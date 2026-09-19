DO $$
DECLARE
  run_count BIGINT := 0;
  event_count BIGINT := 0;
BEGIN
  IF to_regclass('public.technical_sandbox_runs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM technical_sandbox_runs' INTO run_count;
  END IF;
  IF to_regclass('public.technical_sandbox_provider_events') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM technical_sandbox_provider_events' INTO event_count;
  END IF;
  IF run_count > 0 OR event_count > 0 THEN
    RAISE EXCEPTION 'technical sandbox rollback refused while rows exist (runs %, events %)', run_count, event_count;
  END IF;
END $$;

DROP TABLE IF EXISTS technical_sandbox_provider_events;
DROP TABLE IF EXISTS technical_sandbox_runs;
