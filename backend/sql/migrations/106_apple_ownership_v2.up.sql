CREATE TABLE apple_ownership_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_subject TEXT NOT NULL CHECK (char_length(provider_subject) BETWEEN 1 AND 180),
  firebase_user_id TEXT NOT NULL CHECK (char_length(firebase_user_id) BETWEEN 1 AND 180),
  firebase_project_id TEXT NOT NULL CHECK (char_length(firebase_project_id) BETWEEN 6 AND 30),
  apple_client_id TEXT NOT NULL CHECK (char_length(apple_client_id) BETWEEN 3 AND 128),
  redirect_uri TEXT NOT NULL CHECK (redirect_uri ~ '^https://'),
  profile_generation TEXT NOT NULL CHECK (profile_generation ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  profile_digest CHAR(64) NOT NULL CHECK (profile_digest ~ '^[a-f0-9]{64}$'),
  private_use_confirmed_at TIMESTAMPTZ NOT NULL,
  web_test_cohort_enrolled_at TIMESTAMPTZ NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_subject),
  UNIQUE (firebase_user_id)
);

CREATE TABLE apple_ownership_attempts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES apple_ownership_enrollments(user_id) ON DELETE CASCADE,
  request_digest CHAR(64) NOT NULL UNIQUE CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  receipt_digest CHAR(64) NOT NULL UNIQUE CHECK (receipt_digest ~ '^[a-f0-9]{64}$'),
  receipt_key_id TEXT NOT NULL CHECK (char_length(receipt_key_id) BETWEEN 8 AND 100),
  encrypted_receipt TEXT NOT NULL CHECK (char_length(encrypted_receipt) BETWEEN 40 AND 1000),
  code_fingerprint CHAR(64) NOT NULL UNIQUE CHECK (code_fingerprint ~ '^[a-f0-9]{64}$'),
  binding_digest CHAR(64) NOT NULL CHECK (binding_digest ~ '^[a-f0-9]{64}$'),
  profile_generation TEXT NOT NULL CHECK (profile_generation ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  profile_digest CHAR(64) NOT NULL CHECK (profile_digest ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK (state IN (
    'claimed', 'exchanging', 'committed', 'unknown', 'cleanup_required', 'closed'
  )),
  claim_deadline TIMESTAMPTZ NOT NULL,
  recovery_deadline TIMESTAMPTZ NOT NULL,
  exchange_started_at TIMESTAMPTZ,
  exchange_finished_at TIMESTAMPTZ,
  provider_error_code TEXT,
  status_window_started_at TIMESTAMPTZ,
  status_window_count INTEGER NOT NULL DEFAULT 0 CHECK (status_window_count BETWEEN 0 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (claim_deadline > created_at AND claim_deadline <= created_at + interval '2 minutes 5 seconds'),
  CHECK (recovery_deadline > created_at AND recovery_deadline <= created_at + interval '15 minutes 5 seconds')
);
CREATE INDEX apple_ownership_attempts_user_state_idx
  ON apple_ownership_attempts (user_id, state, created_at);
CREATE INDEX apple_ownership_attempts_recovery_idx
  ON apple_ownership_attempts (recovery_deadline) WHERE state <> 'closed';

CREATE TABLE apple_ownership_materials (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL UNIQUE REFERENCES apple_ownership_attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES apple_ownership_enrollments(user_id) ON DELETE CASCADE,
  material_kind TEXT NOT NULL CHECK (material_kind = 'refresh_token'),
  material_key_id TEXT NOT NULL CHECK (char_length(material_key_id) BETWEEN 8 AND 100),
  material_ciphertext TEXT,
  binding_digest CHAR(64) NOT NULL CHECK (binding_digest ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK (state IN (
    'cleanup_pending', 'active', 'revoking', 'cleanup_unknown', 'revoked'
  )),
  cleanup_error_code TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CHECK ((state = 'revoked' AND material_ciphertext IS NULL)
    OR (state <> 'revoked' AND char_length(material_ciphertext) BETWEEN 40 AND 12000))
);
CREATE INDEX apple_ownership_materials_cleanup_idx
  ON apple_ownership_materials (state, updated_at)
  WHERE state IN ('cleanup_pending', 'revoking', 'cleanup_unknown');
CREATE INDEX apple_ownership_materials_user_idx
  ON apple_ownership_materials (user_id, acquired_at);

CREATE TABLE apple_ownership_deliveries (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES apple_ownership_attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES apple_ownership_enrollments(user_id) ON DELETE CASCADE,
  delivery_digest CHAR(64) NOT NULL CHECK (delivery_digest ~ '^[a-f0-9]{64}$'),
  generation SMALLINT NOT NULL CHECK (generation BETWEEN 1 AND 3),
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'session', 'mfa')),
  session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
  mfa_challenge_id UUID REFERENCES auth_mfa_challenges(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (attempt_id, delivery_digest),
  UNIQUE (attempt_id, generation),
  CHECK ((outcome = 'pending' AND session_id IS NULL AND mfa_challenge_id IS NULL AND completed_at IS NULL)
    OR (outcome = 'session' AND completed_at IS NOT NULL
      AND (session_id IS NOT NULL OR superseded_at IS NOT NULL))
    OR (outcome = 'mfa' AND session_id IS NULL AND completed_at IS NOT NULL
      AND (mfa_challenge_id IS NOT NULL OR superseded_at IS NOT NULL)))
);
CREATE UNIQUE INDEX apple_ownership_deliveries_session_idx
  ON apple_ownership_deliveries (session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX apple_ownership_deliveries_mfa_idx
  ON apple_ownership_deliveries (mfa_challenge_id) WHERE mfa_challenge_id IS NOT NULL;

CREATE FUNCTION guard_apple_ownership_enrollment_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'apple_ownership_enrollment_immutable';
END
$$;
CREATE TRIGGER apple_ownership_enrollment_immutable
  BEFORE UPDATE ON apple_ownership_enrollments
  FOR EACH ROW EXECUTE FUNCTION guard_apple_ownership_enrollment_immutable();

CREATE FUNCTION guard_apple_ownership_attempt_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id
     OR NEW.request_digest <> OLD.request_digest OR NEW.receipt_digest <> OLD.receipt_digest
     OR NEW.receipt_key_id <> OLD.receipt_key_id OR NEW.encrypted_receipt <> OLD.encrypted_receipt
     OR NEW.code_fingerprint <> OLD.code_fingerprint OR NEW.binding_digest <> OLD.binding_digest
     OR NEW.profile_generation <> OLD.profile_generation OR NEW.profile_digest <> OLD.profile_digest
     OR NEW.claim_deadline <> OLD.claim_deadline OR NEW.recovery_deadline <> OLD.recovery_deadline
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'apple_ownership_attempt_binding_immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER apple_ownership_attempt_binding_immutable
  BEFORE UPDATE ON apple_ownership_attempts
  FOR EACH ROW EXECUTE FUNCTION guard_apple_ownership_attempt_binding();

CREATE FUNCTION guard_apple_ownership_material_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.attempt_id <> OLD.attempt_id OR NEW.user_id <> OLD.user_id
     OR NEW.material_kind <> OLD.material_kind OR NEW.material_key_id <> OLD.material_key_id
     OR (NEW.material_ciphertext IS DISTINCT FROM OLD.material_ciphertext AND NEW.state <> 'revoked')
     OR NEW.binding_digest <> OLD.binding_digest OR NEW.acquired_at <> OLD.acquired_at THEN
    RAISE EXCEPTION 'apple_ownership_material_binding_immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER apple_ownership_material_binding_immutable
  BEFORE UPDATE ON apple_ownership_materials
  FOR EACH ROW EXECUTE FUNCTION guard_apple_ownership_material_binding();

CREATE FUNCTION guard_apple_ownership_user_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM apple_ownership_attempts attempt
     WHERE attempt.user_id=OLD.id AND attempt.state <> 'closed'
  ) OR EXISTS (
    SELECT 1 FROM apple_ownership_materials material
     WHERE material.user_id=OLD.id AND material.state <> 'revoked'
  ) THEN
    RAISE EXCEPTION 'apple_ownership_cleanup_required';
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER apple_ownership_user_delete_guard
  BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_apple_ownership_user_delete();
