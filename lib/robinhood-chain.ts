import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  decodeEventLog,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/prisma";

// Thrown instead of letting viem's own not-found errors propagate raw --
// callers use this to tell "not mined yet, retry shortly" apart from "this
// transaction is real but doesn't match what was expected."
export class TransactionNotYetVisibleError extends Error {
  constructor() {
    super("Transaction not yet visible on-chain -- it may still be pending.");
  }
}

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
  relayerPrivateKey: Hex | null;
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
  const relayerPrivateKey = (settings?.robinhoodRelayerPrivateKey ||
    process.env.ROBINHOOD_RELAYER_PRIVATE_KEY ||
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
    relayerPrivateKey,
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

const CLAIM_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "amountWei", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** Submits the SAME claim() call a winner's own wallet would submit --
 *  RoleBonusClaim.sol pays exactly the `winner` address baked into the
 *  signed voucher regardless of who calls claim(), so relaying it costs the
 *  relayer only gas, never the payout amount itself (that comes out of the
 *  contract's own balance). This is what lets a winner type an address and
 *  hit submit instead of connecting a wallet. Blocks until mined; throws if
 *  the transaction reverts (e.g. this claimId was somehow already claimed). */
export async function relayClaim(
  claimId: Hex,
  winner: Address,
  amountWei: bigint,
  signature: Hex,
): Promise<Hex> {
  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress) {
    throw new Error("Robinhood contract address is not configured.");
  }
  if (!config.relayerPrivateKey) {
    throw new Error("Robinhood relayer private key is not configured.");
  }

  const chain = robinhoodTestnet(config.rpcUrl, config.chainId);
  const account = privateKeyToAccount(config.relayerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
  const publicClient = await publicClientFor(config);

  const hash = await walletClient.writeContract({
    address: config.contractAddress,
    abi: CLAIM_ABI,
    functionName: "claim",
    args: [claimId, winner, amountWei, signature],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Relayed claim transaction reverted on-chain.");
  }
  return hash;
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
 *  not a contract call) -- checks the real transaction's to/value/sender and
 *  the receipt's success status, never trusting a client-reported amount.
 *  expectedFrom matters more than it looks: without it, anyone who noticed
 *  a stranger's real, still-unconfirmed payment on the public block
 *  explorer could paste that same txHash into their own unrelated entry
 *  and win the confirmation race, since testnetPaymentTxHash's uniqueness
 *  only stops the SAME hash being used twice, not being stolen once. This
 *  ties a confirmation to the wallet actually connected in that user's own
 *  browser session, the same trust boundary already used for claims
 *  (ContestEntry.claimWalletAddress). */
export async function verifyTestnetTransfer(
  txHash: Hex,
  expectedTo: Address,
  expectedAmountWei: bigint,
  expectedFrom: Address,
): Promise<boolean> {
  const config = await resolveRobinhoodConfig();
  const client = await publicClientFor(config);

  let tx, receipt;
  try {
    [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: txHash }),
      client.getTransactionReceipt({ hash: txHash }),
    ]);
  } catch (err) {
    if (
      err instanceof TransactionNotFoundError ||
      err instanceof TransactionReceiptNotFoundError
    ) {
      throw new TransactionNotYetVisibleError();
    }
    throw err;
  }
  if (receipt.status !== "success") return false;
  if (tx.to?.toLowerCase() !== expectedTo.toLowerCase()) return false;
  if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) return false;
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
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    if (err instanceof TransactionReceiptNotFoundError) {
      throw new TransactionNotYetVisibleError();
    }
    throw err;
  }
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
