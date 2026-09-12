# RW20A Play-Internal-Entwurf und OnePlus-Remote-Baseline

Status: **RW20A TECHNISCH GESCHLOSSEN — ENTWURF NICHT AKTIV — REMOTE-BASELINE VORBEREITET**

## Verifizierbare Zustandsgrenze

Der owner-gelieferte MacBook-Codex-Handover berichtet, dass der private,
unveraenderte AAB-Kandidat `1.0.0 (2026082601)` mit SHA-256
`8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873`
in Google Play Internal verarbeitet und nur als Entwurf gespeichert wurde.
`Next`, Aktivierung, Veroeffentlichung und Review-Versand wurden nicht
ausgefuehrt. Diese Console-Fakten wurden von diesem Mac-mini-Worktree nicht
direkt erneut beobachtet und werden deshalb als Handover, nicht als unabhaengige
Console-Evidence, klassifiziert.

Der aktive interne Release bleibt `1.0.0 (2026081509)`. Die bestaetigte
OnePlus-Installation kann daher derzeit nur diesem aktiven Build zugerechnet
werden. Sie beweist noch keinen Start, Login, Kontowechsel, Staging-Ablauf,
Benachrichtigungs- oder Regressionstest.

Die private Testerliste enthaelt laut Handover zwei Konten. Identitaeten und der
private Opt-in-Link bleiben ausserhalb des Repository. Weitere Tester- oder
Listenveraenderungen sind nicht autorisiert.

## Sichere Remote-Baseline vom MacBook

Nach manuell bestaetigtem Android-Wireless-Debugging-Pairing kann der MacBook-
Codex den aktuellen Branch fast-forward aktualisieren und ausschliesslich
folgenden read-only Lauf ausfuehren:

```bash
node tool/inspect_oneplus_play_internal_baseline.mjs \
  > /tmp/sit-oneplus-play-internal-baseline.json
```

Das Werkzeug akzeptiert genau ein autorisiertes physisches OnePlus ueber
Wireless ADB. Es liest nur bereinigte Geraete-, Paket-, Versions-, SDK-,
Installer- und Prozesszustandsfelder. Es startet oder beendet die App nicht,
installiert nichts, liest keine Kontoinhalte und veraendert weder Netzwerk,
Berechtigungen, Store noch App-Daten. Rohadresse, ADB-ID und Prozess-IDs werden
nicht ausgegeben.

Die Baseline besteht nur, wenn `com.shareittoo.app` als `1.0.0 (2026081509)`
vom Installer `com.android.vending` vorhanden ist. Build `2026082601` wird vor
dem separaten Gate `GOOGLE_PLAY_INTERNAL_RELEASE_GO` ausdruecklich nicht als
installiert oder getestet anerkannt.

## Danach moeglicher manueller Testumfang auf dem aktiven Alt-Build

Ohne Store-Aktivierung darf Walid auf dem OnePlus manuell und zerstoerungsfrei
Start, sichtbare Buildnummer, Navigation, Prozessende/Neustart und die bereits
verfuegbaren Staging-Fehlerpfade pruefen. Synthetische Konten duerfen nur nach
separater Owner-Bereitstellung genutzt werden. Mobilfunk- und Offline-Phasen
werden am Handy manuell geschaltet, weil Wireless ADB beim Abschalten des WLANs
abbricht; ein Verbindungsabbruch ist dabei kein App-Testbeleg.

Kein `adb install`, kein Uninstall, kein `pm clear`, kein Downgrade, keine
Credential-Eingabe durch Codex und keine Erfassung privater Screenshots oder
ungefilterter Logs. Die vollstaendige neue Kandidatenmatrix beginnt erst nach
separater Aktivierung von `2026082601` und nachgewiesenem Play-Update.

## Geschlossene Gates

- `GOOGLE_PLAY_INTERNAL_RELEASE_GO`: nicht erteilt.
- Kein Review-Versand, keine Veroeffentlichung und keine weitere Testerliste.
- Aktiver Release `2026081509` bleibt unveraendert und wird nicht pausiert.
- Kein Pixel-Zugriff aus diesem Paket.
- Keine Produktions-, Payment-, Provider-, Firebase-, Cloud-, VPS-, DNS- oder
  PR-Merge-Aenderung.

Maschinenlesbare Zustandsgrenze:
`store/google-play/rw20a-internal-draft-oneplus-handoff.json`.

## Lokale Verifikation

- Neun fokussierte Handover-, Closure- und OnePlus-Baseline-Tests bestehen;
  der verifizierte Implementation-HEAD enthielt davon die acht urspruenglichen
  Handover- und Baseline-Tests.
- Der komplette Standard-Parallelitaetslauf besteht mit 1.965 Tooltests.
- Die unveraenderte vollstaendige technische Regression besteht einschliesslich
  Backend, PostgreSQL, Flutter, Analyzer, Web/Wasm, Loopback-Smoke und Android-
  Debug-Build mit 448 Gradle-Tasks.
- Ein erster Vollregressionsversuch meldete zwei Tooltest-Dateiprozesse ohne
  Assertion-Fehler. Beide betroffenen Ratchets bestanden unmittelbar einzeln;
  danach bestanden der komplette Standard-Parallelitaetslauf und der komplette
  technische Gate-Lauf unveraendert. Es wurde weder Parallelitaet reduziert
  noch Retry-/Timing-/Cache-Logik eingefuehrt. Eine erneute Reproduktion waere
  vor jeder Umgehung als Technical Debt mit eigener Ursache zu schliessen.

## Exact-SHA-Closure

Die RW20A-Implementierung wurde in zwei eng gebundenen Commits abgeschlossen:

- Handover, Validator und Wireless-ADB-Baseline:
  `dfc3d2e3297ab9d4c4fe3696c7dbbb9d8fbc4e3d`.
- CodeQL-Korrektur und final verifizierter Implementation-HEAD:
  `8dbe9b6071b79507eac6414096b8f45949d31d91`.

GitHub Regression `33023774904` und CodeQL `33023776568` sind auf exakt dem
finalen Implementation-HEAD erfolgreich. Alle vier ausgefuehrten
Regression-Jobs bestanden; der Image-Publish-Job blieb korrekt uebersprungen.
Die Branch-Abfrage meldete danach null offene Code-Scanning-Alerts.

CodeQL hatte zuvor die nicht verankerte URL-Ausnahme des neuen Handover-
Sanitizers als `js/regex/missing-regexp-anchor` mit hoher Security-Severity
gemeldet. RW20A erlaubt deshalb nun ausnahmslos keine HTTP- oder HTTPS-URL in
der Repository-Evidence. Ein Grossschreibungs-Regressionsfall ist dauerhaft
abgedeckt. Es gibt keine Host-Ausnahme und keinen Timing-, Retry-, Cache- oder
Parallelitaets-Workaround.

Diese technische Closure aktiviert den Play-Entwurf nicht und ersetzt keine
unabhaengige Console- oder OnePlus-Beobachtung. Der naechste Erkenntnisgewinn
bleibt hinter `GOOGLE_PLAY_INTERNAL_RELEASE_GO` und dem anschliessenden echten
Play-Update auf dem OnePlus.
