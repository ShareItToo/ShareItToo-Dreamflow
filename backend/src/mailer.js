import nodemailer from 'nodemailer';

import { config } from './config.js';
import { safeOperationalErrorCode } from './observability.js';
import { buildTransactionalEmail } from './transactional_mail_templates.js';

export { buildTransactionalEmail } from './transactional_mail_templates.js';

let transporter = null;
let status = config.mail.transport === 'disabled' ? 'disabled' : 'unverified';

function mailError(code, cause = undefined) {
  const error = new Error(code, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function getTransporter() {
  if (transporter) return transporter;
  if (config.mail.transport === 'disabled') throw mailError('mail_unavailable');
  if (config.mail.transport === 'memory') {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  if (config.mail.transport !== 'smtp' || !config.mail.host || !Number.isFinite(config.mail.port)) {
    throw mailError('mail_configuration_invalid');
  }
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    name: new URL(config.appPublicUrl).hostname,
    secure: config.mail.secure,
    requireTLS: config.mail.requireTls,
    auth: config.mail.user && config.mail.password
      ? { user: config.mail.user, pass: config.mail.password }
      : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export function getMailerStatus() {
  return status;
}

export async function verifyMailer() {
  if (config.mail.transport === 'disabled') {
    status = 'disabled';
    return status;
  }
  if (config.mail.transport === 'memory') {
    status = 'ok';
    return status;
  }
  try {
    await getTransporter().verify();
    status = 'ok';
  } catch (error) {
    status = 'error';
    console.error('[mail] SMTP verification failed', safeOperationalErrorCode(error, 'smtp_verification_failed'));
  }
  return status;
}

async function send({ to, subject, text, html }) {
  try {
    const info = await getTransporter().sendMail({
      from: config.mail.from,
      replyTo: config.mail.replyTo,
      to,
      subject,
      text,
      html,
    });
    status = 'ok';
    return info;
  } catch (error) {
    if (config.mail.transport !== 'disabled') status = 'error';
    throw mailError('mail_delivery_failed', error);
  }
}

function emailShell({ title, intro, buttonLabel, url, expiryText, footer }) {
  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeButtonLabel = escapeHtml(buttonLabel);
  const safeUrl = escapeHtml(url);
  const safeExpiryText = escapeHtml(expiryText);
  const safeFooter = escapeHtml(footer);
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${safeTitle}</title></head>
<body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#172033">
<div style="max-width:600px;margin:0 auto;padding:32px 18px">
<div style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 10px 30px rgba(20,35,70,.08)">
<div style="font-size:25px;font-weight:800;color:#2156d9;margin-bottom:24px">ShareItToo</div>
<h1 style="font-size:24px;margin:0 0 14px">${safeTitle}</h1>
<p style="font-size:16px;line-height:1.55;margin:0 0 24px">${safeIntro}</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#2156d9;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${safeButtonLabel}</a></p>
<p style="font-size:13px;line-height:1.5;color:#5d6980">${safeExpiryText}</p>
<p style="font-size:13px;line-height:1.5;color:#5d6980;word-break:break-all">Falls der Button nicht funktioniert:<br>${safeUrl}</p>
<p style="font-size:13px;line-height:1.5;color:#5d6980;margin-top:26px">${safeFooter}</p>
</div></div></body></html>`;
}

export async function sendVerificationEmail({ email, displayName, token }) {
  const url = `${config.publicBaseUrl}/auth/email-verification/confirm?token=${encodeURIComponent(token)}`;
  const greeting = displayName ? `Hallo ${displayName},` : 'Hallo,';
  return send({
    to: email,
    subject: 'Bestätige deine E-Mail-Adresse bei ShareItToo',
    text: `${greeting}\n\nBitte bestätige deine E-Mail-Adresse: ${url}\n\nDer Link ist 24 Stunden gültig. Wenn du kein ShareItToo-Konto erstellt hast, kannst du diese E-Mail ignorieren.`,
    html: emailShell({
      title: 'E-Mail-Adresse bestätigen',
      intro: `${greeting} bestätige bitte deine E-Mail-Adresse, damit dein ShareItToo-Konto vollständig geschützt ist.`,
      buttonLabel: 'E-Mail bestätigen',
      url,
      expiryText: 'Dieser Link ist 24 Stunden gültig und kann nur einmal verwendet werden.',
      footer: 'Wenn du kein ShareItToo-Konto erstellt hast, kannst du diese E-Mail ignorieren.',
    }),
  });
}

export async function sendEmailChangeVerification({ email, displayName, token }) {
  const url = `${config.publicBaseUrl}/auth/email-change/confirm?token=${encodeURIComponent(token)}`;
  const greeting = displayName ? `Hallo ${displayName},` : 'Hallo,';
  return send({
    to: email,
    subject: 'Bestätige deine neue ShareItToo-E-Mail-Adresse',
    text: `${greeting}\n\nBitte bestätige diese neue E-Mail-Adresse für dein ShareItToo-Konto: ${url}\n\nDer Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, bestätige den Link nicht.`,
    html: emailShell({
      title: 'Neue E-Mail-Adresse bestätigen',
      intro: `${greeting} bestätige diese Adresse, damit sie künftig für deine ShareItToo-Anmeldung verwendet wird. Danach werden alle bestehenden Sitzungen aus Sicherheitsgründen beendet.`,
      buttonLabel: 'Neue E-Mail bestätigen',
      url,
      expiryText: 'Dieser Link ist 24 Stunden gültig und kann nur einmal verwendet werden.',
      footer: 'Wenn du diese Änderung nicht angefordert hast, bestätige den Link nicht und wende dich an den Support.',
    }),
  });
}

export async function sendEmailChangeAlert({ email, displayName }) {
  const greeting = displayName ? `Hallo ${displayName},` : 'Hallo,';
  return send({
    to: email,
    subject: 'Änderung deiner ShareItToo-E-Mail-Adresse angefordert',
    text: `${greeting}\n\nFür dein ShareItToo-Konto wurde eine neue E-Mail-Adresse angefordert. Die bisherige Adresse bleibt aktiv, bis die neue Adresse bestätigt wird. Wenn du das nicht warst, ändere bitte sofort dein Passwort und kontaktiere den Support.`,
    html: emailShell({
      title: 'E-Mail-Änderung angefordert',
      intro: `${greeting} für dein Konto wurde eine neue E-Mail-Adresse angefordert. Deine bisherige Adresse bleibt aktiv, bis die neue Adresse bestätigt wurde.`,
      buttonLabel: 'ShareItToo öffnen',
      url: config.appPublicUrl,
      expiryText: 'Wenn du die Änderung selbst gestartet hast, ist nichts weiter zu tun, bis du die neue Adresse bestätigt hast.',
      footer: 'Wenn du das nicht warst, ändere bitte sofort dein Passwort und kontaktiere den Support.',
    }),
  });
}

export async function sendPasswordResetEmail({ email, displayName, token }) {
  const url = `${config.publicBaseUrl}/auth/password-reset/form?token=${encodeURIComponent(token)}`;
  const greeting = displayName ? `Hallo ${displayName},` : 'Hallo,';
  return send({
    to: email,
    subject: 'Setze dein ShareItToo-Passwort zurück',
    text: `${greeting}\n\nÜber diesen Link kannst du dein Passwort zurücksetzen: ${url}\n\nDer Link ist 30 Minuten gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
    html: emailShell({
      title: 'Passwort zurücksetzen',
      intro: `${greeting} über den folgenden sicheren Link kannst du ein neues Passwort für dein ShareItToo-Konto festlegen.`,
      buttonLabel: 'Neues Passwort festlegen',
      url,
      expiryText: 'Dieser Link ist 30 Minuten gültig und kann nur einmal verwendet werden.',
      footer: 'Wenn du diese Änderung nicht angefordert hast, bleibt dein bisheriges Passwort unverändert.',
    }),
  });
}

export async function sendAccountDeletionEmail({ email, displayName, token }) {
  const url = `${config.publicBaseUrl}/account-deletion/confirm?token=${encodeURIComponent(token)}`;
  const greeting = displayName ? `Hallo ${displayName},` : 'Hallo,';
  return send({
    to: email,
    subject: 'Bestätige die Löschung deines ShareItToo-Kontos',
    text: `${greeting}\n\nÜber diesen Link kannst du die Löschung deines ShareItToo-Kontos bestätigen: ${url}\n\nDer Link ist 30 Minuten gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail und dein Konto bleibt unverändert.`,
    html: emailShell({
      title: 'Kontolöschung bestätigen',
      intro: `${greeting} bestätige die Kontolöschung nur, wenn du sie selbst angefordert hast. Offene Buchungen, Auszahlungen oder Streitfälle können die Löschung vorübergehend blockieren.`,
      buttonLabel: 'Kontolöschung prüfen',
      url,
      expiryText: 'Dieser Link ist 30 Minuten gültig und kann nur einmal verwendet werden.',
      footer: 'Wenn du diese Löschung nicht angefordert hast, bleibt dein Konto unverändert.',
    }),
  });
}

export async function sendTransactionalEmail({ email, ...templateInput }) {
  const message = buildTransactionalEmail(templateInput);
  return send({
    to: email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
