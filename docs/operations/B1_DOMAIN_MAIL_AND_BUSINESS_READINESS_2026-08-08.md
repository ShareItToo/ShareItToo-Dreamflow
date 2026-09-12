# B1 Domain, E-Mail und Geschäftsgrundlagen

Stand: 8. August 2026

## Ziel

B1 schafft die belastbare Absender-, Domain- und Geschäftsgrundlage für
Transaktionsmails, Passwort-Zurücksetzung, Buchungsbenachrichtigungen,
Zahlungsereignisse und die spätere Store-Einreichung.

## Erreichter Stand

### Domain und DNS

- Die autoritative DNS-Verwaltung für `shareittoo.com` liegt bei Namecheap.
- Die bestehenden Google-Workspace-MX-Einträge wurden nicht verändert.
- SPF ist als einzelner Root-TXT-Eintrag veröffentlicht:
  `v=spf1 include:_spf.google.com ~all`
- Google-Workspace-DKIM ist mit 2048 Bit und Selector `google` veröffentlicht
  und in Google Admin aktiviert.
- Der Google-Workspace-Alias `dmarc@shareittoo.com` ist dem Konto
  `contact@shareittoo.com` zugeordnet.
- DMARC ist im Beobachtungsmodus veröffentlicht:
  `v=DMARC1; p=none; rua=mailto:dmarc@shareittoo.com; pct=100`
- Cloudflare DNS, Google Public DNS und Quad9 liefern SPF, den vollständigen
  2048-Bit-DKIM-Schlüssel und DMARC am 9. August 2026 identisch aus. Die zuvor
  noch laufende öffentliche Verteilung ist damit für diese unabhängigen
  Resolver bestätigt.
- Das vorhandene SMTP-Relay wurde nicht verändert.
- `node tool/verify_email_dns.mjs` prüft wiederholbar und ohne Zugangsdaten,
  dass genau ein erwarteter SPF-Eintrag, ein gültiger 2048-Bit-DKIM-Schlüssel
  und die überwachte DMARC-Richtlinie bei allen drei Resolvern vorliegen.

### Anwendung und Mailvorlagen

- Die sichtbare Kontaktadresse in der App wurde von der veralteten
  `.de`-Adresse auf `contact@shareittoo.com` vereinheitlicht.
- Die abgeschaltete EU-OS-Plattform und ihr toter Link wurden aus dem
  Impressum entfernt. Der Hinweis zur Verbraucherstreitbeilegung bleibt
  erhalten.
- Der veraltete Verweis auf § 55 Abs. 2 RStV wurde auf § 18 Abs. 2 MStV
  aktualisiert.
- Das Backend enthält sichere Vorlagen für sieben Transaktionsereignisse:
  Buchungsanfrage, Buchungsbestätigung, Zahlungsbestätigung, Stornierung,
  Übergabe-Erinnerung, Rückgabe-Erinnerung und Auszahlung.
- Vorlagen erzeugen Text und HTML, maskieren nutzergesteuerte HTML-Inhalte,
  lehnen unsichere Aktionslinks und Header-Zeilenumbrüche ab und fordern bei
  Zahlungs- bzw. Terminereignissen die nötigen Angaben an.

## Noch offene Abnahmepunkte

### Technische Mailabnahme

- Eine bereits am 8. August 2026 um 18:37 Uhr empfangene produktive
  Verifizierungs-Mail wurde in Gmail geprüft. `From` und `Reply-To` zeigen
  `contact@shareittoo.com`, die Übertragung war TLS-verschlüsselt und der
  Bestätigungslink zeigte auf die produktive HTTPS-API. Die Nachricht wurde
  jedoch vor der neuen DKIM-/DMARC-Konfiguration versendet und mit dem alten
  delegierten Google-Schlüssel signiert; sie ist deshalb nur ein
  Funktionsnachweis und kein aktueller Authentifizierungsnachweis.
