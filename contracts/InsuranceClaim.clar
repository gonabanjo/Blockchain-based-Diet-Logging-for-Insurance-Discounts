(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-PROOF u301)
(define-constant ERR-INVALID-INSURER u302)
(define-constant ERR-CLAIM-ALREADY-SUBMITTED u303)
(define-constant ERR-INVALID-CLAIM-ID u304)
(define-constant ERR-INVALID-TIMESTAMP u305)
(define-constant ERR-PROOF-EXPIRED u306)
(define-constant ERR-INVALID-STATUS u307)
(define-constant ERR-INVALID-AMOUNT u308)
(define-constant ERR-INVALID-USER u309)
(define-constant ERR-PROOF-NOT-VERIFIED u310)
(define-constant ERR-INVALID-REQUEST u311)
(define-constant ERR-MAX-CLAIMS-EXCEEDED u312)
(define-constant ERR-INVALID-DISCOUNT u313)
(define-constant ERR-INSURER-NOT-REGISTERED u314)
(define-constant ERR-CLAIM-NOT-FOUND u315)
(define-constant ERR-INVALID-UPDATE u316)
(define-constant ERR-INVALID-PLAN-ID u317)
(define-constant ERR-INVALID-PERIOD u318)
(define-constant ERR-PROOF-INVALIDATED u319)

(define-trait proof-generator-trait
  (
    (get-proof (uint) (response { user: principal, period-start: uint, period-end: uint, score: uint, proof-hash: (buff 32), issued-at: uint, expiry: uint, status: bool, plan-id: uint } uint))
    (verify-proof (uint) (response bool uint))
  )
)

(define-data-var admin principal tx-sender)
(define-data-var max-claims uint u1000)
(define-data-var claim-fee uint u100)
(define-data-var next-claim-id uint u0)
(define-map insurers principal bool)
(define-map claims uint { user: principal, proof-id: uint, insurer: principal, discount-amount: uint, status: (string-ascii 20), submitted-at: uint })
(define-map claims-by-user { user: principal, proof-id: uint } uint)

(define-read-only (get-claim (claim-id uint))
  (map-get? claims claim-id)
)

(define-read-only (get-claim-by-user ({ user: principal, proof-id: uint }))
  (map-get? claims-by-user { user: user, proof-id: proof-id })
)

(define-read-only (is-insurer (insurer principal))
  (default-to false (map-get? insurers insurer))
)

(define-private (validate-user (user principal))
  (if (is-eq user tx-sender) (ok true) (err ERR-NOT-AUTHORIZED))
)

(define-private (validate-insurer (insurer principal))
  (if (is-some (map-get? insurers insurer)) (ok true) (err ERR-INSURER-NOT-REGISTERED))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0) (ok true) (err ERR-INVALID-AMOUNT))
)

(define-public (register-insurer (insurer principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (map-set insurers insurer true)
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-max-claims (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-CLAIM-ID))
    (var-set max-claims new-max)
    (ok true)
  )
)

(define-public (set-claim-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set claim-fee new-fee)
    (ok true)
  )
)

(define-public (submit-claim (proof-id uint) (insurer principal) (discount-amount uint) (proof-gen <proof-generator-trait>))
  (let
    (
      (user tx-sender)
      (claim-id (var-get next-claim-id))
      (proof (unwrap! (contract-call? proof-gen get-proof proof-id) (err ERR-INVALID-PROOF)))
      (proof-status (unwrap! (contract-call? proof-gen verify-proof proof-id) (err ERR-PROOF-NOT-VERIFIED)))
    )
    (try! (validate-user user))
    (try! (validate-insurer insurer))
    (try! (validate-amount discount-amount))
    (asserts! (is-eq (get user proof) user) (err ERR-INVALID-USER))
    (asserts! proof-status (err ERR-PROOF-INVALIDATED))
    (asserts! (< claim-id (var-get max-claims)) (err ERR-MAX-CLAIMS-EXCEEDED))
    (asserts! (is-none (map-get? claims-by-user { user: user, proof-id: proof-id })) (err ERR-CLAIM-ALREADY-SUBMITTED))
    (try! (stx-transfer? (var-get claim-fee) tx-sender (var-get admin)))
    (map-set claims claim-id
      { user: user, proof-id: proof-id, insurer: insurer, discount-amount: discount-amount, status: "pending", submitted-at: block-height }
    )
    (map-set claims-by-user { user: user, proof-id: proof-id } claim-id)
    (var-set next-claim-id (+ claim-id u1))
    (print { event: "claim-submitted", claim-id: claim-id, user: user })
    (ok claim-id)
  )
)

(define-public (approve-claim (claim-id uint))
  (let
    (
      (claim (unwrap! (map-get? claims claim-id) (err ERR-CLAIM-NOT-FOUND)))
      (insurer tx-sender)
    )
    (try! (validate-insurer insurer))
    (asserts! (is-eq (get insurer claim) insurer) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status claim) "pending") (err ERR-INVALID-STATUS))
    (map-set claims claim-id
      { user: (get user claim), proof-id: (get proof-id claim), insurer: insurer, discount-amount: (get discount-amount claim), status: "approved", submitted-at: (get submitted-at claim) }
    )
    (print { event: "claim-approved", claim-id: claim-id })
    (ok true)
  )
)

(define-public (reject-claim (claim-id uint))
  (let
    (
      (claim (unwrap! (map-get? claims claim-id) (err ERR-CLAIM-NOT-FOUND)))
      (insurer tx-sender)
    )
    (try! (validate-insurer insurer))
    (asserts! (is-eq (get insurer claim) insurer) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status claim) "pending") (err ERR-INVALID-STATUS))
    (map-set claims claim-id
      { user: (get user claim), proof-id: (get proof-id claim), insurer: insurer, discount-amount: (get discount-amount claim), status: "rejected", submitted-at: (get submitted-at claim) }
    )
    (print { event: "claim-rejected", claim-id: claim-id })
    (ok true)
  )
)