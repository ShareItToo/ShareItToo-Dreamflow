# RW20D — Play-Draft-Wahrheit zeitlich reconciliert

Status: **TECHNISCH GESCHLOSSEN — EXAKT VERIFIZIERT — RELEASE-GATE GESCHLOSSEN**

## Befund

Der historische BUILD_READY-Snapshot vom 26.08.2026 sagte korrekt, dass beim
Kandidatenbau noch kein Play-Upload erfolgt war. Nach dem spaeteren, vom
MacBook-Codex uebergebenen Upload als inaktiver Internal-Entwurf blieb das
kanonische Upload-Handoff jedoch auf `wartet auf Upload` stehen. Damit konnten
aktuelle Leser zwei widerspruechliche Antworten erhalten.

## Korrekturmodell

RW20D veraendert keine historische Tatsache. BUILD_READY bleibt ein expliziter
Build-Zeitpunkt-Snapshot. Das Kandidatenmanifest fuehrt daneben einen klar
getrennten post-build Play-Zustand. Das kanonische Upload-Handoff beschreibt nun
den owner-gemeldeten aktuellen Zustand: exakt gebundener AAB verarbeitet und als
Entwurf gespeichert, aber weder aktiviert noch veroeffentlicht oder zur Review
gesendet.

Der neue Validator verlangt gleichzeitig:

- der historische Snapshot bleibt `kein Upload beim Build`;
- RW20A bleibt die Quelle des spaeteren owner-gemeldeten Draft-Uploads;
- Kandidatenmanifest und Upload-Handoff stimmen mit RW20A ueberein;
- `PLAY_UPLOAD_APPROVED` ist nur fuer den exakten AAB verbraucht;
- `GOOGLE_PLAY_INTERNAL_RELEASE_GO` bleibt nicht erteilt;
- Altbuild `2026081509` bleibt aktiv und Kandidat `2026082601` wird auf dem
  OnePlus weiterhin nicht als installiert oder getestet behauptet;
- keine Identitaet, private URL, Credential-, Geraete- oder Netzwerkkennung
  gelangt in die Evidence.

## Ausfuehrungsgrenze

Dieses Paket liest und korrigiert ausschliesslich Repository-Evidence. Es greift
nicht auf Google Play oder ein Geraet zu und veraendert keine Testerliste,
Release-, Produktions-, Payment-, Provider-, Firebase-, Cloud-, VPS-, DNS- oder
PR-Merge-Einstellung. Der naechste reale Schritt bleibt unveraendert
`GOOGLE_PLAY_INTERNAL_RELEASE_GO` im Owner-Zeitfenster.

## Verifikation

Implementierungs-HEAD `9fdca671b174b5b521fe797f202ffeca07abd595`
bestand die vollstaendige lokale technische Regression mit Standardparallelitaet:
624 Flutter-Tests plus drei dokumentierte Profilausnahmen, Analyzer ohne neuen
Befund, 1.991 Tool-Tests, Web/Wasm, Loopback-Smoke, Android-Build mit 448 Tasks
und minSdk 24 sowie den Resource Guard. Kein Retry-, Timing-, Rate-Limit- oder
Parallelitaets-Workaround wurde eingefuehrt.

Exakt derselbe HEAD bestand GitHub Regression `33033342045` einschliesslich
Clean-Checkout-Reproduzierbarkeit sowie CodeQL `33033342059`. Der optionale
API-Image-Publish blieb erwartungsgemaess uebersprungen; es bestehen null offene
Code-Scanning-Alerts.
