# C1G - V5.2 Privacy, Network, FCM and Crashlytics

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`f2781366a5c0c9f2e2a26401cf862272bc7f1609`

GitHub Actions:
[`32358854576`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32358854576)
ist fuer genau diesen Commit GREEN.

## Ergebnis

**Die begrenzte lokale C1G-Implementierung ist technisch GREEN. Provider-,
Vertrags-, Transfer-, Rechts-, Store-, Release- und reale Geraetenachweise
bleiben HOLD.**

FCM erhaelt jetzt ausschliesslich einen zentralen transaktionalen V5.2-Vertrag
mit neutralem Sperrbildschirmtext, einer kennungsfreien Route und kurzen,
ereignisspezifischen TTLs. Die App oeffnet daraus nur das authentifizierte
Benachrichtigungszentrum und laedt fachliche Details ueber die normalen
geschuetzten SIT-APIs. Unbekannte und Marketing-Ereignisse werden vor einem
Provideraufruf abgewiesen.

Crashlytics bleibt davon getrennt, freiwillig und standardmaessig aus. Google
Analytics, FCM-BigQuery-Export, Analytics-Breadcrumbs, Werbung, externe
generative KI, Laufzeit-Webfonts und beliebige Release-Bildhosts bleiben aus
oder fail-closed. Google Maps kann selbst bei vorhandenem Server-Key erst nach
einer gesonderten Aktivierungsfreigabe und vollstaendigen Provider-, Zweck-,
Datenfeld-, Regionen-, Transfer- und DPA-Fakten eingeschaltet werden.

## Verbindliche Quellen und Grenzen

- Drive-Arbeitspaket `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`, C1G.
- V5.2 Core, Abschnitt 11: transaktionales neutrales FCM, kuerzeste sinnvolle
  TTL, getrenntes freiwilliges Crashlytics und fail-closed externe Provider.
- C1A-Delta-Audit, insbesondere die offenen Punkte 20 bis 23.
- Keine Firebase-, Google-Cloud-, Provider- oder Store-Console-Aktion; kein
  Live-Push, Crash-Upload, Analytics-Ereignis und keine externe Netzwerkprobe.
- Keine Produktions-, VPS/OpenClaw-, DNS-, Payment-, Store-, signierte
  Release-, oeffentliche Rollout- oder destruktive Git-Aktion.
- Keine Providerfirma, Vertragspartei, Verarbeitungsregion, DPA-Annahme,
  Transfergrundlage, Retentionfrist, Loeschbestaetigung oder Store-Antwort
  wurde angenommen oder erfunden.

## Zentraler Push-Vertrag

- `backend/src/push_sender.js` besitzt eine geschlossene Positivliste aller
  derzeit produzierten transaktionalen Ereignisarten. Eine unbekannte,
  fehlerhafte oder Marketing-Art endet mit `push_kind_not_allowlisted`.
- Jeder FCM-Request zeigt exakt den neutralen Titel
  `Neue ShareItToo-Aktualisierung` und den Text `In der App ansehen.`. Der
  breitere Titel deckt auch sichere Support-Updates ab, ohne die Art des
  Vorgangs auf dem Sperrbildschirm offenzulegen.
- Der Datenbereich enthaelt exakt `contract=v52` und
  `route=notifications`. Artikeltext, Chattext, Adresse, Zahlungsdaten,
  Fotos, Schadensnachweise, Action-URL und fachliche IDs werden nicht an FCM
  oder den Webhook uebergeben.
- Android erhaelt eine explizite TTL in Millisekunden; APNs erhaelt ein
  absolutes `apns-expiration`. Es gibt keinen Rueckfall auf die
  vierwoechige FCM-Standard-TTL.
- TTL-Gruppen sind bewusst kurz: Chat 15 Minuten; unmittelbare Buchungs-,
  Zahlungs-, Erinnerungs- und Antwortsignale 1 Stunde; Widerruf und neue
  Rueckgabefaelle 6 Stunden; abgeschlossene oder langsamere Statussignale
  maximal 24 Stunden.
- Ungueltige FCM-Registrierungstoken bleiben eng klassifiziert und werden
  kontogebunden deaktiviert. Transiente Providerfehler werden nicht als
  ungueltiges Token behandelt.
