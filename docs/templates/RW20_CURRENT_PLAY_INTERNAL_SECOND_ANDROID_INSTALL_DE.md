# RW20 aktueller Play-Internal-Test auf dem zweiten Android-Handy

Status: **AAB ALS ENTWURF HOCHGELADEN — RELEASE NICHT AKTIV**

Diese Anleitung gilt nur fuer den spaeter owner-freigegebenen Kandidaten
`1.0.0 (2026082601)` auf `com.shareittoo.app`. Vor der Installation muessen
der private BUILD_READY-Handover, der Artefakt-Quell-Commit
`a1aa3f2528f1923c092a1fb15bdd3dc083673890` und der AAB-SHA-256
`8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873`
mit dem spaeteren Play-Release uebereinstimmen.

## Google-Konto und privater Opt-in

1. Walid bestaetigt ausserhalb von Git und Chat das Google-Konto, das auf dem
   zweiten Android-Handy im Play Store aktiv ist. Die Adresse wird nicht in
   Repository, Evidence oder Screenshots geschrieben.
2. Das owner-ausgewaehlte Konto ist laut MacBook-Handover bereits in der
   privaten Testerliste. Die Adresse bleibt ausserhalb des Repository. Keine
   weitere Tester- oder Listenveraenderung vornehmen.
3. Der private Opt-in-Link bleibt ausserhalb von Git und oeffentlichen Kanaelen.
4. Solange `GOOGLE_PLAY_INTERNAL_RELEASE_GO` nicht erteilt ist, liefert der
   Link weiterhin den aktiven Alt-Build `2026081509`; den neuen Entwurf nicht
   als installiert oder getestet darstellen.
5. Erst nach separater Aktivierung Link mit genau diesem Google-Konto oeffnen,
   dem internen Test beitreten und nur die Play-Store-Seite fuer
   `com.shareittoo.app` verwenden.
6. Vor dem neuen Kandidatentest in den App-Informationen beziehungsweise in
   der owner-gelieferten Buildanzeige `1.0.0 (2026082601)` bestaetigen. Eine
   andere Buildnummer ist ein Stop fuer die neue Kandidatenmatrix.

## Clean Install oder Update

- Clean Install: nur wenn `com.shareittoo.app` auf dem zweiten Handy noch nie
  installiert war. Installation ausschliesslich aus Google Play.
- Update: wenn der alte interne Build `2026081509` installiert ist, nicht
  deinstallieren und keine App-Daten loeschen. Das Play-Update muss Daten,
  Paket-ID und Signaturbeziehung erhalten.
- Kein Sideload, kein APK aus Downloads und kein Downgrade fuer diesen Test.

## Derzeit installierter OnePlus-Stand

Die Installation auf dem OnePlus ist bestaetigt, aber der neue Build
`2026082601` ist noch nicht aktiv. Erwartet wird daher `1.0.0 (2026081509)`.
Dieser Stand darf zunaechst nur mit der read-only Baseline aus
`docs/operations/RW20A_PLAY_INTERNAL_DRAFT_AND_ONEPLUS_REMOTE_BASELINE_2026-08-27.md`
erfasst werden. Die Installation allein ist kein funktionaler Testnachweis.

## Sichere Testdaten

- Nur owner-bereitgestellte synthetische Staging-Konten und Testobjekte nutzen.
- Keine echten Namen, Adressen, Telefonnummern, Zahlungen, Vertraege, Ausweise,
  Gesichter oder privaten Fotos eingeben.
- Kein neues oeffentliches Konto anlegen und keine reale Vermietung starten.
- Ergebnisse nur mit einem anonymen Run-Code melden; Google-Adresse und
  Opt-in-Link bleiben privat.

## Sofort stoppen

Stop bei falscher Version, anderer Paket-ID, unerwartetem oeffentlichen Track,
Produktionsdaten, realer Zahlung, externer Provideraktivitaet, Daten eines
anderen Kontos, Signatur-/Installationsfehler oder nicht erklaerbarer
Play-Warnung. Nicht deinstallieren oder Daten loeschen, solange die Ursache und
die benoetigte minimale Evidence nicht geklaert sind.
