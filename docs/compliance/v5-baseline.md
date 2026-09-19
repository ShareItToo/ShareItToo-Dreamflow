# ShareItToo V5.1 – technische Ausgangslage

Stand: 16. August 2026  
Ausgangsstand: `4e33587162114e347dc7f15b2206a24a48085e96`
Bestehender interner Kandidat: `1.0.0+2026081509`, Commit `3fa045b98897f9551f91da932136c2b100b2d700`  
Status: interne Arbeitsgrundlage, `HOLD`

## Beweisgrenze

Der Quellstand und der bereits signierte interne Kandidat sind verschieden. Der
Kandidat darf nicht als Nachweis für spätere V5.1-Änderungen verwendet, unter
derselben Build-Identität ersetzt oder stillschweigend neu etikettiert werden.
Es wurde kein Produktions-, Echtgeld-, Store-Review- oder öffentlicher
Rolloutschritt durchgeführt.

## Preis- und Quote-Iststand

| Bereich | Tatsächlicher Stand | V5.1-Abweichung / Restarbeit |
|---|---|---|
| Backend-Quote | `backend/src/booking_domain.js` rechnet in Integer-Cent und berechnet 10 % auf den rabattierten Mietpreis. Migration 016 speichert jedes Serverangebot unveränderbar mit Nutzer, Anzeige, Zeitraum, Katalog-/Verfügbarkeitsrevision, Hash und zehn Minuten Ablaufzeit. | Rabatt-ID/-Label/-Finanzierungsquelle und die sichtbare Verwendung desselben Server-Snapshots im Checkout bleiben umzusetzen. |
| Backend-Workflow | `backend/src/booking_workflow.js` berechnet das Angebot serverseitig neu. Eine Privat-Pilot-Buchung verlangt zusätzlich die unveränderte, nicht abgelaufene Serverbindung; Nutzer, Anzeige, Zeitraum, Revisionen und Preis müssen exakt übereinstimmen. | Die allgemeine Domain führt weiterhin Delivery-, Pickup- und Expressfelder; der Privat-Pilot blockiert neue Nutzung, alte Daten- und Anzeigepfade bleiben zu auditieren. |
| Flutter-Preislogik | `lib/services/private_pilot_pricing.dart` bildet 10 % und Rabatte für die Anzeige nach. `DataService` holt unmittelbar vor jeder echten Remote-Buchungsanlage ein frisches Serverangebot und reicht ausschließlich dessen ID und Hash weiter. | Die sichtbare Checkout-Summe muss noch direkt aus demselben Server-Snapshot stammen; lokaler QA-Betrieb bleibt klar getrennt. |
| Checkout | `lib/screens/private_pilot_checkout_screen.dart` zeigt Mietpreis, Rabatt, Plattformbeitrag und Gesamt. | Weiter V4-Dokumente, fünf Erklärungen und alter Button; kein eigener Plattformvertrag und kein dauerhafter Vertragsbeleg. |
| Karten/Listen/Details | Mehrere Oberflächen zeigen Tages- oder Buchungspreise über lokale Modelle/Helper. | Alle Flächen müssen auf denselben sichtbaren Endpreis bzw. denselben gespeicherten Quote-Snapshot vereinheitlicht werden. |
| Storno/Belege | Centbasierte Teilbeträge und Stornoansichten existieren. | Nach-Mietbeginn-/No-Show-Pauschale, getrennte Miet-/SIT-Refunds und ausschließlich snapshotbasierte Belege fehlen. |

## Vertrag, Widerruf und Zustand

- App und Backend verwenden noch `V4-2026-08-14` und
  `V4-INTERIM-2026-08-15`.
- Fünf V4-Checkout-Erklärungen werden gespeichert; V5.1 verlangt zwei getrennte,
  nicht vorausgewählte Erklärungen mit exaktem Text, Version, Hash, Locale,
  Zeitpunkt und Client-Build.
- `legal_declarations` ist append-only, aber es gibt noch kein eigenes
  V5.1-Plattformvertragsobjekt, keinen vollständigen Dokument-Snapshot und keinen
  nachgewiesenen dauerhaften Beleg.
- Der Widerrufsweg speichert den Eingang, setzt aber weiterhin
  `pending_legal_process_decision`; die V5.1-Wirkung auf Buchungsstatus und
  getrennte Refundobjekte ist noch nicht umgesetzt.
- T0+5, vier Fotos je Richtung, QR-/Sechsstellencode und neutrale
  Rückgabebestätigung sind technisch weitgehend vorhanden, benötigen aber noch
  V5.1-Versionierung, E2E- und Kandidatenbeweis.