- Die Benachrichtigungs-Outbox uebergibt an den Sender nur noch die
  serverseitig erlaubte Ereignisart. In-App- und E-Mail-Inhalte bleiben davon
  getrennt und werden nicht zur Push-Nutzlast.

## Authentifizierter Detailabruf

- Flutter akzeptiert nur den exakten zweifeldrigen V5.2-Datenvertrag und
  erzeugt daraus `shareittoo://notifications` ohne Kennung.
- Alte `actionUrl`-, Entity- oder erweiterte Push-Daten koennen keine
  Navigation mehr ausloesen.
- Der Android-Bridgepfad leitet ebenfalls nur
  `contract=v52`/`route=notifications` auf die kennungsfreie Route ab.
- Ohne aktive Sitzung wird zuerst die Anmeldung verlangt. Erst danach zeigt
  die bestehende Benachrichtigungsoberflaeche Details aus den normalen
  authentifizierten Datenquellen.
- Ein gueltiges Signal aktualisiert nur die generischen lokalen Buchungs- und
  Nachrichten-Caches; aus der Push-Nutzlast wird keine fachliche Entitaet
  rekonstruiert.

## Firebase- und Netzwerkgrenzen

- `setDeliveryMetricsExportToBigQuery(false)` wird beim Firebase-Start
  ausdruecklich gesetzt. Firebase Analytics, Performance, Ads und
  `google_fonts` sind keine Launch-Abhaengigkeiten.
- Die bestehenden getrennten Push- und Crashlytics-Entscheidungen bleiben
  unveraendert. Push aktiviert keine Crash-Erfassung.
- Crashlytics-Autocollection bleibt nativ aus; die bestehende freiwillige
  Entscheidung, Widerruf, Loeschung ungesendeter Berichte, bereinigte
  Diagnose-Allowlist und das Verbot einer SIT-User-ID bleiben durch Tests
  gebunden.
- `backend/src/google_maps_activation.js` entfernt den Server-Key aus der
  Laufzeitkonfiguration, solange die Aktivierung nicht ausdruecklich
  freigegeben und jede vorgeschriebene Provider-/Transferangabe vorhanden
  ist. Eine beantragte, aber unvollstaendige Aktivierung bricht ab, ohne den
  Key auszugeben.
- Der vorhandene Maps-Proxy behaelt festen Google-Ursprung, authentifizierten
  Serverpfad und bereinigte Antworten. Ohne Aktivierung bleibt der manuelle
  Adresseingabepfad verfuegbar.
- Release-Bilder bleiben auf verwaltete SIT-Uploads begrenzt. Alle Flutter-
  Netzwerkbilder laufen weiterhin durch `AppImage`, das externe Demo-URLs im
  Release vor einem Request ablehnt und auf einen lokalen Platzhalter
  zurueckfaellt.
- Externe KI ist weiterhin hart deaktiviert; Schriften werden lokal gebuendelt.
  Die vollstaendige physische Netzwerk- und Geraetematrix bleibt C1I.

## Maschinenlesbare Bereitschaft

- `store/privacy-disclosures.json` bindet den neutralen Push-Vertrag,
  ereignisspezifische TTL, ausgeschalteten BigQuery-/Analytics-Pfad,
  ausgeschaltete Crashlytics-Breadcrumbs und das offene Provider-/Store-Gate.
- `store/retention-deletion-readiness.json` bindet die neuen und geaenderten
  Quellen, ohne eine Providerloeschung oder Retentionfreigabe zu behaupten.
- Privacy bleibt `draft` mit `approvalAllowed=false` und offenem finalen
  Binary-Scan. Retention bleibt `draft`, mit neun offenen Entscheidungen und
  blockierter Ausfuehrung.
- Crash Insights Sharing wurde nicht in einer Console geprueft und bleibt
  deshalb ausdruecklich `crashInsightsSharingVerified=false` statt als
  deaktiviert behauptet zu werden.

## Lokale Verifikation vor Commit

- Fokussierte Push-, TTL-, Marketing-Block-, Invalid-Token-, Maps-Gate- und
  Maps-Proxy-Tests: 13 PASS, 0 Fehler.
