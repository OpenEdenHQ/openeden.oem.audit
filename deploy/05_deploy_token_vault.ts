import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hreAny = hre as any;
  const { deployments: deployerDeployments, getNamedAccounts, network } = hreAny;
  const ethers = hreAny.ethers;
  const upgrades = hreAny.upgrades;
  const run = hreAny.run;
  const { get } = deployerDeployments;
  const { deployer } = await getNamedAccounts();

  console.log('🚀 Deploying OEMVault');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('OEMVault');
    console.log('📌 OEMVault already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Check dependencies
  let oemAddress: string;
  let redemptionQueueAddress: string;
  try {
    const oemDeployment = await get('OEM');
    oemAddress = oemDeployment.address;
    console.log('✅ Found OEM at:', oemAddress);
  } catch (error) {
    throw new Error('OEM not found. Please deploy OEM first using 02_deploy_oem.ts');
  }

  try {
    const redemptionQueueDeployment = await get('RedemptionQueue');
    redemptionQueueAddress = redemptionQueueDeployment.address;
    console.log('✅ Found RedemptionQueue at:', redemptionQueueAddress);
  } catch (error) {
    throw new Error(
      'RedemptionQueue not found. Please deploy RedemptionQueue first using 04_deploy_redemption_queue.ts'
    );
  }

  // Configuration
  const vaultName = 'Staked OpenEden Multi Strategy Yield';
  const vaultSymbol = 'xOEM';

  // Deploy OEMVault
  console.log('\n1️⃣ Deploying OEMVault...');
  const OEMVault = await ethers.getContractFactory('Vault');
  const vault = await upgrades.deployProxy(
    OEMVault,
    [oemAddress, vaultName, vaultSymbol, deployer, redemptionQueueAddress],
    {
      initializer: 'initialize',
      kind: 'uups',
    }
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log('✅ OEMVault deployed to:', vaultAddress);

  // Set vault address in redemption queue
  console.log('\n2️⃣ Setting vault address in RedemptionQueue...');
  const RedemptionQueue = await ethers.getContractFactory('RedemptionQueue');
  const redemptionQueue = RedemptionQueue.attach(redemptionQueueAddress);
  const setVaultTx = await redemptionQueue.setVault(vaultAddress);
  await setVaultTx.wait();
  console.log('✅ Vault address set in RedemptionQueue');

  // Save deployment info
  await deployerDeployments.save('OEMVault', {
    address: vaultAddress,
    abi: OEMVault.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('OEMVault:', vaultAddress);
  console.log('Name:', vaultName);
  console.log('Symbol:', vaultSymbol);
  console.log('OEM Token:', oemAddress);
  console.log('RedemptionQueue:', redemptionQueueAddress);
  console.log('Admin:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    const vaultImpl = await upgrades.erc1967.getImplementationAddress(vaultAddress);
    console.log('\n🔍 Implementation address:', vaultImpl);

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: vaultImpl,
        constructorArguments: [],
      });
      console.log('✅ OEMVault implementation verified');
    } catch (error: any) {
      console.log('❌ OEMVault implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Deployment completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('   - Run 06_deploy_oem_express.ts');
};

func.tags = ['oem_vault', 'oem', 'core'];
export default func;
