import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodePacked, keccak256, parseEther } from "viem";

const { viem } = await hre.network.create();

async function sign(
  operatorClient: Awaited<ReturnType<typeof viem.getWalletClients>>[number],
  claimId: `0x${string}`,
  winner: `0x${string}`,
  amountWei: bigint,
  contractAddress: `0x${string}`,
  chainId: number,
) {
  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256", "address", "uint256"],
      [claimId, winner, amountWei, contractAddress, BigInt(chainId)],
    ),
  );
  return operatorClient.signMessage({ message: { raw: messageHash } });
}

async function deployFunded() {
  const [owner, operator, winner, attacker] = await viem.getWalletClients();
  const contract = await viem.deployContract("RoleBonusClaim", [
    operator.account.address,
    owner.account.address,
  ]);
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  await owner.sendTransaction({
    to: contract.address,
    value: parseEther("1"),
  });

  return { owner, operator, winner, attacker, contract, publicClient, chainId };
}

const claimIdFor = (label: string) =>
  keccak256(encodePacked(["string"], [label]));

describe("RoleBonusClaim", () => {
  it("pays the winner and marks the claimId claimed on a valid voucher", async () => {
    const { operator, winner, contract, publicClient, chainId } =
      await deployFunded();
    const claimId = claimIdFor("contest-1:WK");
    const amountWei = parseEther("0.5");
    const signature = await sign(
      operator,
      claimId,
      winner.account.address,
      amountWei,
      contract.address,
      chainId,
    );

    const balanceBefore = await publicClient.getBalance({
      address: winner.account.address,
    });

    await viem.assertions.emitWithArgs(
      contract.write.claim([
        claimId,
        winner.account.address,
        amountWei,
        signature,
      ]),
      contract,
      "BonusClaimed",
      [claimId, winner.account.address, amountWei],
    );

    const balanceAfter = await publicClient.getBalance({
      address: winner.account.address,
    });
    assert.equal(balanceAfter - balanceBefore, amountWei);
    assert.equal(await contract.read.claimed([claimId]), true);
  });

  it("rejects a second claim of the same claimId", async () => {
    const { operator, winner, contract, chainId } = await deployFunded();
    const claimId = claimIdFor("contest-1:BAT");
    const amountWei = parseEther("0.1");
    const signature = await sign(
      operator,
      claimId,
      winner.account.address,
      amountWei,
      contract.address,
      chainId,
    );

    await contract.write.claim([
      claimId,
      winner.account.address,
      amountWei,
      signature,
    ]);

    await viem.assertions.revertWithCustomError(
      contract.write.claim([
        claimId,
        winner.account.address,
        amountWei,
        signature,
      ]),
      contract,
      "AlreadyClaimed",
    );
  });

  it("rejects a voucher signed by anyone other than the operator", async () => {
    const { attacker, winner, contract, chainId } = await deployFunded();
    const claimId = claimIdFor("contest-1:BOWL");
    const amountWei = parseEther("0.1");
    // signed by attacker, not operator
    const signature = await sign(
      attacker,
      claimId,
      winner.account.address,
      amountWei,
      contract.address,
      chainId,
    );

    await viem.assertions.revertWithCustomError(
      contract.write.claim([
        claimId,
        winner.account.address,
        amountWei,
        signature,
      ]),
      contract,
      "InvalidSignature",
    );
  });

  it("rejects a voucher whose signed amount was tampered with", async () => {
    const { operator, winner, contract, chainId } = await deployFunded();
    const claimId = claimIdFor("contest-1:AR");
    const signedAmount = parseEther("0.1");
    const signature = await sign(
      operator,
      claimId,
      winner.account.address,
      signedAmount,
      contract.address,
      chainId,
    );

    // same signature, but claiming 10x the amount it actually authorized
    await viem.assertions.revertWithCustomError(
      contract.write.claim([
        claimId,
        winner.account.address,
        parseEther("1"),
        signature,
      ]),
      contract,
      "InvalidSignature",
    );
  });

  it("rejects a voucher scoped to a different deployed contract", async () => {
    const { owner, operator, winner, chainId } = await deployFunded();
    const otherContract = await viem.deployContract("RoleBonusClaim", [
      operator.account.address,
      owner.account.address,
    ]);
    await owner.sendTransaction({
      to: otherContract.address,
      value: parseEther("1"),
    });

    const claimId = claimIdFor("contest-1:WK");
    const amountWei = parseEther("0.1");
    // signed for the FIRST contract's address, replayed against a second one
    const { contract: firstContract } = await deployFunded();
    const signature = await sign(
      operator,
      claimId,
      winner.account.address,
      amountWei,
      firstContract.address,
      chainId,
    );

    await viem.assertions.revertWithCustomError(
      otherContract.write.claim([
        claimId,
        winner.account.address,
        amountWei,
        signature,
      ]),
      otherContract,
      "InvalidSignature",
    );
  });

  it("reverts if the contract can't cover the claimed amount", async () => {
    const { owner, operator, winner, chainId } = await deployFunded();
    const poor = await viem.deployContract("RoleBonusClaim", [
      operator.account.address,
      owner.account.address,
    ]);
    // deliberately not funded

    const claimId = claimIdFor("contest-1:WK");
    const amountWei = parseEther("0.5");
    const signature = await sign(
      operator,
      claimId,
      winner.account.address,
      amountWei,
      poor.address,
      chainId,
    );

    await viem.assertions.revertWithCustomError(
      poor.write.claim([claimId, winner.account.address, amountWei, signature]),
      poor,
      "InsufficientBalance",
    );
  });

  it("lets the owner withdraw unclaimed funds", async () => {
    const { owner, contract, publicClient } = await deployFunded();
    const contractBalance = await publicClient.getBalance({
      address: contract.address,
    });

    const ownerContract = await viem.getContractAt(
      "RoleBonusClaim",
      contract.address,
      { client: { wallet: owner } },
    );
    await ownerContract.write.withdrawUnclaimed([
      owner.account.address,
      contractBalance,
    ]);

    assert.equal(
      await publicClient.getBalance({ address: contract.address }),
      0n,
    );
  });

  it("rejects withdrawUnclaimed from a non-owner", async () => {
    const { attacker, contract } = await deployFunded();
    const asAttacker = await viem.getContractAt(
      "RoleBonusClaim",
      contract.address,
      { client: { wallet: attacker } },
    );

    await viem.assertions.revertWithCustomError(
      asAttacker.write.withdrawUnclaimed([
        attacker.account.address,
        parseEther("0.1"),
      ]),
      contract,
      "OwnableUnauthorizedAccount",
    );
  });
});
