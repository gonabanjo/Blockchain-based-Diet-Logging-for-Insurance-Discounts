(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-USER u101)
(define-constant ERR-INVALID-PLAN u102)
(define-constant ERR-INVALID-PERIOD u103)
(define-constant ERR-NO-LOGS u104)
(define-constant ERR-INSUFFICIENT-COMPLIANCE u105)
(define-constant ERR-INVALID-SCORE u106)
(define-constant ERR-PLAN-NOT-SUBSCRIBED u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-INVALID-THRESHOLD u109)
(define-constant ERR-INVALID-NUTRIENT u110)
(define-constant ERR-INVALID-CALORIES u111)
(define-constant ERR-VERIFICATION-FAILED u112)
(define-constant ERR-ALREADY-VERIFIED u113)
(define-constant ERR-INVALID-LOG-HASH u114)
(define-constant ERR-INVALID-AGGREGATE u115)
(define-constant ERR-MAX-PERIODS-EXCEEDED u116)
(define-constant ERR-INVALID-START-BLOCK u117)
(define-constant ERR-INVALID-END-BLOCK u118)
(define-constant ERR-INVALID-COMPLIANCE-RATE u119)
(define-constant ERR-INVALID-METRIC u120)

(define-trait user-profile-trait
  ((get-user-info (principal) (response { subscribed-plan: uint } uint)))
)

(define-trait diet-plan-trait
  ((get-plan-details (uint) (response { rules: (list 10 { metric: (string-ascii 32), min: uint, max: uint }), threshold: uint } uint)))
)

(define-trait daily-log-trait
  ((get-log-by-block (principal uint) (response { hash: (buff 32), calories: uint, nutrients: (list 10 { nutrient: (string-ascii 32), value: uint }) } uint)))
)

(define-data-var admin principal tx-sender)
(define-data-var max-periods uint u100)
(define-data-var verification-fee uint u500)
(define-data-var compliance-threshold uint u80)

(define-map verifications
  { user: principal, period-start: uint, period-end: uint }
  { score: uint, status: bool, timestamp: uint }
)

(define-map aggregate-scores
  principal
  { total-periods: uint, average-score: uint }
)

(define-read-only (get-verification (key { user: principal, period-start: uint, period-end: uint }))
  (map-get? verifications key)
)

(define-read-only (get-aggregate-score (user principal))
  (map-get? aggregate-scores user)
)

(define-private (validate-user (user principal))
  (if (is-eq user tx-sender) (ok true) (err ERR-NOT-AUTHORIZED))
)

(define-private (validate-period (start uint) (end uint))
  (if (and (> end start) (<= (- end start) u365) (>= start block-height))
    (ok true)
    (err ERR-INVALID-PERIOD))
)

(define-private (validate-plan (plan uint))
  (if (> plan u0) (ok true) (err ERR-INVALID-PLAN))
)

(define-private (validate-score (score uint))
  (if (and (>= score u0) (<= score u100)) (ok true) (err ERR-INVALID-SCORE))
)

(define-private (validate-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100)) (ok true) (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-calories (calories uint) (min uint) (max uint))
  (if (and (>= calories min) (<= calories max)) (ok true) (err ERR-INVALID-CALORIES))
)

(define-private (validate-nutrient (value uint) (min uint) (max uint))
  (if (and (>= value min) (<= value max)) (ok true) (err ERR-INVALID-NUTRIENT))
)

(define-private (fetch-user-plan (user principal) (user-profile <user-profile-trait>))
  (let
    (
      (result (contract-call? user-profile get-user-info user))
    )
    (asserts! (is-ok result) (err ERR-INVALID-USER))
    result
  )
)

(define-private (fetch-plan-rules (plan uint) (diet-plan <diet-plan-trait>))
  (let
    (
      (result (contract-call? diet-plan get-plan-details plan))
    )
    (asserts! (is-ok result) (err ERR-INVALID-PLAN))
    result
  )
)

(define-private (fetch-log (user principal) (block uint) (daily-log <daily-log-trait>))
  (contract-call? daily-log get-log-by-block user block)
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-max-periods (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-PERIOD))
    (var-set max-periods new-max)
    (ok true)
  )
)

(define-public (set-verification-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set verification-fee new-fee)
    (ok true)
  )
)

(define-public (set-compliance-threshold (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (> new-threshold u0) (<= new-threshold u100)) (err ERR-INVALID-THRESHOLD))
    (var-set compliance-threshold new-threshold)
    (ok true)
  )
)

