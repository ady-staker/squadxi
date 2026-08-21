import "server-only";
import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  decodeEventLog,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/prisma";

// Chain ID is fixed by Robinhood Chain itself, not a per-deployment choice --
// deliberately not a Settings field (see contracts/hardhat.config.ts, same
// constant). ROBINHOOD_CHAIN_ID_LOCAL lets this module point at a local
// Hardhat node during development/testing without touching any real chain.
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

const robinhoodTestnet = (rpcUrl: string, chainId: number) => ({
  id: chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

type RobinhoodConfig = {
  rpcUrl: string;
  contractAddress: Address | null;
  operatorPrivateKey: Hex | null;
  centsPerTestnetEth: number | null;
  chainId: number;
};

/** Same Settings-row-first, env-fallback convention as lib/coinvoyage.ts's
 *  resolveRaw -- re-resolved on every call, not cached, so a Settings update
 *  is picked up immediately. Unlike CoinVoyage's apiKey/apiSecret, these
 *  aren't a matched pair that must come from one source together. */
export async function resolveRobinhoodConfig(): Promise<RobinhoodConfig> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  const rpcUrl =
    settings?.robinhoodRpcUrl ||
    process.env.ROBINHOOD_RPC_URL ||
    "http://127.0.0.1:8545";
  const contractAddress = (settings?.robinhoodContractAddress ||
    process.env.ROBINHOOD_CONTRACT_ADDRESS ||
    null) as Address | null;
  const operatorPrivateKey = (settings?.robinhoodOperatorPrivateKey ||
    process.env.ROBINHOOD_OPERATOR_PRIVATE_KEY ||
    null) as Hex | null;
  const centsPerTestnetEth =
    settings?.robinhoodCentsPerTestnetEth ??
    (process.env.ROBINHOOD_CENTS_PER_TESTNET_ETH
      ? Number(process.env.ROBINHOOD_CENTS_PER_TESTNET_ETH)
      : null);
  const chainId = process.env.ROBINHOOD_CHAIN_ID_LOCAL
    ? Number(process.env.ROBINHOOD_CHAIN_ID_LOCAL)
    : ROBINHOOD_TESTNET_CHAIN_ID;

  return {
    rpcUrl,
    contractAddress,
    operatorPrivateKey,
    centsPerTestnetEth,
    chainId,
  };
}

async function publicClientFor(config: RobinhoodConfig) {
  return createPublicClient({
    chain: robinhoodTestnet(config.rpcUrl, config.chainId),
    transport: http(config.rpcUrl),
  });
}

/** Must match RoleBonusClaim.sol's claim() verification exactly:
 *  keccak256(claimId, winner, amountWei, contractAddress, chainId), signed
 *  as an EIP-191 personal message (viem's signMessage({message:{raw}})
 *  matches OpenZeppelin's MessageHashUtils.toEthSignedMessageHash +
 *  ECDSA.recover on the contract side). */
export async function signClaimVoucher(
  claimId: Hex,
  winner: Address,
  amountWei: bigint,
): Promise<Hex> {
  const config = await resolveRobinhoodConfig();
  if (!config.operatorPrivateKey) {
    throw new Error("Robinhood operator private key is not configured.");
  }
  if (!config.contractAddress) {
    throw new Error("Robinhood contract address is not configured.");
  }

  const account = privateKeyToAccount(config.operatorPrivateKey);
  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256", "address", "uint256"],
      [
        claimId,
        winner,
        amountWei,
        config.contractAddress,
        BigInt(config.chainId),
      ],
    ),
  );
  return account.signMessage({ message: { raw: messageHash } });
}

/** Read-only -- returns null if no contract is configured yet, rather than
 *  throwing, so admin UI can render a clear "not deployed yet" state. */
export async function getContractBalance(): Promise<bigint | null> {
  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) return null;

  const client = await publicClientFor(config);
  return client.getBalance({ address: config.contractAddress });
}

export function operatorAddressFor(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}

/** Same cents-per-testnet-ETH rate used for role-bonus payouts (point 5 of
 *  the plan) -- reused here so an entry fee and a role bonus derived from
 *  the same dollar figure convert to the same wei amount. */
export function centsToTestnetWei(cents: number, centsPerEth: number): bigint {
  return (BigInt(cents) * BigInt(10) ** BigInt(18)) / BigInt(centsPerEth);
}

/** Verifies a plain ETH transfer (contest entry fees paid in testnet ETH,
 *  not a contract call) -- checks the real transaction's to/value and the
 *  receipt's success status, never trusting a client-reported amount. */
export async function verifyTestnetTransfer(
  txHash: Hex,
  expectedTo: Address,
  expectedAmountWei: bigint,
): Promise<boolean> {
  const config = await resolveRobinhoodConfig();
  const client = await publicClientFor(config);

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getTransactionReceipt({ hash: txHash }),
  ]);
  if (receipt.status !== "success") return false;
  if (tx.to?.toLowerCase() !== expectedTo.toLowerCase()) return false;
  return tx.value === expectedAmountWei;
}

const BONUS_CLAIMED_EVENT = {
  type: "event",
  name: "BonusClaimed",
  inputs: [
    { name: "claimId", type: "bytes32", indexed: true },
    { name: "winner", type: "address", indexed: true },
    { name: "amountWei", type: "uint256", indexed: false },
  ],
} as const;

/** Never trust a client-reported txHash on its own -- confirms the
 *  transaction actually succeeded on-chain, went to our contract, and
 *  emitted BonusClaimed for exactly this claimId/winner/amount before the
 *  caller marks a RoleBonusClaim CLAIMED. */
export async function verifyBonusClaimedOnChain(
  txHash: Hex,
  claimId: Hex,
  winner: Address,
  amountWei: bigint,
): Promise<boolean> {
  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) return false;

  const client = await publicClientFor(config);
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return false;
  if (receipt.to?.toLowerCase() !== config.contractAddress.toLowerCase()) {
    return false;
  }

  return receipt.logs.some((log) => {
    try {
      const decoded = decodeEventLog({
        abi: [BONUS_CLAIMED_EVENT],
        data: log.data,
        topics: log.topics,
      });
      return (
        decoded.eventName === "BonusClaimed" &&
        decoded.args.claimId === claimId &&
        decoded.args.winner.toLowerCase() === winner.toLowerCase() &&
        decoded.args.amountWei === amountWei
      );
    } catch {
      return false; // log from an unrelated event on the same tx -- skip
    }
  });
}
