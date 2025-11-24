;; Fun Liquidity Arcade
;; Users deposit STX into a shared pool, earn fun-score, and can spin a pseudo-random wheel
;; to win prizes from a reward pool that is funded by a fee on deposits.

(define-constant ERR-MIN-DEPOSIT u100)
(define-constant ERR-NO-PLAYER u404)
(define-constant ERR-WITHDRAW-TOO-MUCH u405)
(define-constant ERR-NO-LIQUIDITY u300)
(define-constant ERR-NO-REWARD u301)

(define-constant BPS-DENOM u10000)
(define-constant FEE-BPS u1000)                 ;; 10% of every deposit goes to the reward pool
(define-constant MIN-DEPOSIT u100000)          ;; 0.1 STX in micro-STX units
(define-constant MIN-LIQUIDITY-FOR-SPIN u1000000) ;; 1 STX required to spin the wheel

(define-data-var total-liquidity uint u0)
(define-data-var reward-pool uint u0)

(define-map players
  { user: principal }
  { balance: uint, fun-score: uint, spins: uint }
)

;; INTERNAL HELPERS

(define-private (get-or-default-player (user principal))
  (default-to { balance: u0, fun-score: u0, spins: u0 }
    (map-get? players { user: user })))

;; PUBLIC FUNCTIONS

(define-public (deposit (amount uint))
  (begin
    (asserts! (>= amount MIN-DEPOSIT) (err ERR-MIN-DEPOSIT))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (let
      (
        (fee (/ (* amount FEE-BPS) BPS-DENOM))
        (net (- amount fee))
        (current (get-or-default-player tx-sender))
        (new-balance (+ (get balance current) net))
        (new-score (+ (get fun-score current) (/ amount MIN-DEPOSIT)))
      )
      (begin
        (map-set players { user: tx-sender }
          { balance: new-balance, fun-score: new-score, spins: (get spins current) })
        (var-set total-liquidity (+ (var-get total-liquidity) net))
        (var-set reward-pool (+ (var-get reward-pool) fee))
        (ok { deposited: net, fee: fee, new-balance: new-balance, fun-score: new-score })
      )
    )
  )
)

(define-public (withdraw (amount uint))
  (let
    (
      (maybe-player (map-get? players { user: tx-sender }))
    )
    (match maybe-player
      player
        (begin
          (asserts! (> amount u0) (err ERR-WITHDRAW-TOO-MUCH))
          (let ((balance (get balance player)))
            (begin
              (asserts! (<= amount balance) (err ERR-WITHDRAW-TOO-MUCH))
              (try! (stx-transfer? amount (as-contract tx-sender) tx-sender))
              (let ((new-balance (- balance amount)))
                (begin
                  (map-set players { user: tx-sender }
                    { balance: new-balance, fun-score: (get fun-score player), spins: (get spins player) })
                  (var-set total-liquidity (- (var-get total-liquidity) amount))
                  (ok { withdrawn: amount, remaining: new-balance })
                )
              )
            )
          )
      )
      (err ERR-NO-PLAYER)
    )
  )
)

(define-public (spin-wheel (client-seed uint))
  (let
    (
      (maybe-player (map-get? players { user: tx-sender }))
    )
    (match maybe-player
      player
        (let
          (
            (balance (get balance player))
          )
          (begin
            (asserts! (>= balance MIN-LIQUIDITY-FOR-SPIN) (err ERR-NO-LIQUIDITY))
            (let
              (
                (pool (var-get reward-pool))
              )
              (begin
                (asserts! (> pool u0) (err ERR-NO-REWARD))
                (let
                  (
                    (raw (+ (* block-height u9973) client-seed))
                    (roll (+ (mod raw u20) u1))           ;; roll is between 1 and 20
                    (prize (/ (* pool roll) u100))        ;; up to 20% of the pool
                    (final-prize (if (> prize pool) pool prize))
                  )
                  (begin
                    (try! (stx-transfer? final-prize (as-contract tx-sender) tx-sender))
                    (var-set reward-pool (- pool final-prize))
                    (map-set players { user: tx-sender }
                      { balance: balance,
                        fun-score: (+ (get fun-score player) roll),
                        spins: (+ (get spins player) u1) })
                    (ok { roll: roll, prize: final-prize, remaining-pool: (var-get reward-pool) })
                  )
                )
              )
            )
          )
      )
      (err ERR-NO-PLAYER)
    )
  )
)

;; READ-ONLY VIEWS

(define-read-only (get-player (user principal))
  (ok (get-or-default-player user))
)

(define-read-only (get-total-liquidity)
  (ok (var-get total-liquidity))
)

(define-read-only (get-reward-pool)
  (ok (var-get reward-pool))
)
