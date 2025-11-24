// NOTE: This is a lightweight mock layer. In a full implementation, you would
// import `@stacks/transactions` and construct real contract-calls against a
// running Stacks node or Clarinet devnet.

const state = {
  connected: false,
  address: "SPTEST-ADDRESS-MOCK",
};

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setJson(id, data) {
  const el = document.getElementById(id);
  if (el) el.textContent = JSON.stringify(data, null, 2);
}

function requireConnected() {
  if (!state.connected) {
    alert("Connect your wallet first (mock)");
    return false;
  }
  return true;
}

// Wire up buttons
window.addEventListener("DOMContentLoaded", () => {
  const connectBtn = document.getElementById("connect");
  const depositBtn = document.getElementById("deposit");
  const withdrawBtn = document.getElementById("withdraw");
  const spinBtn = document.getElementById("spin");
  const refreshBtn = document.getElementById("refresh-status");

  connectBtn?.addEventListener("click", () => {
    state.connected = true;
    setText("connected-address", `Connected as ${state.address}`);
  });

  depositBtn?.addEventListener("click", async () => {
    if (!requireConnected()) return;
    const amountInput = document.getElementById("deposit-amount");
    const amountStx = Number(amountInput.value || "0");
    const amountUstx = Math.floor(amountStx * 1_000_000);

    // Here you would call `fun-liquidity-arcade::deposit` using @stacks/transactions
    const mockTx = {
      function: "deposit",
      args: { amountUstx },
      note: "Replace with real contract-call on devnet.",
    };
    setJson("deposit-result", mockTx);
  });

  withdrawBtn?.addEventListener("click", async () => {
    if (!requireConnected()) return;
    const amountInput = document.getElementById("withdraw-amount");
    const amountStx = Number(amountInput.value || "0");
    const amountUstx = Math.floor(amountStx * 1_000_000);

    const mockTx = {
      function: "withdraw",
      args: { amountUstx },
      note: "Replace with real contract-call on devnet.",
    };
    setJson("withdraw-result", mockTx);
  });

  spinBtn?.addEventListener("click", async () => {
    if (!requireConnected()) return;
    const seedInput = document.getElementById("client-seed");
    const seed = Number(seedInput.value || "0");

    const mockTx = {
      function: "spin-wheel",
      args: { clientSeed: seed },
      note: "Replace with real contract-call on devnet.",
    };
    setJson("spin-result", mockTx);
  });

  refreshBtn?.addEventListener("click", async () => {
    if (!requireConnected()) return;

    const mockStatus = {
      address: state.address,
      player: {
        balance: "900_000 uSTX (example)",
        funScore: 10,
        spins: 1,
      },
      totals: {
        totalLiquidity: "2_700_000 uSTX (example)",
        rewardPool: "300_000 uSTX (example)",
      },
      note:
        "In a real dApp, this would be fetched from read-only functions using a Stacks RPC endpoint.",
    };

    setJson("status-result", mockStatus);
  });
});
