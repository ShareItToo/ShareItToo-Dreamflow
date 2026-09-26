# P0B-L3 — unabhängiger Astra-AI-Rechtsabgleich

Paket: `P0B-L3-ASTRA-AI-CROSSCHECK-2026-09-14.1`
Geprüfter Quellstand: `2db2b90aab385aeba527fd559a33c269c8dc00cf`
Rechtsraum: Deutschland
Ergebnis: **CORRECTIONS_REQUIRED**

## Aussagegrenze

Dies ist ein unabhängiger KI-Abgleich der P0B-L2-AI-Vorprüfung und keine
anwaltliche oder sonstige professionelle Rechtsfreigabe. Er erlaubt weder
Echtgeld noch Production, Store-Einreichung oder öffentliche Aktivierung.
Alle professionellen Entscheidungen bleiben `open`.

Der empfangene Abgleich wurde nur als **teilweise normalisiertes Ergebnis**
gesichert. Die vollständige rohe Modellantwort mit durchgängiger
Einzelbegründung, Einzelfundstelle, Norm, Änderungsbedarf, Risiko und Konfidenz
je Entscheidung wurde nicht im Repository persistiert. Deshalb werden keine
fehlenden Details nachkonstruiert. Das Paket hält ausschließlich die
normalisiert übermittelte 18-Punkte-Verteilung und die ausdrücklich
übermittelten Korrekturbefunde fest. Es dokumentiert das Ergebnis, ist aber
nicht unabhängig als vollständige Erfüllung des 18-Punkte-Prüfauftrags
auditierbar.

Nicht geheime Task-Provenienz:

- Task-ID: `01a09e1b-0c59-71d2-b323-8c79b0b73bbd`
- Tasktitel: `Astra Ultra für SIT am Macbook`
- Ausführungsklasse: entfernter Codex-Task auf dem MacBook
- Angeforderter Abgleich: Astra Ultra; eine tatsächliche interne
  Backend-Modellkennung wurde nicht als Evidence gesichert.

## Ergebnisübersicht

- `CONFIRM`: 3
- `CORRECT`: 12
- `INSUFFICIENT_EVIDENCE`: 3
- Priorität P0: 14
- Priorität P1: 4

Die normalisiert als bestätigt übermittelten Punkte betreffen das private
Gruppen-Mietvertragsmodell, die
gemeinsame Termin-/Positionsbeweiswirkung und die positionsgenaue
Ledger-/Refund-/Chargeback-Zuordnung. Externe Tatsachen bleiben insbesondere
für Betreiberidentität, PSP-/Geldflussvertrag und Business-/Global-Varianten
offen.

## Übermittelte P0-Korrekturbefunde

1. Leistungsumfang und Ende des Plattformvertrags müssen eindeutig sein.
2. Angebot, Zugang, Gegenangebot und Zahlungsbedingung dürfen nicht
   widersprüchlich als Annahme erscheinen.
3. Pflichtinformationen und dauerhafte Vertragsbestätigung müssen rechtzeitig
   vor Leistungsbeginn nachweisbar sein.
4. Die 14-Tage-Grenze darf nicht an der Annahme-Uhrzeit des letzten Tages
   enden. Der Ereignistag wird bei einer ereignisgebundenen Frist nicht
   mitgerechnet; eine nach Tagen bestimmte Frist endet mit Ablauf des letzten
   Tages. Die technische Grenze muss deshalb die lokale Tagesendsemantik
   abbilden.
5. Teil-/Restgruppenfolgen und die Rechtsgrund-Matrix für Storno, Widerruf,
   Rücktritt und Refund müssen vollständig und widerspruchsfrei sein.
6. Eine bloße Schadensbehauptung darf nicht allein fremde, unstreitige
   Positionen sperren.
7. In Teil E V5.2 ist die Schuldner-/Gläubigerrolle beim Mietpreis zu
   berichtigen. Eine operative Rechtsversion muss neu versioniert werden;
   V5.2 bleibt als historischer Snapshot unverändert.
8. Verantwortliche, Empfänger, Zwecke, Rechtsgrundlagen und die
   Endgerätezugriffsprüfung müssen vollständig getrennt werden.
9. Der Auskunfts-/Exportweg benötigt eine sichere Ergänzungs- und
   Gegenparteien-Schutzroute.
10. Aufbewahrungsfristen benötigen je Zweck einen belegten Startpunkt; die
    mietrechtliche Anspruchsfrist darf nicht an einem falschen Ereignis
    beginnen.
11. Der DSA-Meldeweg muss, soweit rechtlich erforderlich, ohne Konto nutzbar
    sein und die zulässige Ausnahme von Identitätsangaben abbilden.

Die amtlichen Grundnormen für die bereits technisch umgesetzte
Tagesendkorrektur sind § 187 Abs. 1, § 188 Abs. 1 und § 355 Abs. 2 BGB:

- https://www.gesetze-im-internet.de/bgb/__187.html
- https://www.gesetze-im-internet.de/bgb/__188.html
- https://www.gesetze-im-internet.de/bgb/__355.html

Diese Korrektur bildet zunächst die 14 Kalendertage bis zum lokalen Tagesende
ab. Sie behauptet noch keine vollständige gesetzliche Frist-Closure: § 193 BGB
kann bei Sonnabend, Sonntag oder einem am Erklärungsort anerkannten Feiertag
den nächsten Werktag an die Stelle des letzten Tages setzen. Für Feiertage
fehlt noch der vertraglich maßgebliche Erklärungsort beziehungsweise die
persistierte regionale Frist-Policy. Bis zu deren eigener Korrektur bleiben
spätere Erklärungen im manuellen Prüfpfad und Echtgeld geschlossen.

- https://www.gesetze-im-internet.de/bgb/__193.html

## Folge

Die Korrekturen werden in getrennten, prüfbaren Arbeitspaketen umgesetzt.
Externe Fakten werden nicht erfunden. Insbesondere bleiben Betreiberregister,
Stripe-Connect-Produkt-/Kontovertrag und Business-/Global-Rechtsvarianten
außerhalb einer autonomen Freigabe.

`ASTRA_CROSSCHECK_RESULT=CORRECTIONS_REQUIRED`
`ASTRA_CROSSCHECK_SCOPE_COMPLETE=false`
