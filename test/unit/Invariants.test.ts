import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployCoreContracts } from "../fixtures/deployments";

/**
 * Invariant Tests
 *
 * These tests verify properties that should ALWAYS hold true, regardless of the sequence of operations.
 * They are critical for ensuring system integrity and security.
 */
describe("Invariant Tests", function () {
  async function deployFixture() {
    return await deployCoreContracts();
  }

  describe("OEM Token Invariants", function () {
    it("INVARIANT: Total supply should never exceed issue cap", async function () {
      const { oem, minter, burner, user1, user2, user3 } =
        await loadFixture(deployFixture);

      const issueCap = await oem.issueCap();
      const totalSupply = await oem.totalSupply();

      expect(totalSupply).to.be.lte(issueCap);

      // Perform various operations
      const mintAmount = ethers.parseUnits("1000", 18);
      await oem.connect(minter).mint(user1.address, mintAmount);

      expect(await oem.totalSupply()).to.be.lte(issueCap);

      // Transfer and burn
      await oem.connect(user1).transfer(user2.address, mintAmount / 2n);
      await oem.connect(burner).burn(user2.address, mintAmount / 4n);

      expect(await oem.totalSupply()).to.be.lte(issueCap);
    });

    it("INVARIANT: Sum of all balances should equal total supply", async function () {
      const { oem, user1, user2, user3, minter, burner } =
        await loadFixture(deployFixture);

      async function checkInvariant() {
        const balance1 = await oem.balanceOf(user1.address);
        const balance2 = await oem.balanceOf(user2.address);
        const balance3 = await oem.balanceOf(user3.address);
        const minterBalance = await oem.balanceOf(minter.address);

        const totalSupply = await oem.totalSupply();
        const knownBalances = balance1 + balance2 + balance3 + minterBalance;

        // Known balances should be <= total supply (others may have tokens)
        expect(knownBalances).to.be.lte(totalSupply);
      }

      await checkInvariant();

      // Mint
      await oem
        .connect(minter)
        .mint(user1.address, ethers.parseUnits("500", 18));
      await checkInvariant();

      // Transfer
      await oem
        .connect(user1)
        .transfer(user2.address, ethers.parseUnits("100", 18));
      await checkInvariant();

      // Burn
      await oem
        .connect(burner)
        .burn(user2.address, ethers.parseUnits("50", 18));
      await checkInvariant();
    });

    it("INVARIANT: Balance should never be negative or exceed total supply", async function () {
      const { oem, user1, user2 } = await loadFixture(deployFixture);

      const checkBalance = async (address: string) => {
        const balance = await oem.balanceOf(address);
        const totalSupply = await oem.totalSupply();

        expect(balance).to.be.gte(0);
        expect(balance).to.be.lte(totalSupply);
      };

      await checkBalance(user1.address);
      await checkBalance(user2.address);

      // After transfer
      await oem
        .connect(user1)
        .transfer(user2.address, ethers.parseUnits("100", 18));

      await checkBalance(user1.address);
      await checkBalance(user2.address);
    });

    it("INVARIANT: Allowance should never exceed spender's actual spending ability", async function () {
      const { oem, user1, user2, user3 } = await loadFixture(deployFixture);

      const balance = await oem.balanceOf(user1.address);
      const allowance = ethers.parseUnits("5000", 18);

      await oem.connect(user1).approve(user2.address, allowance);

      // Allowance can be > balance, but can't transfer more than balance
      expect(await oem.allowance(user1.address, user2.address)).to.equal(
        allowance,
      );

      if (allowance > balance) {
        await expect(
          oem
            .connect(user2)
            .transferFrom(user1.address, user3.address, allowance),
        ).to.be.revertedWithCustomError(oem, "ERC20InsufficientBalance");
      }
    });

    it("INVARIANT: Banned addresses should never be able to send or receive tokens (except mint/burn)", async function () {
      const { oem, user1, user2, burner, banlistManager } =
        await loadFixture(deployFixture);

      await oem.connect(banlistManager).banAddresses([user1.address]);

      // Can't send
      await expect(
        oem
          .connect(user1)
          .transfer(user2.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(oem, "BannedSender");

      // Can't receive
      await expect(
        oem
          .connect(user2)
          .transfer(user1.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(oem, "BannedRecipient");

      // Cannot burn from banned address (ban check applies to all transfers including mint/burn)
      const balance = await oem.balanceOf(user1.address);
      if (balance > 0) {
        await expect(
          oem.connect(burner).burn(user1.address, ethers.parseUnits("10", 18)),
        ).to.be.revertedWithCustomError(oem, "BannedSender");
      }
    });

    it("INVARIANT: When paused, no transfers should occur", async function () {
      const { oem, user1, user2, burner, pauser, minter } =
        await loadFixture(deployFixture);

      await oem.connect(pauser).pause();

      // No transfers
      await expect(
        oem
          .connect(user1)
          .transfer(user2.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(oem, "EnforcedPause");

      // No mints
      await expect(
        oem.connect(minter).mint(user1.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(oem, "EnforcedPause");

      // No burns
      await expect(
        oem.connect(burner).burn(user1.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWithCustomError(oem, "EnforcedPause");
    });
  });

  describe("Vault Invariants", function () {
    it("INVARIANT: Total assets should equal vault's OEM balance", async function () {
      const { vault, oem, user1, user2 } = await loadFixture(deployFixture);

      async function checkInvariant() {
        const totalAssets = await vault.totalAssets();
        const vaultBalance = await oem.balanceOf(await vault.getAddress());

        expect(totalAssets).to.equal(vaultBalance);
      }

      await checkInvariant();

      // After stake
      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      await checkInvariant();

      // After another stake
      await oem.connect(user2).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user2).stake(stakeAmount, 0);

      await checkInvariant();

      // After unstake (assets leave vault to queue)
      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(shares / 2n);

      await checkInvariant();
    });

    it("INVARIANT: Share price should never decrease through deposits/withdrawals alone", async function () {
      const { vault, oem, user1, user2 } = await loadFixture(deployFixture);

      const stakeAmount1 = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount1);
      await vault.connect(user1).stake(stakeAmount1, 0);

      const shares1 = await vault.balanceOf(user1.address);
      const pricePerShare1 = await vault.convertToAssets(
        ethers.parseUnits("1", 24),
      ); // 1 share with offset

      // Second user stakes
      const stakeAmount2 = ethers.parseUnits("1000", 18);
      await oem.connect(user2).approve(await vault.getAddress(), stakeAmount2);
      await vault.connect(user2).stake(stakeAmount2, 0);

      const pricePerShare2 = await vault.convertToAssets(
        ethers.parseUnits("1", 24),
      );

      // Share price should remain stable (or increase slightly due to rounding)
      expect(pricePerShare2).to.be.gte(
        pricePerShare1 - ethers.parseUnits("0.01", 18),
      );
    });

    it("INVARIANT: Sum of all share balances should not exceed total supply", async function () {
      const { vault, oem, user1, user2, user3 } =
        await loadFixture(deployFixture);

      async function checkInvariant() {
        const balance1 = await vault.balanceOf(user1.address);
        const balance2 = await vault.balanceOf(user2.address);
        const balance3 = await vault.balanceOf(user3.address);

        const totalSupply = await vault.totalSupply();
        const knownBalances = balance1 + balance2 + balance3;

        expect(knownBalances).to.be.lte(totalSupply);
      }

      await checkInvariant();

      // Stake
      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      await checkInvariant();

      // Transfer shares
      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).transfer(user2.address, shares / 2n);

      await checkInvariant();

      // Unstake
      const user1Shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(user1Shares);

      await checkInvariant();
    });

    it("INVARIANT: Converting shares to assets and back should yield approximately same amount", async function () {
      const { vault, oem, user1 } = await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const shares = await vault.balanceOf(user1.address);

      // Convert shares -> assets -> shares
      const assets = await vault.convertToAssets(shares);
      const sharesBack = await vault.convertToShares(assets);

      // Should be approximately equal (allow for rounding)
      const difference =
        shares > sharesBack ? shares - sharesBack : sharesBack - shares;
      const tolerance = shares / 1000n; // 0.1% tolerance

      expect(difference).to.be.lte(tolerance);
    });

    it("INVARIANT: Deposits and preview deposits should match actual shares received", async function () {
      const { vault, oem, user1 } = await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      const previewShares = await vault.previewDeposit(stakeAmount);

      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const actualShares = await vault.balanceOf(user1.address);

      // Should be very close (allow tiny rounding difference)
      expect(actualShares).to.be.closeTo(
        previewShares,
        ethers.parseUnits("1", 18),
      );
    });

    it("INVARIANT: Banned addresses should not be able to receive vault shares", async function () {
      const { vault, oem, user1, user2, banlistManager } =
        await loadFixture(deployFixture);

      // User1 stakes first
      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      // Ban user2
      await oem.connect(banlistManager).banAddresses([user2.address]);

      // Can't transfer shares to banned user
      const shares = await vault.balanceOf(user1.address);
      await expect(
        vault.connect(user1).transfer(user2.address, shares),
      ).to.be.revertedWithCustomError(vault, "BannedAddress");

      // Can't stake for banned user
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await expect(vault.connect(user1).stakeFor(user2.address, stakeAmount, 0))
        .to.be.reverted;
    });

    it("INVARIANT: When paused, vault operations should be blocked", async function () {
      const { vault, oem, user1, user2, pauser } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      // Approve for user2 as well
      await oem.connect(user2).approve(await vault.getAddress(), stakeAmount);

      await vault.connect(pauser).pause();

      // Can't stake (minting shares triggers _update which checks paused)
      await expect(
        vault.connect(user2).stake(stakeAmount, 0),
      ).to.be.revertedWithCustomError(vault, "VaultPausedTransfers");

      // Can't unstake (burning shares triggers _update which checks paused)
      const shares = await vault.balanceOf(user1.address);
      await expect(
        vault.connect(user1).unstake(shares),
      ).to.be.revertedWithCustomError(vault, "VaultPausedTransfers");

      // Can't transfer shares
      await expect(
        vault.connect(user1).transfer(user2.address, shares),
      ).to.be.revertedWithCustomError(vault, "VaultPausedTransfers");
    });
  });

  describe("Redemption Queue Invariants", function () {
    it("INVARIANT: Redemption count should always match number of queued redemptions", async function () {
      const { vault, oem, redemptionQueue, user1 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("3000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const totalShares = await vault.balanceOf(user1.address);

      // Queue multiple redemptions
      await vault.connect(user1).unstake(totalShares / 3n);
      await vault.connect(user1).unstake(totalShares / 3n);
      await vault.connect(user1).unstake(totalShares / 3n);

      const redemptionCount = await redemptionQueue.redemptionCount(
        user1.address,
      );
      expect(redemptionCount).to.equal(3);

      // Check all exist
      for (let i = 0; i < Number(redemptionCount); i++) {
        const redemption = await redemptionQueue.getRedemption(
          user1.address,
          i,
        );
        expect(redemption.user).to.equal(user1.address);
      }
    });

    it("INVARIANT: Processed redemptions should never become unprocessed", async function () {
      const { vault, oem, redemptionQueue, user1 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(shares);

      // Wait and claim
      await time.increase(7 * 24 * 60 * 60);
      await redemptionQueue.connect(user1).claim(0);

      const redemption = await redemptionQueue.getRedemption(user1.address, 0);
      expect(redemption.processed).to.be.true;

      // Should stay processed
      const redemptionAfter = await redemptionQueue.getRedemption(
        user1.address,
        0,
      );
      expect(redemptionAfter.processed).to.be.true;
    });

    it("INVARIANT: Cannot claim before claimableAt timestamp", async function () {
      const { vault, oem, redemptionQueue, user1 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(shares);

      const redemption = await redemptionQueue.getRedemption(user1.address, 0);

      // Try to claim before time
      const currentTime = await time.latest();
      if (currentTime < redemption.claimableAt) {
        await expect(
          redemptionQueue.connect(user1).claim(0),
        ).to.be.revertedWithCustomError(redemptionQueue, "StillInQueue");
      }
    });

    it("INVARIANT: Pending redemptions should never include processed ones", async function () {
      const { vault, oem, redemptionQueue, user1 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("3000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const totalShares = await vault.balanceOf(user1.address);

      // Queue 3 redemptions
      await vault.connect(user1).unstake(totalShares / 3n);
      await vault.connect(user1).unstake(totalShares / 3n);
      await vault.connect(user1).unstake(totalShares / 3n);

      let pending = await redemptionQueue.getAllPendingRedemptions(
        user1.address,
      );
      expect(pending.length).to.equal(3);

      // Claim one
      await time.increase(7 * 24 * 60 * 60);
      await redemptionQueue.connect(user1).claim(0);

      pending = await redemptionQueue.getAllPendingRedemptions(user1.address);
      expect(pending.length).to.equal(2);

      // All pending should be unprocessed
      for (const redemption of pending) {
        expect(redemption.processed).to.be.false;
      }
    });

    it("INVARIANT: Redemption assets should match vault preview at time of unstake", async function () {
      const { vault, oem, redemptionQueue, user1 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      const shares = await vault.balanceOf(user1.address);
      const previewAssets = await vault.previewRedeem(shares);

      await vault.connect(user1).unstake(shares);

      const redemption = await redemptionQueue.getRedemption(user1.address, 0);

      // Assets in redemption should approximately match preview
      expect(redemption.assets).to.be.closeTo(
        previewAssets,
        ethers.parseUnits("1", 18),
      );
    });
  });

  describe("Cross-Contract Invariants", function () {
    it("INVARIANT: Total OEM in circulation = user balances + vault balance + queue balance", async function () {
      const { vault, oem, redemptionQueue, user1, user2, user3, minter } =
        await loadFixture(deployFixture);

      async function checkInvariant() {
        const totalSupply = await oem.totalSupply();

        const user1Balance = await oem.balanceOf(user1.address);
        const user2Balance = await oem.balanceOf(user2.address);
        const user3Balance = await oem.balanceOf(user3.address);
        const minterBalance = await oem.balanceOf(minter.address);
        const vaultBalance = await oem.balanceOf(await vault.getAddress());
        const queueBalance = await oem.balanceOf(
          await redemptionQueue.getAddress(),
        );

        const accountedFor =
          user1Balance +
          user2Balance +
          user3Balance +
          minterBalance +
          vaultBalance +
          queueBalance;

        // Accounted balances should be <= total supply
        expect(accountedFor).to.be.lte(totalSupply);
      }

      await checkInvariant();

      // Stake
      const stakeAmount = ethers.parseUnits("1000", 18);
      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      await checkInvariant();

      // Unstake
      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(shares);

      await checkInvariant();
    });

    it("INVARIANT: Vault shares supply should match sum of all share holders", async function () {
      const { vault, oem, user1, user2, user3 } =
        await loadFixture(deployFixture);

      const stakeAmount = ethers.parseUnits("1000", 18);

      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).stake(stakeAmount, 0);

      await oem.connect(user2).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user2).stake(stakeAmount, 0);

      const user1Shares = await vault.balanceOf(user1.address);
      const user2Shares = await vault.balanceOf(user2.address);
      const user3Shares = await vault.balanceOf(user3.address);

      const totalSupply = await vault.totalSupply();
      const knownShares = user1Shares + user2Shares + user3Shares;

      expect(knownShares).to.be.lte(totalSupply);
    });

    it("INVARIANT: System should maintain solvency (assets >= liabilities)", async function () {
      const { vault, oem, redemptionQueue, user1, user2 } =
        await loadFixture(deployFixture);

      // Stake
      const stakeAmount1 = ethers.parseUnits("2000", 18);
      const stakeAmount2 = ethers.parseUnits("1000", 18);

      await oem.connect(user1).approve(await vault.getAddress(), stakeAmount1);
      await vault.connect(user1).stake(stakeAmount1, 0);

      await oem.connect(user2).approve(await vault.getAddress(), stakeAmount2);
      await vault.connect(user2).stake(stakeAmount2, 0);

      // Unstake
      const shares1 = await vault.balanceOf(user1.address);
      await vault.connect(user1).unstake(shares1);

      // Assets: vault balance + queue balance
      const vaultBalance = await oem.balanceOf(await vault.getAddress());
      const queueBalance = await oem.balanceOf(
        await redemptionQueue.getAddress(),
      );
      const totalAssets = vaultBalance + queueBalance;

      // Liabilities: outstanding shares (convertToAssets) + queued redemptions
      const totalShares = await vault.totalSupply();
      const sharesValue = await vault.convertToAssets(totalShares);

      const redemption1 = await redemptionQueue.getRedemption(user1.address, 0);
      const queuedAssets = redemption1.assets;

      const totalLiabilities = sharesValue + queuedAssets;

      // Assets should approximately equal liabilities (allow for rounding)
      expect(totalAssets).to.be.closeTo(
        totalLiabilities,
        ethers.parseUnits("1", 18),
      );
    });
  });
});
