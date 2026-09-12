# PF3 — Walid external gate action pack

Status: **HOLD / NO-GO**

Dieses Paket ist eine kleine Folge von Entscheidungs- und Anwesenheitsblöcken,
keine allgemeine Aufgabenliste. Immer nur den nächsten sinnvollen Block öffnen.
Ein `GO` gilt ausschließlich für den Wortlaut des jeweiligen Blocks. Es gibt
keine stillschweigende Freigabe für Kosten, Verträge, AGB, Login/2FA, Secrets,
Signierung, Geräteinstallation, Store-Upload, Produktion, Echtgeld oder
Aktivierung.

Für jeden Betrag gilt: Erst ein konkretes Angebot vorlegen, dann darf Walid mit
dem dokumentierten Kosten-Token einen Maximalbetrag freigeben. Ohne Betrag und
zweite Freigabe beginnt kein kostenpflichtiger Auftrag.

## A — Geschlossener Android-Pilot ohne Echtgeld

### A1 — Rechts-, Betreiber-, Privacy- und Retention-Review anbahnen

- Warum Walid jetzt gebraucht wird: Nur Walid kann den echten Betreiberkontext,
  aktive Verträge und den unabhängigen professionellen Prüfer bestimmen. Dieser
  Block entsperrt fachlich fast alle weiteren Stage-A-Lanes.
- Dauer: etwa 20–30 Minuten für Auswahlkriterien und Freigabe einer
  unverbindlichen Angebotsanfrage; die externe Prüfung selbst ist unbekannt.
- Mögliche Kosten: Anwalt/Datenschutzberatung und gegebenenfalls Vertragsprüfung;
  Betrag unbekannt. Keine Beauftragung ohne separates Kostenlimit.
- Walid öffnet/bestätigt: die vorbereitete 18-Entscheidungs-Rechtsmappe,
  Privacy-/Retention-Matrizen und vorhandene echte Anbieterunterlagen; bestätigt
  nur, ob Codex daraus ein anonymisiertes Anfragepaket für Angebote finalisieren
  darf. Keine Verträge oder personenbezogenen Betreiberangaben im Chat senden.
- Codex parallel: Quellenindex, Hashbindungen, Fragenliste und redigierte
  Übergabe weiter prüfen; keine Kanzlei kontaktieren und keine Rechtsantwort
  erfinden.
- Antworttokens: `PF3_A1_QUOTE_REQUEST_PACK_GO` oder `PF3_A1_HOLD`. Nach einem
  konkreten Angebot ausschließlich `PF3_A1_COST_GO_MAX_EUR_<GANZZAHL>` oder
  `PF3_A1_COST_NO_GO`.
- Ohne Entscheidung blockiert: `PILOT_STAGE_A_LEGAL_OPERATOR_EVIDENCE_ACCEPTED`
  und `PILOT_STAGE_A_PRIVACY_RETENTION_EVIDENCE_ACCEPTED`; damit bleiben
  Firebase, Distribution, Pilot-Envelope und Stage A ebenfalls auf HOLD.

### A2 — Operations-Rollen und Stellvertretungen vorbereiten

- Warum Walid jetzt gebraucht wird: Reale Primärrollen, getrennte
  Stellvertretungen und das führende Unternehmenssystem können nicht aus dem
  Repository abgeleitet werden.
- Dauer: etwa 30–45 Minuten für die private Zuordnung; die vier 72-Stunden-
  Ausfalltests dauern anschließend kalenderbedingt mindestens 72 Stunden.
- Mögliche Kosten: interne Arbeitszeit oder Personalaufwand; unbekannt. Keine
  neue Stelle, Lizenz oder Berechtigung ist durch dieses Paket freigegeben.
- Walid öffnet/bestätigt: das autoritative Unternehmenssystem, trägt dort sechs
  reale Primärrollen und sechs unterschiedliche Stellvertretungen ein und
  bestätigt später nur anonymisierte Rollen-/RBAC-/MFA-Evidenzreferenzen.
- Codex parallel: Runbook, Rollentrennung und Evidenzschema validieren; keine
  echten Namen speichern und keine Accountrechte verändern.
