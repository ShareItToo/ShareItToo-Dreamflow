DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_safety_impact_reviews LIMIT 1) THEN
    RAISE EXCEPTION 'S4B rollback blocked: support safety impact reviews exist';
  END IF;
END;
$$;

DROP TRIGGER support_safety_impact_reviews_append_only
  ON support_safety_impact_reviews;
DROP TRIGGER support_safety_impact_reviews_validate
  ON support_safety_impact_reviews;
DROP FUNCTION sit_validate_support_safety_impact_review();
DROP TABLE support_safety_impact_reviews;
