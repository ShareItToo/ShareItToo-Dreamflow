# SIT Mission — Masterplan und Paket-1-Vertrag

## 1. Status, Geltungsbereich und Quellenbindung

Stand: 30.09.2026. **Autoritativer Planungs- und Zielvertrag für die Mission-Neuausrichtung; keine Implementierungs-, Rechts-, Zahlungs- oder Live-Freigabe.** Grundlage ist Walids verbindlicher, durch Sol übergebener Zielvertrag. Die technische Baseline wurde read-only auf dem sauberen Branch `codex/master-workflow-20260808`, Commit `7f3161b5e9099e70c6e4209047db7604d7220f75`, geprüft. Dieses Dokument ist das einzige neue Artefakt von Paket 1. Runtime, Flags, Migrationen und `docs/current_state.md` werden in diesem Paket nicht verändert.

Phase 0 Web/CORS bleibt ein eigenständiger Gate mit eigenem Source-, Artefakt- und Runtime-Nachweis. Ihr Fortschritt darf weder beschädigt noch als Mission-Freigabe ausgelegt werden. Staging ist nicht Produktion; Google Play bleibt außerhalb dieser Planungsausführung. Der Web-Build der Baseline setzt Google, Apple/Facebook, externe Listing-Assistenz und technische G3–G5-Oberflächen fail-closed. Funktionale Google-Web-Quellen ersetzen keine verifizierte Firebase-Web-Konfiguration und keine tatsächliche Anmeldung.

Führende geprüfte Quellen:

- [Blue-Ocean-Leitlinie vom 12.08.2026](BLUE_OCEAN_SHIFT_LAUNCH_2026-08-12.md): historischer Launchansatz, kein Beweis für Nachfrage oder Providerfreigaben.
- [Aktueller Bestand](../current_state.md), Abschnitte G3B–G3L, G4A/G4B, G5A/G5B, und [G3A-Entscheidung](../architecture/g3a-same-owner-multi-item-decision-2026-08-20.md): technische Fähigkeiten, Grenzen und gleichbleibende Einzelpositionen.
- [Projektregeln](../../AGENTS.md), [aktives Arbeitspaket](../current_work_package.md) und [Web-first-Phasenkapsel](../operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md).
- [G4A-Kern](../../backend/src/planner_core.js), [G4B-Inventar](../../backend/src/planner_inventory_workflow.js), [Routes](../../backend/src/app.js), [Web-Profil](../../tool/staging_web_contract.mjs).

Die neue Mission-Ausrichtung ersetzt für künftige Arbeit die reine Inserat-/Suchorientierung, nicht bestehende Vertrags-, Daten- oder Sicherheitsregeln. Ältere Launchwünsche nach Apple, Telefon und Kartenzahlung sind keine Aktivierungsautorität. Historische Evidenz bleibt unverändert. Neuere exakte Readbacks haben Vorrang vor historischen Statusangaben; Rechts-/Provider-Gates können nicht durch dieses Dokument aufgehoben werden.

## 2. Kategorie, Nichtkunden, Nutzen und Moat — Hypothesen

**Zielclaim:** „Nicht suchen. Vorhaben zeigen. Lokal erledigen.“ Das ist das angestrebte Nutzenversprechen, keine heutige Funktions- oder Erfolgsgarantie.

| Hypothese | Erwarteter Nutzen | Noch zu belegende Beobachtung |
| --- | --- | --- |
| Kategorie: vorhabenorientierte lokale Ausleihkoordination | Ein verständlicher Bedarfsplan statt einzelner Suchtreffer | Nutzer erreicht eine richtige, vollständige Planung mit weniger Aufwand als über den bestehenden Suchweg |
| Nichtkunden: seltene Käufer, informelle Nachbarschaftsleiher, wegen Aufwand Verzichtende | Bedarf klären, vorhandene Dinge nutzen, Unsicherheit sichtbar machen | Freiwillige, getrennt ausgewertete Nutzertests zeigen tatsächlichen Wechsel, nicht nur Zustimmung zum Konzept |
| Invisible Shelf erschließt bislang nicht angebotenes privates Inventar | Erst eine konkrete Nachfrage rechtfertigt einen Angebotsaufwand | Eigentümer bestätigt passende Angebote bei begrenztem Kontaktaufwand, ohne unerwünschte Veröffentlichung |
| Moat: geprüfte Bedarfs-/Kompatibilitätsdaten plus zuverlässige lokale Abwicklung | Wiederverwendbare Qualität und Verfügbarkeit, nicht bloß ein KI-Chat | Messbare Wiederverwendung und weniger Fehlzuordnungen; keine Exklusivität oder Marktführerschaft behauptet |

