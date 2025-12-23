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

  console.log('🚀 Deploying AssetRegistry');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('AssetRegistry');
    console.log('📌 AssetRegistry already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Deploy AssetRegistry
  console.log('\n1️⃣ Deploying AssetRegistry...');
  const AssetRegistry = await ethers.getContractFactory('AssetRegistry');
  const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await assetRegistry.waitForDeployment();
  const assetRegistryAddress = await assetRegistry.getAddress();
  console.log('✅ AssetRegistry deployed to:', assetRegistryAddress);

  // Save deployment info
  await deployerDeployments.save('AssetRegistry', {
    address: assetRegistryAddress,
    abi: AssetRegistry.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('AssetRegistry:', assetRegistryAddress);
  console.log('Admin:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    const assetRegistryImpl = await upgrades.erc1967.getImplementationAddress(assetRegistryAddress);
    console.log('\n🔍 Implementation address:', assetRegistryImpl);

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: assetRegistryImpl,
        constructorArguments: [],
      });
      console.log('✅ AssetRegistry implementation verified');
    } catch (error: any) {
      console.log('❌ AssetRegistry implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Deployment completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('   - Configure assets using setAssetConfig()');
  console.log('   - Run 04_deploy_redemption_queue.ts');
};

func.tags = ['asset_registry', 'oem'];
export default func;
