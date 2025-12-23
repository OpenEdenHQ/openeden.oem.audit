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

  console.log('🚀 Deploying RedemptionQueue');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('RedemptionQueue');
    console.log('📌 RedemptionQueue already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Check dependencies
  let oemAddress: string;
  try {
    const oemDeployment = await get('OEM');
    oemAddress = oemDeployment.address;
    console.log('✅ Found OEM at:', oemAddress);
  } catch (error) {
    throw new Error('OEM not found. Please deploy OEM first using 02_deploy_oem.ts');
  }

  // Configuration
  const redemptionDelay = 7 * 24 * 60 * 60; // 7 days in seconds
  const vaultAddress = ethers.ZeroAddress; // Will be set after vault deployment

  // Deploy RedemptionQueue
  console.log('\n1️⃣ Deploying RedemptionQueue...');
  const RedemptionQueue = await ethers.getContractFactory('RedemptionQueue');
  const redemptionQueue = await upgrades.deployProxy(
    RedemptionQueue,
    [deployer, oemAddress, vaultAddress, redemptionDelay],
    {
      initializer: 'initialize',
      kind: 'uups',
    }
  );
  await redemptionQueue.waitForDeployment();
  const redemptionQueueAddress = await redemptionQueue.getAddress();
  console.log('✅ RedemptionQueue deployed to:', redemptionQueueAddress);
  console.log('📌 Redemption Delay:', redemptionDelay / (24 * 60 * 60), 'days');
  console.log('⚠️  Vault address set to ZeroAddress - will be updated after vault deployment');

  // Save deployment info
  await deployerDeployments.save('RedemptionQueue', {
    address: redemptionQueueAddress,
    abi: RedemptionQueue.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('RedemptionQueue:', redemptionQueueAddress);
  console.log('OEM Token:', oemAddress);
  console.log('Vault:', vaultAddress, '(to be set)');
  console.log('Redemption Delay:', redemptionDelay / (24 * 60 * 60), 'days');
  console.log('Admin:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    const redemptionQueueImpl =
      await upgrades.erc1967.getImplementationAddress(redemptionQueueAddress);
    console.log('\n🔍 Implementation address:', redemptionQueueImpl);

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: redemptionQueueImpl,
        constructorArguments: [],
      });
      console.log('✅ RedemptionQueue implementation verified');
    } catch (error: any) {
      console.log('❌ RedemptionQueue implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Deployment completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('   - Run 05_deploy_oem_vault.ts');
  console.log('   - The vault address will be set automatically in RedemptionQueue');
};

func.tags = ['redemption_queue', 'oem', 'core'];
export default func;