Es gibt hier keine Marktgrößen-, Wettbewerbs-, Umsatz-, Rechts- oder Nachhaltigkeitsbehauptung. Solche Aussagen brauchen später eigene aktuelle Quellen. Ein Moat ist eine zu prüfende Produktthese, kein Recht an privaten Inventardaten; exportierbare Daten und Löschrechte werden nicht eingeschränkt.

## 3. Verbindliche Begriffe und Produktgrenzen

**Mission:** Ein Nutzer beschreibt oder zeigt ein Vorhaben. SIT erzeugt daraus einen überprüften Fähigkeits-/Bedarfsplan, löst reale lokale Verfügbarkeit auf, aktiviert fehlendes Angebot datensparsam auf konkrete Nachfrage und führt bis Übergabe, Rückgabe und Abschluss. Vorhabenbeschreibung oder Foto ist zunächst Nutzereingabe, kein bewiesener Bedarf und kein Nachweis der Eignung eines Artikels. Pflichtbedarf, Menge, Zeitraum, Ortsgrenze und optionale Ergänzungen sind getrennt.

**Invisible Shelf:** Ein privates, niemals öffentlich sichtbares Inventar. Keine automatische Veröffentlichung, öffentliche Suche, öffentlich abrufbare Medien oder indirekte Offenlegung über Trefferzahlen. Konkrete Nachfrage darf nur eine eigentümerbestätigte, gegebenenfalls anfragebezogene Anzeige anstoßen. Eine freigegebene Anzeige ist ein separates, begrenzt sichtbares Objekt mit eigener Bestätigung; sie macht das private Inventar nicht öffentlich.

**Mission Quorum:** Eine Mission wird erst bindend, wenn alle erforderlichen Komponenten belegt und verfügbar sind und sämtliche wirksamen Annahme-/Vertragsvoraussetzungen erfüllt sind. Fehlender Bedarf, unbekannte Eignung, abgelaufene Bestätigung oder ungeklärte Verfügbarkeit bleiben sichtbar. Optionale Elemente werden ausdrücklich eingeschlossen oder ausgeschlossen, niemals still ersetzt. Eine Vorschau, ein Mietkorb oder eine Interessensbekundung ist kein Quorum.

**Neighborhood Flash Fleet:** Mehrere private Eigentümer dürfen Mengen oder Sets zu einer Mission beitragen. Eigentümer, Verträge, Annahme, Zahlung, Rückgabe, Auszahlung und Streit bleiben getrennt korrekt. Die Mission koordiniert diese Positionen; sie erfindet keinen gemeinsamen Zahlungsempfänger, kein künstliches Sammelinserat und keine einheitliche Verantwortlichkeit.

**FitCheck:** Überprüfbare Kompatibilitätsfragen treffen auf echte Artikelfakten mit Herkunft, Version und erforderlicher Bestätigung. Ergebnisse unterscheiden belegt passend, belegt unpassend und unbekannt. Keine erfundene Eignung, Sicherheit oder Verfügbarkeit, keine gefährliche freie KI-Beratung. Relevante unbekannte Pflichtfakten blockieren die Freigabe, nicht die Speicherung eines Entwurfs. Ein positives Ergebnis ist keine Sicherheitsgarantie.

Unveränderte SIT-Guardrails:

- Veröffentlichung braucht mindestens **1 aktuelles authentisches Listingfoto**. KI-generierte oder materiell täuschend veränderte Bilder sind kein Produkt- oder Zustandsnachweis. Entwurf und Veröffentlichung bleiben getrennt.
- Übergabe und Rückgabe brauchen **je 4 aktuelle Zustandsfotos der übergebenden Partei**, mit Bestätigung der Gegenpartei oder aktuellem Gegenfoto bei einer Abweichung. Bei mehreren Artikeln bleiben die Nachweise artikelbezogen.
- QR ist Standard; Fallback ist **exakt 6 Ziffern**.
- Keine Lieferung, kein Versand, kein Express; insbesondere kein bezahlter Transport als vermeintlicher Bestandteil einer Fleet.
- Storno: **mindestens 24 Stunden vor Beginn 100 %; weniger als 24 Stunden 50 %; ab Beginn 0 %**. Bestehende autoritative Berechnungs-/Erstattungsbasis und Zeitregeln bleiben erhalten, keine zweite Mission-Formel.
- **10 % Plattformbeitrag; Zahlung bei Annahme; Auszahlung nach Rückgabe.** Bestehende Auszahlungs-Holds, Streit- und Providerprüfungen bleiben wirksam; „nach Rückgabe“ verspricht keine sofortige Auszahlung.
- Keine Kaution, keine Versicherung, keine Schadengarantie. Fahrzeuge bleiben gesperrt; die aktuelle serverseitige Kategorie-/Regionenfreigabe bleibt bindend.
- Keine automatische Veröffentlichung oder erfundenen Fakten. Preis, Quote, Verfügbarkeit und Vertragsstatus bleiben serverautoritativ.
- Einzelbuchung bleibt rückwärtskompatibel. Historische Verträge, Preise, Zahlungen und Nachweise werden nicht neu interpretiert oder überschrieben.

