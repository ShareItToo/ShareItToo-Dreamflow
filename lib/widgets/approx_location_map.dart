import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Lightweight static map preview that shows an approximate area circle.
///
/// The preview is rendered locally. Google Maps is opened only after the user
/// explicitly taps the external action.
class ApproxLocationMap extends StatelessWidget {
  final double? lat;
  final double? lng;
  final String label; // e.g., "Abholung in der Nähe von"
  final double height;

  const ApproxLocationMap({
    super.key,
    required this.lat,
    required this.lng,
    required this.label,
    // Slightly taller by default (approx. +2cm visual height on phones)
    this.height = 320,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasCoords = lat != null && lng != null;
    final border = BorderRadius.circular(16);

    final mapChild = Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.blueGrey.withValues(alpha: 0.30),
            Colors.blueGrey.withValues(alpha: 0.18),
          ],
        ),
      ),
      child: const Center(
        child: Icon(Icons.map_outlined, color: Colors.white70, size: 42),
      ),
    );

    return ClipRRect(
      borderRadius: border,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(children: [
          Positioned.fill(child: mapChild),

          // Approximate circle overlay (visual only; does not reveal exact address)
          Align(
            alignment: Alignment.center,
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.primary.withValues(alpha: 0.14),
                border: Border.all(
                    color: Colors.white.withValues(alpha: 0.22), width: 2),
              ),
            ),
          ),

          // Centered label near the bottom (mittig nach unten)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(12),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.10)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.place_outlined,
                      size: 16, color: Colors.white),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w800),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ]),
              ),
            ),
          ),

          // Open in Google Maps action (top-right)
          Positioned(
            right: 8,
            top: 8,
            child: Material(
              color: Colors.black.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(999),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: hasCoords ? () => _openInGoogleMaps(lat!, lng!) : null,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Row(mainAxisSize: MainAxisSize.min, children: const [
                    Icon(Icons.map_outlined, size: 16, color: Colors.white),
                    SizedBox(width: 6),
                    Text('Google Maps',
                        style: TextStyle(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _openInGoogleMaps(double lat, double lng) async {
    final url =
        Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }
}
