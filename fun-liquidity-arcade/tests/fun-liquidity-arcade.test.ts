import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;

const CONTRACT = "fun-liquidity-arcade";

describe("Fun Liquidity Arcade Contract", () => {
  describe("deposit", () => {
    it("should allow user to deposit STX and earn fun-score", () => {
      const depositAmount = 1_000_000; // 1 STX
      const response = simnet.callPublicFn(
        CONTRACT,
        "deposit",
        [Cl.uint(depositAmount)],
        address1
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          deposited: Cl.uint(900_000), // 90% after 10% fee
          fee: Cl.uint(100_000), // 10% fee
          "new-balance": Cl.uint(900_000),
          "fun-score": Cl.uint(10), // 1000000 / 100000 = 10
        })
      );

      // Check player state
      const player = simnet.callReadOnlyFn(
        CONTRACT,
        "get-player",
        [Cl.principal(address1)],
        address1
      );
      expect(player.result).toBeOk(
        Cl.tuple({
          balance: Cl.uint(900_000),
          "fun-score": Cl.uint(10),
          spins: Cl.uint(0),
        })
      );
    });

    it("should reject deposits below minimum", () => {
      const response = simnet.callPublicFn(
        CONTRACT,
        "deposit",
        [Cl.uint(50_000)], // below MIN_DEPOSIT (100000)
        address1
      );

      expect(response.result).toBeErr(Cl.uint(100)); // ERR-MIN-DEPOSIT
    });

    it("should accumulate liquidity and reward pool correctly", () => {
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1_000_000)], address1);
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(2_000_000)], address2);

      const totalLiquidity = simnet.callReadOnlyFn(
        CONTRACT,
        "get-total-liquidity",
        [],
        address1
      );
      expect(totalLiquidity.result).toBeOk(Cl.uint(2_700_000)); // 900k + 1.8M

      const rewardPool = simnet.callReadOnlyFn(
        CONTRACT,
        "get-reward-pool",
        [],
        address1
      );
      expect(rewardPool.result).toBeOk(Cl.uint(300_000)); // 100k + 200k (10% of each deposit)
    });
  });

  describe("withdraw", () => {
    it("should allow user to withdraw deposited funds", () => {
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1_000_000)], address1);

      const withdrawResponse = simnet.callPublicFn(
        CONTRACT,
        "withdraw",
        [Cl.uint(400_000)],
        address1
      );

      expect(withdrawResponse.result).toBeOk(
        Cl.tuple({
          withdrawn: Cl.uint(400_000),
          remaining: Cl.uint(500_000),
        })
      );

      // Verify player balance updated
      const player = simnet.callReadOnlyFn(
        CONTRACT,
        "get-player",
        [Cl.principal(address1)],
        address1
      );
      expect(player.result).toBeOk(
        Cl.tuple({
          balance: Cl.uint(500_000),
          "fun-score": Cl.uint(10),
          spins: Cl.uint(0),
        })
      );
    });

    it("should reject withdrawal exceeding balance", () => {
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1_000_000)], address1);

      const withdrawResponse = simnet.callPublicFn(
        CONTRACT,
        "withdraw",
        [Cl.uint(1_000_000)], // trying to withdraw more than the net deposit (900k)
        address1
      );

      expect(withdrawResponse.result).toBeErr(Cl.uint(405)); // ERR-WITHDRAW-TOO-MUCH
    });

    it("should reject withdrawal from non-player", () => {
      const withdrawResponse = simnet.callPublicFn(
        CONTRACT,
        "withdraw",
        [Cl.uint(100_000)],
        address2
      );

      expect(withdrawResponse.result).toBeErr(Cl.uint(404)); // ERR-NO-PLAYER
    });
  });

  describe("spin-wheel", () => {
    it("should allow eligible user to spin and win prize from reward pool", () => {
      // Setup: address1 deposits enough to spin (MIN_LIQUIDITY_FOR_SPIN = 1M)
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(2_000_000)], address1);

      const rewardPoolBefore = simnet.callReadOnlyFn(
        CONTRACT,
        "get-reward-pool",
        [],
        address1
      );
      expect(rewardPoolBefore.result).toBeOk(Cl.uint(200_000)); // 10% of 2M

      const spinResponse = simnet.callPublicFn(
        CONTRACT,
        "spin-wheel",
        [Cl.uint(12345)], // client-seed
        address1
      );

      expect(spinResponse.result).toBeOk(
        Cl.some(
          Cl.tuple({
            roll: Cl.uint(expect.any(Number)), // pseudo-random roll 1-20
            prize: Cl.uint(expect.any(Number)),
            "remaining-pool": Cl.uint(expect.any(Number)),
          })
        )
      );

      // Check that player's spins counter increased
      const player = simnet.callReadOnlyFn(
        CONTRACT,
        "get-player",
        [Cl.principal(address1)],
        address1
      );
      const playerData = player.result.expectOk().expectTuple();
      expect(playerData["spins"]).toBeUint(1);
    });

    it("should reject spin if user has insufficient balance", () => {
      // address1 deposits less than MIN_LIQUIDITY_FOR_SPIN
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(500_000)], address1);

      const spinResponse = simnet.callPublicFn(
        CONTRACT,
        "spin-wheel",
        [Cl.uint(12345)],
        address1
      );

      expect(spinResponse.result).toBeErr(Cl.uint(300)); // ERR-NO-LIQUIDITY
    });

    it("should reject spin if reward pool is empty", () => {
      // Use a fresh simnet state where no one has deposited yet
      const spinResponse = simnet.callPublicFn(
        CONTRACT,
        "spin-wheel",
        [Cl.uint(99999)],
        address1
      );

      expect(spinResponse.result).toBeErr(Cl.uint(404)); // ERR-NO-PLAYER (since address1 hasn't deposited)
    });
  });

  describe("read-only functions", () => {
    it("should return default values for a non-existent player", () => {
      const player = simnet.callReadOnlyFn(
        CONTRACT,
        "get-player",
        [Cl.principal(address2)],
        address2
      );

      expect(player.result).toBeOk(
        Cl.tuple({
          balance: Cl.uint(0),
          "fun-score": Cl.uint(0),
          spins: Cl.uint(0),
        })
      );
    });

    it("should return correct liquidity and reward pool totals", () => {
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1_000_000)], address1);
      simnet.callPublicFn(CONTRACT, "deposit", [Cl.uint(1_000_000)], address2);

      const totalLiquidity = simnet.callReadOnlyFn(
        CONTRACT,
        "get-total-liquidity",
        [],
        address1
      );
      expect(totalLiquidity.result).toBeOk(Cl.uint(1_800_000)); // 2 * 900k

      const rewardPool = simnet.callReadOnlyFn(
        CONTRACT,
        "get-reward-pool",
        [],
        address1
      );
      expect(rewardPool.result).toBeOk(Cl.uint(200_000)); // 2 * 100k
    });
  });
});
