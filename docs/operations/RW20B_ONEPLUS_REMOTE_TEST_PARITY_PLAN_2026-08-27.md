# RW20B OnePlus Remote-Test-Paritaetsplan

Status: **RW20B TECHNISCH GESCHLOSSEN — NICHT AUSGEFUEHRT — RELEASE- UND GERAETE-GATE GESCHLOSSEN**

## Zweck

RW20B beantwortet die konkrete Frage, welche bereits auf dem Pixel verwendeten
Diagnosen spaeter auf Walids privatem OnePlus ueber Wireless ADB wiederholt
werden koennen. Es fuehrt keinen Test aus, greift nicht auf das OnePlus zu und
veraendert weder Google Play noch das Geraet.

Der Zielkandidat bleibt exakt `com.shareittoo.app`, `1.0.0 (2026082601)`,
Artefakt-Quell-HEAD `a1aa3f2528f1923c092a1fb15bdd3dc083673890` und AAB-SHA-256
`8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873`.
Der neue Build ist weiterhin nur Play-Entwurf. Auf dem OnePlus wird bis zu
einem nachgewiesenen Play-Update weiterhin `2026081509` erwartet.

## Pixel-zu-OnePlus-Entscheidung

| Pixel-Nachweis | OnePlus-Entscheidung | Begrenzung |
| --- | --- | --- |
| R1 Installations-/Identitaetsaudit | Nach Release und Play-Update vorbereitet | Nur Paket, Version, SDK, Play-Installer und Split-Struktur; kein AAB-Binaergleich und kein Play-App-Signing-Nachweis |
| R4 Lifecycle-Kern | Teilweise, nur im Owner-Zeitfenster | Force-stop, Start, Home und Neustart veraendern Prozess/UI; globale Rotation und private Deep Links bleiben ausgeschlossen |
| R5 Wiederholungsstabilitaet | Teilweise, nur begrenzt und beaufsichtigt | Keine Roh-Logs, keine unbeschraenkten Zyklen; Akku-/Waermefenster beachten |
| Authentifizierte Navigation und Rechtstexte | Erst nach synthetischer Testsession | Keine Credential-Automation; Owner meldet das Testkonto selbst an |
| Grosse Schrift/Accessibility | Manuell auf dem privaten Handy | Keine unbeaufsichtigte globale Einstellungsveraenderung; Wiederherstellung muss sichtbar bestaetigt werden |
| WLAN/Mobilfunk/Offline | Manuell | WLAN-Abschaltung beendet typischerweise den Wireless-ADB-Kanal und ist deshalb kein verlaesslicher Remote-Automationsschritt |
| Clean Install | Auf dem privaten OnePlus nicht autorisiert | Kein Uninstall, kein `pm clear`, kein Sideload und kein Datenverlust ohne separates Gate |

Damit sind Pixel und OnePlus vergleichbar, aber nicht austauschbar: Ein
bestandener OnePlus-Lauf ergaenzt die Pixel-Evidence fuer ein anderes
Hersteller-/OS-Profil. Er beweist nicht automatisch identisches Verhalten auf
allen Android-Geraeten.

## Vorbereiteter read-only Kandidaten-Preflight

Das neue Werkzeug
`tool/preflight_oneplus_play_internal_candidate.mjs` verweigert jeden
CLI-Geraetezugriff, solange nicht der exakte Owner-Gatewert uebergeben wird.
Erst nach ausdruecklicher Freigabe und manuell bestaetigtem Wireless-Debugging-
Pairing darf auf dem MacBook ausgefuehrt werden:

```bash
node tool/preflight_oneplus_play_internal_candidate.mjs \
  --confirm-release-go GOOGLE_PLAY_INTERNAL_RELEASE_GO \
  > /tmp/sit-oneplus-candidate-preflight.json
```

Der Preflight liest ausschliesslich bereinigte Geraeteeigenschaften,
Paketversion, SDK-Werte, Play-Installer, Split-Anzahl und Prozessanzahl. Er
startet oder stoppt die App nicht, installiert nichts, liest keine Kontodaten
und erfasst weder Screenshots noch Logcat. ADB-Adresse, Roh-ID und PIDs werden
nicht ausgegeben.

`2026082601` plus `com.android.vending` beweisen Play-Auslieferung und sichtbare
Versionsidentitaet, aber nicht, dass installierte Play-Splits bytegleich mit dem
urspruenglichen AAB sind. Der Upload-Zertifikat-Fingerabdruck ist ebenfalls
nicht automatisch der Fingerabdruck des von Play signierten Installats. Diese
beiden Aussagen bleiben daher im Ergebnis ausdruecklich `false`.

## Verbindliche Reihenfolge nach spaeterer Freigabe

1. Walid erteilt separat `GOOGLE_PLAY_INTERNAL_RELEASE_GO`.
2. Der bestehende Entwurf wird erst dann nach dem festgelegten Owner-Ablauf
   aktiviert; RW20B selbst fuehrt das nicht aus.
3. Das OnePlus aktualisiert ueber Google Play auf `2026082601`.
4. Walid bestaetigt Wireless-Debugging-Pairing am entsperrten Handy.
5. Der read-only Preflight muss bestehen.
6. Danach folgt die nicht-destruktive Owner-Matrix.
7. Authentifizierte A-zu-B- und Rechts-/Navigationspfade folgen nur mit einer
   owner-bereitgestellten synthetischen Testsession.
8. WLAN/Mobilfunk/Offline bleiben manuelle Phasen am Handy.

Ein Fehler oder Verbindungsabbruch darf keine nachfolgende Phase als bestanden
markieren. Jede Phase bleibt `NOT_RUN`, bis ihr eigener Nachweis vorliegt.

## Aktuelle Grenzen

- `GOOGLE_PLAY_INTERNAL_RELEASE_GO`: nicht erteilt.
- Kandidaten-Preflight und Funktionsmatrix: nicht ausgefuehrt.
- Kein OnePlus-/Pixel-Zugriff aus diesem Paket.
- Keine Store-, Testerlisten-, Produktions-, Payment-, Provider-, Firebase-,
  Cloud-, VPS-, DNS- oder PR-Merge-Aenderung.
- Keine Kontoadresse, Opt-in-URL, ADB-ID, Netzwerkadresse, Screenshots,
  Roh-Logs oder Credentials in Repository-Evidence.

Maschinenlesbarer Plan:
`store/google-play/rw20b-oneplus-remote-test-plan.json`.

## Exact-SHA-Closure

Implementation-HEAD `fd874bb9584ee3445047c0c7a300754905cb7c3a` bestand die
vollstaendige lokale technische Regression ohne reduzierte Parallelitaet,
Retry, Timing- oder Cache-Umgehung. Acht fokussierte RW20B-Tests und die
kombinierte 17-Test-Matrix mit RW20A/Altbuild-Baseline bestanden.

GitHub Regression `33026839775` und CodeQL `33026839780` sind auf exakt diesem
HEAD erfolgreich. Flutter, Backend, PostgreSQL und Clean-Checkout-
Reproduzierbarkeit bestanden; der Image-Publish-Job blieb uebersprungen. Die
Branch-Abfrage meldete danach null offene Code-Scanning-Alerts. PR #7 blieb
Draft, offen, mergefaehig und ungemergt.

Diese technische Closure ist ausschliesslich ein Ausfuehrungspaket. Sie ist
kein OnePlus-Testresultat und erteilt weder Release-, Store-, Device-, Login-
noch Human-Pilot-Freigabe.