Im aktuellen synthetischen Pilot bedeutet Zahlungsstatus nur den ausdrücklich benannten Testzustand: kein echtes Geld, kein realer Vertrag, keine Auszahlung. Die Zielregel für spätere reale Zahlungen aktiviert keinen Provider.

## 4. Nutzerreisen und Zustandsvertrag

### Hauptreise und Ausnahmewege

1. Nutzer legt eine Mission an; bestätigt oder korrigiert extrahierte Angaben. Manuelle Eingabe muss auch bei nicht verfügbarer Fotoanalyse funktionieren.
2. Geprüfte Fragen bestimmen Pflicht-/Optionalbedarf, Mengen und FitCheck. Unbekanntes bleibt unbekannt; kein automatischer Preis oder Sicherheitsrat.
3. SIT zeigt reale aktuelle Kandidaten und explizite Lücken. Nur nach zulässiger Nachfragefreigabe werden passende private Eigentümer begrenzt angesprochen.
4. Eigentümer sieht nur den notwendigen Anfrageumfang und bestätigt oder lehnt einzelne Beiträge ab. Keine Antwort bedeutet weder Zusage noch Verfügbarkeit. Teilablehnung macht betroffene Pflichtkomponenten unvollständig. Alternativen brauchen neue Prüfung und explizite Nutzerentscheidung.
5. Vor Bindung sieht der Nutzer jede Position, Eigentümerzuordnung, Gesamtpreis, Plattformbeitrag und getrennte Vertrags-/Annahmefolgen. Quorum wird gegen aktuelle serverseitige Fakten geprüft; der verbindliche Annahmeablauf bleibt bis zur Entscheidung D1/D2 und den Gates gesperrt.
6. Übergabe und Rückgabe führen jede Position durch die bestehenden QR-/Code- und Fotoregeln. Verschiedene Orte oder Termine werden ehrlich getrennt gezeigt.
7. Abschluss zeigt Rückgabe, eventuelle Erstattung, Auszahlungs-Hold und Streit je Position. Ein Streit sperrt nicht automatisch unbeteiligte Positionen; bestehende kontoweite Sicherheitssperren bleiben möglich.

Abbruch vor Bindung beendet den Entwurf oder die Anfrage ohne behauptete Stornierung eines Vertrags. Nach tatsächlich erfolgter Annahme gelten die bestehenden Storno-/Vertragsregeln je Position. Technischer Fehler oder fehlendes Mission-Quorum dürfen eine schon wirksame Einzelannahme nicht als „nie erfolgt“ darstellen. Keine automatische Stornierung, Erstattung oder neue Buchung als verdeckte Fehlerkorrektur. Nach Timeout zuerst autoritative Readback-/Replay-Klärung; Nutzer nicht zu einer möglicherweise doppelten Annahme auffordern.

### Zustandsmaschine: Mission und Komponenten getrennt

| Missionszustand | Eintritt / Wahrheit | Zulässiger nächster Schritt |
| --- | --- | --- |
| `geplant` | Nutzereingabe und Bedarfsrevision gespeichert; keine Bestandszusage | Prüfen → `unvollständig` oder `aktuell_belegt`; unverbindlich abbrechen |
| `unvollständig` | Mindestens eine Pflichtkomponente fehlt, ist unpassend, unbekannt, abgelehnt oder abgelaufen | Bedarf ausdrücklich korrigieren oder passende Fakten einholen; erneut prüfen |
| `aktuell_belegt` | Alle Pflichtkomponenten und relevanten Fit-Fakten sind für die konkrete Revision aktuell belegt; Zeitpunkt/Ablauf sichtbar | Gegatete Annahme koordinieren oder bei Drift zurück zu `unvollständig`; noch kein Vertrag durch diese Anzeige |
| `bindend` | Quorum-Revision und alle erforderlichen wirksamen Komponentenannahmen/-verträge sind serverseitig belegt | Bestehende Übergabe-, Rückgabe-, Storno- und Streitabläufe je Komponente |
| `abgeschlossen` | Jede Komponente besitzt ein nachvollziehbares terminales Ergebnis; keine offene Klärung oder unbekannte Zahlungsfolge | Historie lesen; neues Vorhaben als neue Mission, nicht Historie umschreiben |
| `abgebrochen` | Vor Bindung beendet oder nach Bindung alle betroffenen Positionen regelkonform beendet | Historie behalten; keine Wiederbelebung alter Zusagen |

