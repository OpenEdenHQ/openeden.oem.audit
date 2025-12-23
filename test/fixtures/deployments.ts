import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface CoreDeployment {
  oem: any;
  vault: any;
  redemptionQueue: any;
  admin: HardhatEthersSigner;
  minter: HardhatEthersSigner;
  burner: HardhatEthersSigner;
  pauser: HardhatEthersSigner;
  banlistManager: HardhatEthersSigner;
  maintainer: HardhatEthersSigner;
  user1: HardhatEthersSigner;
  user2: HardhatEthersSigner;
  user3: HardhatEthersSigner;
}

export async function deployCoreContracts(): Promise<CoreDeployment> {
  const [
    admin,
    minter,
    burner,
    pauser,
    banlistManager,
    maintainer,
    user1,
    user2,
    user3,
  ] = await ethers.getSigners();

  // Deploy OEM token
  const OEMFactory = await ethers.getContractFactory("Token");
  const oem = await upgrades.deployProxy(
    OEMFactory,
    [
      "OEM Multi Strategy Yield",
      "OEM",
      admin.address,
      ethers.parseUnits("1000000", 18),
    ],
    { kind: "uups", initializer: "initialize" },
  );
  await oem.waitForDeployment();

  // Grant roles
  const MINTER_ROLE = await oem.MINTER_ROLE();
  const BURNER_ROLE = await oem.BURNER_ROLE();
  const PAUSE_ROLE = await oem.PAUSE_ROLE();
  const BANLIST_ROLE = await oem.BANLIST_ROLE();
  const UPGRADE_ROLE = await oem.UPGRADE_ROLE();

  await oem.connect(admin).grantRole(MINTER_ROLE, minter.address);
  await oem.connect(admin).grantRole(BURNER_ROLE, burner.address);
  await oem.connect(admin).grantRole(PAUSE_ROLE, pauser.address);
  await oem.connect(admin).grantRole(BANLIST_ROLE, banlistManager.address);
  await oem.connect(admin).grantRole(UPGRADE_ROLE, admin.address);

  // Deploy RedemptionQueue
  const RedemptionQueueFactory =
    await ethers.getContractFactory("RedemptionQueue");
  const redemptionQueue = await upgrades.deployProxy(
    RedemptionQueueFactory,
    [
      admin.address,
      await oem.getAddress(),
      ethers.ZeroAddress, // vault address - will be set after vault deployment
      7 * 24 * 60 * 60, // 7 days
    ],
    { kind: "uups", initializer: "initialize" },
  );
  await redemptionQueue.waitForDeployment();

  // Deploy OEMVault
  const VaultFactory = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(
    VaultFactory,
    [
      await oem.getAddress(),
      "Staked OpenEdge Multi Strategy Yield",
      "sOEM",
      admin.address,
      await redemptionQueue.getAddress(),
    ],
    { kind: "uups", initializer: "initialize" },
  );
  await vault.waitForDeployment();

  // Set vault address in redemption queue
  await redemptionQueue.connect(admin).setVault(await vault.getAddress());

  // Grant roles to vault
  const VAULT_PAUSE_ROLE = await vault.PAUSE_ROLE();
  const VAULT_UPGRADE_ROLE = await vault.UPGRADE_ROLE();
  await vault.connect(admin).grantRole(VAULT_PAUSE_ROLE, pauser.address);
  await vault.connect(admin).grantRole(VAULT_UPGRADE_ROLE, admin.address);

  // Grant roles to redemption queue
  const QUEUE_UPGRADE_ROLE = await redemptionQueue.UPGRADE_ROLE();
  await redemptionQueue
    .connect(admin)
    .grantRole(QUEUE_UPGRADE_ROLE, admin.address);

  // Mint some OEM to users for testing
  const mintAmount = ethers.parseUnits("10000", 18);
  await oem.connect(minter).mint(user1.address, mintAmount);
  await oem.connect(minter).mint(user2.address, mintAmount);
  await oem.connect(minter).mint(user3.address, mintAmount);

  return {
    oem,
    vault,
    redemptionQueue,
    admin,
    minter,
    burner,
    pauser,
    banlistManager,
    maintainer,
    user1,
    user2,
    user3,
  };
}
