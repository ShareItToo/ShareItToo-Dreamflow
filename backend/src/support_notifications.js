export async function enqueueSupportCaseUpdateNotification(client, {
  caseId,
  recipientUserId,
  eventKey,
}) {
  const result = await client.query(
    `SELECT id, reporter_user_id, affected_user_ids
       FROM support_cases
      WHERE id::text = $1`,
    [caseId],
  );
  if (!result.rowCount) return 0;
  const supportCase = result.rows[0];
  const affectedUserIds = Array.isArray(supportCase.affected_user_ids)
    ? supportCase.affected_user_ids
    : [];
  if (supportCase.reporter_user_id !== recipientUserId
      && !affectedUserIds.includes(recipientUserId)) {
    return 0;
  }

  const payload = {
    notification: {
      category: 'support',
      kind: 'support_case_update',
      priority: 3,
      title: 'Update zu deinem Support-Fall',
      body: 'In deinem Support-Fall gibt es eine neue Information. Öffne die App, um sie sicher anzusehen.',
      entityType: 'support',
      entityId: supportCase.id,
      actionUrl: null,
      ctaLabel: 'Support-Fall öffnen',
      payload: {},
    },
  };
  let inserted = 0;
  for (const channel of ['in_app', 'push']) {
    const enqueue = await client.query(
      `INSERT INTO notification_outbox (
         event_key, user_id, channel, kind, payload
       ) VALUES ($1, $2, $3, 'support_case_update', $4::jsonb)
       ON CONFLICT (event_key, user_id, channel) DO NOTHING`,
      [eventKey, recipientUserId, channel, JSON.stringify(payload)],
    );
    inserted += enqueue.rowCount;
  }
  return inserted;
}
