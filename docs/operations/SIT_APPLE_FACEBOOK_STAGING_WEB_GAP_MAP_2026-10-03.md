# Apple/Facebook — Staging-Web-Voraussetzungen, keine Aktivierung

Stand: 2026-10-03. Source-Target: `fd90df58bf1450ac2268b5740e545b6b301b2184`, Branch `codex/master-workflow-20260808`.
RESULT: **Source-/Gap-Map PASS; Apple/Facebook Web-Login und Web-Registrierung BLOCKED / nicht implementierungs- oder providerseitig freigegeben.** Kein konkreter unabhängiger Sourcebug belegt, daher keine Source-/Teständerung. Google-Gate bleibt separat und unverändert.

## Entscheidender Befund

**Credentials oder Console-Schalter allein reichen nicht.** Der aktuelle Webzweig erlaubt ausschließlich Google. Native Apple-/Facebook-Codepfade und eine Backend-Providerallowlist sind kein Websupport. Außerdem gibt es im geschützten Staging keine neue Apple-/Facebook-Registrierungslane. Diese Grenzen sind bewusst zu behandeln, nicht als Defekt zu entfernen.

| Schicht | FACT am Source-Target | Konkrete Lücke / Stopregel |
| --- | --- | --- |
| UI und Flags | `lib/services/auth_service.dart:127–187`: Apple/Facebook-Defines default false; Produktbuilds benötigen zusätzlich `SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED`. Im `kIsWeb`-Zweig kann ausschließlich Google true werden. Login `lib/screens/login_screen.dart:1014–1060` und Registrierung `lib/screens/register_screen.dart:737–824` benutzen diesen Gate für Verfügbarkeit/Callback. | Apple/Facebook bleiben Web-seitig auch bei ihren Defines=true gesperrt. Kein bloßes Button-Enabling. Die vom Koordinator berichtete deaktivierte Live-UI passt dazu, wurde in diesem Worker nicht erneut visuell geprüft. |
| Web-Runtime/Acquisition | `lib/services/firebase_runtime.dart:108–155` bindet Webkonfiguration an den bestehenden Web-Google-Vertrag. `auth_service.dart:1496–1534` nutzt im Web nur dessen Popup-/Tokenpfad. Apple/Facebook-SDK-Flows stehen danach im nativen Zweig `:1553–1603`. | Separate Web-Providerintegration mit exaktem Firebase-App-/Originbinding, Principal-/Cancellation-/Cleanupvertrag fehlt. Keine allgemeine Webfreigabe aus nativer SDK-Abhängigkeit ableiten; Google-Vertrag nicht nebenbei verallgemeinern. |
| Stagingbuild | `tool/staging_web_contract.mjs:12–25` setzt Apple, Facebook und Aktivierungsvalidierung auf false. `tool/validate_social_provider_activation.mjs:6–64` kennt nur `android`, `ios`, `all` und zieht für Apple/Facebook native Readiness heran. | Kein bestehender Web-Apple-/Facebook-Aktivierungsnachweis. Native Freigaben nicht als Webgate verwenden. Build-/Deploymentänderung ist Folgepaket, nicht Teil dieser Mappe. |
| Token-/Backendvertrag | `backend/src/firebase_social_auth.js:11–15,30–84,91–141`; `backend/src/config.js:152–169,574–581`: Firebase-ID-Tokenprüfung inklusive Revocation, Provider/Subject/Firebase-UID/E-Mail-Normalisierung; `FIREBASE_AUTH_ENABLED` default false; Projektbindung über Service-Accountvalidierung. | Backendallowlist enthält Apple/Facebook, ist aber kein Nachweis aktivierter Firebaseprovider, korrekter Client-Appbindung oder Livecredentials. Fehlende E-Mail wird mit `social_email_required` abgelehnt; nicht aus Providerbutton/Scope garantieren. |
| Session/Login/Registrierung | Client `auth_service.dart:1290–1370` führt owner-/epochgebundenen `/auth/social`-Austausch mit Consentfeldern aus. Backend `backend/src/app.js:2803–2828,2908–2925,2970–3055` trennt verknüpfte Identität, bestehendes Konto und Neuanlage. | Unter aktivem Stagingzugang scheitert eine neue nicht vorhandene Apple-/Facebook-Identität ohne freigegebene Registrierungslane mit `staging_registration_disabled`. Existierende Konten benötigen passende Allowlist-/Identitäts-/Linkingbedingungen; kein behaupteter Live-Login. Die besondere Google-Lane wird nicht auf andere Provider übertragen. |
| Apple-Revoke-Vertrag | Client `auth_service.dart:1587–1597` verlangt Authorization Code und sendet ihn zusätzlich zum Firebase-ID-Token. Backend `app.js:2883–2906,2926–2955` tauscht den Code serverseitig, bindet Subject und speichert verschlüsseltes Refreshmaterial. `backend/src/apple_revocation.js:182–224`; `backend/src/apple_revocation_secret_files.js:63–126`. | Web muss einen mit diesem Backendvertrag kompatiblen Code-/Refreshmaterialpfad erst belegen. Generische Firebase-Web-Anleitung beweist nicht, dass ein nach Firebase-Austausch zurückgegebener Code erneut austauschbar ist. Ohne belastbaren Flow-/Deletionbeleg bleibt Apple aus; keine Tokens aus dem Browser als frei akzeptiertes Refreshmaterial einschleusen. |
| Stagingkonfiguration | `backend/compose.staging.yml:120–123,146` führt Firebaseflag/Projekt/Service-Accountmount. Im gelesenen Composefile gibt es keine `APPLE_REVOCATION_*`-Weitergabe. Der Configreader kennt Enable, Client-/Team-/Key-ID, Redirect und private/encryption key files; Staging erzwingt encryption key file. | Effektive Apple-Runtimeverdrahtung samt ggf. vorhandenen Overrides ist NOT VERIFIED, nicht durch Quell-Defaults ersetzt. Keine Secretdatei, aktuelle Umgebung oder private Console wurde gelesen. |