`aktuell_belegt` ist eine zeitgebundene Beobachtung, keine Reservierung. Eine spätere Bestandsänderung nach Bindung erzeugt einen Störungs-/Klärungsfall, niemals eine Rückdatierung auf „unverbindlich“. Während Annahmeausführung wird „Freigabe läuft / Ergebnis wird geprüft“ angezeigt. Falls trotz Schutz ein Teil bereits wirksam gebunden ist, zeigt SIT **„teilweise bindend; Mission nicht vollständig“** mit den echten Komponentenfolgen; kein falsches Gesamterfolgssignal. Die legale und technische Vermeidung/Behandlung dieses Falls ist Gate D1/D2.

Komponenten behalten eigene belegte Zustände für Angebot, Annahme, Vertrag, Zahlung, Übergabe, Rückgabe, Erstattung, Auszahlung und Streit. Diese Achsen werden nicht in ein einziges „fertig“-Bool zusammengezogen. Ereignisse binden Mission, Bedarfsrevision, Position/Menge, verantwortlichen Eigentümer, konkrete Artikelidentität, Fakten-/Quote-/Verfügbarkeitsrevision und Akteur. Gleiche Operation plus gleicher Inhalt ist replaybar; abweichender Inhalt kollidiert.

## 5. Rollen, Berechtigungen und Datenminimierung

| Rolle | Darf | Darf nicht |
| --- | --- | --- |
| Missionsnutzer | Eigenes Vorhaben, freigegebene Kandidaten und eigene Komponentenfolgen sehen/ändern | Private Regale durchsuchen, fremde Missionen lesen, Eigentümerfakten bestätigen |
| Eigentümer | Eigenes Shelf verwalten; konkrete Anfrage ablehnen oder begrenzt freigeben | Andere Eigentümer vertreten oder fremde Zahlung/Annahme ändern |
| System | Geprüfte Regeln auswerten; autorisierte Kandidaten/Ablaufstände koordinieren | Veröffentlichen, Einwilligung/Passung erfinden oder historische Wahrheit umschreiben |
| Support | Fallbezogen über bestehende Berechtigung und Audit unterstützen | Allgemeiner Zugriff auf private Inventare, stille Freigabe oder Zahlungsersatz |

Shelf und Missionsmedien erhalten eigene zweckgebundene ACLs; kein Rückgriff auf öffentliche Listing-Uploads als private Ablage. Nachfrage zeigt nur benötigte Fähigkeit/Menge, begrenzte Region und Zeitraum, nicht vollständiges Regal, genaue Wohnadresse, private Vorhabenfotos oder unnötige Identitätsdaten. Anfragebezogene Anzeige braucht Empfänger-/Zweckbindung, Ablauf und Widerruf der künftigen Sichtbarkeit; bestehende notwendige Vertrags-/Auditdaten werden dadurch nicht gelöscht. Aufbewahrungsfristen und zulässige Nachweisaufbewahrung sind D3, keine erfundenen Zahlen. Export, Löschung, Medienbereinigung, Notification-Präferenzen, Rate-Limits und Anti-Enumeration gehören vor Aktivierung dazu. Principal-Wechsel, Logout und veraltete Antwort dürfen keine fremden Daten in UI oder Cache übernehmen. Keine neue Marketinganalyse oder Anbieterweitergabe.

## 6. Additive Architektur, Reuse und Migration

| Baustein | Wiederverwenden | Nicht voraussetzen / kleinste Ergänzung |
| --- | --- | --- |
| G4A | Deterministische Fragen, Prioritäten, Allowlist, Plan-Hash | Dauerhafte Mission-/Bedarfsrevision; Fotoausgabe erst nach Bestätigung |
| G4B / Projektkorb | Reale Kandidaten, Quote-Preview, Snapshot-Neuprüfung, owner-gebundene Persistenz | Ort/Entfernung, Mengen, Pflichtlücken und Gültigkeit ergänzen; keine Reservierungswirkung vortäuschen |
| G3B–G3D | Immutable Ereignisse, Idempotenz, item-spezifische V5.2-Bindungen und Nachweise | Bestehende Ein-Eigentümer-Constraints behalten; Mission referenziert getrennte gültige Komponenten |
| G5A | Geprüfte Zubehörvorschläge und explizite Eigentümerantwort | Keine automatische Bilderkennung, Shelf-Erfassung oder Veröffentlichung daraus ableiten |
| G5B | Versionierte Sets, Pflichtmitglieder, exakte Einzelquoten und Ortsprüfung | Mehr-Eigentümer-Fleet als Koordinator, nicht als aufgeweichtes G5-Set |
| Listing-Drafts | Feldherkunft, Bestätigungen, explizite Publikation, Account-Kontext | Eigenes dauerhaftes privates Shelf; die 24h-Draft-Recovery ist kein Inventarmodell |

