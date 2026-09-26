-- S4F / SUP-022 + SUP-023: a reviewed account-recovery guidance message is
-- accepted only for the exact P0 account-takeover reporter and only while an
-- independent authenticated in-app path still exists. This migration sends no
-- message and performs no recovery, revocation, payment, or external action.
CREATE OR REPLACE FUNCTION sit_validate_support_account_recovery_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  recipient users%ROWTYPE;
  active_authenticated_session BOOLEAN;
  expected_next_update_datetime TEXT;
  expected_rendered_content TEXT;
BEGIN
  IF NEW.template_id IS DISTINCT FROM 'T-035' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id;
  SELECT * INTO recipient FROM users WHERE id = NEW.recipient_user_id;
  SELECT EXISTS (
    SELECT 1
      FROM auth_sessions AS session
      JOIN refresh_tokens AS token ON token.session_id = session.id
     WHERE session.user_id = NEW.recipient_user_id
       AND session.revoked_at IS NULL
       AND token.revoked_at IS NULL
       AND token.expires_at > now()
  ) INTO active_authenticated_session;

  IF target_case.id IS NULL OR target_case.case_type <> 'trust_safety'
    OR target_case.case_subtype <> 'account_takeover'
    OR target_case.priority <> 'p0'
    OR target_case.severity <> 'critical'
    OR target_case.safety_flag IS DISTINCT FROM true
    OR target_case.account_takeover_flag IS DISTINCT FROM true
    OR target_case.approval_level <> 'red_explicit_decision'
    OR NEW.recipient_user_id <> target_case.reporter_user_id
  THEN
    RAISE EXCEPTION 'Account recovery guidance requires exact P0 reporter scope';
  END IF;

  IF recipient.id IS NULL OR recipient.account_status <> 'active'
    OR recipient.deactivated_at IS NOT NULL OR recipient.password_hash IS NULL
    OR active_authenticated_session IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Account recovery guidance requires alternate authenticated verification';
  END IF;

  expected_next_update_datetime := to_char(
    target_case.next_update_at AT TIME ZONE 'Europe/Berlin',
    'DD.MM.YYYY, HH24:MI "Uhr"'
  );
  expected_rendered_content := format(
    E'Hallo Mitglied,\n\nwir pruefen eine Sicherheitsmeldung zu deinem Konto.\n\nVorlaeufige Auswirkung: Der aktuelle Kontostatus bleibt unveraendert; diese Nachricht fuehrt weder eine Wiederherstellung noch eine Sitzungsbeendigung aus.\n\nDiese Sicherheitsmassnahme ist noch keine Feststellung eines Verstosses. Bitte nutze fuer die Wiederherstellung nur den bereits authentifizierten Bereich "Konto > Sicherheit" in der SIT-App mit erneuter Passwortpruefung; der gemeldete E-Mail-Kanal allein wird nicht akzeptiert und teile keine Codes im Supportchat.\n\nNaechstes Update: %s. Case ID: %s.',
    expected_next_update_datetime,
    target_case.human_readable_case_number
  );

  IF jsonb_typeof(NEW.structured_variables) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.structured_variables)) <> 12
    OR NEW.message_title IS DISTINCT FROM 'Konto-Sicherheitspruefung'
    OR NEW.template_version IS DISTINCT FROM '1.0.0'
    OR NEW.locale IS DISTINCT FROM 'de-DE'
    OR NEW.approval_level IS DISTINCT FROM 'yellow_human_review'
    OR NEW.structured_variables ->> 'case_id'
      IS DISTINCT FROM target_case.human_readable_case_number
    OR NEW.structured_variables ->> 'first_name' IS DISTINCT FROM 'Mitglied'
    OR NEW.structured_variables ->> 'next_update_datetime'
      IS DISTINCT FROM expected_next_update_datetime
    OR NEW.structured_variables ->> 'secure_recovery_channel'
      IS DISTINCT FROM 'den bereits authentifizierten Bereich "Konto > Sicherheit" in der SIT-App mit erneuter Passwortpruefung; der gemeldete E-Mail-Kanal allein wird nicht akzeptiert'
    OR NEW.structured_variables ->> 'temporary_account_effect'
      IS DISTINCT FROM 'Der aktuelle Kontostatus bleibt unveraendert; diese Nachricht fuehrt weder eine Wiederherstellung noch eine Sitzungsbeendigung aus'
    OR NEW.rendered_content IS DISTINCT FROM expected_rendered_content
    OR NEW.structured_variables ->> 'account_recovery_guidance_version'
      IS DISTINCT FROM 'sit_support_account_recovery_guidance_v1'
    OR NEW.structured_variables ->> 'recovery_route'
      IS DISTINCT FROM 'authenticated_in_app_password_reauthentication'
    OR (NEW.structured_variables -> 'compromised_channel_used')
      IS DISTINCT FROM 'false'::jsonb
    OR (NEW.structured_variables -> 'password_or_pin_requested')
      IS DISTINCT FROM 'false'::jsonb
    OR (NEW.structured_variables -> 'recovery_action_executed')
      IS DISTINCT FROM 'false'::jsonb
    OR (NEW.structured_variables -> 'session_revocation_executed')
      IS DISTINCT FROM 'false'::jsonb
    OR (NEW.structured_variables -> 'external_message_sent')
      IS DISTINCT FROM 'false'::jsonb
  THEN
    RAISE EXCEPTION 'Account recovery guidance binding is invalid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_account_recovery_message_insert_guard
BEFORE INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_account_recovery_message();

CREATE TRIGGER support_account_recovery_message_publication_guard
BEFORE UPDATE OF send_status ON support_messages
FOR EACH ROW
WHEN (NEW.template_id = 'T-035' AND NEW.send_status = 'sent')
EXECUTE FUNCTION sit_validate_support_account_recovery_message();
