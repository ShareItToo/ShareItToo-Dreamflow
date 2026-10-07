import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:lendify/config/private_pilot_config.dart';

class V52LegalAsset {
  final String part;
  final String title;
  final String assetPath;

  const V52LegalAsset({
    required this.part,
    required this.title,
    required this.assetPath,
  });
}

class V52LegalDocumentScreen extends StatefulWidget {
  final String title;
  final List<V52LegalAsset> documents;

  const V52LegalDocumentScreen({
    super.key,
    required this.title,
    required this.documents,
  });

  @override
  State<V52LegalDocumentScreen> createState() => _V52LegalDocumentScreenState();
}

class _V52LegalDocumentScreenState extends State<V52LegalDocumentScreen> {
  late final Future<List<({V52LegalAsset asset, String text})>> _loaded =
      _loadDocuments();

  Future<List<({V52LegalAsset asset, String text})>> _loadDocuments() async {
    final loaded = <({V52LegalAsset asset, String text})>[];
    for (final asset in widget.documents) {
      final html = await rootBundle.loadString(asset.assetPath);
      final pages = RegExp(
        r'<pre>([\s\S]*?)</pre>',
        caseSensitive: false,
      ).allMatches(html).map((match) => match.group(1) ?? '').toList();
      if (pages.isEmpty) {
        throw FormatException('Kein gebundener Rechtstext: ${asset.part}');
      }
      loaded.add((asset: asset, text: _decodeHtml(pages.join('\n\n'))));
    }
    return loaded;
  }

  String _decodeHtml(String value) => value
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: FutureBuilder<List<({V52LegalAsset asset, String text})>>(
        future: _loaded,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || snapshot.data == null) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Der gebundene Rechtstext konnte nicht sicher geladen werden.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(18),
            children: [
              Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: const Padding(
                  padding: EdgeInsets.all(14),
                  child: Text(
                    'V5.2-Entwurf – nicht veröffentlicht. Der Abschluss bleibt gesperrt, bis alle Pflichtangaben und die unveränderlichen Server-Snapshots vollständig bereitstehen.',
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                PrivatePilotConfig.v52DocumentVersion,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              for (final document in snapshot.data!) ...[
                const SizedBox(height: 14),
                Semantics(
                  header: true,
                  child: Text(
                    'Teil ${document.asset.part} – ${document.asset.title}',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
                const SizedBox(height: 8),
                SelectableText(document.text),
              ],
            ],
          );
        },
      ),
    );
  }
}
