import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hreAny = hre as any;
  const { deployments: deployerDeployments, getNamedAccounts, network } = hreAny;
  const ethers = hreAny.ethers;
  const run = hreAny.run;
  const { get } = deployerDeployments;
  const { deployer } = await getNamedAccounts();

  console.log('🚀 Deploying Token Implementation (for manual upgrade)');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('TokenImpl');
    console.log('📌 Token implementation already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Deploy Token Implementation (no proxy, just the implementation)
  console.log('\n1️⃣ Deploying Token implementation...');
  const Token = await ethers.getContractFactory('Token');
  const tokenImpl = await Token.deploy();
  await tokenImpl.waitForDeployment();
  const tokenImplAddress = await tokenImpl.getAddress();
  console.log('✅ Token implementation deployed to:', tokenImplAddress);

  // Save deployment info
  await deployerDeployments.save('TokenImpl', {
    address: tokenImplAddress,
    abi: Token.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('Token Implementation:', tokenImplAddress);
  console.log('Deployer:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: tokenImplAddress,
        constructorArguments: [],
      });
      console.log('✅ Token implementation verified on Etherscan');
    } catch (error: any) {
      console.log('❌ Token implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Implementation deployment completed successfully!');
  console.log('\n💡 Next steps for manual upgrade:');
  console.log('   1. Go to your proxy contract on Etherscan');
  console.log('   2. Navigate to the "Contract" tab');
  console.log('   3. Click "Upgrade" or use the upgrade function');
  console.log('   4. Enter the new implementation address:', tokenImplAddress);
  console.log('   5. Confirm the transaction');
};

func.tags = ['token_impl', 'implementations'];
export default func;

