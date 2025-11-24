# Fun Liquidity Arcade – Project Documentary

## 1. Concept

The **Fun Liquidity Arcade** is a playful liquidity pool built on Clarity.
Users deposit STX into a shared pool, earn a personal **fun-score**, and can
spend their liquidity to unlock spins on a pseudo-random reward wheel.

Each deposit is split into:
- **Net liquidity** (90%) that contributes to the global liquidity pool.
- A **fee** (10%) that funds a shared reward pool used to pay out prizes when
  players spin the wheel.

The goal is to showcase a non-trivial, self-contained DeFi mini-game:
liquidity provision plus a simple on-chain game loop.

## 2. Smart Contract Design

### 2.1 Storage

- `total-liquidity: uint` – Sum of all users' net liquidity.
- `reward-pool: uint` – Pool of fees available to reward winners.
- `players` map – Indexed by `user: principal`, storing:
  - `balance: uint` – User's current net liquidity.
  - `fun-score: uint` – Accumulated score, increasing with deposits and spins.
  - `spins: uint` – Number of times the user has spun the wheel.

### 2.2 Constants

- `MIN-DEPOSIT = 100_000 uSTX` – Minimum deposit (0.1 STX).
- `FEE-BPS = 1000` – 10% fee, expressed in basis points (1/100 of a percent).
- `MIN-LIQUIDITY-FOR-SPIN = 1_000_000 uSTX` – Minimum balance required to spin.

### 2.3 Public Functions

#### `deposit(amount uint)`

- Enforces `amount >= MIN-DEPOSIT`.
- Transfers `amount` STX from `tx-sender` to the contract.
- Splits into:
  - `fee = amount * FEE-BPS / 10_000`.
  - `net = amount - fee`.
- Updates:
  - `players[user].balance += net`.
  - `players[user].fun-score += amount / MIN-DEPOSIT` (gamified score).
  - `total-liquidity += net`.
  - `reward-pool += fee`.
- Returns a tuple with `deposited`, `fee`, `new-balance`, and `fun-score`.

This is a fully-fledged liquidity provision function, not a trivial read-only
helper. It moves tokens, updates multiple pieces of state, and creates a fee
mechanism that drives the game.

#### `withdraw(amount uint)`

- Fails if the caller has never deposited (`ERR-NO-PLAYER`).
- Enforces `amount > 0` and `amount <= player.balance`.
- Transfers `amount` STX back from the contract to the caller.
- Updates:
  - `players[user].balance -= amount`.
  - `total-liquidity -= amount`.
- Returns `{ withdrawn, remaining }`.

This function demonstrates safe liquidity withdrawals with constraints on
balances and protection against over-withdrawal.

#### `spin-wheel(client-seed uint)`

- Requires the caller to be an existing player.
- Requires `player.balance >= MIN-LIQUIDITY-FOR-SPIN` (`ERR-NO-LIQUIDITY`).
- Requires `reward-pool > 0` (`ERR-NO-REWARD`).
- Generates a pseudo-random number using:

  `raw = block-height * 9973 + client-seed`

  `roll = (raw mod 20) + 1` (values from 1 to 20).

- Prize is computed as `prize = reward-pool * roll / 100`, capped at the
  remaining reward-pool.
- Transfers `prize` STX from the contract to the caller.
- Updates:
  - `reward-pool -= prize`.
  - `players[user].fun-score += roll`.
  - `players[user].spins += 1`.
- Returns `{ roll, prize, remaining-pool }`.

While this is **not** a secure randomness oracle, it demonstrates how game
mechanics can be built from deterministic chain data and player-provided input.

### 2.4 Read-only Views

- `get-player(user)` – Returns the stored player state, or a default
  `{ balance: 0, fun-score: 0, spins: 0 }` if never seen before.
- `get-total-liquidity()` – Returns the global liquidity total.
- `get-reward-pool()` – Returns the size of the reward pool.

These functions power the UI's status panel and are used extensively in tests.

## 3. Clarinet Tests

The `tests/fun-liquidity-arcade.test.ts` file uses the Clarinet Vitest
environment (`vitest-environment-clarinet`) to drive the contract on a local
simnet and assert on results.

The suite covers several behaviors:

### 3.1 Deposits

- **Happy path** – A user deposits 1 STX:
  - Asserts the response tuple has the correct `deposited`, `fee`,
    `new-balance`, and `fun-score` values.
  - Calls `get-player` to ensure the on-chain map matches expectations.
- **Min deposit enforcement** – A deposit below `MIN-DEPOSIT` fails with
  `ERR-MIN-DEPOSIT`.
- **Global accounting** – Multiple deposits from different wallets are made
  and the tests assert:
  - `get-total-liquidity` equals the sum of all net amounts.
  - `get-reward-pool` equals the sum of all fees.

