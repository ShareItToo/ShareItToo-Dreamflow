# B7 – Messaging-Umfang für den ersten Launch

Status: bewusst vereinfacht und technisch abgesichert.

## Im ersten Launch enthalten

- Textnachrichten mit serverseitiger Teilnehmer- und Sperrprüfung;
- Fotos aus Kamera oder Galerie;
- private Fotovorschau im Chat mit antippbarer Vollbildansicht;
- Standortfreigabe im Buchungskontext;
- verpflichtende Foto-Nachweise bei Übergabe und Rückgabe;
- Push-Benachrichtigungen ohne Nachrichteninhalt in Serverprotokollen;
- private Anhänge, die nur die beiden Chatteilnehmer abrufen dürfen.

Alle hochgeladenen Chatfotos werden serverseitig dekodiert, Metadaten werden
entfernt, Größe und Pixelzahl begrenzt und das Ergebnis neu als WebP erzeugt.
Unbekannte oder nur umbenannte Dateien werden abgelehnt.

## Bewusst erst nach dem Launch

- frei hochgeladene PDF-, Word-, ZIP- oder andere Dokumente;
- Chatvideos;
- Audio- und Sprachnachrichten.

Diese Formate vergrößern Angriffsfläche, Moderationsaufwand, Speicherbedarf und
Datenschutzumfang, ohne für die erste sichere Buchung erforderlich zu sein.
Von ShareItToo selbst erzeugte Rechnungen und Buchungsbelege als PDF bleiben
unverändert verfügbar; sie sind kein freier Chat-Upload.

Der automatisierte Test `validate_messaging_launch_scope.test.mjs` verhindert,
dass Dokument- oder Video-Uploads versehentlich in einen Launch-Kandidaten
gelangen, und prüft gleichzeitig, dass Text, Fotos und Standort erhalten
bleiben.