## Zahlung und Auszahlungen

- Backendtabellen und Workflows für Stripe/Marketplace-Zahlungen existieren.
- Der aktuelle sichere Betriebszustand ist Test/Memory; Echtgeld ist
  ausgeschaltet.
- Lokale Wallet-, IBAN-, PayPal-, Apple-Pay- und Google-Pay-Darstellungen sind
  kein Nachweis realer Providerfunktionen.
- Produktiv fehlen der tatsächlich unterzeichnete Marketplace-PSP-Vertrag, der
  bestätigte Geldfluss, Onboarding, Refund-/Chargeback-Regeln und vollständige
  Testabnahme. Bis dahin bleibt Echtgeld technisch und in der Darstellung
  gesperrt.

## Datenschutz- und Netzwerk-Inventar

| Dienst/Pfad | Iststand | Launchregel |
|---|---|---|
| Firebase Cloud Messaging | Bleibt bewusst integriert. Native Auto-Initialisierung Android/iOS aus; getrennte freiwillige Gerätewahl, Token-/Backendbereinigung und wiederholbarer FID-Löschpfad sind implementiert. | Provider-/Transfer-/Retention-/Store-Nachweise und neuer Kandidatenbeweis bleiben offen. |
| Firebase Crashlytics | Bleibt bewusst integriert. Native Sammlung aus; eigene freiwillige Wahl, Opt-out, ungesendete Reports und FID-Löschung sind implementiert. | Keine fachlichen Geheimnisse in Diagnosen; Provider-/Transfer-/Store-Nachweise und kontrollierter neuer Kandidatenbeweis bleiben offen. |
| Firebase Analytics / Ads | Analytics- und Werbesammlung aus; keine Ad-ID-Nutzung freigegeben. | Bleibt ohne eigene spätere Entscheidung aus. |
| Firebase Authentication | E-Mail/Telefon sowie vorbereitete soziale Providerpfade existieren. | Providerwahrheit, Löschung und Storeangaben müssen mit dem jeweils aktivierten Kandidaten übereinstimmen. |
| Google Places / Karten | Backendproxy und Karten-/Geocodingpfade existieren. | Standardmäßig nur bei vollständiger Providerkonfiguration und dokumentiertem Zweck/Transfer aktiv; manueller und interner Fallback erforderlich. |
| OSM/Nominatim | Quellpfade vorhanden. | Ohne vollständige Anbieter- und Datenschutzkonfiguration aus. |
| Externe Bilder | Historische Unsplash-URLs und generische externe Bildpfade sind noch auffindbar. | Produktionsreichweite entfernen oder kontrolliert übernehmen, prüfen, neu kodieren und autorisiert ausliefern. |
| Externe generative KI | Quell-/Proxyreste vorhanden, zentrale Produktfreigabe aus. | Für den Launch aus; lokale Heuristik darf nur als Preisassistent bezeichnet werden. |
| Google Fonts | Laufzeit- und Assetpfad gesondert prüfen. | Fonts lokal bündeln; kein Runtime-Fetch. |

## Rechtstexte und Betreiberangaben

- Rechtstexte sind aktuell als Dart-Inhalte und Arbeitsdateien vorhanden, aber
  noch nicht als vollständiges V5.1-Manifest mit unveränderlichen Hashes,
  Gültigkeit, öffentlichen URLs und Downloadbeleg gebunden.
- Bestätigte Arbeitsangaben: Walid Chraibi; Bernhaldenweg 37, 71579
  Spiegelberg-Jux, Deutschland; `contact@shareittoo.com`.
- Registerfirma, Registergericht, HRB, endgültige Providerverträge und
  produktiver PSP dürfen nicht erfunden werden. Ein späterer Produktivbuild muss
  bei fehlenden Pflichtangaben fail-closed stoppen.

## Verbindliche nächste Reihenfolge

1. V5.1-Dokument-/Entscheidungsregister und unveränderliche Vertragssnapshots
   einführen.
2. Plattformvertrag, zwei Erklärungen und dauerhaften Beleg vor der Mietanfrage
   serverseitig und idempotent binden.
3. Checkout und Vermieterannahme auf genau diese Versionen und denselben Quote
   umstellen; Echtgeld weiter aus.
4. Widerruf, getrennte Refundobjekte und Nach-Mietbeginn-/No-Show-Abrechnung
   implementieren.
