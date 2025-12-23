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

  console.log('🚀 Deploying OEM Token');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('OEM');
    console.log('📌 OEM already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Configuration
  const name = 'OpenEden Multi Strategy Yield';
  const symbol = 'OEM';
  const issueCap = ethers.parseUnits('10000000', 18); // 10M OEM cap (0 = unlimited)

  // Deploy OEM
  console.log('\n1️⃣ Deploying OEM token...');
  const OEM = await ethers.getContractFactory('Token');
  const oem = await upgrades.deployProxy(OEM, [name, symbol, deployer, issueCap], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await oem.waitForDeployment();
  const oemAddress = await oem.getAddress();
  console.log('✅ OEM Token deployed to:', oemAddress);
  console.log('📌 Issue Cap:', issueCap > 0 ? ethers.formatEther(issueCap) : 'Unlimited');

  // Save deployment info
  await deployerDeployments.save('OEM', {
    address: oemAddress,
    abi: OEM.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('OEM Token:', oemAddress);
  console.log('Name:', name);
  console.log('Symbol:', symbol);
  console.log('Issue Cap:', issueCap > 0 ? ethers.formatEther(issueCap) : 'Unlimited');
  console.log('Admin:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    const oemImpl = await upgrades.erc1967.getImplementationAddress(oemAddress);
    console.log('\n🔍 Implementation address:', oemImpl);

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: oemImpl,
        constructorArguments: [],
      });
      console.log('✅ OEM implementation verified');
    } catch (error: any) {
      console.log('❌ OEM implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Deployment completed successfully!');
};

func.tags = ['oem', 'core'];
export default func;