- Antworttokens: `PF3_A2_PRIVATE_ROLE_MAPPING_READY` oder `PF3_A2_HOLD`;
  nach echten Ausfalltests `PF3_A2_ABSENCE_EVIDENCE_READY`.
- Ohne Entscheidung blockiert: `PILOT_STAGE_A_OPERATIONS_EVIDENCE_ACCEPTED`,
  Support-Betrieb, Pilot-Envelope und Stage-A-Entscheidung.

### A3 — Firebase-Owner-Review begleiten

- Warum Walid jetzt gebraucht wird: Nur der Owner kann aktuelle Bedingungen,
  Projekt-/Planstatus sowie Auth-, FCM-, Lösch-/Retention- und Maps-Key-
  Einstellungen authentisch sehen.
- Dauer: etwa 20–30 Minuten in einer begleiteten, nur lesenden Sitzung.
- Mögliche Kosten: unter aktuellem Plan unbekannt; jede Plan-, Billing- oder
  Nutzungsänderung braucht vorher ein konkretes Kostenlimit.
- Walid öffnet/bestätigt: Firebase/Google-Cloud-Konsole im eigenen Browser und
  navigiert zu den vorbereiteten Kontrollpunkten. Bei Login, 2FA, Bedingungen,
  Schlüssel oder Billing stoppt Codex; keine geheimen Werte werden geteilt.
- Codex parallel: Ja/Nein-Evidenzvorlage und Kandidatenbindung prüfen; keine
  Cloud-, Provider- oder Produktionskonfiguration verändern. Die zwei
  unabhängigen Gerätedienst-Schalter sind auf dem historischen Pixel-Kandidaten
  `2026082302` bereits zweimal als aus verifiziert; es wurde keine Einwilligung,
  Registrierung oder Crashdiagnose ausgelöst. Dieser physische Nachweis wird
  nicht auf den aktuellen Play-Entwurf `2026082601` übertragen.
- Antworttokens: `PF3_A3_OWNER_CONSOLE_READ_ONLY_READY` oder `PF3_A3_HOLD`;
  nach vollständiger sanitierter Evidenz
  `PILOT_STAGE_A_FIREBASE_OWNER_CONTROLS_CONFIRMED`.
- Ohne Entscheidung blockiert: Firebase-Gate, private Android-Distribution,
  Pilot-Envelope und Stage A.

### A4 — Private Android-Distributionsroute festlegen

- Warum Walid jetzt gebraucht wird: Der aktuelle signierte Kandidat
  `2026082601` liegt bereits als inaktiver Google-Play-Internal-Entwurf vor.
  Nur der Store-Owner darf entscheiden, ob genau dieser Entwurf mit
  `GOOGLE_PLAY_INTERNAL_RELEASE_GO` intern aktiviert wird. Die umfangreichen
  Pixel-Nachweise gehören zum historischen Kandidaten `2026082302` und werden
  nicht auf den neuen Build übertragen. Auf dem OnePlus wird weiterhin der
  aktive Altbuild `2026081509` erwartet; alle Tests für `2026082601` sind
  `NOT_RUN`.
- Dauer: etwa 20 Minuten nur lesende Console-Prüfung; Signierung, Upload und
  Review sind separate spätere Schritte.
- Mögliche Kosten: Google-Registrierung ist als bereits bezahlt dokumentiert;
  neue Kosten sind unbekannt und nicht freigegeben.
- Walid öffnet/bestätigt: Google Play Console im eigenen Browser, öffnet nur den
  bestehenden Internal-Entwurf `2026082601` und prüft, dass er weiterhin
  inaktiv und nicht zur Review gesendet ist. Keine Schaltfläche zur Aktivierung
  anklicken, bevor das exakte Gate erteilt wurde. Codex stoppt bei Login/2FA,
  Zugangsdaten, Agreement-Annahme oder einer unerwarteten Store-Abweichung.
- Codex parallel: Nach einer später ausdrücklich autorisierten Internal-
  Aktivierung den Play-Update-/OnePlus-Preflight vorbereiten; kein Gerät ohne
  `ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO` ansprechen; keine Binärdatei signieren oder hochladen.