## Externe Voraussetzungen — providerweise abarbeiten, Werte zunächst NOT VERIFIED

Gemeinsame Abhängigkeit: Das tatsächlich verwendete Staging-Firebaseprojekt, dessen vorhandene Web-App und deren `authDomain` müssen unabhängig read-only bestätigt sein. Diese Mappe erstellt keine Web-App und wiederholt/erweitert nicht das Google-Provider-/Domainpaket. `staging.shareittoo.com` ist der beabsichtigte Anwendungsorigin; er ist **nicht automatisch der OAuth-Callbackhost**.

### Apple

- Apple Developer-Mitgliedschaft und berechtigten Consolezugang bestätigen; vorhandene primäre App-ID mit Sign in with Apple sowie zugehörige Services ID für Web feststellen. Die Website wird der primären App zugeordnet; Domains/Subdomains und Return-URLs werden im Services-ID-Kontext eingetragen. Kein vorhandener Identifier oder dessen Freigabe ist hier behauptet. [Apple Web-Konfiguration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- Im richtigen Firebaseprojekt Appleprovider, Services ID und OAuth-Konfiguration mit Team-/Key-ID und privatem Schlüssel prüfen. Standardcallback ist `https://<verified-project-id>.firebaseapp.com/__/auth/handler`; bei tatsächlich konfiguriertem Custom-Authdomain ist dessen exakter Handler maßgeblich. Nicht ungeprüft `/auth/social` oder die Staging-Startseite als Return-URL eintragen. E-Mail-Relay-Sender für tatsächlich eingesetzte Firebase-Mailfunktionen berücksichtigen. Werte/Schlüssel bleiben außerhalb der Mappe. [Firebase Apple Web](https://firebase.google.com/docs/auth/web/apple)
- Zusätzlich SIT-spezifisch: `APPLE_REVOCATION_ENABLED`, `APPLE_REVOCATION_CLIENT_ID`, `APPLE_REVOCATION_TEAM_ID`, `APPLE_REVOCATION_KEY_ID`, `APPLE_REVOCATION_REDIRECT_URI`, `APPLE_REVOCATION_PRIVATE_KEY_FILE`, `APPLE_REVOCATION_ENCRYPTION_KEY_FILE` nur als Vorhanden-/Binding-/Berechtigungsprüfung, nie Secretinhalt exportieren. Client-ID/Audience und Redirect müssen zum tatsächlich gewählten Webcodeflow passen. Echten Codeaustausch/Refreshmaterial und spätere Widerrufung nicht mit Unit-Testmocks als abgeschlossen melden.

### Facebook / Meta

- Vorhandene Meta-App für Website/Facebook Login und passenden Consolezugang feststellen. App-ID/Secret werden für die Firebase-Facebookproviderkonfiguration benötigt; Secret ausschließlich im dafür vorgesehenen vertraulichen Provider-/Serverkontext, nie im Webbuild oder dieser Mappe. Exakten Firebasehandler unter **Valid OAuth Redirect URIs** abgleichen. [Firebase Facebook Web](https://firebase.google.com/docs/auth/web/facebook-login)
- Effektive Client-/Web-OAuth-Einstellungen, HTTPS, Strict Mode und exakt erlaubte Redirects kontrollieren. Falls ein direkter Meta-JavaScript-SDK-Pfad gewählt würde, kommen **Login with JavaScript SDK** und **Allowed Domains for JavaScript SDK** für den hostenden Origin hinzu; nicht als zwingende zweite SDK-Integration neben Firebase voraussetzen. [Meta Login Security](https://developers.facebook.com/documentation/facebook-login/security)
- Im Appdashboard Zugang für das konkrete Pilotpublikum, Appmodus, Rollen/Tester, `email`/`public_profile`-Accesslevel und aktuell angezeigte Review-/Verifikations-/Privacy-/Datenlöschungsanforderungen read-only feststellen. Kein Live-Moduswechsel, keine Testpersonenanlage, keine pauschale Aussage „kein Review nötig“: Die aktuelle Meta-Webseite nennt automatisch verfügbare Basisscopes, weist später aber für externe Nutzer auf Advanced Access hin. Effektive Appberechtigung bleibt deshalb OPEN. [Meta Web Login](https://developers.facebook.com/documentation/facebook-login/web)

Für beide Provider sind **Consolevoraussetzung**, **SIT-Webimplementierung**, **Staging-Berechtigung/Registrierung** und **sichtbarer erfolgreicher Login** vier getrennte Nachweise. Auch ein technisch erfolgreicher Providerlogin darf nicht still ein neues SIT-Konto oder eine ungeprüfte Identitätsverknüpfung schaffen.

## Sanitized aktuelle Read-only-Fakten

- Lokaler HEAD und untersuchte Bytes entsprechen dem Target oben; keine Providerwerte/Secrets aus Worktree-Konfiguration gelesen.
- 2026-10-03, 12:46:13 UTC: unangemeldeter `GET https://staging.shareittoo.com/` → HTTP 200, HTML. `GET https://staging.shareittoo.com/api/v1/auth/me` → HTTP 401, JSON. Nur Status/Content-Type erfasst, keine Responsebodies, Cookies oder Sessionlocators gespeichert. Belegt erreichbare Shell und verweigerten anonymen Profilzugriff; **keine** Providerkonfiguration, aktive Buildidentität oder Browserbuttonfunktion.
- Apple-/Meta-/Firebaseconsole, bestehende App-/Services-IDs, Appmodus, erlaubte Callbackwerte, Secretmounts und effektive Runtimeflags: **NOT VERIFIED**. Kein authentifizierter Login, kein Providerwrite, keine Accountanlage.

## Freshness / Primärquellen

Alle folgenden Seiten am 2026-10-03 mit Live-Fetchanforderung `maxAge=0` geöffnet, HTTP 200. Dies prüft öffentliche Dokumentation, nicht den SIT-Account. Vor einem späteren Consolewrite neu öffnen; bei Nichterreichbarkeit/Drift NOT VERIFIED/STALE, nicht aus diesem Snapshot freigeben.

| Quelle | Sichtbarer Dokumentstand |
| --- | --- |
| [Firebase Apple Web](https://firebase.google.com/docs/auth/web/apple) | 2026-10-01 UTC |
| [Firebase Facebook Web](https://firebase.google.com/docs/auth/web/facebook-login) | 2026-10-01 UTC |
| [Apple Web-Konfiguration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/) | Kein sichtbares Aktualisierungsdatum |
| [Meta Login Security](https://developers.facebook.com/documentation/facebook-login/security) | 2026-06-30 |
| [Meta Web Login](https://developers.facebook.com/documentation/facebook-login/web) | 2026-03-16; Accesslevel-Spannung oben ausdrücklich offengehalten |

## Fokussierte Verifikation und Byteanker

```sh
# Aus backend/: 16/16 PASS, 0 skipped
node --import ./test_setup.js --test test/firebase_social_auth.test.js test/apple_revocation.test.js test/apple_revocation_contract.test.js
# Aus Repo-Root: 49/49 PASS, 0 skipped; nur lokale synthetische Testfixtures
node --test test/tool/staging_web_contract.test.mjs test/tool/validate_social_provider_activation.test.mjs
# Aus Repo-Root: 10/10 PASS, 0 skipped; Widget-/VMtests, kein Webproviderlogin
flutter test --no-pub test/social_auth_release_gating_test.dart test/social_auth_button_truth_test.dart test/social_auth_backend_error_mapping_test.dart
```

Kein echter Apple-/Facebookcodeaustausch, PG-Provider-E2E oder Browserintegrationstest ausgeführt. Die nativen/VMtests beweisen insbesondere keinen `kIsWeb`-Login. Die Webexklusivität wurde direkt im gebundenen Source geprüft. Keine Vollregression.

SHA256 über vollständige Gitdateien am Target, gegen aktuelle Bytes geprüft:

| Repo-Pfad | SHA256 |
| --- | --- |
| `lib/services/auth_service.dart` | `e2d8cb65e3d0fee369694165733c74e3b86fbf53b4b2091665488d1866a37922` |
| `lib/services/firebase_runtime.dart` | `f9d7c4cd29512d0e22dbe867260341537f3dff564e8fad6fe629d24bdbf230d5` |
| `backend/src/firebase_social_auth.js` | `58843e34ac407b429d2d1886d56fce54a37645e5f92e75ef282953003c235399` |
| `backend/src/apple_revocation_secret_files.js` | `2eb6ea78419d60d7ca51593a30d7b018977626b1f8910680d885a0d07175bfcf` |
| `backend/src/apple_revocation.js` | `e3e83a54ed7bb3818231ffadf39d2482193be19d20a880598fefffab46a7aae5` |
| `backend/src/app.js` | `ac867635b2d02c992347416a0ba3f1f2b681b5902963728c99f89457703863e2` |
| `backend/src/config.js` | `b2a29054cdfc65e77c981d1d02c3a0af5f1b8c2a08cc536c58847d5f4c80f515` |
| `backend/compose.staging.yml` | `5d5837797f843d4d940f2c2fbac0b651c70e898513e5c4af405609e3cceae3a4` |
| `tool/staging_web_contract.mjs` | `6e936b68a9c691a07e06e757869fd5599668fbdb051859887313d65ae492cd7a` |
| `tool/validate_social_provider_activation.mjs` | `26a365545b4ca4324de6250e857a09cfb1541c9b1ce1c7b4db6b2837f613fd86` |

## Kleinster sinnvoller Nachfolger

Zunächst **ein providerweise getrenntes Read-only-Consoleinventar** für das bereits bestehende Stagingprojekt/App: jeweils Präsenz, Bindinggleichheit, Domain-/Callbackgleichheit und offene Gatewerte als Boolean/Status dokumentieren, keine Secret-/Accountlocators. Fehlender Zugang wird als Blocker berichtet, nicht durch neue Konten umgangen.

Danach enges Web-Auth-Designpaket (weiterhin flags off): Websupport/SDKpfad plus Staging-Login-vs.-Neuregistrierung ausdrücklich festlegen; Apple-Code-/Revokevertrag bzw. Facebook-Pilotzugang testen. Kein Google-Scopeersatz, kein Flagenabling als Abkürzung. Erst bei separater Autorisierung und vollständigem Readback können Providerwrite, Build und Live-E2E eigene Schritte werden. Bei partiellem Providererfolg: Zustand read-only nachlesen, nicht blind erneut anlegen/aktivieren.

CHANGED: nur diese Gap-Map. BLOCKER: Webpfad/Registrierungslane fehlen und Provider-/Console-/Runtimebindungen sind unbestätigt. NEXT: begrenztes Read-only-Inventar. Fremde Capsule, D8-/Avatarartefakte und Google-/Gemini-Pakete unangetastet; kein Commit/Push/Deployment.
