import hre from "hardhat";

// Deploys RoleBonusClaim to whichever network --network points at.
// Requires ROBINHOOD_DEPLOYER_PRIVATE_KEY and ROBINHOOD_TESTNET_RPC_URL set
// in the environment (see hardhat.config.ts) and ROBINHOOD_OPERATOR_ADDRESS
// for the address that will sign claim vouchers -- not necessarily the same
// key as the deployer.
//
//   ROBINHOOD_DEPLOYER_PRIVATE_KEY=0x... \
//   ROBINHOOD_TESTNET_RPC_URL=https://... \
//   ROBINHOOD_OPERATOR_ADDRESS=0x... \
//   npx hardhat run scripts/deploy.ts --network robinhoodTestnet
async function main() {
  const operatorAddress = process.env.ROBINHOOD_OPERATOR_ADDRESS;
  if (!operatorAddress) {
    throw new Error("ROBINHOOD_OPERATOR_ADDRESS is required");
  }

  const { viem } = await hre.network.create();
  const [deployer] = await viem.getWalletClients();

  console.log("Deploying from:", deployer.account.address);
  console.log("Operator will be:", operatorAddress);

  const contract = await viem.deployContract("RoleBonusClaim", [
    operatorAddress as `0x${string}`,
    deployer.account.address,
  ]);

  console.log("RoleBonusClaim deployed to:", contract.address);
  console.log("Owner:", deployer.account.address);
  console.log(
    "\nNext: fund the contract with a plain ETH transfer to the address above,",
    "then set Settings.robinhoodContractAddress in squadxi-site to this address.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
