# SIT Blue Ocean Shift – Umsetzung bis zur ersten echten Buchung

Status: verbindliche Produktleitlinie für Pilot und ersten Launch.

## Neue Kategorie und Nutzenversprechen

SIT tritt nicht als weitere Kleinanzeigen-App an. SIT macht privates lokales
Ausleihen zu einem geführten Mietvorgang:

> Sicher leihen statt kaufen – in deiner Nähe, mit fairem Preis und geführter
> Übergabe und Rückgabe.

„Sicher“ darf in App und Marketing nur zusammen mit den tatsächlich
implementierten Kontrollen erklärt werden. SIT bietet zum Launch ausdrücklich
weder Kaution noch Schutz- oder Versicherungsprodukt an.

## Gegen welche Alternativen SIT wirklich antritt

- Neukauf eines selten benötigten Gegenstands;
- Gebrauchtkauf und späterer Wiederverkauf;
- informelles Ausleihen bei Freunden oder Nachbarn;
- klassische gewerbliche Verleiher;
- freie Absprachen über Kleinanzeigen oder Gruppen;
- vollständiger Verzicht, weil private Miete unsicher oder umständlich wirkt.

SIT gewinnt nicht über die größte Inseratsmenge oder den niedrigsten Preis,
sondern über Einfachheit, nachvollziehbare Preise, lokale Verfügbarkeit und
eine dokumentierte Transaktion.

## Fokussierter Pilot

Der erste Pilot startet in genau einem zusammenhängenden Gebiet. Die genaue
Zone wird vor der Anbietergewinnung anhand der verfügbaren Startanbieter
festgelegt; Zielradius sind ungefähr 20 bis 30 Kilometer. Eine deutschlandweit
leere Suche wird nicht als Wachstum verkauft.

Priorisierte Startbereiche:

1. Werkzeuge und Heimwerken;
2. Reinigung und Haushalt;
3. Camping, Freizeit und Outdoor;
4. Kamera, Creator und kleinere Eventausrüstung.

Andere technisch vorhandene Kategorien dürfen als Entwurf bestehen, werden
im Pilot aber erst aktiviert, wenn lokale Nachfrage, Haftungsregeln und
Supportfähigkeit nachgewiesen sind. Fahrzeuge, Waffen, Medikamente,
sicherheitskritische Schutzausrüstung und unvertretbar teure Luxusgüter bleiben
ausgeschlossen.

## Der eine Hauptablauf

1. Anbieter fotografiert den Gegenstand.
2. SIT erzeugt einen bearbeitbaren Inseratsentwurf und eine begründete
   Preisspanne.
3. Der Gegenstand erscheint mit echter Verfügbarkeit in der lokalen Suche.
4. Der Mieter sieht Gesamtpreis und Gebühren vor seiner Zusage.
5. Zahlung und Buchungsstatus werden serverseitig bestätigt.
6. SIT führt beide Rollen durch QR-/Code-Übergabe und Zustandsfotos.
7. SIT führt beide Rollen durch QR-/Code-Rückgabe und Zustandsfotos.
8. Auszahlung, Rückerstattung, Bewertung oder Klärungsfall folgen aus dem
   dokumentierten Ergebnis.

Jeder Bildschirm muss erkennbar zeigen, was erledigt ist und was als Nächstes
geschieht. Freie Nebenwege dürfen den Hauptablauf nicht umgehen.

## Eliminieren, reduzieren, erhöhen, erschaffen

### Eliminieren

- Dokument-, Video- und Audio-Uploads im Launch-Chat;
- externe Zahlungsabsprachen als vorgesehener Produktweg;
- doppelte Formulare und wiederholte Bestätigungen ohne Sicherheitsnutzen;
- Kautions-, Schutz- oder Versicherungsversprechen;
- Startkategorien ohne operativ beherrschbares Risiko.

### Reduzieren

- Pflichtfelder und Zeit bis zum ersten Inserat;
- offene Preisverhandlung;
- Anzahl der Startregionen und Startkategorien;
- visuelle und funktionale Überladung;
- manuelle Supportschritte ohne klare Entscheidungshilfe.

### Erhöhen