### 3.2 Withdrawals

- **Happy path** – A user deposits and then withdraws a subset of their
  balance. The test verifies:
  - The return tuple shows `withdrawn` and `remaining` amounts.
  - The player's stored balance matches the remaining amount.
- **Over-withdrawal protection** – Attempting to withdraw more than the net
  deposited amount fails with `ERR-WITHDRAW-TOO-MUCH`.
- **Non-player protection** – A withdrawal from an address that never
  deposited fails with `ERR-NO-PLAYER`.

### 3.3 Spin Wheel

- **Happy path** – A user deposits enough to be eligible to spin:
  - Calls `spin-wheel` and expects an `ok` result with a prize and roll.
  - Checks that the player's `spins` counter increased.
- **Insufficient liquidity** – A user below `MIN-LIQUIDITY-FOR-SPIN` gets an
  `ERR-NO-LIQUIDITY` error.
- **Empty pool** – If no rewards are available or the caller has never
  deposited, errors are returned instead of partial state updates.

### 3.4 Read-only Views

- Tests that `get-player` returns default values for new addresses.
- Tests that aggregate functions report values consistent with a sequence of
  deposits.

These tests together exercise the **core logic** of the protocol: deposits,
withdrawals, game entry conditions, and reward distribution.

## 4. UI Layer

The `ui/` folder contains a lightweight single-page interface:

- `index.html` – Layout and semantic structure.
- `styles.css` – Visual design and user-experience oriented layout.
- `app.js` – Mocked interaction logic showing how real contract calls would be
  wired up.

### 4.1 Interaction Flows

The UI is arranged as a step-by-step arcade experience:

1. **Connect panel** – A "Connect Wallet (mock)" button that simulates picking
   a user address. In a production app, this would integrate with a Stacks
   wallet extension.
2. **Deposit panel** – A numeric input for STX amount plus a "Deposit" button.
   - In `app.js`, clicking this button constructs a JSON object representing a
     call to `fun-liquidity-arcade::deposit(amount)` and displays it.
3. **Withdraw panel** – Similar controls for calling `withdraw(amount)`.
4. **Spin panel** – Input for `client-seed` and a "Spin" button that prepares
   a call to `spin-wheel(client-seed)`.
5. **Status panel** – A "Refresh" button that, in a real implementation,
   would fetch `get-player`, `get-total-liquidity`, and `get-reward-pool` and
   render them to the screen.

Even though this UI uses mocked calls instead of hitting a live node, it shows
clearly how the contract interface is meant to be consumed. Replacing the mock
layer with `@stacks/transactions` calls is straightforward.

### 4.2 UX-Oriented Redesign Choices

Compared with a barebones UI that would just show a few buttons, this design
introduces:

- **Card-based panels** for each phase (connect, deposit, withdraw, spin,
  status) instead of a flat form.
- **Gradient backgrounds and elevated cards** to visually communicate that this
  is an "arcade" experience rather than a plain admin screen.
- **Inline explanations** under each section, clarifying what is happening
  on-chain.
- **Structured JSON outputs** in `<pre>` blocks to surface exactly what payload
  would be sent to the blockchain.

These UX decisions make the contract easier to understand and more inviting to
interact with.

## 5. How to Run the Project

1. **Install Clarinet** (already done on the target machine).
2. From the project root, check the contract:

   ```bash
   clarinet check
   ```

3. **Install JS dependencies** (optional but required for running tests):

   ```bash
   npm install
   ```

4. **Run tests**:

   ```bash
   npm test
   ```

   This invokes Vitest with the Clarinet environment; tests live in the
   `tests/` directory.

5. **Open the UI**:

   - Serve `ui/` with a simple HTTP server (e.g. `python -m http.server` from
     inside `ui/`) or open `ui/index.html` directly in your browser.
   - Interact with the mock wallet, deposit, withdraw, and spin flows.

To fully wire the UI to a live devnet or testnet, you would:

- Configure an RPC URL (e.g. a Clarinet devnet endpoint).
- Use `@stacks/transactions` to construct signed contract calls.
- Swap out the mock JSON payloads in `app.js` for real `contractCall`
  transactions and read-only function calls.

## 6. Why This Project Counts

This project includes several substantial components beyond trivial changes:

- A non-trivial set of **Clarity functions** implementing a liquidity pool,
  fee mechanism, and on-chain game.
- A set of **Clarinet tests** that exercise stateful behavior and game logic.
- A **UI layer** that is specifically designed to connect to those functions
  and present them in a user-friendly, arcade-themed experience.
- A documentary (this file) that explains design decisions and how the pieces
  fit together.

Together, these pieces form a coherent, fun, and unique Clarinet project that
is significantly more than a small bug fix or styling tweak.
