# Profilavatar — enger Source-/Testaudit

Stand 2026-10-03; Source-Target `a89dfe22ca629f6cc5cca1a0b751f6a4d1960cf0`, Branch `codex/master-workflow-20260808`.
RESULT: **lokaler Audit PASS, Live-Auth-/Browserdarstellung NOT VERIFIED**. Kein konkreter verbleibender Sourcefehler belegt; keine Produktions-/Teständerung notwendig. WP189 ist Ausgangsevidenz, nicht Live-Abnahme.

## Tatsächlicher Pfad und Grenzen

Der Schreibendpunkt ist **`PATCH /v1/profile`**, nicht `PATCH /auth/me`. Danach folgt **`GET /v1/auth/me`**. Ein Upload allein ist noch keine gespeicherte Profiländerung.

| Station | Entscheidende Source am Target | Lokal belegte Aussage / Grenze |
| --- | --- | --- |
| Auswahl | `lib/screens/profile_info_screen.dart:580–600` | ImagePicker → Bytes → Data-URL-Draft; Principal vor/nach asynchroner Auswahl geprüft. Echter Browser-Dateidialog nicht ausgeführt. |
| Upload | `lib/services/profile_mutation_service.dart:177–228`; `lib/services/backend_repository.dart:3132–3168` | Backendmodus lädt JPEG/PNG/WebP bis 8 MiB ownergebunden mit `purpose=profile_image` hoch; managed URL und aktuelle Session nach Upload geprüft. Debug/QA-Draft ist keine durable Serverbindung. |
| Serverseitige Bildannahme | `backend/src/app.js:7997–8099` | Auth/aktives Konto/verifizierte E-Mail, erkannter MIME-Typ, Bildsanitisierung, servergenerierter Storage-Name, Uploadzeile mit Owner/Purpose/Visibility/Scanstatus; Antwort enthält managed URL. PG-Test verwendet nur synthetisches PNG und Loopbackserver. |
| Autorisierte Profilbindung | `backend/src/profile_media_authorization.js:12–66`; `backend/src/app.js:4578–4619` | Exakte managed Full-URL ohne Query/Fragment; vorhandener eigener `profile_image`-Upload, `public`, `passed`. Fremde Bindung 403; unmanaged URL 400; explizites Entfernen zulässig. UPDATE wird an `req.auth.userId` gebunden. |
| Durable Readback | `backend/src/app.js:4158–4162`; `lib/services/backend_repository.dart:345–359,485–507` | PATCH `/profile` und GET `/auth/me` sind getrennt. Der GET liest die authentifizierte Userszeile. Der PG-Test prüft gespeicherte URL, HTTP-Server-Neustart im selben Nodeprozess und eine weitere synthetische Authsession; kein realer Login-/App-Prozessneustartbeweis. |
| Lokale Projektion / Erfolg | `lib/services/profile_mutation_service.dart:230–316`; `lib/services/data_service.dart:4149–4194,4388–4475`; `lib/screens/profile_info_screen.dart:323–435` | PATCH-Receipt → ownergebundener GET → verifizierte lokale CurrentUser/Users-Persistenz → `profileStateKey`. Anzeige „Gespeichert“ nach Readback; unbekannter/teilweise angenommener Ausgang wird nicht als sichere Nichtänderung ausgegeben. Keine automatische Blindwiederholung. |
| Session-/Bildrefresh | `lib/services/data_service.dart:2633–2685`; `lib/services/shared_persistence_sync.dart:79–88`; `lib/widgets/app_image.dart:106–179`; `lib/widgets/user_avatar.dart:1–37` | Managed Avatar lädt Token der aktuellen Session, erneuert auf Profil-/Accountsignal und fällt ohne Token zurück. Tests zeigen neue NetworkImage-Credentials bei gleicher URL, Accountwechsel und Sign-out; keine erfolgreichen echten Bildbytes/Pixel dadurch bewiesen. |

## Sichtbare Consumer

