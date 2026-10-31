import { config } from './config.js';
import { inTransaction } from './db.js';
import { enqueueReturnLifecycleNotification } from './notifications.js';
import {
  addReturnPolicyCalendarDays,
  returnPolicyTimeZone,
} from './return_calendar_policy.js';

function instant(value, code) {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(code);
  return parsed;
}

function optionalInstant(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function iso(value) {
  return value ? value.toISOString() : null;
}

function confirmationRoles(payload) {
  const confirmation = payload?.returnConfirmation;
  return {
    owner: Number.isFinite(Date.parse(confirmation?.ownerConfirmedAt ?? '')),
    renter: Number.isFinite(Date.parse(confirmation?.renterConfirmedAt ?? '')),
  };
}

function cadenceAfter(dueAt, now, timezone) {
  let next = addReturnPolicyCalendarDays(dueAt, 7, timezone);
  while (next <= now) next = addReturnPolicyCalendarDays(next, 7, timezone);
  return next;
}

export function planReturnLifecycle(row, { now = new Date() } = {}) {
  const current = instant(now, 'invalid_current_time');
  const state = String(row.return_state ?? 'not_started');
  const t0 = optionalInstant(row.return_t0);
  const reportDeadline = optionalInstant(row.return_report_deadline);
  const clarificationDeadline = optionalInstant(row.return_clarification_deadline);
  const deadlineTimezone = returnPolicyTimeZone(
    row.case_deadline_timezone ?? row.rental_timezone ?? 'Europe/Berlin',
  );
  const actions = [];
  let nextState = state;
  let nextPayoutInstructionDueAt = optionalInstant(row.payout_instruction_due_at);
  let nextCaseStatusUpdateDueAt = optionalInstant(row.next_status_update_due_at);

  if (state === 'awaitingReturnConfirmation' && t0 && clarificationDeadline) {
    const confirmed = confirmationRoles(row.booking_payload ?? {});
    const missingRoles = ['owner', 'renter'].filter((role) => !confirmed[role]);
    if (current >= t0 && missingRoles.length > 0) {
      actions.push({
        kind: 'return_confirmation_reminder',
        recipientRoles: missingRoles,
        deadline: clarificationDeadline,
        eventKey: `return:${row.id}:confirmation-reminder:t0:${iso(t0)}`,
      });
    }
    if (reportDeadline && current >= reportDeadline && missingRoles.length > 0) {
      actions.push({
        kind: 'return_confirmation_reminder',
        recipientRoles: missingRoles,
        deadline: clarificationDeadline,
        eventKey: `return:${row.id}:confirmation-reminder:48h:${iso(reportDeadline)}`,
      });
    }
    if (current >= clarificationDeadline) {
      nextState = 'payoutEligible';
      nextPayoutInstructionDueAt = clarificationDeadline;
      actions.push({
        kind: 'return_confirmation_window_closed',
        recipientRoles: ['owner', 'renter'],
        deadline: clarificationDeadline,
        eventKey: `return:${row.id}:confirmation-window-closed:${iso(clarificationDeadline)}`,
      });
    }
  }

  if (state === 'reportWindowOpen' && reportDeadline && current >= reportDeadline) {
    nextState = 'payoutEligible';
    nextPayoutInstructionDueAt = reportDeadline;
    actions.push({
      kind: 'return_report_window_closed',
      recipientRoles: ['owner', 'renter'],
      deadline: reportDeadline,
      eventKey: `return:${row.id}:report-window-closed:${iso(reportDeadline)}`,
    });
  }

  if (state === 'needsReview' && row.case_id) {
    const openedAt = optionalInstant(row.case_opened_at);
    if (openedAt) {
      actions.push({
        kind: 'return_case_opened',
        recipientRoles: ['owner', 'renter'],
        deadline: row.case_response_due_at,
        eventKey: `return:${row.id}:case-opened:${row.case_id}`,
      });
    }
    const responseDueAt = optionalInstant(row.case_response_due_at);
    if (responseDueAt && current >= responseDueAt) {
      const respondentRole = row.case_opened_by === row.owner_id ? 'renter' : 'owner';
      actions.push({
        kind: 'return_case_response_due',
        recipientRoles: [respondentRole],
        deadline: responseDueAt,
        eventKey: `return:${row.id}:case-response-due:${row.case_id}:${iso(responseDueAt)}`,
      });
    }
    if (nextCaseStatusUpdateDueAt && current >= nextCaseStatusUpdateDueAt) {
      const due = nextCaseStatusUpdateDueAt;
      nextCaseStatusUpdateDueAt = cadenceAfter(due, current, deadlineTimezone);
      actions.push({
        kind: 'return_case_status_update',
        recipientRoles: ['owner', 'renter'],
        deadline: nextCaseStatusUpdateDueAt,
        eventKey: `return:${row.id}:case-status:${row.case_id}:${iso(due)}`,
      });
    }
  }

  return Object.freeze({
    previousState: state,
    nextState,
    nextPayoutInstructionDueAt: iso(nextPayoutInstructionDueAt),
    nextCaseStatusUpdateDueAt: iso(nextCaseStatusUpdateDueAt),
    actions: Object.freeze(actions.map((action) => Object.freeze(action))),
  });
}

export async function reconcileReturnLifecycleWithClient(client, {
  now = new Date(),
  limit = 50,
  enqueue = enqueueReturnLifecycleNotification,
} = {}) {
  const current = instant(now, 'invalid_current_time');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const candidates = await client.query(
    `SELECT booking.id, booking.owner_id, booking.renter_id,
            booking.return_state, booking.return_t0,
            booking.return_report_deadline,
            booking.return_clarification_deadline,
            booking.payout_instruction_due_at,
            booking.rental_timezone,
            request.payload AS booking_payload,
            active_case.id AS case_id,
            active_case.opened_by AS case_opened_by,
            active_case.opened_at AS case_opened_at,
            active_case.response_due_at AS case_response_due_at,
            active_case.next_status_update_due_at,
            active_case.deadline_timezone AS case_deadline_timezone
       FROM bookings AS booking
       JOIN rental_requests AS request ON request.id = booking.id
       LEFT JOIN LATERAL (
         SELECT booking_case.*, return_case.deadline_timezone
           FROM booking_cases AS booking_case
           LEFT JOIN v52_return_cases AS return_case
             ON return_case.booking_case_id = booking_case.id
          WHERE booking_case.booking_id = booking.id
            AND booking_case.status <> 'closed'
          ORDER BY booking_case.opened_at DESC
          LIMIT 1
       ) AS active_case ON true
      WHERE booking.workflow_status = 'completed'
        AND booking.return_state IN (
          'awaitingReturnConfirmation', 'reportWindowOpen', 'needsReview'
        )
      ORDER BY COALESCE(
        active_case.next_status_update_due_at,
        booking.return_clarification_deadline,
        booking.return_report_deadline,
        booking.return_t0
      )
      FOR UPDATE OF booking SKIP LOCKED
      LIMIT $1`,
    [safeLimit],
  );
  let advanced = 0;
  let notifications = 0;
  let caseCadencesAdvanced = 0;
  for (const row of candidates.rows) {
    const plan = planReturnLifecycle(row, { now: current });
    if (plan.nextState !== plan.previousState) {
      await client.query(
        `UPDATE bookings
            SET return_state = $2,
                payout_instruction_due_at = $3,
                version = version + 1,
                updated_at = now()
          WHERE id = $1 AND return_state = $4`,
        [
          row.id,
          plan.nextState,
          plan.nextPayoutInstructionDueAt,
          plan.previousState,
        ],
      );
      const payload = row.booking_payload && typeof row.booking_payload === 'object'
        ? { ...row.booking_payload }
        : {};
      payload.returnState = plan.nextState;
      payload.payoutInstructionDueAt = plan.nextPayoutInstructionDueAt;
      await client.query(
        `UPDATE rental_requests SET payload = $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify(payload)],
      );
      await client.query(
        `INSERT INTO booking_events (
           booking_id, actor_id, event_type, idempotency_key, metadata
         ) VALUES ($1, NULL, 'booking.return_lifecycle_advanced', $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          row.id,
          `return-lifecycle:${row.id}:${plan.previousState}:${plan.nextState}:${plan.nextPayoutInstructionDueAt}`,
          JSON.stringify({
            previousReturnState: plan.previousState,
            nextReturnState: plan.nextState,
            payoutInstructionDueAt: plan.nextPayoutInstructionDueAt,
            evaluatedAt: current.toISOString(),
            version: 5,
          }),
        ],
      );
      advanced += 1;
    }
    if (row.case_id
        && plan.nextCaseStatusUpdateDueAt
        && plan.nextCaseStatusUpdateDueAt !== iso(optionalInstant(row.next_status_update_due_at))) {
      await client.query(
        `UPDATE booking_cases
            SET next_status_update_due_at = $2
          WHERE id = $1 AND status <> 'closed'`,
        [row.case_id, plan.nextCaseStatusUpdateDueAt],
      );
      caseCadencesAdvanced += 1;
    }
    for (const action of plan.actions) {
      notifications += await enqueue(client, {
        bookingId: row.id,
        ...action,
      });
    }
  }
  return {
    inspected: candidates.rowCount,
    advanced,
    notifications,
    caseCadencesAdvanced,
  };
}

let running = null;

export function reconcileReturnLifecycle(options = {}) {
  if (!config.privatePilotV4Enabled) {
    return Promise.resolve({
      inspected: 0,
      advanced: 0,
      notifications: 0,
      caseCadencesAdvanced: 0,
      disabled: true,
    });
  }
  if (running) return running;
  running = inTransaction((client) =>
    reconcileReturnLifecycleWithClient(client, options)).finally(() => {
    running = null;
  });
  return running;
}
