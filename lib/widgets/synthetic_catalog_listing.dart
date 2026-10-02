import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/widgets/app_image.dart';

/// A server-classified test illustration, never a normal offer/owner claim.
class SyntheticCatalogCard extends StatelessWidget {
  const SyntheticCatalogCard({
    super.key,
    required this.item,
    this.publicCatalogImage = false,
  });
  final Item item;
  final bool publicCatalogImage;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(
            builder: (_) => SyntheticCatalogDetails(
                item: item, publicCatalogImage: publicCatalogImage),
          )),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(12),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Semantics(
                liveRegion: true,
                child: const Text(Item.syntheticCatalogNotice),
              ),
              const SizedBox(height: 8),
              const Text('Testansicht öffnen'),
            ]),
          ),
        ),
      );
}

class SyntheticCatalogDetails extends StatelessWidget {
  const SyntheticCatalogDetails({
    super.key,
    required this.item,
    this.publicCatalogImage = false,
  });
  final Item item;
  final bool publicCatalogImage;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Synthetische Testansicht')),
        body: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
              child: ListView(padding: const EdgeInsets.all(20), children: [
                Semantics(
                  liveRegion: true,
                  child: const Text(Item.syntheticCatalogNotice),
                ),
                const SizedBox(height: 16),
                Text(item.title, style: Theme.of(context).textTheme.titleLarge),
                if (item.photos.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Semantics(
                    image: true,
                    label:
                        'Testillustration, kein aktueller Produkt- oder Zustandsnachweis',
                    child: ExcludeSemantics(
                      child: Align(
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width >= 900
                                ? 640
                                : double.infinity,
                          ),
                          child: AspectRatio(
                              aspectRatio: 4 / 3,
                              child: AppImage(
                                  publicCatalogImage: publicCatalogImage,
                                  url: item.photos.first,
                                  fit: BoxFit.contain)),
                        ),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                const Text(
                    'Erfundene Testdaten. Das Bild belegt weder Eigentum noch '
                    'aktuellen Zustand oder reale Verfügbarkeit.'),
                const SizedBox(height: 16),
                const FilledButton(
                    onPressed: null,
                    child: Text('Nicht buchbar – nur Katalogtest')),
              ]),
            ),
          ),
        ),
      );
}
