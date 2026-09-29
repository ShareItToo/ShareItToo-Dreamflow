export const paymentNotice = 'Synthetischer Zahlungstest – kein echtes Geld/kein Vertrag/keine Auszahlung';
export const paymentAuditStatuses = ['ready', 'failed', 'ready', 'requires_action', 'captured', 'refunded'];

export function validatePaymentUiReadback({ before, after, snapshot, runId, bookingId }) {
  if (JSON.stringify(before) !== JSON.stringify(after) || before.id !== bookingId
      || snapshot.runId !== runId || snapshot.bookingId !== bookingId
      || snapshot.marker?.persistentNotice !== paymentNotice || snapshot.marker?.monetaryEffectMinor !== 0
      || snapshot.marker?.syntheticTestOnly !== true
      || snapshot.marker?.contractEligible !== false || snapshot.marker?.payoutEligible !== false
      || snapshot.payment?.status !== 'refunded' || snapshot.payment?.livemode !== false
      || snapshot.payment?.capturedMinor !== 6600 || snapshot.payment?.refundedMinor !== 6600
      || snapshot.payment?.method !== 'synthetic' || snapshot.payment?.scenario !== 'challenge_then_capture'
      || snapshot.quote?.amountMinor !== 6600 || snapshot.quote?.platformFeeMinor !== 600
      || snapshot.payout !== null
      || snapshot.audit?.some((entry, index) => entry.sequence !== index + 1 || entry.monetaryEffectMinor !== 0)
      || JSON.stringify(snapshot.audit?.map((entry) => entry.status)) !== JSON.stringify(paymentAuditStatuses)) {
    throw new Error('synthetic_payment_ui_readback_invalid');
  }
  return { status: 'passed-local-synthetic-ui', auditStatuses: [...paymentAuditStatuses], cloneBookingUnchanged: true, replayAddedEvents: 0, monetaryEffectMinor: 0 };
}

export async function runSyntheticPaymentUiFlow({ driver, readBooking, readPayment, runId, bookingId }) {
  const before = await readBooking();
  await driver.tapVisibleLabel('Lokalen Zahlungstest öffnen', 'payment-entry');
  const waitStatus = async (status, phase) => {
    await driver.waitForPattern(new RegExp(`^Server-Teststatus: ${status}$`, 'u'), `${phase}-status`);
    await driver.waitForPattern(/^Synthetischer Zahlungstest – kein echtes Geld\/kein Vertrag\/keine Auszahlung$/u, `${phase}-notice`);
  };
  for (const [index, [label, status]] of [
    ['Sichere Testablehnung wählen', null], ['Testauswahl speichern', 'ready'],
    ['Testzahlung absenden', 'failed'], ['Bestätigung mit Testerfolg wählen', null],
    ['Testauswahl speichern', 'ready'], ['Testzahlung absenden', 'requires_action'],
    ['Zusätzliche Testbestätigung', 'captured'], ['Testerstattung auslösen', 'refunded'],
    ['Letzten Testbefehl wiederholen', 'refunded'],
  ].entries()) {
    const phase = `payment-action-${index + 1}`;
    await driver.tapVisibleLabel(label, phase);
    if (status) await waitStatus(status, phase);
  }
  await driver.shell(['input', 'keyevent', 'KEYCODE_BACK']);
  await driver.tapVisibleLabel('Lokalen Zahlungstest öffnen', 'payment-reopen');
  await waitStatus('refunded', 'payment-reopen');
  const result = validatePaymentUiReadback({ before, after: await readBooking(), snapshot: await readPayment(), runId, bookingId });
  await driver.shell(['input', 'keyevent', 'KEYCODE_BACK']);
  return result;
}
