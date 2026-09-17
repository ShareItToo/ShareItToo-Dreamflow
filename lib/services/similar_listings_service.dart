import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/listing_feedback_service.dart';

/// Resolves related public listings without treating a stale/hidden item as a
/// successful result. The selection is deterministic: exact subcategory first,
/// then the same category, with newer listings first within each group.
class SimilarListingsService {
  SimilarListingsService._();

  static List<Item> select({
    required Item current,
    required Iterable<Item> candidates,
    Set<String> hiddenItemIds = const <String>{},
    int limit = 24,
  }) {
    final visible = candidates
        .where((item) => item.id != current.id)
        .where((item) => item.status == 'active' && item.isActive)
        .where((item) => !hiddenItemIds.contains(item.id))
        .toList();
    final exact = visible
        .where((item) =>
            item.categoryId == current.categoryId &&
            item.subcategory == current.subcategory)
        .toList();
    final sameCategory = visible
        .where((item) =>
            item.categoryId == current.categoryId &&
            item.subcategory != current.subcategory)
        .toList();
    int newestFirst(Item left, Item right) =>
        right.createdAt.compareTo(left.createdAt);
    exact.sort(newestFirst);
    sameCategory.sort(newestFirst);
    return [...exact, ...sameCategory].take(limit).toList(growable: false);
  }

  static Future<List<Item>> load({
    required Item current,
    Future<List<Item>> Function()? catalogLoader,
    Future<Set<String>> Function()? hiddenLoader,
  }) async {
    final candidates = await (catalogLoader ?? DataService.getPublicItems)();
    final hidden =
        await (hiddenLoader ?? ListingFeedbackService.getHiddenItemIds)();
    return select(
        current: current, candidates: candidates, hiddenItemIds: hidden);
  }
}