Neue additive Objekte: Mission mit versioniertem Bedarf, private Inventarobjekte, Fit-Fakten, zweckgebundene Nachfrage/Freigaben und Mission-Komponentenbindungen mit append-only Ereignissen. Konkrete SQL-Namen/Nummern entstehen erst im jeweiligen freigegebenen Paket. Kein zweiter Quote-, Gebühren-, Storno-, Ledger- oder Vertragsmotor; Adapter nutzen die bestehenden autoritativen Workflows. Historische Einzelbuchungen benötigen keine Mission-ID und bleiben vollständig les-/abwickelbar. Eine neue optionale Relation ist kein historischer Backfill.

Bekannte Unterschiede müssen ausdrücklich entschieden werden: G4B „1-Stop“ prüft heute denselben Eigentümer, G5B zusätzlich den genauen Abholort. G4B liest höchstens 24 Kandidaten je Typ, keine globale Vollständigkeits-/Optimalitätsgarantie. Pilotregion ist kein Entfernungsmatch. Clientseitig neu erzeugte Planer-Projekt-IDs sind kein dauerhafter Mission-/Replay-Schlüssel. Manuelle Projekte, Planer und Sets werden über Adapter verbunden, nicht parallel neu gebaut. Gegateter Code ist nicht automatisch tot; Entfernung erst nach Aufrufer-, Daten- und Kompatibilitätsnachweis.

Migration folgt Expand → geprüfte Adapter → begrenzte Aktivierung. Erst reale PostgreSQL-Tests für Owner-/FK-/Ereignisconstraints, konkurrierende Änderungen, Export/Löschung und Altbestand; dann getrennte Staging-Migration mit verifiziertem Backup/Restore und kompatibler Recovery-Version. Migrationen 028–031 und spätere Historie werden nicht umgeschrieben. Rollback deaktiviert zunächst nur neue Einstiege und schützt laufende Komponenten; historische Nachweise bleiben. Down-Migrationen mit belegten Daten werden nicht erzwungen. Ein UI-Rollback kann weder Verträge noch erfolgte Provideroperationen rückgängig machen.

## 7. Messsystem: Ziel, Simulation und Beobachtung getrennt

Jede Kennzahl trägt Evidenzklasse (`synthetisch`, `beobachtet_staging`, `beobachtet_freigegebener_pilot`), Source/Artefakt, Zeitraum, Stichprobengröße, Nenner, Fehler-/Abbruchfälle und Erhebungsmethode. Technischer PASS ist keine Nachfrage, Conversion oder real abgeschlossene Mission. Die Baseline enthält keinen gemessenen Mission-Markterfolg. Keine synthetischen Personen in Live-KPIs.

| Messgröße | Definition / gewünschte Richtung |
| --- | --- |
| Planungsaufwand | Zeit vom bestätigten Einstieg bis zum nutzerbestätigten Bedarf; Abbrüche separat, nicht aus dem Nenner entfernen |
| Pflichtabdeckung | Belegte erforderliche Einheiten / erforderliche Einheiten je Revision; unbekannt zählt nicht als belegt |
| Quorum-Zuverlässigkeit | Nach Neuprüfung unverändert belegte Missionen / geprüfte Missionen; Drift und Teilbindung separat |
| Angebotsaktivierung | Explizit freigegebene passende Beiträge / zugestellte berechtigte Nachfragen; Ablehnung/Nichtantwort getrennt |
| Fehlpassung und Aufwand | Verifizierte FitCheck-Korrekturen, unnötige Kontakte und Supportfälle pro begonnenem Vorhaben |
| Abwicklung | Übergabe/Rückgabe mit allen Pflichtnachweisen / tatsächlich begonnene Übergaben/Rückgaben; Abschluss und Auszahlung getrennt |
| Schutzqualität | Unautorisierte Offenlegung, Auto-Publikation, falscher Bindungsstatus, doppelte Annahme oder reale Testzahlung: keine akzeptierte Verletzung |