- Transparenz von Gesamtpreis, Gebühr und Rückerstattung;
- Qualität und Aktualität lokaler Verfügbarkeit;
- Sichtbarkeit der Vertrauenskette;
- Geschwindigkeit von Foto zu veröffentlichungsfähigem Inserat;
- Nachweisbarkeit von Übergabe, Zustand und Rückgabe;
- Klarheit bei Stornierung, Verspätung, Schaden und Streit.

### Erschaffen

- erklärbarer KI-Preisvorschlag mit manueller Kontrolle;
- geführte QR-/Code-Übergabe und -Rückgabe;
- verpflichtende, private Zustandsfotos;
- sichtbare Statuskette: verifiziert, bezahlt, übergeben, zurückgegeben;
- lokale Suche „in meiner Nähe und im Zeitraum verfügbar“;
- dokumentierte Übergabe und Rückgabe ohne behauptete Absicherung.

## Launchumfang

Erforderlich:

- E-Mail- und Telefonverifizierung;
- Google- und Apple-Anmeldung, Facebook nur bei vollständig geprüftem Setup;
- Inserat mit Fotos, Standort, Verfügbarkeit und KI-Preisorientierung;
- lokale Suche und passende Zeitfilter;
- Textchat, private Fotos und Standortfreigabe;
- transparente Preis- und Gebührenübersicht;
- sichere Kartenzahlung; verfügbare Apple-/Google-Wallets über Stripe;
- geführte Übergabe und Rückgabe mit Fotos und QR/Code;
- Push, Bewertung und einfacher Klärungsweg.

Nicht erforderlich für die erste Buchung:

- freie Dokumente, Chatvideos, Audio oder Sprachnachrichten;
- Werbung oder Abonnements;
- PayPal und Klarna zusätzlich zum geprüften Stripe-Pfad;
- landesweite Kategoriedichte;
- soziale Feeds oder Follower-Funktionen.

## Umsetzungsreihenfolge

1. Aktuellen sicheren Hauptablauf auf Staging bündeln und auf zwei Rollen
   vollständig testen.
2. Social Login, Maps, Telefonverifizierung und Stripe-Testzahlung aktivieren.
3. Die Statuskette in Suche, Buchung und Chat einheitlich sichtbar machen.
4. Einen frischen Android-Kandidaten aus exakt demselben Serverstand bauen.
5. Mit wenigen echten Pilotanbietern ein dichtes Startangebot in der
   Pilotzone vorbereiten.
6. Die erste kontrollierte reale Buchung vollständig durchführen und auswerten.
7. Erst danach Kategorien, Region oder Zahlungsmethoden erweitern.

## Messbare Pilotkriterien

- Median Foto bis vollständiger Inseratsentwurf: höchstens 3 Minuten;
- mindestens 20 buchbare Qualitätsinserate je aktiver Startkategorie in der
  Pilotzone vor breiter Nutzerwerbung;
- Suchanfragen mit mindestens einem passenden verfügbaren Ergebnis: mindestens
  70 Prozent im beworbenen Gebiet;
- begonnene Buchungen ohne Support bis zur bestätigten Übergabe: mindestens
  85 Prozent;
- bestätigte Übergaben mit den erforderlichen Zustandsfotos: 100 Prozent;
- abgeschlossene Rückgaben mit dokumentiertem Ergebnis: 100 Prozent;
- P0-Sicherheits- oder Zahlungsfehler: 0;
- Streitfälle, Abbrüche und Zeit bis zur Lösung werden vollständig erfasst,
  ohne Erfolgswerte vorzutäuschen.

## Entscheidungsfilter für neue Funktionen

Eine neue Launchfunktion wird nur umgesetzt, wenn sie mindestens eine Frage
klar mit Ja beantwortet:

1. Kommt dadurch schneller eine passende Buchung zustande?
2. Wird die Transaktion dadurch sicherer oder glaubwürdiger?
3. Wird Übergabe oder Rückgabe dadurch einfacher oder besser nachweisbar?
4. Wird ein bisheriger Nichtkunde dadurch bereit zu mieten?

Wenn keine Antwort eindeutig Ja lautet, bleibt die Funktion im Nach-Launch-
Backlog. Diese Regel gilt auch dann, wenn die Funktion technisch leicht wäre.
