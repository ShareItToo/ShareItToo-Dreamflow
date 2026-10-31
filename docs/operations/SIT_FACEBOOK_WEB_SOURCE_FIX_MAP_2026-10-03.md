# Facebook Web — Architekturgrenze / FIX-Map

Source: `7c6f2ac6cd787735005627031128b45dcec2b70b`, 2026-10-03. RESULT: **FIX / STOP vor Sourceeingriff**, wie im Auftrag für nötige größere Architekturarbeit vorgesehen. Kein Facebook-Websupport implementiert; alle Flags unverändert aus. Kein Applepfad angefasst.

## Warum kein kleiner Popup-Patch korrekt ist

| Nachweis | Heutiger Vertrag | Konsequenz |
| --- | --- | --- |
| `lib/services/web_google_auth.dart:61–87` | `WebGooglePublicConfig.optionsFor` liefert bei `googleEnabled=false` null; Approvaldigest bindet exakte öffentliche Webkonfiguration, keine Facebook-Providerreadiness. | Facebook-only kann die bestehende Runtime nicht initialisieren. Google einzuschalten oder dessen Approval als Facebookfreigabe umzudeuten wäre keine unabhängige Implementierung. |
| `lib/services/firebase_runtime.dart:146–154,353–360,405–435`; `lib/main.dart:45` | CurrentOptions, Readybit und Memory-Persistence-Startup sind explizit Googlegebunden. | Es braucht einen getrennt geprüften Webprovider-/Configauswahlvertrag und Startupintegration; lediglich im Authswitch Facebook zu ergänzen reicht nicht. |
| `lib/services/auth_service.dart:172–187,1496–1534` | UIgate und Webacquisition lassen ausschließlich Google zu. Native Facebookacquisition liegt danach `:1560–1584`. | Den nativen SDKpfad nicht ins Web fallen lassen; keinen Facebook-Webpfad bauen, der nur bei zusätzlicher Googleaktivierung funktioniert. |
| `tool/validate_social_provider_activation.mjs:6–10,42–64`; `tool/validate_android_social_auth_provider_readiness.mjs:17–33,52–65` | Aktivierungsvalidator unterstützt android/ios/all, kein Web. Facebookevidenz ist unter anderem an Androidpaket, Upload-/Play-Signaturen und nativen Clienttoken gebunden. | Ein neues Web-Readinessschema samt Negativtests fehlt. Das vorhandene Validated-Bit allein ist kein Facebook-Web-Beleg. Bestehende native Beweise/Tests unverändert erhalten. |

Dies ist kein generelles technisches Unvermögen von Firebase oder Facebook. Es ist eine konkrete Grenze des aktuellen SIT-Vertrags unter der Vorgabe, Google/native Facebook zu erhalten und nur durch tatsächlich passende bestehende Gates aktivierbar zu sein. Eine neue providerbezogene Webfreigabe über drei Grenzen hinweg (Konfiguration/Startup, Acquisition, Aktivierungsnachweis) ist mehr als der kleine unabhängige Popup-Patch. Ein totes, unverdrahtetes Helperfile würde den verlangten Source-Support ebenfalls nicht erfüllen.

## Bereits wiederverwendbare Teile — kein Redesign nötig

- `lib/services/remote_auth_attempt_transaction.dart:22–78`: Preflight, Principalwechsel, Remote-/lokale Sessionverwerfung bleiben zentral und unverändert.
- `lib/services/auth_service.dart:1320–1403,1440–1469`: ownergebundener Backendexchange und Firebase-Cleanup anhand exakter SDK-Generation/UID; für Facebook-Web nicht zusätzlich das native Facebook-SDK-Logout aktivieren. Eine Web-Firebasepopupacquisition hätte `firebaseUid`, aber kein natives `facebookAcquired`.
- `backend/src/firebase_social_auth.js:30–84,117–141`: Provider wird aus verifizierten Firebaseclaims abgeleitet, nicht aus einem frei vertrauten Clientproviderfeld. Facebookidentität und fehlende/verifizierte E-Mail werden bereits behandelt. `backend/src/app.js:2908–2925` lässt daraus keine neue Staging-Registrierungslane entstehen.
- Der bereits dokumentierte Providerconsoleblocker ist real, verhindert aber nicht ein späteres getrenntes Source-/Testpaket. Er rechtfertigt keine erfundenen Approvalwerte, IDs oder Credentials.

## Präziser größerer Nachfolger (noch nicht umgesetzt)

**FB-W1: separater Webkonfigurations-/Readinessvertrag, weiterhin dormant.** Vor Acquisitionverdrahtung festlegen und testen:

1. Provider `facebook`, Plattform Web, exakter Stagingorigin, Backendprojekt, Web-App-Konfigurationsdigest und tatsächlicher Callback-/Meta-Audience-Readback müssen gemeinsam gebunden sein. Fehlende, native-only, veraltete oder fremde Providerevidenz bleibt false. Keine Approvaldatei mit erfundenem PASS anlegen.
2. Firebase-Weboptionen unabhängig von der Googleaktivierung auswählen. Google-only muss byte-/semantikgleich zum bisherigen Vertrag bleiben. Sind beide Provider künftig konfiguriert, müssen sie dieselbe exakt verifizierte Firebase-Appbindung nutzen; widersprüchliche Optionen scheitern vor SDKinitialisierung. Kein zweites ungebundenes Default-Firebaseapp und kein `googleEnabled || facebookEnabled` als ungeprüfter Approvalersatz.
3. Startup-Readiness muss Memory-Persistence und bestehende Firebaseoptions-Gleichheit bewahren. Keinen Push-/Crash-/Installationsdienst im Web aktivieren. Die bestehenden Googlefunktionen können als unveränderte Fassade bestehen bleiben; Apple bleibt ausdrücklich außerhalb.
4. Erst dann **FB-W2**: eigener Facebook-Firebasepopupzweig, minimaler Scope; frisches Firebase-ID-Token in bestehende SIT-Transaktion, kein Metaaccess-/Clienttoken in SIT-Payload oder Log. Native Facebookacquisition und Googlepopup bleiben unberührt.