- Statische Firebase-, Crashlytics-, lokale-Font-, externe-Bildhost- und
  Firebase-Konfigurationspruefungen: 34 PASS, 0 Fehler.
- Privacy- und Retention-CLI: PASS; Privacy bleibt Draft mit 17 Datentypen und
  neun Diensten, Retention bleibt mit neun Entscheidungen und 20 stabilen
  Ausfuehrungsblockern offen.
- Vollstaendige lokale Backend-Suite: 252 PASS, ein erwarteter Skip ohne
  lokale `TEST_DATABASE_URL`, 0 Fehler.
- Vollstaendige Flutter-Suite: 296 PASS, ein dokumentierter Skip, 0 Fehler.
- Vollstaendiger technischer CI-Metadatenlauf: PASS mit OpenJDK 17, Flutter
  3.41.7 und Dart 3.11.5. Der Lauf verwendete
  `SIT_ALLOW_CANDIDATE_ROLLOVER=1` fuer den ehrlichen Draft oberhalb des alten
  Store-Kandidaten und `CI=true` nur fuer die Metadatenpruefung des lokal nicht
  vorhandenen owner-only AAB.
- Analyzer: bestehende akzeptierte Baseline von 223 Hinweisen, keine
  verbotene Korrektheitsregression. Web-Debug-Build und Android-Debug-APK:
  PASS. `git diff --check`: PASS.

Der lokale Lauf erzeugte keinen signierten Kandidaten, ersetzte kein AAB und
belegt keinen Store-Upload, keine Providerfreigabe und keinen realen
Geraete-/Netzwerkpass.

## Commitgebundene GitHub-CI

- Backend-Regression: GREEN mit 253 PASS, 0 Skip und 0 Fehler. Der Lauf mit
  CI-`TEST_DATABASE_URL` schliesst den lokal bewusst uebersprungenen
  Datenbankpfad ein.
- Der historische und Working-Tree-Secret-Scan ist GREEN: die zwoelf exakt
  bekannten historischen Baseline-Funde wurden wiedererkannt und es wurde
  kein neues hochkonfidentes Secret in Git-Historie oder Working Tree
  gefunden.
- Flutter-Regression: GREEN mit 296 PASS, einem dokumentierten Skip und 0
  Fehlern. Der zusaetzliche konsolidierte Social-Profile-Test ist ebenfalls
  GREEN.
- Analyzer-Baseline, Web-Debug-Build und Android-Debug-APK sind GREEN; die
  CI baute `app-debug.apk`, aber kein signiertes Release-Artefakt.
- `publish-api-image` wurde erwartungsgemaess uebersprungen. Es wurde kein
  Container-Image veroeffentlicht und kein Live-System veraendert.

## Fortbestehende Gates

- C1A Punkt 20 ist auf Code- und Testebene geschlossen, benoetigt fuer einen
  Release aber weiterhin den spaeteren echten FCM-/Geraetenachweis.
- C1A Punkt 21 bleibt technisch geschlossen; eine Console-Einstellung wie
  Crash Insights Sharing wird ohne aktuellen Nachweis nicht behauptet.
- C1A Punkt 22 bleibt offen: Betreiber-, Provider-, Vertrags-, Transfer-,
  Retention-, Loesch- und Store-Fakten sind nicht vollstaendig freigegeben.
- C1A Punkt 23 ist fuer die lokalen Code-Gates geschlossen; der abschliessende
  physische V5.2-Netzwerkmitschnitt und die Geraetematrix bleiben C1I.
- Privacy, Retention, Legal, Store, Payment, Provider und signierte Releases
  bleiben fail-closed.

## Abschluss und naechster Schritt

C1G ist mit dem gruenen, commitgebundenen GitHub-CI-Lauf technisch
geschlossen. Das aktive Folgepaket ist **C1H - V5.2 Categories, Moderation,
Invoice/Receipt and Operator fail-closed configuration**. Alle oben genannten
Live-, Provider-, Rechts-, Store-, Payment- und Release-Gates bleiben dabei
unveraendert offen und fail-closed.
