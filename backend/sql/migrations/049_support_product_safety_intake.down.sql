DROP INDEX IF EXISTS support_cases_product_safety_triage_idx;

ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_product_safety_bundle,
  DROP CONSTRAINT IF EXISTS support_cases_product_safety_evidence_object,
  DROP CONSTRAINT IF EXISTS support_cases_product_safety_notice_number_format,
  DROP CONSTRAINT IF EXISTS support_cases_product_safety_notice_number_unique,
  DROP COLUMN IF EXISTS product_safety_triage_due_at,
  DROP COLUMN IF EXISTS product_safety_evidence,
  DROP COLUMN IF EXISTS product_safety_notice_number;