5. alte Delivery-/Express-/Demo-Zahlungs- und externe Bild-/Netzpfade aus der
   Produktionsreichweite entfernen oder fail-closed quarantänisieren.
6. Rechtstexte, öffentliche Seiten, Datenschutz, Retention und Storeangaben
   synchronisieren.
7. alle automatisierten Gates, vier Gerätematrixfälle und eine vollständige
   Testbuchung nachweisen.
8. erst danach einen neuen Kandidaten mit neuer Build-Identität erstellen.

## Fortschreibung 16.118 – frisches Serverangebot

- `016_v51_booking_quotes.up.sql` führt unveränderbare, nutzergebundene und
  ablaufende Angebotsnachweise ein.
- Privat-Pilot-Buchungen scheitern geschlossen, wenn Angebot, Hash, Nutzer,
  Anzeige, Zeitraum, Katalogrevision, Verfügbarkeitsrevision oder Preis nicht
  mehr exakt stimmen.
- Der echte App-Remoteweg holt das Angebot unmittelbar vor der Anlage; lokale
  QA-Daten bleiben getrennt und erzeugen keinen falschen Servernachweis.
- Angebotsdaten sind im Kontoexport enthalten und als Transaktionsdatensatz im
  Aufbewahrungsinventar sichtbar. Die konkrete Löschfrist bleibt Teil der noch
  offenen Aufbewahrungsentscheidung.
- Checkout-Vertrag, exakt zwei V5.1-Erklärungen, dauerhafter Beleg und sichtbare
  Serverpreisbindung sind der nächste Baustein. Echtgeld bleibt aus.

## Fortschreibung 16.126 – unveränderliche Finanzdokumente

- Migration 020 führt append-only Finanzdokumente und Downloadereignisse ein.
  PostgreSQL erzwingt Quelltyp, Zielnutzer, Rollen und alle
  Summengleichungen.
- Dokumente entstehen nur aus vollständig erfasster Zahlung, erfolgreicher
  Erstattung oder tatsächlich ausgeführter Auszahlung. Eine bloße Buchung,
  Autorisierung, Stornierung oder ausstehende Auszahlung erzeugt keinen Beleg.
- Privater Mietpreis und SIT-Plattformgebühr bleiben getrennte Leistungen. SIT
  weist auf die private Miete keine pauschalen 19 % Umsatzsteuer aus; der
  Vermieter erhält keine SIT-Gebührenrechnung.
- Die Release-App lädt ausschließlich authentifizierte Serversnapshots. Vor
  lokaler PDF-Darstellung muss der exakte Serverartefakt-Hash übereinstimmen;
  unbekannte Typen, falsche Summen und beschädigte Snapshots werden nicht
  angezeigt. Lokale Belege existieren nur als klarer QA-Testmodus.
- Datenschutzexport und Aufbewahrungsinventar enthalten Dokumente und
  Ereignisse. Die konkrete Frist bleibt Teil der neun offenen
  Retention-/Löschentscheidungen.
- FCM-Push und Firebase Crashlytics bleiben unverändert erhalten: getrennte
  freiwillige Opt-ins, beide standardmäßig aus, keine Kopplung. Werbung,
  Marketingtracking, allgemeine Analytics und externe generative KI bleiben
  aus.
- Echtgeld, Migration/Deployment auf Staging oder Produktion, Store-Aktion und
  neuer Kandidat wurden nicht ausgelöst.

## Fortschreibung 16.127 – entscheidbare Löschmatrix

- Die neun offenen Retention-/Löschpunkte sind einzeln nach Empfehlung,
  Implementierungsstand, Autorität und verbleibender Freigabe klassifiziert.
- V5.1 verlangt eine Löschmatrix, enthält aber keine vollständigen Fristen.
  Deshalb bleiben alle neun formell offen; eine Empfehlung gilt niemals als
  Betreiber- oder Rechtsfreigabe.
- Abgelaufene Zugangsdaten und 14-Tage-Backuprotation sind technisch bzw.
  betrieblich entscheidungsreif. Transaktionen, Kommunikation, Moderation,
  Audit, inaktive Konten, externe Anbieter und Legal Hold brauchen getrennte
  Entscheidungen oder Klassifikationen.
- FCM-Push und Crashlytics bleiben ausdrücklich erhalten, unabhängig,
  freiwillig und standardmäßig aus. Push aktiviert Crashlytics nicht.
- Kategorieweise Löschung, Produktion, Store, öffentlicher Datenschutztext und
  der bestehende Kandidat bleiben unverändert beziehungsweise gesperrt.
