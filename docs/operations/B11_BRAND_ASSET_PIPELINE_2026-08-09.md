# B11 – Einheitliche Marken- und App-Icon-Kette

Stand: 9. August 2026  
Status: technisch abgeschlossen; reale Store- und Geräteprüfung bleibt offen

## Ziel

Alle installierbaren ShareItToo-Oberflächen müssen dasselbe freigegebene
Symbol auf deckend weißem Hintergrund zeigen. Flutter-Standardassets oder
transparente Varianten dürfen nicht in Android, iOS, Web-App, Browser-Favicon
oder Startbildschirm gelangen.

## Kanonische Quelle

Die unveränderte Masterdatei ist:

`assets/images/shareittoo_app_icon_master.png`

Sie besitzt exakt 1024 × 1024 Pixel, ist ein nicht interlaced 8-Bit-RGB-PNG
ohne Alphakanal und enthält das ShareItToo-Symbol auf Weiß. Die nativen und
Web-Varianten sind deterministisch daraus skaliert; das Logo wurde nicht
generativ neu gezeichnet oder farblich verändert.

## Abgedeckte Auslieferungsziele

- fünf Android-Launcher-Icons von 48 bis 192 Pixel;
- fünf Android-Startlogos von 96 bis 384 Pixel;
- fünfzehn iOS-App-Icons von 20 bis 1024 Pixel;
- drei iOS-Startbilder von 168 bis 504 Pixel;
- Web-Favicon mit 32 Pixel;
- PWA-Icons mit 192 und 512 Pixel;
- Maskable-PWA-Icons mit 192 und 512 Pixel.

Damit werden insgesamt 34 PNG-Dateien einschließlich Master geprüft.

## Korrektur vom 9. August 2026

Android, iOS und die nativen Startbilder waren bereits korrekt. In den fünf
Web-Assets waren noch Flutter-Standardbilder vorhanden. Sie wurden durch die
passenden ShareItToo-Ableitungen ersetzt.

Zusätzlich gilt nun:

- PWA-Startfarbe: `#FFFFFF`;
- PWA-Themefarbe: ShareItToo-Primärblau `#0EA5E9`;
- Android-Startfläche: deckendes Weiß;
- iOS-Startfläche: deckendes Weiß.

## Automatischer Schutz

`tool/verify_brand_assets.mjs` kontrolliert für jedes Asset:

1. erwarteten Pfad und erwartete Pixelgröße;
2. PNG-Signatur und IHDR-Daten;
3. 8-Bit-RGB ohne Alphakanal und ohne Interlacing;
4. exakten freigegebenen Inhalt der jeweiligen Master-Ableitung;
5. vollständige PWA-Manifestzuordnung;
6. weißen PWA-, Android- und iOS-Starthintergrund.

Der Prüfer läuft sowohl in `scripts/technical_regression_check.sh` als auch in
`scripts/release_candidate_preflight.sh`. Ein falsches Logo, Transparenz,
eine unbemerkte Größenänderung oder die Rückkehr eines Flutter-Standardassets
stoppt damit Regression und Store-Kandidat.

## Abnahme

Lokal bestanden:

- 34 von 34 Markenassets;
- Store-Metadatenprüfung im weiterhin geschützten Entwurfszustand;
- Analyzer ohne neue Regression auf Basis 696;
- 167 von 167 Fluttertests;
- Web-Debug-Build;
- Android-Debug-Build;
- Release-Kandidaten-Preflight für `com.shareittoo.app`;
- bytegleicher Abgleich der fünf erzeugten Web-Assets mit den Quellen.

GitHub-Actions-Lauf `31316133047` ist für Implementierungscommit
`53dc61831a2d3bcc3c7ee9b487827e2ed0b1cfa9` vollständig grün:

- 34 von 34 Markenassets sowohl in Regression als auch im signierten
  Release-Preflight;
- 56 von 56 Backendtests einschließlich PostgreSQL-16;
- 167 von 167 Fluttertests und Analyzer-Basis 696 ohne neue Regression;
- Web-Debug und Android-Debug;
- signierter, commitgebundener Android-AAB und -APK;
- Sicherheits-, Secret-, Abhängigkeits-, Compose- und Caddy-Prüfungen;
- verifiziertes commitgebundenes API-Image veröffentlicht, aber nicht
  ausgerollt.

CI-Nachweis:
`https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31316133047`

## Verbleibende reale Gates

Vor Store-Freigabe werden Icon und Startbildschirm weiterhin auf einem echten
Android-Gerät, einem echten iOS-Gerät, im Play-Internal-Track und in TestFlight
visuell geprüft. Diese externe Abnahme wird nicht durch den technischen
Baustein vorgetäuscht. Produktion, Store-Upload, Stripe-Live und Echtgeld
wurden nicht verändert.
