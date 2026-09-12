import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/local_principal_scope.dart';
import 'package:lendify/widgets/saved_cart_action_scope.dart';

/// Listing-to-cart entry only. This never creates a reservation or payment.
Future<void> saveListingToRentalCart(
  BuildContext context, {
  required Item item,
  required DateTimeRange range,
  LocalPrincipalActionOwner? expectedOwner,
}) async {
  LocalPrincipalActionOwner owner;
  try {
    // capture() pins the epoch synchronously and rejects a change during the
    // session read. Unreadable authentication is not an authenticated guest.
    owner = expectedOwner ?? await LocalPrincipalActionOwner.capture();
  } catch (_) {
    // No identified current owner means no remote write or account-bound UI.
    return;
  }
  final action = SavedCartActionScope(owner, isMounted: () => context.mounted);
  try {
    if (!await action.isCurrent()) return;
    // DataService requires an acknowledgement for the exact new item, range
    // and project; merely returning an unrelated nonempty cart is not success.
    await DataService.addRentalCartItem(
        item: item, range: range, expectedOwner: owner);
    if (!await action.isCurrent()) return;
    if (!context.mounted) return;
    await action.notice(context,
        icon: Icons.shopping_bag_outlined,
        title: 'Im Mietkorb – noch nicht reserviert',
        message:
            'Preis und Verfügbarkeit werden vor der Anfrage erneut geprüft.');
  } catch (_) {
    if (!context.mounted) return;
    await action.notice(context,
        icon: Icons.error_outline,
        title: 'Speichern im Mietkorb konnte nicht bestätigt werden',
        message:
            'Bitte lade den Mietkorb erneut, bevor du den Artikel noch einmal hinzufügst.');
  } finally {
    action.dispose();
  }
}