Produkt-Zielschwellen werden vor einem begrenzten Nutzertest mit Nenner und Stopregel beschlossen (D5), nicht nach Ergebnis angepasst. Funnel-Telemetrie bleibt minimiert; Rohfotos, Freitext, genaue Orte und persönliche Inventare sind keine Standard-Analytics. Sicherheits-/Auditdaten werden getrennt behandelt.

## 8. Phasen 0–5 und erste Welle

| Phase | Ergebnis / Exit-Gate |
| --- | --- |
| 0 — bestehender Web/CORS-Gate | Eigene exakte Source-/CI-/Artefakt-/Rollback-/Readback-Beweise; keine Mission-Aktivierung |
| 1 — Vertrag und Baseline | Paket 1 akzeptiert; Begriffe, Zustände, Grenzen und offene Entscheidungen verzeichnet |
| 2 — unverbindlicher Mission-Vertikalschnitt | Persistenter Bedarf, echte Lücken, manuelle Korrektur, unbekannter Fit und sicherer Restart; nur synthetisch belegt |
| 3 — privates Angebot und FitCheck | ACL/Privacy/Retention, gezielte Nachfrage, ausdrückliche Freigabe und Faktengrundlage geprüft; begrenzter Staging-Flow |
| 4 — Quorum/Fleet und vollständige Abwicklung | D1/D2 entschieden; getrennte Komponenten bis Übergabe/Rückgabe/Streit synthetisch und mit echter DB geprüft; keine reale Zahlung dadurch freigegeben |
| 5 — gesondert freigegebener Pilot | Legal/Payment/Privacy/Security/Operations plus exakte Release-/Provider-/Gerätebeweise; erst dann begrenzte beobachtete Nutzung und Kill/Pivot-Auswertung |

Die erste Welle besteht aus genau sieben begrenzten Paketen. Jedes endet mit einem Review; spätere Phasen werden nicht durch ihre Nennung ausführbar.

### P1 — dieser Masterplan und Zustandsvertrag

- **OBJECTIVE:** Ein gemeinsamer A-bis-Z-Vertrag ohne Runtime-Wirkung.
- **SOURCE:** Baseline-HEAD, bindender Zielvertrag und Quellen aus Abschnitt 1.
- **ACCEPTANCE:** Fünf Begriffe, Guardrails, Teilbindung, Rollen, Reuse, Gates, Entscheidungen und Phasen in genau diesem Dokument; Hypothesen gekennzeichnet.
- **EXCLUSIONS:** Kein Runtime-/Flag-/Migrations-/Live-/`current_state`-Edit.
- **VERIFY:** Lokale Links, Pflichtbegriffe, Source-Grenze und Diff prüfen; Sol-Review.

### P2 — dauerhafter unverbindlicher Missionsbedarf

- **OBJECTIVE:** Eine eigene Mission-/Bedarfsrevision anlegen, laden und korrigieren.
- **SOURCE:** G4A, G2-Projektkorb, principal-gebundener Planner-Gateway.
- **ACCEPTANCE:** Stabile ID, Owner-Isolation, Pflicht/Optional/Menge, idempotente Revision und ehrlicher Entwurfszustand; alte Mietkörbe unverändert.
- **EXCLUSIONS:** Keine Buchung, Reservierung, freie KI oder automatische Fotoauswertung.
- **VERIFY:** Domain-/HTTP-Tests, Restart/Accountwechsel, additive PG-/Altbestandsprüfung.

### P3 — ein privates Shelf-Objekt

- **OBJECTIVE:** Ein Eigentümer speichert und löscht genau sein privates Inventarobjekt.
- **SOURCE:** Listing-Draft-Feldherkunft, bestehende Medien-/Owner-Prüfung und Retention.
- **ACCEPTANCE:** Kein öffentlicher Zugriff oder Suchtreffer, kein Autopublish; private Fotos, Export/Löschung und fremder Owner negativ geprüft.
- **EXCLUSIONS:** Keine Nachfrageverteilung, Batch-Importe oder neue Retention-Fantasiefristen.
- **VERIFY:** ACL-/Enumeration-/Medien-/Accountwechsel-Tests und D3/D4-Review.

### P4 — ein begrenzter FitCheck

- **OBJECTIVE:** Einen freigegebenen Bedarfstyp gegen belegbare Artikelmerkmale prüfen.
- **SOURCE:** G4A-Fragen/Sicherheitsregeln und bestätigte Draft-Feldherkunft.
- **ACCEPTANCE:** Version/Herkunft/Einheit; passend/unpassend/unbekannt; relevante fehlende Pflichtfakten blockieren Freigabe, manuelle Korrektur bleibt möglich.
- **EXCLUSIONS:** Keine freie Gefahrenberatung, Sicherheitsgarantie oder KI-erfundene Fakten.
- **VERIFY:** Vollständige begrenzte Antwortmatrix, widersprüchliche/veraltete Fakten, UI-Zugänglichkeit.

