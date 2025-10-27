(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-USER u201)
(define-constant ERR-INVALID-VERIFICATION u202)
(define-constant ERR-PROOF-ALREADY-GENERATED u203)
(define-constant ERR-INVALID-PROOF-HASH u204)
(define-constant ERR-INVALID-TIMESTAMP u205)
(define-constant ERR-INVALID-PLAN u206)
(define-constant ERR-INSUFFICIENT-SCORE u207)
(define-constant ERR-INVALID-PROOF-ID u208)
(define-constant ERR-INVALID-EXPIRY u209)
(define-constant ERR-PROOF-EXPIRED u210)
(define-constant ERR-INVALID-METADATA u211)
(define-constant ERR-INVALID-ISSUER u212)
(define-constant ERR-MAX-PROOFS-EXCEEDED u213)
(define-constant ERR-INVALID-VERIFIER u214)
(define-constant ERR-INVALID-STATUS u215)
(define-constant ERR-INVALID-REQUEST u216)
(define-constant ERR-INVALID-PLAN-ID u217)
(define-constant ERR-INVALID-PERIOD u218)
(define-constant ERR-VERIFICATION-FAILED u219)

(define-trait adherence-verifier-trait
  (
    (get-verification ({ user: principal, period-start: uint, period-end: uint }) (response { score: uint, status: bool, timestamp: uint } uint))
  )
)

(define-data-var admin principal tx-sender)
(define-data-var max-proofs uint u1000)
(define-data-var proof-fee uint u200)
(define-data-var proof-expiry uint u52560)
(define-data-var next-proof-id uint u0)

(define-map proofs
  uint
  { user: principal, period-start: uint, period-end: uint, score: uint, proof-hash: (buff 32), issued-at: uint, expiry: uint, status: bool, plan-id: uint }
)

(define-map proof-by-user
  { user: principal, period-start: uint, period-end: uint }
  uint
)

(define-read-only (get-proof (proof-id uint))
  (map-get? proofs proof-id)
)

(define-read-only (get-proof-by-user ({ user: principal, period-start: uint, period-end: uint }))
  (map-get? proof-by-user { user: user, period-start: period-start, period-end: period-end })
)

(define-private (validate-user (user principal))
  (if (is-eq user tx-sender) (ok true) (err ERR-NOT-AUTHORIZED))
)

(define-private (validate-verification (verif { score: uint, status: bool, timestamp: uint }) (min-score uint))
  (if (and (get status verif) (>= (get score verif) min-score)) (ok true) (err ERR-INSUFFICIENT-SCORE))
)

(define-private (validate-expiry (expiry uint))
  (if (> expiry block-height) (ok true) (err ERR-INVALID-EXPIRY))
)

(define-private (validate-proof-hash (hash (buff 32)))
  (if (> (len hash) u0) (ok true) (err ERR-INVALID-PROOF-HASH))
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-max-proofs (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-PROOF-ID))
    (var-set max-proofs new-max)
    (ok true)
  )
)

(define-public (set-proof-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set proof-fee new-fee)
    (ok true)
  )
)

(define-public (set-proof-expiry (new-expiry uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-expiry u0) (err ERR-INVALID-EXPIRY))
    (var-set proof-expiry new-expiry)
    (ok true)
  )
)

(define-public (generate-proof
  (period-start uint)
  (period-end uint)
  (plan-id uint)
  (proof-hash (buff 32))
  (verifier <adherence-verifier-trait>)
)
  (let
    (
      (user tx-sender)
      (proof-id (var-get next-proof-id))
      (verif (unwrap! (contract-call? verifier get-verification { user: user, period-start: period-start, period-end: period-end }) (err ERR-INVALID-VERIFICATION)))
      (min-score (var-get proof-fee))
      (expiry (+ block-height (var-get proof-expiry)))
    )
    (try! (validate-user user))
    (try! (validate-verification verif min-score))
    (try! (validate-proof-hash proof-hash))
    (asserts! (< proof-id (var-get max-proofs)) (err ERR-MAX-PROOFS-EXCEEDED))
    (asserts! (is-none (map-get? proof-by-user { user: user, period-start: period-start, period-end: period-end })) (err ERR-PROOF-ALREADY-GENERATED))
    (try! (stx-transfer? (var-get proof-fee) tx-sender (var-get admin)))
    (map-set proofs proof-id
      { user: user, period-start: period-start, period-end: period-end, score: (get score verif), proof-hash: proof-hash, issued-at: block-height, expiry: expiry, status: true, plan-id: plan-id }
    )
    (map-set proof-by-user { user: user, period-start: period-start, period-end: period-end } proof-id)
    (var-set next-proof-id (+ proof-id u1))
    (print { event: "proof-generated", proof-id: proof-id, user: user })
    (ok proof-id)
  )
)

(define-public (verify-proof (proof-id uint))
  (let
    (
      (proof (unwrap! (map-get? proofs proof-id) (err ERR-INVALID-PROOF-ID)))
      (expiry (get expiry proof))
    )
    (try! (validate-expiry expiry))
    (ok (get status proof))
  )
)

(define-public (revoke-proof (proof-id uint))
  (let
    (
      (proof (unwrap! (map-get? proofs proof-id) (err ERR-INVALID-PROOF-ID)))
      (user (get user proof))
    )
    (asserts! (or (is-eq tx-sender (var-get admin)) (is-eq tx-sender user)) (err ERR-NOT-AUTHORIZED))
    (map-set proofs proof-id
      { user: user, period-start: (get period-start proof), period-end: (get period-end proof), score: (get score proof), proof-hash: (get proof-hash proof), issued-at: (get issued-at proof), expiry: (get expiry proof), status: false, plan-id: (get plan-id proof) }
    )
    (print { event: "proof-revoked", proof-id: proof-id })
    (ok true)
  )
)