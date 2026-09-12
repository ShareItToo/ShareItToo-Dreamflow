import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSupportAccountRecoveryPublication,
  normalizeSupportAccountRecoveryGuidance,
  supportAccountRecoveryGuidanceVersion,
} from '../src/support_account_recovery_domain.js';

function accountCase(overrides = {}) {
  return {
    case_type: 'trust_safety',
    case_subtype: 'account_takeover',
    priority: 'p0',
    severity: 'critical',
    safety_flag: true,
    account_takeover_flag: true,
    approval_level: 'red_explicit_decision',
    reporter_user_id: 'user-1',
    ...overrides,
  };
}

function guidance(overrides = {}) {
  return normalizeSupportAccountRecoveryGuidance({
    supportCase: accountCase(),
    recipientUserId: 'user-1',
    activeAuthenticatedSession: true,
    passwordReauthenticationAvailable: true,
    ...overrides,
  });
}

test('account recovery guidance excludes the reported email channel and performs no action', () => {
  const result = guidance();
  assert.equal(
    result.metadata.account_recovery_guidance_version,
    supportAccountRecoveryGuidanceVersion,
  );
  assert.equal(result.metadata.compromised_channel_used, false);
  assert.equal(result.metadata.password_or_pin_requested, false);
  assert.equal(result.metadata.recovery_action_executed, false);
  assert.equal(result.metadata.session_revocation_executed, false);
  assert.match(result.bindings.secure_recovery_channel, /Konto > Sicherheit/u);
  assert.match(result.bindings.secure_recovery_channel, /E-Mail-Kanal allein wird nicht akzeptiert/u);
});

test('email-only recovery fails closed without an authenticated reauthentication path', () => {
  for (const override of [
    { activeAuthenticatedSession: false },
    { passwordReauthenticationAvailable: false },
  ]) {
    assert.throws(
      () => guidance(override),
      /support_account_recovery_alternate_verification_unavailable/u,
    );
  }
  assert.throws(
    () => guidance({ supportCase: accountCase({ case_subtype: 'harassment_or_stalking' }) }),
    /support_account_recovery_case_required/u,
  );
  assert.throws(
    () => guidance({ recipientUserId: 'other-user' }),
    /support_account_recovery_reporter_required/u,
  );
});

test('publication rechecks exact immutable recovery metadata and current alternate path', () => {
  const result = guidance();
  const message = {
    template_id: 'T-035',
    recipient_user_id: 'user-1',
    structured_variables: {
      case_id: 'SIT-TESTCASE234',
      next_update_datetime: '22.08.2026, 17:00 Uhr',
      ...result.bindings,
      ...result.metadata,
    },
  };
  assert.doesNotThrow(() => assertSupportAccountRecoveryPublication({
    message,
    supportCase: accountCase(),
    recipientState: {
      activeAuthenticatedSession: true,
      passwordReauthenticationAvailable: true,
    },
  }));
  assert.throws(
    () => assertSupportAccountRecoveryPublication({
      message: {
        ...message,
        structured_variables: {
          ...message.structured_variables,
          compromised_channel_used: true,
        },
      },
      supportCase: accountCase(),
      recipientState: {
        activeAuthenticatedSession: true,
        passwordReauthenticationAvailable: true,
      },
    }),
    /support_account_recovery_binding_invalid/u,
  );
  assert.throws(
    () => assertSupportAccountRecoveryPublication({
      message: {
        ...message,
        structured_variables: {
          ...message.structured_variables,
          unexpected_recovery_instruction: 'forbidden',
        },
      },
      supportCase: accountCase(),
      recipientState: {
        activeAuthenticatedSession: true,
        passwordReauthenticationAvailable: true,
      },
    }),
    /support_account_recovery_binding_invalid/u,
  );
});
