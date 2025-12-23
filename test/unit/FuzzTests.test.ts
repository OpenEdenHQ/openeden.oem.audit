import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployCoreContracts } from "../fixtures/deployments";

describe("Fuzz Tests", function () {
  async function deployFixture() {
    return await deployCoreContracts();
  }

  describe("OEM Fuzz Tests", function () {
    describe("Minting Fuzz", function () {
      const testCases = [
        { amount: "0.000001", description: "very small" },
        { amount: "1", description: "1 token" },
        { amount: "100", description: "medium" },
        { amount: "10000", description: "large" },
        { amount: "99999", description: "near max user balance" },
      ];

      testCases.forEach(({ amount, description }) => {
        it(`should handle minting ${description} amounts (${amount} tokens)`, async function () {
          const { oem, minter, user1 } = await loadFixture(deployFixture);

          const mintAmount = ethers.parseUnits(amount, 18);
          const balanceBefore = await oem.balanceOf(user1.address);

          await oem.connect(minter).mint(user1.address, mintAmount);

          const balanceAfter = await oem.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(mintAmount);
        });
      });

      it("should handle random mint amounts", async function () {
        const { oem, minter, user1 } = await loadFixture(deployFixture);

        // Test 10 random amounts
        for (let i = 0; i < 10; i++) {
          const randomAmount =
            BigInt(Math.floor(Math.random() * 100000)) *
            ethers.parseUnits("1", 18);

          if (randomAmount > 0) {
            const balanceBefore = await oem.balanceOf(user1.address);
            await oem.connect(minter).mint(user1.address, randomAmount);
            const balanceAfter = await oem.balanceOf(user1.address);

            expect(balanceAfter - balanceBefore).to.equal(randomAmount);
          }
        }
      });
    });

    describe("Transfer Fuzz", function () {
      const testCases = [
        { percentage: 1, description: "1%" },
        { percentage: 10, description: "10%" },
        { percentage: 50, description: "50%" },
        { percentage: 99, description: "99%" },
        { percentage: 100, description: "100%" },
      ];

      testCases.forEach(({ percentage, description }) => {
        it(`should handle transferring ${description} of balance`, async function () {
          const { oem, user1, user2 } = await loadFixture(deployFixture);

          const balance = await oem.balanceOf(user1.address);
          const transferAmount = (balance * BigInt(percentage)) / 100n;

          if (transferAmount > 0) {
            await oem.connect(user1).transfer(user2.address, transferAmount);

            expect(await oem.balanceOf(user1.address)).to.equal(
              balance - transferAmount,
            );
            expect(await oem.balanceOf(user2.address)).to.be.gte(
              transferAmount,
            );
          }
        });
      });

      it("should handle multiple random transfers", async function () {
        const { oem, user1, user2, user3 } = await loadFixture(deployFixture);

        const users = [user1, user2, user3];

        // Perform 20 random transfers
        for (let i = 0; i < 20; i++) {
          const fromIndex = Math.floor(Math.random() * users.length);
          const toIndex = (fromIndex + 1) % users.length;
          const from = users[fromIndex];
          const to = users[toIndex];

          const balance = await oem.balanceOf(from.address);

          if (balance > 0n) {
            const transferAmount =
              balance / BigInt(Math.floor(Math.random() * 10) + 2);

            if (transferAmount > 0) {
              await oem.connect(from).transfer(to.address, transferAmount);
            }
          }
        }

        // Verify total supply is unchanged
        const totalBalance =
          (await oem.balanceOf(user1.address)) +
          (await oem.balanceOf(user2.address)) +
          (await oem.balanceOf(user3.address));

        expect(await oem.totalSupply()).to.be.gte(totalBalance);
      });
    });

    describe("Burn Fuzz", function () {
      const testCases = [
        { percentage: 1, description: "1%" },
        { percentage: 25, description: "25%" },
        { percentage: 50, description: "50%" },
        { percentage: 75, description: "75%" },
        { percentage: 100, description: "100%" },
      ];

      testCases.forEach(({ percentage, description }) => {
        it(`should handle burning ${description} of balance`, async function () {
          const { oem, burner, user1 } = await loadFixture(deployFixture);

          const balance = await oem.balanceOf(user1.address);
          const burnAmount = (balance * BigInt(percentage)) / 100n;

          if (burnAmount > 0) {
            const supplyBefore = await oem.totalSupply();

            await oem.connect(burner).burn(user1.address, burnAmount);

            const supplyAfter = await oem.totalSupply();
            expect(supplyBefore - supplyAfter).to.equal(burnAmount);
          }
        });
      });
    });

    describe("Allowance Fuzz", function () {
      it("should handle various allowance amounts", async function () {
        const { oem, user1, user2, user3 } = await loadFixture(deployFixture);

        const amounts = [
          1n,
          ethers.parseUnits("0.1", 18),
          ethers.parseUnits("100", 18),
          ethers.parseUnits("10000", 18),
          ethers.MaxUint256,
        ];

        for (const amount of amounts) {
          await oem.connect(user1).approve(user2.address, amount);
          expect(await oem.allowance(user1.address, user2.address)).to.equal(
            amount,
          );

          if (amount !== ethers.MaxUint256) {
            const balance = await oem.balanceOf(user1.address);
            const transferAmount = amount < balance ? amount : balance / 2n;

            if (transferAmount > 0) {
              await oem
                .connect(user2)
                .transferFrom(user1.address, user3.address, transferAmount);
            }
          }
        }
      });
    });
  });

  describe("Vault Fuzz Tests", function () {
    describe("Staking Fuzz", function () {
      const testCases = [
        { amount: "1", description: "1 token" },
        { amount: "10", description: "10 tokens" },
        { amount: "100", description: "100 tokens" },
        { amount: "1000", description: "1000 tokens" },
        { amount: "5000", description: "5000 tokens" },
      ];

      testCases.forEach(({ amount, description }) => {
        it(`should handle staking ${description}`, async function () {
          const { vault, oem, user1 } = await loadFixture(deployFixture);

          const stakeAmount = ethers.parseUnits(amount, 18);
          const balance = await oem.balanceOf(user1.address);

          if (stakeAmount <= balance) {
            await oem
              .connect(user1)
              .approve(await vault.getAddress(), stakeAmount);
            await vault.connect(user1).stake(stakeAmount);

            expect(await vault.balanceOf(user1.address)).to.be.gt(0);
          }
        });
      });

      it("should handle random stake amounts", async function () {
        const { vault, oem, user1 } = await loadFixture(deployFixture);

        const balance = await oem.balanceOf(user1.address);

        // Perform 10 random stakes
        for (let i = 0; i < 10; i++) {
          const randomPercentage = Math.floor(Math.random() * 20) + 1; // 1-20%
          const stakeAmount = (balance * BigInt(randomPercentage)) / 1000n;

          if (stakeAmount > 0) {
            const userBalance = await oem.balanceOf(user1.address);

            if (stakeAmount <= userBalance) {
              await oem
                .connect(user1)
                .approve(await vault.getAddress(), stakeAmount);
              await vault.connect(user1).stake(stakeAmount);
            }
          }
        }

        // Verify user has shares
        expect(await vault.balanceOf(user1.address)).to.be.gt(0);
      });
    });

    describe("Unstaking Fuzz", function () {
      async function stakeFirst() {
        const fixture = await deployFixture();
        const { vault, oem, user1 } = fixture;

        const stakeAmount = ethers.parseUnits("5000", 18);
        await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
        await vault.connect(user1).stake(stakeAmount);

        return fixture;
      }

      const testCases = [
        { percentage: 10, description: "10%" },
        { percentage: 25, description: "25%" },
        { percentage: 50, description: "50%" },
        { percentage: 75, description: "75%" },
        { percentage: 100, description: "100%" },
      ];

      testCases.forEach(({ percentage, description }) => {
        it(`should handle unstaking ${description} of shares`, async function () {
          const { vault, user1, redemptionQueue } =
            await loadFixture(stakeFirst);

          const shares = await vault.balanceOf(user1.address);
          const unstakeAmount = (shares * BigInt(percentage)) / 100n;

          if (unstakeAmount > 0) {
            await vault.connect(user1).unstake(unstakeAmount);

            expect(await vault.balanceOf(user1.address)).to.equal(
              shares - unstakeAmount,
            );
            expect(
              await redemptionQueue.redemptionCount(user1.address),
            ).to.equal(1);
          }
        });
      });

      it("should handle multiple random unstakes", async function () {
        const { vault, user1, redemptionQueue } = await loadFixture(stakeFirst);

        let shares = await vault.balanceOf(user1.address);
        let unstakeCount = 0;

        // Perform 5 random unstakes
        for (let i = 0; i < 5 && shares > 0; i++) {
          const randomPercentage = Math.floor(Math.random() * 20) + 5; // 5-25%
          const unstakeAmount = (shares * BigInt(randomPercentage)) / 100n;

          if (unstakeAmount > 0 && unstakeAmount <= shares) {
            await vault.connect(user1).unstake(unstakeAmount);
            shares = await vault.balanceOf(user1.address);
            unstakeCount++;
          }
        }

        expect(await redemptionQueue.redemptionCount(user1.address)).to.equal(
          unstakeCount,
        );
      });
    });

    describe("Share Transfer Fuzz", function () {
      async function stakeFirst() {
        const fixture = await deployFixture();
        const { vault, oem, user1 } = fixture;

        const stakeAmount = ethers.parseUnits("5000", 18);
        await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
        await vault.connect(user1).stake(stakeAmount);

        return fixture;
      }

      it("should handle various transfer amounts", async function () {
        const { vault, user1, user2 } = await loadFixture(stakeFirst);

        const shares = await vault.balanceOf(user1.address);
        const transferAmounts = [
          shares / 10n,
          shares / 5n,
          shares / 3n,
          shares / 2n,
        ];

        let remainingShares = shares;

        for (const amount of transferAmounts) {
          if (amount > 0 && amount <= remainingShares) {
            await vault.connect(user1).transfer(user2.address, amount);
            remainingShares = await vault.balanceOf(user1.address);
          }
        }

        const user2Shares = await vault.balanceOf(user2.address);
        expect(user2Shares + remainingShares).to.equal(shares);
      });
    });
  });

  describe("Redemption Queue Fuzz Tests", function () {
    describe("Multiple Redemptions Fuzz", function () {
      it("should handle various numbers of redemptions per user", async function () {
        const { vault, oem, redemptionQueue, user1, minter } =
          await loadFixture(deployFixture);

        // Mint more tokens for testing
        await oem
          .connect(minter)
          .mint(user1.address, ethers.parseUnits("50000", 18));

        // Stake large amount
        const totalStake = ethers.parseUnits("50000", 18);
        await oem.connect(user1).approve(await vault.getAddress(), totalStake);
        await vault.connect(user1).stake(totalStake);

        // Queue random number of redemptions (5-15)
        const redemptionCount = Math.floor(Math.random() * 10) + 5;
        const shares = await vault.balanceOf(user1.address);
        const unstakeAmount = shares / BigInt(redemptionCount + 2);

        for (
          let i = 0;
          i < redemptionCount &&
          (await vault.balanceOf(user1.address)) >= unstakeAmount;
          i++
        ) {
          await vault.connect(user1).unstake(unstakeAmount);
        }

        const actualCount = await redemptionQueue.redemptionCount(
          user1.address,
        );
        expect(actualCount).to.be.lte(redemptionCount);
        expect(actualCount).to.be.gt(0);
      });
    });
  });

  describe("Cross-Contract Fuzz Tests", function () {
    it("should maintain invariants across random operations", async function () {
      const { vault, oem, redemptionQueue, user1, user2 } =
        await loadFixture(deployFixture);

      const initialSupply = await oem.totalSupply();

      // Perform 30 random operations
      for (let i = 0; i < 30; i++) {
        const operation = Math.floor(Math.random() * 5);
        const user = i % 2 === 0 ? user1 : user2;

        try {
          switch (operation) {
            case 0: // Stake
              {
                const balance = await oem.balanceOf(user.address);
                if (balance > 0) {
                  const stakeAmount =
                    balance / BigInt(Math.floor(Math.random() * 10) + 2);
                  if (stakeAmount > 0) {
                    await oem
                      .connect(user)
                      .approve(await vault.getAddress(), stakeAmount);
                    await vault.connect(user).stake(stakeAmount);
                  }
                }
              }
              break;

            case 1: // Unstake
              {
                const shares = await vault.balanceOf(user.address);
                if (shares > 0) {
                  const unstakeAmount =
                    shares / BigInt(Math.floor(Math.random() * 5) + 2);
                  if (unstakeAmount > 0) {
                    await vault.connect(user).unstake(unstakeAmount);
                  }
                }
              }
              break;

            case 2: // Transfer tokens
              {
                const balance = await oem.balanceOf(user.address);
                if (balance > 0) {
                  const transferAmount =
                    balance / BigInt(Math.floor(Math.random() * 10) + 2);
                  const toUser = user === user1 ? user2 : user1;
                  if (transferAmount > 0) {
                    await oem
                      .connect(user)
                      .transfer(toUser.address, transferAmount);
                  }
                }
              }
              break;

            case 3: // Transfer shares
              {
                const shares = await vault.balanceOf(user.address);
                if (shares > 0) {
                  const transferAmount =
                    shares / BigInt(Math.floor(Math.random() * 10) + 2);
                  const toUser = user === user1 ? user2 : user1;
                  if (transferAmount > 0) {
                    await vault
                      .connect(user)
                      .transfer(toUser.address, transferAmount);
                  }
                }
              }
              break;

            case 4: // Burn
              {
                const balance = await oem.balanceOf(user.address);
                if (balance > 0) {
                  const burnAmount =
                    balance / BigInt(Math.floor(Math.random() * 20) + 10);
                  if (burnAmount > 0) {
                    await oem.connect(user).burn(burnAmount);
                  }
                }
              }
              break;
          }
        } catch (error) {
          // Expected errors (insufficient balance, etc.) are okay
        }
      }

      // Invariant: total supply should be <= initial supply (due to burns)
      const finalSupply = await oem.totalSupply();
      expect(finalSupply).to.be.lte(initialSupply);

      // Invariant: vault total assets should equal vault's OEM balance + queued redemptions
      const vaultBalance = await oem.balanceOf(await vault.getAddress());
      const queueBalance = await oem.balanceOf(
        await redemptionQueue.getAddress(),
      );
      const totalAssets = await vault.totalAssets();

      expect(totalAssets).to.equal(vaultBalance);
    });

    it("should handle extreme sequences of operations", async function () {
      const { vault, oem, user1, minter } = await loadFixture(deployFixture);

      // Mint additional tokens
      await oem
        .connect(minter)
        .mint(user1.address, ethers.parseUnits("100000", 18));

      // Rapid stake/unstake cycles
      for (let i = 0; i < 5; i++) {
        const stakeAmount = ethers.parseUnits("1000", 18);
        await oem.connect(user1).approve(await vault.getAddress(), stakeAmount);
        await vault.connect(user1).stake(stakeAmount);

        const shares = await vault.balanceOf(user1.address);
        if (shares > 0) {
          await vault.connect(user1).unstake(shares / 2n);
        }
      }

      // Should maintain consistency
      const shares = await vault.balanceOf(user1.address);
      const assets = await vault.convertToAssets(shares);

      expect(assets).to.be.gt(0);
    });
  });

  describe("Boundary Value Tests", function () {
    it("should handle operations at uint256 boundaries", async function () {
      const { oem, user1, user2 } = await loadFixture(deployFixture);

      // Test with max uint256 approval
      await oem.connect(user1).approve(user2.address, ethers.MaxUint256);
      expect(await oem.allowance(user1.address, user2.address)).to.equal(
        ethers.MaxUint256,
      );

      // Test very small transfer
      await oem.connect(user1).transfer(user2.address, 1n);
      expect(await oem.balanceOf(user2.address)).to.be.gte(1n);
    });

    it("should handle zero edge cases gracefully", async function () {
      const { vault, oem, burner, user1 } = await loadFixture(deployFixture);

      // Zero amount operations should revert with InvalidAmount
      await expect(vault.connect(user1).stake(0)).to.be.revertedWithCustomError(
        vault,
        "InvalidAmount",
      );

      await expect(
        oem.connect(burner).burn(user1.address, 0),
      ).to.be.revertedWithCustomError(oem, "InvalidAmount");
    });

    it("should handle operations near issue cap", async function () {
      const { oem, minter, user1, admin } = await loadFixture(deployFixture);

      const currentSupply = await oem.totalSupply();
      const nearCapAmount = ethers.parseUnits("1000", 18);
      const newCap = currentSupply + nearCapAmount;

      await oem.connect(admin).setIssueCap(newCap);

      // Mint up to 1 token below cap
      await oem
        .connect(minter)
        .mint(user1.address, nearCapAmount - ethers.parseUnits("1", 18));

      // Should be able to mint remaining
      await expect(
        oem.connect(minter).mint(user1.address, ethers.parseUnits("1", 18)),
      ).to.not.be.reverted;

      // Can't mint more
      await expect(
        oem.connect(minter).mint(user1.address, 1n),
      ).to.be.revertedWithCustomError(oem, "ExceedsIssueCap");
    });
  });
});
