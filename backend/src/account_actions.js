import escapeHtml from 'escape-html';

import { config } from './config.js';
import { hashActionToken, newActionToken } from './security.js';

export const ACCOUNT_RECOVERY_EMAIL_BLOCKED = 'account_recovery_email_blocked';

export async function createActionToken(client, { userId, kind, payload = {} }) {
  const target = await client.query(
    `SELECT id FROM users
     WHERE id = $1 AND deactivated_at IS NULL
     FOR UPDATE`,
    [userId],
  );
  if (!target.rowCount) throw new Error('account_action_target_unavailable');
  if (kind === 'reset_password') {
    const activeTakeoverCase = await client.query(
      `SELECT 1
         FROM support_cases
        WHERE reporter_user_id = $1
          AND case_type = 'trust_safety'
          AND case_subtype = 'account_takeover'
          AND priority = 'p0'
          AND account_takeover_flag = true
          AND status NOT IN ('resolved', 'closed')
        LIMIT 1`,
      [userId],
    );
    if (activeTakeoverCase.rowCount) {
      throw new Error(ACCOUNT_RECOVERY_EMAIL_BLOCKED);
    }
  }
  const token = newActionToken();
  const createdAt = new Date();
  const lifetimeMs = ['verify_email', 'change_email'].includes(kind)
    ? config.emailVerificationLifetimeHours * 60 * 60 * 1000
    : (kind === 'delete_account'
      ? config.accountDeletionLifetimeMinutes
      : config.passwordResetLifetimeMinutes) * 60 * 1000;
  const expiresAt = new Date(createdAt.getTime() + lifetimeMs);
  await client.query(
    `UPDATE auth_action_tokens
     SET consumed_at = COALESCE(consumed_at, now())
     WHERE user_id = $1 AND kind = $2 AND consumed_at IS NULL`,
    [userId, kind],
  );
  await client.query(
    `INSERT INTO auth_action_tokens (
       user_id, kind, token_hash, expires_at, payload, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      userId,
      kind,
      hashActionToken(token),
      expiresAt,
      JSON.stringify(payload),
      createdAt,
    ],
  );
  return token;
}

export async function lockValidActionToken(client, { token, kind }) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 500) return null;
  const result = await client.query(
    `SELECT aat.id AS action_token_id, aat.user_id, aat.expires_at,
            aat.payload AS action_payload,
            u.id, u.email, u.password_hash, u.profile, u.created_at,
            u.updated_at, u.deactivated_at, u.email_verified_at, u.password_changed_at,
            u.role, u.account_status, u.terms_accepted_at, u.privacy_accepted_at,
            u.minimum_age_confirmed_at, u.phone_verified_at
     FROM auth_action_tokens aat
     JOIN users u ON u.id = aat.user_id
     WHERE aat.token_hash = $1 AND aat.kind = $2
       AND aat.consumed_at IS NULL AND aat.expires_at > now()
       AND u.deactivated_at IS NULL
     FOR UPDATE OF aat, u`,
    [hashActionToken(token), kind],
  );
  return result.rows[0] ?? null;
}

export async function consumeActionToken(client, actionTokenId) {
  const result = await client.query(
    `UPDATE auth_action_tokens
     SET consumed_at = now()
     WHERE id = $1 AND consumed_at IS NULL
     RETURNING id`,
    [actionTokenId],
  );
  return result.rowCount === 1;
}

function pageShell({ title, content, pageId = '', complianceStatus = '' }) {
  const pageAttribute = pageId
    ? ` data-sit-public-page="${escapeHtml(pageId)}"`
    : '';
  const statusAttribute = complianceStatus
    ? ` data-sit-compliance-status="${escapeHtml(complianceStatus)}"`
    : '';
  return `<!doctype html><html lang="de"${pageAttribute}${statusAttribute}><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · ShareItToo</title>
<style>body{margin:0;background:#edf2fb;color:#172033;font-family:Arial,sans-serif}.wrap{max-width:720px;margin:6vh auto;padding:20px}.card{background:#fff;border-radius:22px;padding:32px;box-shadow:0 16px 42px rgba(24,45,90,.12)}.brand{color:#2156d9;font-size:25px;font-weight:800;margin-bottom:24px}h1{font-size:25px;margin:0 0 14px}h2{font-size:19px;margin:28px 0 8px}p,li{line-height:1.55;color:#4d596f}.button,button{display:inline-block;border:0;border-radius:12px;background:#2156d9;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;cursor:pointer}a{color:#1748bd}label{display:block;font-weight:700;margin:15px 0 7px}input{box-sizing:border-box;width:100%;border:1px solid #c9d3e6;border-radius:11px;padding:13px;font-size:16px}.hint{font-size:13px}.error{color:#b42318;font-weight:700}.draft{border-left:4px solid #b54708;background:#fff4e5;padding:12px 14px;color:#713b12}.meta{font-size:13px;color:#667085}</style>
</head><body><main class="wrap"><section class="card"><div class="brand">ShareItToo</div>${content}</section></main></body></html>`;
}

export function publicComplianceOverview({
  compliance = config.publicCompliance,
  consumerDispute = config.consumerDispute,
  productSafety = config.productSafety,
} = {}) {
  const approved = compliance.approved
    && consumerDispute.isComplete
    && productSafety.isComplete;
  return {
    status: approved ? 'approved' : 'draft',
    submissionReady: approved,
    pages: {
      support: compliance.approved && productSafety.isComplete
        ? 'approved'
        : 'draft',
      privacy: approved ? 'approved' : 'draft',
      consumerDispute: consumerDispute.isComplete ? 'approved' : 'draft',
      productSafety: productSafety.isComplete ? 'approved' : 'draft',
      accountDeletion: 'operational',
    },
  };
}

export function publicSupportPage({
  compliance = config.publicCompliance,
  productSafety = config.productSafety,
} = {}) {
  const approved = compliance.approved && productSafety.isComplete;
  const { supportEmail } = compliance;
  const status = approved ? 'approved' : 'draft';
  const content = approved
    ? `<h1>Support</h1><p>Wir helfen bei Fragen zu Konten, Inseraten, Buchungen, Zahlungen, Sicherheit und Meldungen.</p>
<h2>Kontakt</h2><p><a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p>
<p>In der App findest du außerdem unter Profil → Hilfe den Hilfebereich und die geschützten Supportwege zu einer Buchung.</p>
<h2>Produktsicherheit melden</h2><p>Möglicherweise gefährliche Produkte, Unfälle oder Verletzungen kannst du direkt und schnell an <a href="mailto:${escapeHtml(productSafety.consumerContactEmail)}">${escapeHtml(productSafety.consumerContactEmail)}</a> melden. Nenne möglichst Produkt, Hersteller oder Modell, das betroffene Inserat, die Art der Gefahr sowie Datum und vorhandene Nachweise. Nutze das Produkt nicht weiter und gib es nicht weiter. Bei akuter Gefahr oder Verletzung rufe 112; dieser Kontakt ist kein Notruf und ersetzt keine medizinische oder technische Beurteilung.</p>
<h2>Rechtswidrige Inhalte melden</h2><p>Auch ohne Konto kannst du möglicherweise rechtswidrige Anzeigen, Profile, Bewertungen oder andere Inhalte elektronisch an die oben genannte Adresse melden. Verwende möglichst den Betreff „Meldung rechtswidriger Inhalt“ und nenne den direkten Link oder eine eindeutige Beschreibung des Inhalts, den Grund der Meldung, die betroffene Rechtsposition und vorhandene Nachweise. Erkläre bitte außerdem, dass du die Angaben nach bestem Wissen für richtig und vollständig hältst.</p>
<p>Wir bestätigen den Eingang, prüfen hinreichend konkrete Meldungen sorgfältig und informieren über die Entscheidung, soweit eine Kontaktadresse angegeben wurde und keine rechtlichen Gründe entgegenstehen.</p>
<h2>Beschwerde zu einer Moderationsentscheidung</h2><p>Wenn dein Inhalt oder Konto eingeschränkt wurde oder du mit dem Ergebnis einer Meldung nicht einverstanden bist, kannst du über dieselbe Adresse eine erneute Prüfung verlangen. Nenne dafür die betroffene Anzeige, das Profil oder die Fallreferenz und erläutere, weshalb die Entscheidung geändert werden sollte.</p>
<p class="hint">Bei unmittelbarer Gefahr für Personen wende dich bitte an Polizei oder Rettungsdienst. Dieser Kontakt ist kein Notruf.</p>`
    : `<h1>Support</h1><p class="draft">Diese öffentliche Supportseite ist technisch vorbereitet, aber die verbindlichen Support- und Produktsicherheits-Kontaktpunkte wurden noch nicht geschäftlich freigegeben.</p>
<p>Vor einer Store-Einreichung werden Kontaktadressen, Produktsicherheitsprozess, Safety-Gate-Registrierung, Zustellung und Verantwortlichkeit bestätigt. Bis dahin darf diese Seite nicht als freigegebene Store-URL verwendet werden.</p>`;
  return pageShell({
    title: 'Support',
    pageId: 'support',
    complianceStatus: status,
    content,
  });
}

export function publicPrivacyPage({
  compliance = config.publicCompliance,
} = {}) {
  const status = compliance.approved ? 'approved' : 'draft';
  const content = compliance.approved
    ? `<h1>Datenschutz</h1><p class="meta">Stand: ${escapeHtml(compliance.effectiveDate)}</p>
<h2>Verantwortlicher</h2><p>${escapeHtml(compliance.providerName)}<br>${escapeHtml(compliance.providerAddress)}<br><a href="mailto:${escapeHtml(compliance.privacyEmail)}">${escapeHtml(compliance.privacyEmail)}</a></p>
<h2>Geltungsbereich</h2><p>Diese Datenschutzerklärung gilt für die ShareItToo-App und die zugehörigen öffentlichen Konto-, Support- und Löschseiten. ShareItToo vermittelt die zeitweise Nutzung physischer Gegenstände zwischen Nutzern.</p>
<h2>Welche Daten verarbeitet werden</h2><p>Je nach Nutzung verarbeitet ShareItToo Konto- und Kontaktdaten, Alters- und Einwilligungsstatus, Profilangaben, Inserats- und Bilddaten, Adressen sowie ungefähre oder präzise Standortdaten, Buchungsbeträge und Buchungsstatus, Nachrichten, Bewertungen, Meldungen, Geräte- und Push-Kennungen sowie Sicherheits-, Audit-, Sitzungs- und Crashdiagnosedaten. Eine freiwillige Produktsicherheitsmeldung kann außerdem Angaben zum Produkt, zu Gefahren, Unfällen oder Verletzungen enthalten. Der aktuelle Store-Kandidat bietet keine Ausweisprüfung und keinen Upload von Identitätsdokumenten an. Er erhebt außerdem keine Karten- oder Bankdaten und überträgt kein Echtgeld an Stripe.</p>
<h2>Private Zustandsnachweise</h2><p>Bei der Übergabe hinterlegt der Vermieter mindestens vier aktuelle Zustandsfotos; der Mieter bestätigt den Fotosatz oder dokumentiert eine Abweichung mit mindestens einem eigenen Foto. Bei der Rückgabe gelten dieselben Schritte mit vertauschten Rollen. Die Nachweise sind an Buchung, Rolle, geschützten Upload und Chatnachricht gebunden, nicht öffentlich und werden nicht an eine KI übermittelt.</p>
<h2>Zwecke und Rechtsgrundlagen</h2><p>Die Verarbeitung dient – abhängig vom jeweiligen Vorgang – der Vertragsanbahnung und Kontoführung, der Vermittlung und Abwicklung physischer Mietvorgänge, Kommunikation, Sicherheit und Missbrauchsabwehr, Support, gesetzlichen Nachweisen oder einer ausdrücklich gestarteten beziehungsweise eingewilligten Funktion. Als Rechtsgrundlagen kommen insbesondere Art. 6 Abs. 1 Buchst. a, b, c und f DSGVO in Betracht.</p>
<h2>Standort und Google Maps Platform</h2><p>Adressvorschläge und Ortsdetails werden nur bei Nutzung der entsprechenden Eingabefunktion an Google Maps Platform übertragen. Dabei können die eingegebene Adresse beziehungsweise Ortskennung, die IP-Adresse des Geräts und technische Anfrageinformationen verarbeitet werden. Einen präzisen aktuellen Gerätestandort fragt die App nur ab, wenn du „Standort prüfen“ selbst startest. Es findet keine dauerhafte Hintergrund- oder Live-Ortung statt. Weitere Informationen enthalten die <a href="https://policies.google.com/privacy">Datenschutzhinweise von Google</a>.</p>
<h2>Firebase Push und Crashdiagnose</h2><p>Push und freiwillige Crashdiagnose sind in der App standardmäßig aus und werden nur nach einer getrennten Wahl in den Benachrichtigungseinstellungen aktiviert. Beide Dienste können dort jederzeit wieder ausgeschaltet werden. Firebase Cloud Messaging verarbeitet eine Firebase-Installationskennung, um Push-Nachrichten an die App-Installation zuzustellen. Nach einer Löschanforderung für die Installationskennung entfernt Firebase die zugehörigen Daten nach eigenen Angaben innerhalb von bis zu 180 Tagen aus Live- und Sicherungssystemen. Firebase Crashlytics verarbeitet Installations- und Sitzungskennungen, Geräte- und App-Informationen sowie Crash- und Diagnosedaten; ShareItToo übermittelt dabei keine Werbe-ID und keine SIT-Nutzerkennung. Beim Ausschalten oder bei einer Kontolöschung löscht ShareItToo ungesendete Crashberichte auf dem Gerät und fordert die Löschung der Firebase-Installation an. Bereits gesendete Crashdaten kann ShareItToo ohne übermittelte SIT-Nutzerkennung keinem Konto zuordnen und nicht kontobezogen vorzeitig löschen. Crashlytics bewahrt diese Daten und zugehörige Kennungen nach eigenen Angaben 90 Tage auf, bevor die Entfernung aus Live- und Sicherungssystemen beginnt. Die Verarbeitung kann weltweit an Standorten von Google oder dessen Auftragsverarbeitern erfolgen.</p>
<h2>Telefonnummer per SMS bestätigen</h2><p>Wenn du diese freiwillige Funktion startest, übermittelt die App die angegebene Telefonnummer an Firebase Authentication und Google sendet einen einmal verwendbaren SMS-Code. ShareItToo erhält den SMS-Code nicht. Der Server akzeptiert die Bestätigung nur, wenn die von Firebase geprüfte Nummer exakt der angeforderten Nummer entspricht, und entfernt anschließend die nur für diesen Nachweis verwendete Firebase-Telefonidentität. Der SMS-Versand ist auf deutsche Rufnummern beschränkt.</p>
<h2>Anmeldung mit Google, Apple oder Facebook</h2><p>Diese Anmeldearten sind im aktuellen Kandidaten technisch vorbereitet, aber noch nicht für Nutzer aktiviert. Vor einer Aktivierung werden Anbieter, Rechtsgrundlage und Datenflüsse erneut geprüft. Wenn du später freiwillig eine aktivierte Anmeldeart wählst, verarbeitet Firebase Authentication insbesondere Anbieterkennung, E-Mail-Adresse, E-Mail-Bestätigungsstatus und gegebenenfalls den Anzeigenamen. ShareItToo speichert dann nur die sichere Kontoverknüpfung, nicht das Passwort des Anbieters und nicht dessen Zugriffstoken. Bei einer SIT-Kontolöschung wird eine verknüpfte Firebase-Authentifizierungsidentität dauerhaft zur Anbieterlöschung vorgemerkt und bis zur Bestätigung automatisch erneut angefragt. Firebase entfernt sonstige Authentifizierungsdaten nach eigenen Angaben innerhalb von bis zu 180 Tagen nach der kundenseitig ausgelösten Nutzerlöschung aus Live- und Sicherungssystemen.</p>
<h2>Empfänger und Dienstleister</h2><p>Daten werden nur zweckgebunden an erforderliche Hosting-, E-Mail-, Push-, Diagnose-, Authentifizierungs- und Kartendienstleister sowie bei rechtlicher Pflicht an zuständige Stellen übermittelt. Google-Dienste können Daten auf globaler Infrastruktur, auch außerhalb von EU und EWR, nach den jeweils geltenden Datenschutzbedingungen verarbeiten. Apple- und Meta-Anmeldedienste erhalten im aktuellen Kandidaten keine Anmeldedaten, weil diese Anmeldearten nicht aktiviert sind. Der aktuelle Store-Kandidat enthält keine Werbung, kein Werbetracking und keine aktivierte Echtgeld-Zahlungsübertragung an Stripe. Vor einer späteren Aktivierung externer Anmeldungen oder Zahlungen wird diese Erklärung aktualisiert.</p>
<h2>Speicherung, Löschung und Rechte</h2><p>Konto- und Inhaltsdaten werden grundsätzlich für die aktive Kontonutzung und die Abwicklung der angeforderten Funktionen gespeichert. Bei Kontolöschung werden Profil-, Kontakt-, Geräte- und Zugangsdaten gelöscht oder anonymisiert; aktive Sitzungen und Zustellkennungen werden widerrufen. Gesetzlich oder zur Geltendmachung, Ausübung oder Verteidigung von Ansprüchen erforderliche Buchungs-, Sicherheits- und Transaktionsnachweise können zweckgebunden und soweit möglich pseudonymisiert bis zum Ablauf der maßgeblichen Frist verbleiben. Operative Sicherungen rotieren derzeit innerhalb von 14 Tagen; eine kontobezogene Einzelentfernung aus bereits erzeugten Sicherungen ist nicht möglich.</p>
<h2>Kontolöschung und Datenkopie</h2><p>Du kannst deine Daten in der App exportieren und dein Konto unter Konto → Konto löschen entfernen. Alternativ kannst du die Löschung über die <a href="https://shareittoo.com/account-deletion">öffentliche Kontolöschseite</a> anfordern. Offene Buchungen, Sicherheitsfälle oder Streitfälle müssen gegebenenfalls zuerst abgeschlossen werden.</p>
<p>Dir können insbesondere Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch zustehen. Einwilligungen kannst du mit Wirkung für die Zukunft widerrufen. Außerdem kannst du dich bei einer zuständigen Datenschutzaufsichtsbehörde beschweren.</p>
<h2>Datenschutzkontakt</h2><p>Fragen oder Anträge sendest du an <a href="mailto:${escapeHtml(compliance.privacyEmail)}">${escapeHtml(compliance.privacyEmail)}</a>.</p>`
    : `<h1>Datenschutz</h1><p class="draft">Diese öffentliche Datenschutzerklärung ist technisch vorbereitet, befindet sich aber noch in fachlicher und rechtlicher Endprüfung.</p>
<p>Verantwortlicher, Kontakt, Rechtsgrundlagen, Empfänger, Aufbewahrungsfristen und Betroffenenrechte müssen vor Veröffentlichung bestätigt werden. Bis dahin darf diese Seite nicht als freigegebene Store-URL verwendet werden.</p>`;
  return pageShell({
    title: 'Datenschutz',
    pageId: 'privacy',
    complianceStatus: status,
    content,
  });
}

export function publicImprintPage({
  compliance = config.publicCompliance,
  consumerDispute = config.consumerDispute,
} = {}) {
  const approved = compliance.approved && consumerDispute.isComplete;
  const status = approved ? 'approved' : 'draft';
  const content = approved
    ? `<h1>Impressum</h1>
<h2>Anbieter</h2><p>${escapeHtml(compliance.providerName)}<br>${escapeHtml(compliance.providerAddress)}</p>
<h2>Kontakt</h2><p><a href="mailto:${escapeHtml(compliance.supportEmail)}">${escapeHtml(compliance.supportEmail)}</a></p>
<h2>Vertretung und inhaltliche Verantwortung</h2><p>Vertretungsberechtigt: ${escapeHtml(compliance.representative)}<br>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: ${escapeHtml(compliance.contentResponsible)}</p>
<h2>Verbraucherstreitbeilegung</h2><p>ShareItToo ist nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, soweit keine gesetzliche Verpflichtung im Einzelfall besteht.</p>`
    : `<h1>Impressum</h1><p class="draft">Die Anbieterkennzeichnung und die Erklärung zur Verbraucherstreitbeilegung sind noch nicht vollständig zur Veröffentlichung freigegeben.</p>`;
  return pageShell({
    title: 'Impressum',
    pageId: 'imprint',
    complianceStatus: status,
    content,
  });
}

export function resultPage({ success, title, message }) {
  return pageShell({
    title,
    content: `<h1>${escapeHtml(title)}</h1><p class="${success ? '' : 'error'}">${escapeHtml(message)}</p><p><a class="button" href="${escapeHtml(config.appPublicUrl)}">ShareItToo öffnen</a></p>`,
  });
}

export function passwordResetForm({ token, error = '' }) {
  return pageShell({
    title: 'Passwort zurücksetzen',
    content: `<h1>Neues Passwort festlegen</h1><p>Wähle ein neues Passwort mit mindestens zehn Zeichen, einem Buchstaben und einer Zahl.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="${escapeHtml(config.publicBaseUrl)}/auth/password-reset/form" autocomplete="off">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="password">Neues Passwort</label><input id="password" name="password" type="password" minlength="10" maxlength="200" autocomplete="new-password" required>
<label for="passwordConfirm">Passwort wiederholen</label><input id="passwordConfirm" name="passwordConfirm" type="password" minlength="10" maxlength="200" autocomplete="new-password" required>
<p class="hint">Der Link kann nur einmal verwendet werden.</p><button type="submit">Passwort speichern</button></form>`,
  });
}

export function accountDeletionRequestForm({ submitted = false }) {
  return pageShell({
    title: 'ShareItToo-Konto löschen',
    pageId: 'account-deletion',
    complianceStatus: 'operational',
    content: submitted
      ? `<h1>Anfrage erhalten</h1><p>Wenn ein aktives Konto zu dieser Adresse gehört, senden wir einen einmal verwendbaren Bestätigungslink. Prüfe auch den Spam-Ordner.</p>`
      : `<h1>Konto löschen</h1><p>Du kannst die Löschung direkt in der App unter Konto → Konto löschen starten. Alternativ senden wir dir hier einen sicheren Bestätigungslink.</p>
<form method="post" action="${escapeHtml(config.publicBaseUrl)}/account-deletion/request" autocomplete="off">
<label for="email">E-Mail-Adresse</label><input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>
<p class="hint">Offene Buchungen, Sicherheitsfälle oder Streitfälle müssen zuerst abgeschlossen werden. Gesetzlich erforderliche Buchungs- und Sicherheitsnachweise werden nur zweckgebunden und soweit möglich pseudonymisiert aufbewahrt.</p>
<button type="submit">Löschung anfordern</button></form>`,
  });
}

export function accountDeletionConfirmForm({ token, error = '' }) {
  return pageShell({
    title: 'Kontolöschung bestätigen',
    content: `<h1>Konto endgültig löschen?</h1><p>Profil-, Kontakt-, Geräte- und Zugangsdaten werden gelöscht oder anonymisiert. Gesetzlich erforderliche Buchungs- und Sicherheitsnachweise können zweckgebunden und soweit möglich pseudonymisiert verbleiben.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="${escapeHtml(config.publicBaseUrl)}/account-deletion/confirm" autocomplete="off">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Konto endgültig löschen</button></form>`,
  });
}