Erwartete betroffene Grenzen für einen ausdrücklich erweiterten Auftrag: neue Facebook-Webcontract/helper-Datei und deren Tests; die bestehenden `FirebaseRuntimeConfig.currentOptions`-/Startupseams und Webbranches in `auth_service.dart`; ein separater Webreadinessvalidator mit Tests. Kein Stageprofile, Buildscript oder Deployment muss dabei aktiviert werden. Die neue Registrierungsfreigabe bleibt ein anderes Paket, nicht Teil von FB-W1/2.

## Verpflichtende Regression für FB-W1/2

- Matrix: alle aus; Facebook=true ohne passende Webevidenz; Google-only; Facebook-only mit ausschließlich synthetischer gültiger Evidenz; beide Provider konsistent; widersprüchliche App-/Projekt-/Originbindung; native Facebook unverändert. Kein Popup/Backendaufruf bei fehlendem Gate.
- Acquisition: Usercancel, Popupblocker, unbekannte SDKfehler ohne PII-Weitergabe, fehlender Firebaseuser, fehlendes/frisches Token, falscher tatsächlich erworbener Provider. UID-/Principalwechsel vor Popup, während Popup, beim Tokenread und nach Backendexchange. Cleanup nur für exakt eigene UID/Generation, nie die Nachfolgersitzung; kein natives Logout aus Webpfad.
- Backendpayload: nur Firebase-ID-Token und bestehende Consentfelder; kein Facebookaccess-/Refreshtoken und kein Applematerial. Verifizierte Facebookclaims mit passender Identity akzeptieren; fehlende/fremde Provideridentities ablehnen. Falls ein zukünftiges optionales expected-provider-Feld eingeführt wird, muss es gegen die verifizierten Claims geprüft werden; es darf nie Autorität ersetzen. Das bestehende gemeinsame Backend nicht beiläufig inkompatibel machen.
- Staging: neue Apple-/Facebookregistrierungen bleiben ohne eigene Freigabe gesperrt; Login/Registrierung nicht durch einen erfolgreichen SDKpopup als abgeschlossen ausgeben.
- Webtest bzw. kontrollierter SDK-Fake muss wirklich `kIsWeb` ausführen. VM-/Regexprüfungen allein sind kein neuer Facebook-Web-E2E-Beleg. Provider-/Browser-Liveprüfung bleibt separat und erfordert bestehende zugängliche Sitzungen.

## Ausgeführte fokussierte Baseline

Diese Tests wurden für die konkret geprüften Wiederverwendungs-/Gategrenzen am aktuellen Source erneut ausgeführt, nicht als Facebook-Webnachweis:

```sh
flutter test --no-pub test/web_google_auth_test.dart test/remote_auth_attempt_transaction_test.dart
# 42/42 PASS, 0 skipped
node --test test/tool/validate_social_provider_activation.test.mjs test/tool/web_google_auth_wiring.test.mjs
# 8/8 PASS, 0 skipped
# aus backend/
node --import ./test_setup.js --test test/firebase_social_auth.test.js
# 6/6 PASS, 0 skipped
```

## Byteanker / Änderungsgrenze

Vollfile-SHA256 gegen Git-Target und aktuelle Bytes geprüft. Beim Abschluss war HEAD durch parallele Arbeit auf `7829046600fae75f7fed4065680686142a259115` fortgeschritten; alle fünf registrierten Quellen sind im Prüf-Target, Abschluss-HEAD und Worktree bytegleich. Fremde Änderungen an Staging-Promotion und Capsule wurden nicht bearbeitet.

| Pfad | SHA256 |
| --- | --- |
| `lib/services/web_google_auth.dart` | `8b0117bd73268817e404eac265485a57549942145a3d12e16ea800bc167a40ea` |
| `lib/services/firebase_runtime.dart` | `f9d7c4cd29512d0e22dbe867260341537f3dff564e8fad6fe629d24bdbf230d5` |
| `lib/services/auth_service.dart` | `e2d8cb65e3d0fee369694165733c74e3b86fbf53b4b2091665488d1866a37922` |
| `tool/validate_social_provider_activation.mjs` | `26a365545b4ca4324de6250e857a09cfb1541c9b1ce1c7b4db6b2837f613fd86` |
| `tool/validate_android_social_auth_provider_readiness.mjs` | `9b080dbf2cc122b3e588a41cdf30983b01d7ff6007d4ac605248033a0384a590` |

CHANGED durch dieses Paket: ausschließlich diese neue FIX-Map. Keine Credentials/IDs, kein Source-/Testpatch, kein Consolezugriff, keine Provider-/Flag-/Build-/Runtime-/Deploymentänderung, kein Commit/Push. Fremde Capsule und alle anderen Artefakte nicht angefasst. NEXT: FB-W1 als explizites erweitertes Source-/Contractpaket freigeben oder Facebook Web weiter gesperrt lassen; kein physischer Login nötig, um dieses Architekturpaket zu spezifizieren.