- Antworttokens: `PF3_A4_PLAY_CONSOLE_READ_ONLY_READY` oder `PF3_A4_HOLD`;
  für die genaue Internal-Aktivierung separat
  `GOOGLE_PLAY_INTERNAL_RELEASE_GO`; für den anschließenden begrenzten
  OnePlus-Lauf separat `ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO`; erst
  nach echter Kandidaten-/Geräteevidenz
  `PILOT_STAGE_A_ANDROID_DISTRIBUTION_EVIDENCE_ACCEPTED`.
- Ohne Entscheidung blockiert: exakte private Verteilung, Pilot-Envelope und
  Stage A; öffentliche Store-Veröffentlichung bleibt unabhängig davon gesperrt.

### A5 — Pilot-Envelope und private Teilnehmerverwaltung bestätigen

- Warum Walid jetzt gebraucht wird: Region, reale Einladungsliste,
  Erwachsenenstatus und Teilnehmerinformation sind externe Fakten und dürfen
  nicht erfunden oder in Git gespeichert werden.
- Dauer: etwa 20–30 Minuten für Scope und private Roster-/Consent-Verwaltung.
- Mögliche Kosten: Pilotbetrieb, Supportzeit oder Teilnehmeraufwand; unbekannt,
  ohne Kostenlimit keine Ausgabe.
- Walid öffnet/bestätigt: ein privates System außerhalb Git/Chat für höchstens
  30 eingeladene Erwachsene und bestätigt Spiegelberg, die drei Cat8-Pfade,
  Android-only, 30–50 geplante Abläufe und ausschließlich synthetische Zahlung.
  Noch niemanden einladen oder registrieren.
- Codex parallel: scopesichere Testmatrix, Messdefinitionen und anonymisierte
  Evidenzstruktur vorbereiten; keine Personen-, Account-, Region- oder
  Katalogdaten anlegen.
- Antworttokens:
  `PF3_A5_SPIEGELBERG_CAT8_30_ANDROID_NO_MONEY_SCOPE_CONFIRMED` oder
  `PF3_A5_HOLD`; nach vollständiger externer Evidenz
  `PILOT_STAGE_A_ENVELOPE_EVIDENCE_ACCEPTED`.
- Ohne Entscheidung blockiert: reale Pilotplanung und Stage-A-Entscheidung.

### A6 — Separate Stage-A-Entscheidung

- Warum Walid jetzt gebraucht wird: Technische Vorbereitung oder einzelne
  Gate-Tokens dürfen niemals als Pilotfreigabe interpretiert werden.
- Dauer: etwa 15–20 Minuten für das abschließende, kandidatengebundene
  GO/NO-GO-Paket.
- Mögliche Kosten: keine Gebühr für die Entscheidung; alle vorgelagerten
  genehmigten Kosten müssen separat ausgewiesen sein.
- Walid öffnet/bestätigt: nur das finale Stage-A-Dossier, nachdem A1–A5 mit
  authentischer Evidenz geschlossen und CI/Kandidat/Rollback erneut gebunden
  wurden. Bestätigt weiterhin privat, Android-only und ohne Echtgeld.
- Codex parallel: finale Konsistenzprüfung und NO-GO-Liste; keine Aktivierung,
  Einladung, Installation, Store- oder Cloud-Aktion.
- Antworttokens: erst am erreichten Gate entweder
  `PILOT_STAGE_A_DECISION_GO` oder `PILOT_STAGE_A_DECISION_NO_GO`.
- Ohne Entscheidung blockiert: `PILOT_STAGE_A_DECISION` bleibt unerteilt und
  Stage A wird nicht aktiviert.

## B — Geschlossener Echtgeldpilot

Stage B beginnt erst nach einer separat freigegebenen und erfolgreich
abgeschlossenen Stage A. Bis dahin bleibt Zahlung synthetisch.

### B1 — Support-Scanner und Upload-Policy entscheiden

- Warum Walid jetzt gebraucht wird: Beliebige Support-Dateien dürfen erst nach
  Wahl und Review eines Scanner-/Hostingmodells verarbeitet werden.
- Dauer: etwa 20 Minuten für Anforderung und Angebotsrahmen; Review/Einrichtung
  unbekannt.
