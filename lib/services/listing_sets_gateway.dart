import 'package:lendify/models/listing_set.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';

abstract class ListingSetsGateway {
  Future<List<ListingSetOwnerView>> loadOwnerSets(AuthSessionOwner owner);

  Future<ListingSetOwnerView> create({
    required AuthSessionOwner owner,
    required String title,
    required ListingSetKind kind,
    required List<String> listingIds,
  });

  Future<ListingSetOwnerView> end({
    required AuthSessionOwner owner,
    required ListingSetOwnerView set,
  });

  Future<ListingSetDiscovery> discover({
    required AuthSessionOwner owner,
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  });
}

class BackendListingSetsGateway implements ListingSetsGateway {
  const BackendListingSetsGateway();

  @override
  Future<List<ListingSetOwnerView>> loadOwnerSets(
    AuthSessionOwner owner,
  ) async {
    final rows = await BackendRepository.getMyListingSetsForOwner(owner);
    return rows.map(ListingSetOwnerView.fromJson).toList(growable: false);
  }

  @override
  Future<ListingSetOwnerView> create({
    required AuthSessionOwner owner,
    required String title,
    required ListingSetKind kind,
    required List<String> listingIds,
  }) async {
    final row = await BackendRepository.createListingSetForOwner(
      owner: owner,
      listingSet: <String, dynamic>{
        'title': title,
        'setKind': kind.wireValue,
        'members': listingIds
            .map(
              (listingId) => <String, dynamic>{
                'listingId': listingId,
                'role': ListingSetMemberRole.required.wireValue,
              },
            )
            .toList(growable: false),
      },
    );
    return ListingSetOwnerView.fromJson(row);
  }

  @override
  Future<ListingSetOwnerView> end({
    required AuthSessionOwner owner,
    required ListingSetOwnerView set,
  }) async {
    final row = await BackendRepository.reviseListingSetForOwner(
      owner: owner,
      listingSetId: set.id,
      revision: <String, dynamic>{
        'expectedRevision': set.revision,
        'status': 'ended',
      },
    );
    return ListingSetOwnerView.fromJson(row);
  }

  @override
  Future<ListingSetDiscovery> discover({
    required AuthSessionOwner owner,
    required String listingId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    final row = await BackendRepository.discoverListingSetsForOwner(
      owner: owner,
      listingId: listingId,
      startDate: _date(startDate),
      endDate: _date(endDate),
    );
    return ListingSetDiscovery.fromJson(row);
  }
}

String _date(DateTime value) => DateTime(value.year, value.month, value.day)
    .toIso8601String()
    .substring(0, 10);