- Eine neue Testmail wurde am 9. August 2026 um 14:40:34 Uhr CEST über das
  bestehende Google-Workspace-SMTP-Relay auf dem VPS von
  `contact@shareittoo.com` an `contact@shareittoo.com` zugestellt. Betreff:
  `SIT B1 AUTH TEST 2026-08-09`; Message-ID:
  `178627923498.707000.11688038276532933807@shareittoo.com`. Das Gmail-Original
  weist `SPF=PASS`, `DKIM=PASS` mit Selector `google` und
  `DMARC=PASS (p=NONE)` aus; Envelope-From, DKIM-Domain und sichtbare
  From-Domain sind auf `shareittoo.com` ausgerichtet. Gmail zeigt außerdem
  TLS-Transport. Das bestehende Relay und alle übrigen Dienste blieben
  unverändert.
- Eine zweite Testmail wurde am 9. August 2026 über denselben unveränderten
  Versandweg an die neutrale Prüfinstanz `dmarctester.com` gesendet. Der
  unabhängige Empfänger bestätigte `SPF=PASS`, `DKIM=PASS` mit
  RSA-SHA256/2048 Bit und Selector `google`, SPF- und DKIM-Ausrichtung jeweils
  `PASS` sowie `DMARC=PASS`. Der Abschlussstatus enthält keine Warnung; die
  Richtlinie bleibt bewusst `p=none`.
- `From`, `Reply-To`, Support-Adresse, Passwort-Reset-Link und Buchungslink auf
  Desktop und Mobilgerät prüfen.
- DMARC-Berichte mindestens eine Woche im Modus `p=none` beobachten, bevor
  eine Verschärfung auf `quarantine` oder `reject` entschieden wird.

### Verbindliche Geschäftsangaben

Die App nennt bereits „ShareItToo GmbH“, Walid Chraibi, eine Anschrift und eine
Telefonnummer. Vor Veröffentlichung müssen diese Angaben anhand belastbarer
Unterlagen bestätigt werden. Es dürfen keine fehlenden Angaben erfunden
werden.

Zu klären und gegebenenfalls zu ergänzen:

- genaue Firma und Rechtsform;
- vertretungsberechtigte Person;
- ladungsfähige Geschäftsanschrift und geschäftliche Telefonnummer;
- Registergericht und Handelsregisternummer, sofern eingetragen;
- Umsatzsteuer- oder Wirtschafts-Identifikationsnummer, sofern vorhanden;
- Beschäftigtenzahl und verbindliche Entscheidung zur Teilnahme an einer
  Verbraucherschlichtungsstelle;
- vollständige Datenschutzerklärung mit Verantwortlichem, Zwecken,
  Rechtsgrundlagen, Empfängern/Auftragsverarbeitern, Drittlandtransfers,
  Löschfristen und Beschwerderecht;
- verbindliche Gebühren-, Storno-, Erstattungs-, Kautions-, Schadens- und
  Auszahlungsgrundsätze;
- Zugriff und Wiederherstellung für Apple Developer, Google Play Console und
  Stripe Business/Connect.

## Rechtliche Prüfgrundlage

Diese Prüfung ersetzt keine anwaltliche Freigabe. Verwendete Primärquellen:

- § 5 DDG zu Anbieterangaben:
  https://www.gesetze-im-internet.de/ddg/__5.html
- § 36 VSBG zur Information über Verbraucherstreitbeilegung:
  https://www.gesetze-im-internet.de/vsbg/__36.html
- § 18 MStV zu Informationspflichten und Verantwortlichen:
  https://www.gesetze-bayern.de/Content/Document/MStV-18
- Verordnung (EU) 2024/3228 zur Einstellung der EU-OS-Plattform:
  https://eur-lex.europa.eu/eli/reg/2024/3228

## Abnahmekriterium für B1

B1 ist abgeschlossen, wenn die drei Mailauthentifizierungen in echten
Empfangs-Headern bestehen, beide Empfänger ohne Warnhinweis zustellen, die
Transaktionslinks geprüft sind, die Geschäftsangaben belegt und freigegeben
sind und die Apple-/Google-/Stripe-Zugänge mit Wiederherstellungsweg bestätigt
wurden.

## Rückfallweg

- Bei Mailproblemen bleiben MX und SMTP-Relay unverändert.
- Neue DNS-Änderungen sind auf SPF, DKIM und DMARC beschränkt und können
  einzeln zurückgenommen werden.
- DMARC bleibt bis zur Auswertung bewusst im nicht blockierenden Modus
  `p=none`.
- Die neuen Vorlagen sind bis zu ihrer Verdrahtung mit produktiven
  Buchungsereignissen ohne Einfluss auf den bestehenden Mailfluss.