### P5 — ehrliche Mission-Inventarauflösung

- **OBJECTIVE:** Eine Mission mit echten lokalen Kandidaten und sichtbaren Lücken auflösen.
- **SOURCE:** G4B, autoritative Quote-Preview, G5B-Ortsprüfung.
- **ACCEPTANCE:** Pflicht-/Optionalabdeckung und Mengen korrekt; keine doppelte Belegung eines physischen Artikels; Orts-/Snapshot-Drift und begrenzte Suche sichtbar.
- **EXCLUSIONS:** Keine Reservierung, Zahlung, Optimalitätsbehauptung oder neue Preislogik.
- **VERIFY:** Resolver-/HTTP-/PG-Tests, leeres Inventar, Kandidatenlimit, Konkurrenz und stale Snapshot.

### P6 — eine konkrete Nachfrage und explizite Freigabe

- **OBJECTIVE:** Eine fehlende Komponente an einen berechtigten Eigentümer herantragen.
- **SOURCE:** P3/P5, G5A-Eigentümerantwort und bestehende transaktionale Benachrichtigungsgrenzen.
- **ACCEPTANCE:** Datenminimaler Anfrageumfang, Ablehnung/Nichtantwort/Ablauf, widerrufbare anfragebezogene Anzeige; Shelf bleibt privat; Replay erzeugt keine Duplikate.
- **EXCLUSIONS:** Kein Broadcast, Marketing, Auto-Publikation oder automatische Zusage.
- **VERIFY:** Empfänger-/Zweckbindung, Rate-Limit, Replay, Widerruf und kein Public-Leak; D3/D4.

### P7 — synthetischer Quorum-/Fleet-Koordinator

- **OBJECTIVE:** Vollständigkeit und getrennte Komponentenfolgen über mehrere Eigentümer beweisen.
- **SOURCE:** P2/P4/P5/P6, G3-Ereignisse/Idempotenz und unveränderte Einzelworkflows.
- **ACCEPTANCE:** Keine Mission-Bindung ohne alle Pflichtnachweise; Teilablehnung, Konkurrenz, Timeout und Replay ehrlich; komponentengenaue Übergabe/Rückgabe/Streit-Projektion.
- **EXCLUSIONS:** Kein realer Vertrag/Provideraufruf, keine Sammelzahlung, kein Aufweichen der G3/G5-Same-owner-Constraints; D1/D2 bleiben Voraussetzung echter Bindung.
- **VERIFY:** Isolierte PG-/Fehlermatrix und zugänglicher Web-Vertikalschnitt mit synthetischen Daten, 4+4 Nachweisen, QR/6-Ziffern-Fallback und exakter Bereinigung.

Danach werden die fehlenden Phase-4/5-Schritte einzeln beauftragt: verbindlicher Annahmeadapter, autorisierte Zahlungsintegration, operative Ausnahmeabwicklung und eng begrenzte Pilotabnahme. Kein Sammelpaket „alles produktiv schalten“.

## 9. Risiko-, Annahmen- und Entscheidungsregister

| ID / Status | Risiko oder offene Entscheidung | Gate / erforderlicher Nachweis |
| --- | --- | --- |
| D1 — offen | Wann genau dürfen getrennte Annahmen rechtlich wirksam werden, ohne ein falsches Gesamt-Quorum? | Prospektiver Vertrags-/Einwilligungsablauf fachlich prüfen; G3L-Draft ist keine Rechtsfreigabe |
| D2 — offen | Konkurrenz, Verfügbarkeits-Hold, Timeout, teilweise wirksame Annahmen und getrennte Zahlungen | Fail-closed Koordinationsvertrag; reale PG-Concurrency-/Replay-Beweise, providergebundene Idempotenz; keine behauptete verteilte Atomizität |
| D3 — offen | Private Inventare, Nachfragezielgruppen, Zwecke, Aufbewahrung, Export und Widerruf | Privacy-/Retention-Entscheidung und geprüfte ACL-/Medien-Datenflüsse vor Verarbeitung echter Daten |
| D4 — offen | Profil-/Inventar-Enumeration, Anfrage-Spam, falsche Artikelfakten, gefährliche Fit-Aussagen | Threat Model, begrenzte Merkmalsfreigabe, Fakten-/Missbrauchstests und Supportweg |
| D5 — offen | Lokale Nachfrage, ausreichendes Angebot und Aktivierungsnutzen sind Hypothesen | Vorab definierter begrenzter Nutzertest mit Schwellen, Nennern und Stopregel; keine Erfolgszahl vorhanden |
| D6 — offen | Web-first-Einstieg liegt außerhalb des heutigen ausgeschalteten G3–G5-/Stage-A-Profils | Eigenes explizites Scope-/Build-/Backend-Gate; keine beiläufige Aktivierung alter Flags |
| D7 — offen | Koordination mehrerer Abholorte/Termine erhöht Aufwand | Ehrliche Orts-/Terminanzeige und Nutzertest; keine Lieferung oder künstliche 1-Stop-Behauptung |
| D8 — verbindlich | Einzelbuchung und Historie bleiben autoritativ | Additive Adapter/Constraints, Altbestands-/Rollback-Test; kein Rewrite |

