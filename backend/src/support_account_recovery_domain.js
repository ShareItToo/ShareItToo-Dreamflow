import { SupportCaseError } from './support_case_domain.js';

export const supportAccountRecoveryGuidanceVersion =
  'sit_support_account_recovery_guidance_v1';

const secureRecoveryChannel =
  'den bereits authentifizierten Bereich "Konto > Sicherheit" in der SIT-App mit erneuter Passwortpruefung; der gemeldete E-Mail-Kanal allein wird nicht akzeptiert';
const temporaryAccountEffect =
  'Der aktuelle Kontostatus bleibt unveraendert; diese Nachricht fuehrt weder eine Wiederherstellung noch eine Sitzungsbeendigung aus';

function exactAccountTakeoverCase(supportCase) {
  return supportCase?.case_type === 'trust_safety'
    && supportCase?.case_subtype === 'account_takeover'
    && supportCase?.priority === 'p0'
    && supportCase?.severity === 'critical'
    && supportCase?.safety_flag === true
    && supportCase?.account_takeover_flag === true
    && supportCase?.approval_level === 'red_explicit_decision';
}

export function normalizeSupportAccountRecoveryGuidance({
  supportCase,
  recipientUserId,
  activeAuthenticatedSession,
  passwordReauthenticationAvailable,
}) {
  if (!exactAccountTakeoverCase(supportCase)) {
    throw new SupportCaseError(409, 'support_account_recovery_case_required');
  }
  if (!recipientUserId || recipientUserId !== supportCase.reporter_user_id) {
    throw new SupportCaseError(403, 'support_account_recovery_reporter_required');
  }
  if (activeAuthenticatedSession !== true
      || passwordReauthenticationAvailable !== true) {
    throw new SupportCaseError(
      409,
      'support_account_recovery_alternate_verification_unavailable',
    );
  }

  return Object.freeze({
    bindings: Object.freeze({
      first_name: 'Mitglied',
      secure_recovery_channel: secureRecoveryChannel,
      temporary_account_effect: temporaryAccountEffect,
    }),
    metadata: Object.freeze({
      account_recovery_guidance_version: supportAccountRecoveryGuidanceVersion,
      recovery_route: 'authenticated_in_app_password_reauthentication',
      compromised_channel_used: false,
      password_or_pin_requested: false,
      recovery_action_executed: false,
      session_revocation_executed: false,
      external_message_sent: false,
    }),
  });
}

export function assertSupportAccountRecoveryPublication({
  message,
  supportCase,
  recipientState,
}) {
  if (message?.template_id !== 'T-035') return;
  const guidance = normalizeSupportAccountRecoveryGuidance({
    supportCase,
    recipientUserId: message.recipient_user_id,
    activeAuthenticatedSession: recipientState?.activeAuthenticatedSession,
    passwordReauthenticationAvailable:
      recipientState?.passwordReauthenticationAvailable,
  });
  const structured = message.structured_variables;
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    throw new SupportCaseError(409, 'support_account_recovery_binding_invalid');
  }
  const expected = {
    ...guidance.bindings,
    ...guidance.metadata,
  };
  const allowedKeys = new Set([
    ...Object.keys(expected),
    'case_id',
    'next_update_datetime',
  ]);
  if (Object.keys(structured).some((key) => !allowedKeys.has(key))
      || Object.keys(structured).length !== allowedKeys.size) {
    throw new SupportCaseError(409, 'support_account_recovery_binding_invalid');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (structured[key] !== value) {
      throw new SupportCaseError(409, 'support_account_recovery_binding_invalid', {
        key,
      });
    }
  }
}
