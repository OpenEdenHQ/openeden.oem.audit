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

  console.log('🚀 Deploying Express');
  console.log('📌 Deployer address:', deployer);

  // Check if already deployed
  try {
    const existing = await get('Express');
    console.log('📌 Express already deployed at:', existing.address);
    console.log('⏭️  Skipping deployment. Use --reset to redeploy.');
    return;
  } catch (error) {
    // Not deployed yet, proceed
  }

  // Check dependencies
  // let oemAddress: string;
  // let assetRegistryAddress: string;
  // let usdoAddress: string;

  const usdoAddress = '0x1A09b6C25E02f118bd028024C563e7EADeD64167';
  const oemAddress = '0xB2532468CA4AB8c26c6f8f1586BA9A9b058d6da8';
  const assetRegistryAddress = '0x1aBd248F310B24feCEbE46b222fF027F0Ce06CD3';

  /*
  try {
    const oemDeployment = await get('OEM');
    oemAddress = oemDeployment.address;
    console.log('✅ Found OEM at:', oemAddress);
  } catch (error) {
    throw new Error('OEM not found. Please deploy OEM first using 02_deploy_oem.ts');
  }

  try {
    const assetRegistryDeployment = await get('AssetRegistry');
    assetRegistryAddress = assetRegistryDeployment.address;
    console.log('✅ Found AssetRegistry at:', assetRegistryAddress);
  } catch (error) {
    throw new Error(
      'AssetRegistry not found. Please deploy AssetRegistry first using 03_deploy_asset_registry.ts'
    );
  }
    */

  // Configuration
  const treasury = process.env.TREASURY_ADDRESS || deployer; // TODO: Set actual treasury address
  const feeTo = process.env.FEE_TO_ADDRESS || deployer; // TODO: Set actual fee recipient address
  const mintMinimum = ethers.parseUnits('10', 18); // 10 OEM minimum
  const redeemMinimum = ethers.parseUnits('5', 18); // 5 OEM minimum
  const firstDepositAmount = ethers.parseUnits('20', 18); // 20 OEM first deposit

  // Deploy Express
  console.log('\n1️⃣ Deploying Express...');
  const Express = await ethers.getContractFactory('Express');
  const express = await upgrades.deployProxy(
    Express,
    [
      oemAddress,
      usdoAddress,
      treasury,
      feeTo,
      deployer,
      assetRegistryAddress,
      {
        mintMinimum,
        redeemMinimum,
        firstDepositAmount,
      },
    ],
    {
      initializer: 'initialize',
      kind: 'uups',
    }
  );
  await express.waitForDeployment();
  const expressAddress = await express.getAddress();
  console.log('✅ Express deployed to:', expressAddress);

  // Grant MINTER_ROLE to Express
  console.log('\n2️⃣ Granting MINTER_ROLE to Express...');
  const OEM = await ethers.getContractFactory('Token');
  const oem = OEM.attach(oemAddress);
  const MINTER_ROLE = await oem.MINTER_ROLE();
  const grantMinterTx = await oem.grantRole(MINTER_ROLE, expressAddress);
  await grantMinterTx.wait();
  console.log('✅ MINTER_ROLE granted to Express');

  // Grant BURNER_ROLE to Express
  console.log('\n3️⃣ Granting BURNER_ROLE to Express...');
  const BURNER_ROLE = await oem.BURNER_ROLE();
  const grantBurnerTx = await oem.grantRole(BURNER_ROLE, expressAddress);
  await grantBurnerTx.wait();
  console.log('✅ BURNER_ROLE granted to Express');

  // Save deployment info
  await deployerDeployments.save('Express', {
    address: expressAddress,
    abi: Express.interface.format() as any,
  });

  // Summary
  console.log('\n📋 Deployment Summary:');
  console.log('Express:', expressAddress);
  console.log('OEM Token:', oemAddress);
  console.log('USDO Token:', usdoAddress);
  console.log('AssetRegistry:', assetRegistryAddress);
  console.log('Treasury:', treasury);
  console.log('Fee To:', feeTo);
  console.log('Mint Minimum:', ethers.formatEther(mintMinimum), 'OEM');
  console.log('Redeem Minimum:', ethers.formatEther(redeemMinimum), 'OEM');
  console.log('First Deposit Amount:', ethers.formatEther(firstDepositAmount), 'OEM');
  console.log('Admin:', deployer);

  // Verify on Etherscan
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    const expressImpl = await upgrades.erc1967.getImplementationAddress(expressAddress);
    console.log('\n🔍 Implementation address:', expressImpl);

    console.log('\n🔍 Verifying implementation on Etherscan...');
    try {
      await run('verify:verify', {
        address: expressImpl,
        constructorArguments: [],
      });
      console.log('✅ Express implementation verified');
    } catch (error: any) {
      console.log('❌ Express implementation verification failed:', error.message);
    }
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }

  console.log('\n✅ Deployment completed successfully!');
  console.log('\n🎉 All OpenEden Multi Strategy Yield contracts deployed!');
  console.log('\n💡 Next steps:');
  console.log('   - Configure AssetRegistry with asset configurations');
  console.log('   - Grant KYC status to users via grantKycInBulk()');
  console.log('   - Set mint and redeem fee rates if needed');
};

func.tags = ['oem_express', 'oem', 'extension'];
export default func;