Paketverantwortung: Walid bestimmt das Produktziel; Sol steuert und prüft jeweils ein begrenztes Paket, Luna liefert Umsetzung und reproduzierbare Belege. Gemini prüft nur enge kritische Rechts-/Payment-/Privacy-Entscheidungen mit frisch geöffneten Primärquellen und vollständigem Quellenregister. Ein Gemini-PASS ist keine professionelle Rechtsfreigabe; eine tatsächlich erforderliche Fach- oder Betriebsfreigabe bleibt als sachlicher Gate dokumentiert. Walid wird nur für eine unvermeidbare physische Handlung einbezogen, nicht für online lösbare Routineentscheidungen.

## 10. Harte Gates, Kill/Pivot und Nicht-Ziele

**Legal:** D1, getrennte Vertragsstruktur, Annahme-/Teilablehnungsfolgen, Storno-/Dokumentbindung und Streitpfad geprüft; keine Rechtsfreigabe behauptet. **Payment:** Zahlung bei Annahme, getrennte Empfänger/Positionen, unveränderte 10%-/Erstattungs-/Ledgerregeln und Auszahlung nach Rückgabe plus Holds; eigener autorisierter Sandbox-/Provider- und später Realgeld-Gate. Memory ist kein PSP-Beweis. **Privacy:** D3 einschließlich privater Medien, Kontaktzweck, Export/Löschung und Disclosure-/Retention-Quellenbindung. **Security:** D4 plus Session-/Owner-Isolation, Konkurrenz, Replay, Drift und Leak-Negativtests. **Operations/Release:** Support-/Incident-/Recovery-Verantwortung, exakte CI/Artefakte, rollbackfähige Staging-Abnahme und separate native/Store-Gates. Keine flächige Aktivierung.

Sofortiger Stop der betroffenen neuen Lane bei privater Offenlegung, unerlaubter Publikation, falscher Bindungs-/Zahlungsbehauptung, Doppelannahme, Verlust von Nachweisen oder nicht sicher rekonstruierbarem Zustand. Laufende reale Alt-Komponenten werden weiter sicher betreut; Stop bedeutet weder Daten löschen noch still Verträge aufheben. Ursache belegen, begrenzten Fix erstellen und unabhängig erneut prüfen.

Pivot statt Regelaufweichung, wenn der vorab begrenzte Test keinen ausreichenden Nutzen zeigt: auf eine engere Vorhabensklasse/Region reduzieren, Nachfragekontakte begrenzen oder beim unverbindlichen Planer bleiben. Kein ausreichendes Angebot ist ein ehrlicher Mangel, kein Grund für Fake-Inventar, erfundene Eignung oder Ausweitung gesperrter Kategorien. Wird D1/D2 nicht tragfähig gelöst, bleibt Mission unverbindliche Koordination über den bewährten Einzelweg; Claim und UI müssen diesen eingeschränkten Umfang ehrlich nennen.

Nicht-Ziele: Big-Bang-Rewrite, allgemeiner KI-Berater, öffentliche Shelf-Suche, automatische Veröffentlichung, neue Gebühren/Versicherung/Garantie, Lieferung, Fahrzeuge, Business-Mischgruppen, gesamthafte Zahlungs-/Streitverrechnung, Marketingnetzwerk, landesweiter Rollout oder Änderung historischer Daten. Dieses Dokument autorisiert weder Deployment noch Runtime-Flags, Provider-Aktivierung, echte Konten/Einladungen, Geldbewegungen oder Veröffentlichung.

**Paket-1-Abnahme:** Genau dieses Artefakt, valide lokale Quellenlinks, vollständige Begriffs-/Guardrail-Abdeckung, nachvollziehbare Source-Grenze, offene Gates ohne Freigabefiktion und sauberer Diff. Nächster Schritt ist Sol-Review, anschließend gegebenenfalls separat P2; Phase 0 läuft ausschließlich in ihrem eigenen Gate.