| Oberfläche | Wiring | Aussagegrenze |
| --- | --- | --- |
| Profilheader | `lib/screens/profile_screen.dart:384–394,916–923`; `lib/widgets/profile_header_card.dart:30,137–141` | Profilsignal lädt neu; Header verwendet `user.photoURL` über `SitUserAvatar`. |
| Navigationsicon | `lib/navigation/main_navigation.dart:86–92,110–139,223–252,492–509` | Profilsignal/Resume lädt User; Iconkey enthält User/URL, Avatar verwendet verwalteten Bildpfad. Kein eigener Browser-Screenshot in diesem Audit. |
| Eigenes Profil | `lib/screens/own_profile_screen.dart:62–72,1110–1115` | Profil-/Accountrefresh und Avatar an aktuellem User. |
| Öffentliches Profil | `lib/screens/public_profile_screen.dart:829`; `lib/services/data_service.dart:9695–9728` | Header nutzt geladenes Profil. Public-Profile-Lookup ist bei Backend zuerst remote, mit lokalem Offlinefallback; keine Garantie sofortiger Cross-Account-Aktualisierung bei Remoteausfall. |
| Nachrichtenliste / Thread | `lib/screens/messages_screen.dart:91–104,244–267,613`; `lib/screens/message_thread_screen.dart:266–275,1194,2568–2640`; `shared_persistence_sync.dart:81–85` | Profilsignal gehört zum Kommunikationsrefresh; sichtbare Gegenparteien werden bei Listenreload remote nachgeladen, Thread nutzt aktuelle eigene/fremde Avatarwerte. Dies ist lokale Wiringevidenz, kein gleichzeitiger Zwei-Browser-Test. |
| Buchungsliste / Detail | `lib/screens/bookings_screen.dart:67–74,272,452`; `lib/screens/booking_detail_screen.dart:441–451,537–545,4574` | Reload nach Profilsignal; Gegenparteiprofil statt dekorativer Avatar. Kein neuer Booking-/Historyvertrag und kein D8-Eingriff. |
| „Sidebar“ | Suche nach `sidebar`, `side.?bar`, `navigationrail`, `navigation.?drawer`, `profileavatar` in `lib/` und `web/` (Dart/JS/TS/TSX/HTML) ohne separaten Komponententreffer | Nicht als eigene Oberfläche belegt. Der Live-Web-/Breakpointzustand muss erst der tatsächlichen Sourcekomponente zugeordnet werden; Header/Navicon werden nicht stillschweigend als Sidebarbeweis ausgegeben. |

Backend-PATCH publiziert `profiles` an den eigenen Nutzer (`app.js:4618`); daraus folgt keine garantierte sofortige Avataraktualisierung aller bereits offenen fremden Sitzungen. Dafür ist deren nächster Reload bzw. ein eigenständiger Livebeleg maßgeblich.

## Fokussiert ausgeführte Prüfungen

1. `node --test test/tool/wp189_profile_avatar_and_subcategory_wiring.test.mjs backend/test/profile_media_authorization.test.js` → **5/5 PASS** (einschließlich eines unveränderten WP189-Subcategorytests).
2. `node --test test/tool/wp259a_profile_authoritative_hydration.test.mjs test/tool/main_navigation_resume_profile_sync_wiring.test.mjs test/tool/profile_info_async_lifecycle_wiring.test.mjs test/tool/public_profile_async_context_wiring.test.mjs test/tool/wp262b_profile_feedback_wiring.test.mjs` → **17/17 PASS**; Quell-/Wiringtests, kein Browserbeweis.
3. `flutter test --no-pub --dart-define=SIT_BACKEND_ENABLED=true test/profile_mutation_photo_upload_test.dart test/managed_avatar_refresh_test.dart test/profile_info_save_refresh_test.dart` → **8/8 PASS, kein Skip**. Uploadfake, Session-/Imageprovider- und Editor-Lifecycletests; kein Providertraffic als Beleg.
4. `flutter test --no-pub --dart-define=SIT_BACKEND_ENABLED=true --dart-define=SIT_API_BASE_URL=http://127.0.0.1:1/api/v1 test/managed_avatar_refresh_test.dart` → **2/2 PASS, kein Skip**, zusätzlich mit exakt lokalem managed Origin. Das sind dieselben zwei Avatarfälle, keine zusätzlichen unabhängigen Fälle.
5. `SIT_POSTGRES_FOCUSED_PROFILE_AVATAR=1 node tool/run_local_postgres_integration.mjs` → **1/1 PASS, kein Skip**, PostgreSQL 16, isolierter temporärer Loopbackcluster; Runnerstatus `passed-and-cleaned`. Upload 201 → PATCH 200 → zwei GET-Readbacks 200; Fremdbindung 403, unmanaged 400. Keine Provider-/Deployment-/echten Kontenänderungen.

