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

  console.log('📌 Deployer address:', deployer);

  // ============================================
  // Configuration Parameters
  // ============================================

  // OEM Token parameters
  const oemName = 'Portfolio of Risk-adjusted Investment Strategy Mix';
  const oemSymbol = 'PRISM';
  const oemIssueCap = ethers.parseUnits('100000000', 18); // 100M OEM cap (0 = unlimited)

  // RedemptionQueue parameters
  const redemptionDelay = 3 * 60; // 3 minutes in seconds

  // OEMVault parameters
  const vaultName = 'Staked Portfolio of Risk-adjusted Investment Strategy Mix';
  const vaultSymbol = 'xPRISM';

  // Express parameters
  const mintMinimum = ethers.parseUnits('1', 18); // 1 PRISM minimum
  const redeemMinimum = ethers.parseUnits('1', 18); // 1 PRISM minimum
  const firstDepositAmount = ethers.parseUnits('10', 18); // 10 PRISM first deposit

  // Addresses (set these or use deployer as placeholder)
  const treasury = deployer; // TODO: Set actual treasury address
  const feeTo = deployer; // TODO: Set actual fee recipient address
  // const usdoAddress = ethers.ZeroAddress; // TODO: Set actual USDO token address (or deploy MockERC20)

  // sepolia 
  // const usdoAddress = '0x1A09b6C25E02f118bd028024C563e7EADeD64167';

  // mainnet
  const usdoAddress = '0x8238884Ec9668Ef77B90C6dfF4D1a9F4F4823BFe';

  // ============================================
  // 1. Deploy MockERC20 (if needed for testing)
  // ============================================
  let usdo: any;
  let usdoAddressFinal = usdoAddress;

  if (
    usdoAddress === ethers.ZeroAddress &&
    (network.name === 'hardhat' || network.name === 'localhost')
  ) {
    console.log('\n1️⃣ Deploying MockERC20 (USDO) for testing...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdo = await MockERC20.deploy('USDO Token', 'USDO', 18);
    await usdo.waitForDeployment();
    usdoAddressFinal = await usdo.getAddress();
    console.log('✅ MockERC20 (USDO) deployed to:', usdoAddressFinal);
  } else if (usdoAddress === ethers.ZeroAddress) {
    throw new Error('USDO address must be set for non-local networks');
  } else {
    usdoAddressFinal = usdoAddress;
    console.log('\n1️⃣ Using existing USDO token at:', usdoAddressFinal);
  }

  // ============================================
  // 2. Deploy OEM Token
  // ============================================
  console.log('\n2️⃣ Deploying OEM token...');
  const OEM = await ethers.getContractFactory('Token');
  const oem = await upgrades.deployProxy(OEM, [oemName, oemSymbol, deployer, oemIssueCap], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await oem.waitForDeployment();
  const oemAddress = await oem.getAddress();
  console.log('✅ OEM Token deployed to:', oemAddress);
  console.log('📌 Issue Cap:', oemIssueCap > 0 ? ethers.formatEther(oemIssueCap) : 'Unlimited');

  // ============================================
  // 3. Deploy AssetRegistry
  // ============================================
  console.log('\n3️⃣ Deploying AssetRegistry...');
  const AssetRegistry = await ethers.getContractFactory('AssetRegistry');
  const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await assetRegistry.waitForDeployment();
  const assetRegistryAddress = await assetRegistry.getAddress();
  console.log('✅ AssetRegistry deployed to:', assetRegistryAddress);

  // Configure USDO asset in registry (1:1 with OEM, no price feed for now)
  console.log('📌 Configuring USDO asset in registry...');
  await assetRegistry.setAssetConfig({
    asset: usdoAddressFinal,
    priceFeed: ethers.ZeroAddress, // No price feed for 1:1 assets
    isSupported: true,
    maxStalePeriod: 0,
  });
  console.log('✅ USDO asset configured in registry');

  // ============================================
  // 4. Deploy RedemptionQueue
  // ============================================
  console.log('\n4️⃣ Deploying RedemptionQueue...');
  const RedemptionQueue = await ethers.getContractFactory('RedemptionQueue');
  const redemptionQueue = await upgrades.deployProxy(
    RedemptionQueue,
    [
      deployer,
      oemAddress,
      ethers.ZeroAddress, // vault address - will be set after vault deployment
      redemptionDelay,
    ],
    {
      initializer: 'initialize',
      kind: 'uups',
    }
  );
  await redemptionQueue.waitForDeployment();
  const redemptionQueueAddress = await redemptionQueue.getAddress();
  console.log('✅ RedemptionQueue deployed to:', redemptionQueueAddress);
  console.log('📌 Redemption Delay:', redemptionDelay / (24 * 60 * 60), 'days');

  // ============================================
  // 5. Deploy OEMVault
  // ============================================
  console.log('\n5️⃣ Deploying OEMVault...');
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
  console.log('📌 Setting vault address in RedemptionQueue...');
  const setVaultTx = await redemptionQueue.setVault(vaultAddress);
  await setVaultTx.wait();
  console.log('✅ Vault address set in RedemptionQueue');

  // ============================================
  // 6. Deploy Express
  // ============================================
  console.log('\n6️⃣ Deploying Express...');
  const Express = await ethers.getContractFactory('Express');
  const express = await upgrades.deployProxy(
    Express,
    [
      oemAddress,
      usdoAddressFinal,
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
  console.log('📌 Granting MINTER_ROLE to Express...');
  const MINTER_ROLE = await oem.MINTER_ROLE();
  const grantMinterTx = await oem.grantRole(MINTER_ROLE, expressAddress);
  await grantMinterTx.wait();
  console.log('✅ MINTER_ROLE granted to Express');

  // Grant BURNER_ROLE to Express
  console.log('📌 Granting BURNER_ROLE to Express...');
  const BURNER_ROLE = await oem.BURNER_ROLE();
  const grantBurnerTx = await oem.grantRole(BURNER_ROLE, expressAddress);
  await grantBurnerTx.wait();
  console.log('✅ BURNER_ROLE granted to Express');

  // ============================================
  // Save Deployment Info
  // ============================================
  if (usdo) {
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    await deployerDeployments.save('MockERC20', {
      address: usdoAddressFinal,
      abi: MockERC20Factory.interface.format() as any,
    });
  }

  await deployerDeployments.save('OEM', {
    address: oemAddress,
    abi: OEM.interface.format() as any,
  });

  await deployerDeployments.save('AssetRegistry', {
    address: assetRegistryAddress,
    abi: AssetRegistry.interface.format() as any,
  });

  await deployerDeployments.save('RedemptionQueue', {
    address: redemptionQueueAddress,
    abi: RedemptionQueue.interface.format() as any,
  });

  await deployerDeployments.save('OEMVault', {
    address: vaultAddress,
    abi: OEMVault.interface.format() as any,
  });

  await deployerDeployments.save('Express', {
    address: expressAddress,
    abi: Express.interface.format() as any,
  });

  // ============================================
  // Summary
  // ============================================
  console.log('\n📋 Deployment Summary:');
  if (usdo) {
    console.log('MockERC20 (USDO):', usdoAddressFinal);
  } else {
    console.log('USDO Token:', usdoAddressFinal);
  }
  console.log('OEM Token:', oemAddress);
  console.log('AssetRegistry:', assetRegistryAddress);
  console.log('RedemptionQueue:', redemptionQueueAddress);
  console.log('OEMVault:', vaultAddress);
  console.log('Express:', expressAddress);
  console.log('\n📌 Configuration:');
  console.log('  OEM Issue Cap:', oemIssueCap > 0 ? ethers.formatEther(oemIssueCap) : 'Unlimited');
  console.log('  Redemption Delay:', redemptionDelay / (24 * 60 * 60), 'days');
  console.log('  Mint Minimum:', ethers.formatEther(mintMinimum), 'OEM');
  console.log('  Redeem Minimum:', ethers.formatEther(redeemMinimum), 'OEM');
  console.log('  First Deposit Amount:', ethers.formatEther(firstDepositAmount), 'OEM');
  console.log('  Treasury:', treasury);
  console.log('  Fee To:', feeTo);

  // ============================================
  // Verify Contracts on Etherscan
  // ============================================
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n⏳ Waiting for Etherscan to index the contracts...');
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

    // Get implementation addresses
    const oemImpl = await upgrades.erc1967.getImplementationAddress(oemAddress);
    const assetRegistryImpl = await upgrades.erc1967.getImplementationAddress(assetRegistryAddress);
    const redemptionQueueImpl =
      await upgrades.erc1967.getImplementationAddress(redemptionQueueAddress);
    const vaultImpl = await upgrades.erc1967.getImplementationAddress(vaultAddress);
    const expressImpl = await upgrades.erc1967.getImplementationAddress(expressAddress);

    console.log('\n🔍 Implementation addresses:');
    console.log('OEM:', oemImpl);
    console.log('AssetRegistry:', assetRegistryImpl);
    console.log('RedemptionQueue:', redemptionQueueImpl);
    console.log('OEMVault:', vaultImpl);
    console.log('Express:', expressImpl);

    // Verify implementation contracts
    console.log('\n🔍 Verifying implementations on Etherscan...');

    const verifyContract = async (name: string, address: string, constructorArgs: any[] = []) => {
      try {
        await run('verify:verify', {
          address,
          constructorArguments: constructorArgs,
        });
        console.log(`✅ ${name} implementation verified`);
      } catch (error: any) {
        console.log(`❌ ${name} implementation verification failed:`, error.message);
      }
    };

    if (usdo) {
      await verifyContract('MockERC20', usdoAddressFinal, ['USDO Token', 'USDO', 18]);
    }

    await verifyContract('OEM', oemImpl);
    await verifyContract('AssetRegistry', assetRegistryImpl);
    await verifyContract('RedemptionQueue', redemptionQueueImpl);
    await verifyContract('OEMVault', vaultImpl);
    await verifyContract('Express', expressImpl);
  } else {
    console.log('\n🛑 Skipping verification on local network.');
  }
};

func.tags = ['oem_all', 'oem', 'core'];
func.dependencies = [];
export default func;
