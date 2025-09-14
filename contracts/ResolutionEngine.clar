(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-DISPUTE (err u101))
(define-constant ERR-APPEAL-EXPIRED (err u102))
(define-constant ERR-ALREADY-RESOLVED (err u103))
(define-constant ERR-INVALID-MEDIATOR (err u104))
(define-constant ERR-INVALID-OUTCOME (err u105))
(define-constant ERR-INVALID-RATIONALE (err u106))
(define-constant ERR-APPEAL-NOT-ALLOWED (err u107))
(define-constant ERR-FINALIZATION-EARLY (err u108))
(define-constant ERR-NO-RESOLUTION (err u109))

(define-data-var appeal-window uint u43200)
(define-data-var max-appeals uint u1)
(define-data-var resolution-fee uint u500)

(define-map Resolutions
  { dispute-id: uint }
  {
    mediator: principal,
    outcome: (string-ascii 256),
    rationale: (string-ascii 512),
    resolved-at: uint,
    appealed: bool,
    appeals-count: uint,
    final: bool,
    fee-paid: bool
  }
)

(define-map DisputeParties
  { dispute-id: uint }
  {
    landlord: principal,
    tenant: principal,
    dispute-type: (string-ascii 50),
    claim-amount: uint
  }
)

(define-private (is-valid-mediator (dispute-id uint) (caller principal))
  (match (contract-call? .MediatorSelector get-selected-mediator dispute-id)
    mediator (is-eq mediator caller)
    false
  )
)

(define-private (is-dispute-party (dispute-id uint) (caller principal))
  (match (map-get? DisputeParties { dispute-id: dispute-id })
    parties (or (is-eq caller (get landlord parties)) (is-eq caller (get tenant parties)))
    false
  )
)

(define-private (validate-outcome (outcome (string-ascii 256)))
  (if (and (> (len outcome) u0) (<= (len outcome) u256))
      (ok true)
      (err ERR-INVALID-OUTCOME))
)

(define-private (validate-rationale (rationale (string-ascii 512)))
  (if (and (> (len rationale) u0) (<= (len rationale) u512))
      (ok true)
      (err ERR-INVALID-RATIONALE))
)

(define-public (propose-resolution (dispute-id uint) (outcome (string-ascii 256)) (rationale (string-ascii 512)))
  (let
    (
      (dispute (unwrap! (contract-call? .DisputeManager get-dispute dispute-id) ERR-INVALID-DISPUTE))
      (caller tx-sender)
    )
    (asserts! (is-valid-mediator dispute-id caller) ERR-NOT-AUTHORIZED)
    (asserts! (not (get final (default-to { final: false, appeals-count: u0 } (map-get? Resolutions { dispute-id: dispute-id })))) ERR-ALREADY-RESOLVED)
    (try! (validate-outcome outcome))
    (try! (validate-rationale rationale))
    (map-set Resolutions
      { dispute-id: dispute-id }
      {
        mediator: caller,
        outcome: outcome,
        rationale: rationale,
        resolved-at: block-height,
        appealed: false,
        appeals-count: u0,
        final: false,
        fee-paid: false
      }
    )
    (print { event: "resolution-proposed", dispute-id: dispute-id, mediator: caller })
    (ok true)
  )
)

(define-public (pay-resolution-fee (dispute-id uint))
  (let
    (
      (resolution (unwrap! (map-get? Resolutions { dispute-id: dispute-id }) ERR-NO-RESOLUTION))
      (caller tx-sender)
    )
    (asserts! (is-valid-mediator dispute-id caller) ERR-NOT-AUTHORIZED)
    (asserts! (not (get fee-paid resolution)) ERR-ALREADY-RESOLVED)
    (try! (stx-transfer? (var-get resolution-fee) tx-sender .FeeHandler))
    (map-set Resolutions
      { dispute-id: dispute-id }
      (merge resolution { fee-paid: true })
    )
    (ok true)
  )
)

(define-public (finalize-resolution (dispute-id uint))
  (let
    (
      (resolution (unwrap! (map-get? Resolutions { dispute-id: dispute-id }) ERR-INVALID-DISPUTE))
      (dispute (unwrap! (contract-call? .DisputeManager get-dispute dispute-id) ERR-INVALID-DISPUTE))
    )
    (asserts! (get fee-paid resolution) ERR-ALREADY-RESOLVED)
    (asserts! (>= block-height (+ (get resolved-at resolution) (var-get appeal-window))) ERR-FINALIZATION-EARLY)
    (asserts! (not (get final resolution)) ERR-ALREADY-RESOLVED)
    (map-set Resolutions
      { dispute-id: dispute-id }
      (merge resolution { final: true })
    )
    (try! (contract-call? .EscrowManager release-funds dispute-id (get outcome resolution)))
    (try! (contract-call? .ReputationSystem update-reputation dispute-id))
    (try! (contract-call? .DisputeManager close-dispute dispute-id))
    (print { event: "resolution-finalized", dispute-id: dispute-id, outcome: (get outcome resolution) })
    (ok true)
  )
)

(define-public (appeal-resolution (dispute-id uint) (appeal-reason (string-ascii 256)))
  (let
    (
      (resolution (unwrap! (map-get? Resolutions { dispute-id: dispute-id }) ERR-INVALID-DISPUTE))
      (dispute (unwrap! (contract-call? .DisputeManager get-dispute dispute-id) ERR-INVALID-DISPUTE))
      (caller tx-sender)
    )
    (asserts! (is-dispute-party dispute-id caller) ERR-NOT-AUTHORIZED)
    (asserts! (not (get final resolution)) ERR-ALREADY-RESOLVED)
    (asserts! (<= (get appeals-count resolution) (var-get max-appeals)) ERR-APPEAL-NOT-ALLOWED)
    (asserts! (<= block-height (+ (get resolved-at resolution) (var-get appeal-window))) ERR-APPEAL-EXPIRED)
    (try! (stx-transfer? (var-get resolution-fee) tx-sender .FeeHandler))
    (map-set Resolutions
      { dispute-id: dispute-id }
      (merge resolution { appealed: true, appeals-count: (+ (get appeals-count resolution) u1) })
    )
    (try! (contract-call? .MediatorSelector reopen-for-appeal dispute-id))
    (print { event: "resolution-appealed", dispute-id: dispute-id, reason: appeal-reason, appellant: caller })
    (ok true)
  )
)

(define-public (set-appeal-window (new-window uint))
  (asserts! (is-eq tx-sender .Admin) ERR-NOT-AUTHORIZED)
  (var-set appeal-window new-window)
  (ok true)
)

(define-public (set-max-appeals (new-max uint))
  (asserts! (is-eq tx-sender .Admin) ERR-NOT-AUTHORIZED)
  (var-set max-appeals new-max)
  (ok true)
)

(define-public (set-resolution-fee (new-fee uint))
  (asserts! (is-eq tx-sender .Admin) ERR-NOT-AUTHORIZED)
  (var-set resolution-fee new-fee)
  (ok true)
)

(define-read-only (get-resolution (dispute-id uint))
  (map-get? Resolutions { dispute-id: dispute-id })
)

(define-read-only (get-dispute-parties (dispute-id uint))
  (map-get? DisputeParties { dispute-id: dispute-id })
)

(define-read-only (get-appeal-window)
  (var-get appeal-window)
)

(define-read-only (get-max-appeals)
  (var-get max-appeals)
)

(define-read-only (get-resolution-fee)
  (var-get resolution-fee)
)