Ein erster Flutteraufruf nutzte irrtümlich `BACKEND_ENABLED` statt `SIT_BACKEND_ENABLED`: vier Uploadtests bestanden, zwei Avatarfälle wurden übersprungen. Dieser Lauf zählt **nicht** als Avatarbeleg; die zwei korrekt konfigurierten Läufe oben schließen die Lücke. Keine Vollregression.

## Entscheidende Byteanker

SHA256 über vollständige Dateien; geprüft bytegleich mit `git show a89dfe22:<path>`. Übrige Pfade/Zeilen oben sind ebenfalls an den vollständigen Source-Commit gebunden, nicht an eine mutable Capsule.

| Pfad | SHA256 |
| --- | --- |
| `lib/screens/profile_info_screen.dart` | `3cd05944725feb673c0aeef09f7cb8222118bd6aa095da781415cb7398e3485c` |
| `lib/services/profile_mutation_service.dart` | `1b8ad247f9fb7d90816077818dba2eb632a0f64f1d246e5ca7a54e9d12160fd0` |
| `lib/services/backend_repository.dart` | `58b7f0146e13db2cd5e11c76f467e69461a0730c459b7bfc56a66ff2b8220d84` |
| `lib/services/data_service.dart` | `3a470c7b88cc5949ee637e657521aad9cde014e9f595ff4c44d1115c0440d4ed` |
| `lib/widgets/app_image.dart` | `a27f36d4f484517ba0712373ff17522dc56f2d1c95095ca11ebed2161d3571d0` |
| `backend/src/profile_media_authorization.js` | `391f73542e5e6d83b162245b855ef969e1d083db28cd3572d564b986ae9e1856` |
| `backend/test/profile_avatar_postgres.integration.test.js` | `28ee31a31cf018f9c3bae7b82e8f2b7b471d9b8c1600c000a845a6561b0fb12e` |

## Exakt fehlender Livebeleg / nächster Schritt

Nicht ausgeführt: Browser, echter Login, Upload in Staging/Produktion, Deployment, Accountanlage. Für eine Live-Abnahme ist ein separat begrenzter Durchlauf mit bestehendem autorisiertem Testkonto und freigegebenem nicht-sensitivem Bild nötig:

1. Aktuellen Webbuild/Origin/angemeldeten Principal und sichtbare Zieloberflächen einschließlich behaupteter Sidebar read-only verifizieren; keine Credentials/Sessionlocators in Evidenz speichern.
2. Bild wählen und bewusst speichern. Upload- und PATCHerfolg sowie anschließende `/auth/me`-URL müssen demselben Principal zuordenbar sein. Bildrequest muss echte erfolgreiche Bildauslieferung zeigen, nicht nur eine URL/Widgetstruktur.
3. Header/Nav/Eigenprofil prüfen, Seite neu laden und vorhandene Sitzung wieder aufnehmen. Nachrichten-/Buchungsoberflächen nur mit bereits zulässigen vorhandenen Testdaten prüfen; fremde Avataransicht separat in bereits autorisiertem Testkontext. Fehlende Daten nicht durch Buchung/Einladung/Accountanlage ersetzen.
4. Bei Fehler oder unklarem PATCHausgang zuerst Readback; kein blindes Re-Upload/Retry. Keine Behauptung „überall live behoben“, solange ein verlangter Surface-/Browserbeleg fehlt.

CHANGED: ausschließlich diese Mappe. BLOCKER: Livebeleg nicht Teil dieses ausgeführten Source-/Testpakets; Sidebarzuordnung offen. NEXT: Sol-Review und danach der begrenzte reale Browsernachweis, falls autorisiert. Kein Sourcefix, Commit/Push; fremde Capsule, D8-Artefakte und Gemini-Pakete unverändert.