- Mögliche Kosten: Managed Scanner oder Self-Hosting plus Security/Privacy-
  Review; unbekannt und nur nach konkretem Limit.
- Walid öffnet/bestätigt: die Acht-Entscheidungs-Matrix und erlaubt höchstens
  den Vergleich geprüfter Optionen. Keine Datei und keine Echtdaten hochladen.
- Codex parallel: Optionen- und Testkriterien mit synthetischen Dateien
  vorbereiten; Intake bleibt deaktiviert.
- Antworttokens: `PF3_B1_SCANNER_OPTIONS_PACK_GO` oder `PF3_B1_HOLD`; nach
  Review und vollständiger Evidenz `SUPPORT_EVIDENCE_SCANNER_POLICY_ACCEPTED`.
- Ohne Entscheidung blockiert: beliebige Support-Evidence-Uploads sowie Stage
  B und C; Stage A bleibt nur mit deaktiviertem Upload zulässig.

### B2 — Marketplace-PSP-Angebote und Vertragsreview anbahnen

- Warum Walid jetzt gebraucht wird: PSP-Produkt, KYC, Vertragspartei,
  Gebühren und DPA sind externe Unternehmensentscheidungen.
- Dauer: etwa 30 Minuten für Kriterien/Angebotsanfragen; Onboarding,
  professionelles Review und acht Sandbox-Szenarien dauern unbekannt länger.
- Mögliche Kosten: Setup-, Monats-, Transaktions-, KYC-, Rechts-, Steuer- und
  Buchhaltungskosten; alle unbekannt und einzeln freigabepflichtig.
- Walid öffnet/bestätigt: die PSP-Anforderung und erlaubt zunächst nur ein
  anonymisiertes Angebots-/Reviewpaket. Keine KYC-, Vertrags-, Secret- oder
  Sandbox-Aktivierung.
- Codex parallel: Vergleichsmatrix, acht E2E-Szenarien und Ledger-/Refund-
  Evidenzschema pflegen; kein Anbieter wird aktiviert.
- Antworttokens: `PF3_B2_PSP_QUOTE_PACK_GO` oder `PF3_B2_HOLD`; nach Angebot
  `PF3_B2_COST_GO_MAX_EUR_<GANZZAHL>` oder `PF3_B2_COST_NO_GO`; nach kompletter
  externer Evidenz `PILOT_STAGE_B_PSP_CONTRACT_SANDBOX_ACCEPTED`.
- Ohne Entscheidung blockiert: jede Live-PSP-/Echtgeldfunktion und Stage B/C.

### B3 — Separate Echtgeldentscheidung

- Warum Walid jetzt gebraucht wird: Ein erfolgreicher Sandboxlauf ist keine
  Echtgeldfreigabe.
- Dauer: etwa 15–20 Minuten für das vollständige Payment-, Legal-, Tax- und
  Accounting-Dossier.
- Mögliche Kosten: keine Gebühr für die Entscheidung; alle PSP-/Betriebskosten
  müssen vorher konkret genehmigt sein.
- Walid öffnet/bestätigt: das exakte Stage-B-Dossier erst nach A, B1 und B2;
  bestätigt Scope, Limits, Monitoring, Refund/Payout/Ledger und Rollback.
- Codex parallel: Vollständigkeit und Kandidatenbindung prüfen; kein Echtgeld.
- Antworttokens: `PILOT_STAGE_B_REAL_MONEY_DECISION_GO` oder
  `PILOT_STAGE_B_REAL_MONEY_DECISION_NO_GO`.
- Ohne Entscheidung blockiert: Echtgeld bleibt technisch und operativ aus.

## C — Öffentlicher Regionalstart

### C1 — Authentische Economics und Skalierungsbetrieb belegen

- Warum Walid jetzt gebraucht wird: Gebühren, Cloudkosten, reale Arbeitszeit,
  Attribution, Besetzung und Profitabilität können erst aus echten, erlaubten
  Betriebsdaten bestätigt werden.
- Dauer: etwa 30–60 Minuten für Datenquellen und Verantwortliche; die
  Beobachtungsperiode ist nach Pilotumfang zu bestimmen.
