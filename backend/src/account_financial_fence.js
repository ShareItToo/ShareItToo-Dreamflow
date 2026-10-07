function principalIds(values) {
  return [...new Set(values.filter((value) => (
    typeof value === 'string' && value.trim().length > 0
  )))].sort();
}

export async function lockFinancialPrincipals(client, values) {
  const ids = principalIds(values);
  for (const id of ids) {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`account-financial:${id}`],
    );
  }
  return ids;
}

export async function lockPaymentFinancialPrincipals(client, paymentId) {
  const binding = await client.query(
    `SELECT booking.owner_id, booking.renter_id
       FROM payments AS payment
       JOIN bookings AS booking ON booking.id = payment.booking_id
      WHERE payment.id::text = $1`,
    [paymentId],
  );
  if (binding.rowCount !== 1) return null;
  const ids = await lockFinancialPrincipals(client, [
    binding.rows[0].owner_id,
    binding.rows[0].renter_id,
  ]);
  const principals = await client.query(
    `SELECT id, account_status, deactivated_at
       FROM users
      WHERE id = ANY($1::text[])
      ORDER BY id
      FOR UPDATE`,
    [ids],
  );
  return Object.freeze({
    ownerId: binding.rows[0].owner_id,
    renterId: binding.rows[0].renter_id,
    principalsPresent: principals.rowCount === ids.length,
    commerceActive: principals.rowCount === ids.length
      && principals.rows.every((row) => (
        row.account_status === 'active' && row.deactivated_at == null
      )),
  });
}

export async function lockBookingFinancialPrincipals(client, bookingId) {
  const binding = await client.query(
    `SELECT owner_id, renter_id
       FROM bookings
      WHERE id = $1`,
    [bookingId],
  );
  if (binding.rowCount !== 1) return null;
  const ids = await lockFinancialPrincipals(client, [
    binding.rows[0].owner_id,
    binding.rows[0].renter_id,
  ]);
  const principals = await client.query(
    `SELECT id, account_status, deactivated_at
       FROM users
      WHERE id = ANY($1::text[])
      ORDER BY id
      FOR UPDATE`,
    [ids],
  );
  return Object.freeze({
    ownerId: binding.rows[0].owner_id,
    renterId: binding.rows[0].renter_id,
    principalsPresent: principals.rowCount === ids.length,
    commerceActive: principals.rowCount === ids.length
      && principals.rows.every((row) => (
        row.account_status === 'active' && row.deactivated_at == null
      )),
  });
}