(define-public (verify-period
  (start-block uint)
  (end-block uint)
  (user-profile <user-profile-trait>)
  (diet-plan <diet-plan-trait>)
  (daily-log <daily-log-trait>)
)
  (let
    (
      (user tx-sender)
      (user-info (unwrap! (fetch-user-plan user user-profile) (err ERR-INVALID-USER)))
      (plan (get subscribed-plan user-info))
      (plan-details (unwrap! (fetch-plan-rules plan diet-plan) (err ERR-INVALID-PLAN)))
      (rules (get rules plan-details))
      (threshold (get threshold plan-details))
      (period-days (- end-block start-block))
      (score (unwrap! (calculate-adherence-score user start-block end-block daily-log diet-plan) (err ERR-INVALID-SCORE)))
    )
    (try! (validate-period start-block end-block))
    (try! (validate-plan plan))
    (try! (validate-score score))
    (asserts! (is-none (map-get? verifications { user: user, period-start: start-block, period-end: end-block })) (err ERR-ALREADY-VERIFIED))
    (try! (stx-transfer? (var-get verification-fee) tx-sender (var-get admin)))
    (map-set verifications { user: user, period-start: start-block, period-end: end-block }
      { score: score, status: (>= score threshold), timestamp: block-height }
    )
    (try! (update-aggregate-score user score))
    (print { event: "period-verified", user: user, score: score })
    (ok score)
  )
)

(define-private (check-daily-compliance (block uint) (acc { count: uint, user: principal, rules: (list 10 { metric: (string-ascii 32), min: uint, max: uint }), daily-log: <daily-log-trait> }))
  (let
    (
      (log (default-to { hash: (buff 32 0), calories: u0, nutrients: (list) } (fetch-log (get user acc) block (get daily-log acc))))
      (calories (get calories log))
      (nutrients (get nutrients log))
      (cal-rule (unwrap! (find-rule "calories" (get rules acc)) acc))
      (nutrient-checks (fold check-nutrient nutrients { compliant: true, rules: (get rules acc) }))
    )
    (if (and (is-ok (validate-calories calories (get min cal-rule) (get max cal-rule))) (get compliant nutrient-checks))
      { count: (+ (get count acc) u1), user: (get user acc), rules: (get rules acc), daily-log: (get daily-log acc) }
      acc
    )
  )
)

(define-private (find-rule (metric (string-ascii 32)) (rules (list 10 { metric: (string-ascii 32), min: uint, max: uint })))
  (fold match-rule rules none)
)

(define-private (match-rule (rule { metric: (string-ascii 32), min: uint, max: uint }) (found (optional { metric: (string-ascii 32), min: uint, max: uint })))
  (if (is-eq (get metric rule) metric) (some rule) found)
)

(define-private (check-nutrient (nutrient { nutrient: (string-ascii 32), value: uint }) (acc { compliant: bool, rules: (list 10 { metric: (string-ascii 32), min: uint, max: uint }) }))
  (let
    (
      (rule (unwrap! (find-rule (get nutrient nutrient) (get rules acc)) { compliant: false, rules: (get rules acc) }))
    )
    (if (is-ok (validate-nutrient (get value nutrient) (get min rule) (get max rule)))
      acc
      { compliant: false, rules: (get rules acc) }
    )
  )
)

(define-private (update-aggregate-score (user principal) (new-score uint))
  (let
    (
      (agg (default-to { total-periods: u0, average-score: u0 } (map-get? aggregate-scores user)))
      (total (get total-periods agg))
      (avg (get average-score agg))
      (new-total (+ total u1))
      (new-avg (/ (+ (* avg total) new-score) new-total))
    )
    (asserts! (<= new-total (var-get max-periods)) (err ERR-MAX-PERIODS-EXCEEDED))
    (asserts! (and (>= new-avg u0) (<= new-avg u100)) (err ERR-INVALID-SCORE))
    (map-set aggregate-scores user { total-periods: new-total, average-score: new-avg })
    (ok true)
  )
)

(define-public (calculate-adherence-score (user principal) (start uint) (end uint) (daily-log <daily-log-trait>) (diet-plan <diet-plan-trait>))
  (let
    (
      (user-info (unwrap! (fetch-user-plan user diet-plan) (err ERR-INVALID-USER)))
      (plan (get subscribed-plan user-info))
      (plan-details (unwrap! (fetch-plan-rules plan diet-plan) (err ERR-INVALID-PLAN)))
      (rules (get rules plan-details))
      (period-days (- end start))
      (compliant-days
        (fold check-daily-compliance
          (if (>= start end)
            (list)
            (unwrap-panic (as-max-len? (concat (list start) (if (>= (+ start u1) end) (list) (concat (list (+ start u1)) (if (>= (+ start u2) end) (list) (concat (list (+ start u2)) (list)))))) u365))
          )
          { count: u0, user: user, rules: rules, daily-log: daily-log }
        )
      )
      (score (/ (* (get count compliant-days) u100) period-days))
    )
    (try! (validate-period start end))
    (try! (validate-plan plan))
    (try! (validate-score score))
    (ok score)
  )
)

(define-read-only (get-verification-status (user principal) (start uint) (end uint))
  (let
    (
      (verif (map-get? verifications { user: user, period-start: start, period-end: end }))
    )
    (match verif v (ok (get status v)) (err ERR-VERIFICATION-FAILED))
  )
)