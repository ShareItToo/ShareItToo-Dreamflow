-- Authenticated, non-live product-safety intake and rapid internal triage.
-- This migration creates no public contact point, authority transport, Safety
-- Gate integration, notification or autonomous listing/account action.

ALTER TABLE support_cases
  ADD COLUMN product_safety_notice_number TEXT,
  ADD COLUMN product_safety_evidence JSONB,
  ADD COLUMN product_safety_triage_due_at TIMESTAMPTZ;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_product_safety_notice_number_unique
    UNIQUE (product_safety_notice_number),
  ADD CONSTRAINT support_cases_product_safety_notice_number_format CHECK (
    product_safety_notice_number IS NULL
    OR product_safety_notice_number ~ '^SIT-P-[A-HJ-NP-Z2-9]{12}$'
  ),
  ADD CONSTRAINT support_cases_product_safety_evidence_object CHECK (
    product_safety_evidence IS NULL
    OR jsonb_typeof(product_safety_evidence) = 'object'
  ),
  ADD CONSTRAINT support_cases_product_safety_bundle CHECK (
    (
      product_safety_notice_number IS NULL
      AND product_safety_evidence IS NULL
      AND product_safety_triage_due_at IS NULL
    )
    OR (
      case_type = 'trust_safety'
      AND case_subtype = 'dangerous_item_or_injury'
      AND product_safety_notice_number IS NOT NULL
      AND product_safety_evidence IS NOT NULL
      AND product_safety_triage_due_at IS NOT NULL
      AND product_safety_triage_due_at > created_at
      AND product_safety_triage_due_at <= created_at + INTERVAL '60 minutes'
      AND priority IN ('p0', 'p1')
      AND current_owner_role = 'trust_safety_owner'
      AND approval_level = 'red_explicit_decision'
      AND safety_flag
      AND product_safety_evidence ->> 'version' = 'sit_product_safety_intake_v1'
      AND product_safety_evidence ->> 'contactPointVersion' =
        'sit_product_safety_contact_point_v1'
      AND product_safety_evidence ->> 'issueKind' IN (
        'dangerous_product', 'accident_or_injury'
      )
      AND product_safety_evidence ->> 'safetyGuidanceAcknowledged' = 'true'
    )
  );

CREATE INDEX support_cases_product_safety_triage_idx
  ON support_cases(product_safety_triage_due_at, id)
  WHERE product_safety_notice_number IS NOT NULL
    AND status NOT IN ('resolved', 'closed');