- Mögliche Kosten: Finance/Tax/Accounting-Review, Operations und Monitoring;
  unbekannt und vorab zu begrenzen.
- Walid öffnet/bestätigt: nur freigegebene, datenschutzkonforme Datenquellen und
  verantwortliche Rollen außerhalb Git; konfigurierte Nullwerte gelten nicht
  als echte Kosten.
- Codex parallel: anonymisierte Importvorlage, Plausibilitätsregeln und Cockpit
  vorbereiten; keine produktive Analytics-/Cloudänderung.
- Antworttokens: `PF3_C1_ECONOMICS_INPUT_PLAN_GO` oder `PF3_C1_HOLD`; nach
  authentischer Evidenz `PILOT_STAGE_C_ECONOMICS_EVIDENCE_ACCEPTED`.
- Ohne Entscheidung blockiert: belastbare Unit Economics und Stage C.

### C2 — Öffentliche Store- und Launchentscheidung

- Warum Walid jetzt gebraucht wird: Store-Einreichung, vollständige Betreiber-
  und Verbraucherinformationen und öffentliche Aktivierung sind eigenständige
  Außenwirkungen.
- Dauer: etwa 30 Minuten für das finale Dossier; Store-Reviewdauer ist extern
  und unbekannt.
- Mögliche Kosten: mögliche Store-, Rechts-, Support- und Betriebskosten;
  unbekannt, kein Kauf/Vertrag ohne Kostenlimit.
- Walid öffnet/bestätigt: erst nach A/B/C1 das kandidatengebundene öffentliche
  Dossier. Store-Upload, Submission, Vereinbarungen und Veröffentlichung bleiben
  bis zu separaten Handlungsgates aus.
- Codex parallel: keine Submission und keine Veröffentlichung; Metadaten,
  Checklisten und Rollback nur prüfen.
- Antworttokens: `PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION_GO` oder
  `PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION_NO_GO`.
- Ohne Entscheidung blockiert: Store-Einreichung, öffentliche Registrierung
  und regionaler Public Launch.

## D — iOS und spätere zusätzliche Plattformen

### D1 — Apple-/iOS-Scope und Kosten entscheiden

- Warum Walid jetzt gebraucht wird: Mitgliedschaft, Vereinbarungen, Account,
  Signing-Team, iPhone/TestFlight und geeigneter Release-Host sind externe
  Owner- und Kostenentscheidungen.
- Dauer: etwa 20 Minuten für Scope/Bestandsprüfung; Toolchain, Signierung und
  Gerätematrix sind separate spätere Arbeiten.
- Mögliche Kosten: aktuelle Apple-Mitgliedschaft, Hardware oder externe
  Releasearbeit; Betrag unbekannt und vor Kauf konkret freizugeben.
- Walid öffnet/bestätigt: zunächst nur, ob iOS weiter aufgeschoben bleibt oder
  ein kostenfreier Bestandscheck erfolgen soll. Kein Login/2FA, keine
  Agreement-Annahme, Mitgliedschaft, Signierung, App-Record oder Installation.
- Codex parallel: vorhandene iOS-Worksheet- und Toolchain-Lücken aktuell halten;
  Stage A bleibt Android-only.
- Antworttokens: `IOS_PLATFORM_GATE_DECISION_DEFER` oder
  `IOS_PLATFORM_GATE_DECISION_INVENTORY_ONLY`. Beide beantworten nur das Gate
  `IOS_PLATFORM_GATE_DECISION`; sie erteilen keine Apple-Aktion.
- Ohne Entscheidung blockiert: nur iOS/TestFlight und spätere iOS-Verteilung;
  Stage A bleibt unter der dokumentierten Android-only-Bedingung möglich.

## Ausführungsregel

Codex darf zwischen unabhängigen, nicht-live Lanes weiterarbeiten. Er stoppt
den jeweiligen Block an Kosten, Vertrag, Login/2FA, Secret, Rollen-/Rechte-
Mutation, Signierung, riskanter Geräteinstallation, Store/Cloud/Provider,
Echtgeld oder Aktivierung. Der Gesamtauftrag endet am unerteilten Gate
`PILOT_STAGE_A_DECISION`; dieses Action Pack aktiviert nichts.
