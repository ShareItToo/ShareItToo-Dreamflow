import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:http/http.dart' as http;

import 'auth_service.dart';
import 'backend_config.dart';
import 'backend_http.dart';
import 'local_principal_scope.dart';

class BackendRepository {
  static String? _staffStepUpToken;

  static Future<String> _token() async {
    final token = await AuthService.accessToken();
    if (token == null || token.isEmpty) {
      throw const BackendException(401, 'authentication_required');
    }
    return token;
  }

  static Future<Map<String, dynamic>> _authorized({
    required String method,
    required String path,
    Object? body,
    Map<String, String> additionalHeaders = const <String, String>{},
    Duration timeout = const Duration(seconds: 20),
  }) async {
    var token = await _token();
    try {
      return await BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
        additionalHeaders: additionalHeaders,
        timeout: timeout,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestJson(
        method: method,
        path: path,
        accessToken: token,
        body: body,
        additionalHeaders: additionalHeaders,
        timeout: timeout,
      );
    }
  }

  /// Sends one request with a credential resolved only for the exact
  /// token-free session owner captured by the caller. It deliberately does
  /// not fall back to the globally current session after an await.
  static Future<Map<String, dynamic>> _authorizedForOwner({
    required AuthSessionOwner owner,
    required String method,
    required String path,
    Object? body,
    Map<String, String> additionalHeaders = const <String, String>{},
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final token = await AuthService.accessTokenForOwner(owner);
    if (token == null || token.isEmpty) {
      throw const BackendException(401, 'authentication_required');
    }
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const BackendException(401, 'authentication_required');
    }
    return BackendHttp.requestJson(
      method: method,
      path: path,
      accessToken: token,
      body: body,
      additionalHeaders: additionalHeaders,
      timeout: timeout,
    );
  }

  static List<Map<String, dynamic>> _maps(Object? value) {
    if (value is! List) return <Map<String, dynamic>>[];
    return value
        .whereType<Map>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();
  }

  static List<Map<String, dynamic>> _strictMaps(Object? value) {
    if (value is! List) {
      throw const FormatException('Expected a server list.');
    }
    final result = <Map<String, dynamic>>[];
    for (final entry in value) {
      if (entry is! Map) {
        throw const FormatException('Expected a server object.');
      }
      result.add(Map<String, dynamic>.from(entry));
    }
    return result;
  }

  @visibleForTesting
  static List<Map<String, dynamic>> strictAuthSessionsForTesting(
    Object? value,
  ) =>
      _strictMaps(value);

  static Future<Map<String, dynamic>> getCurrentProfile() async {
    final response = await _authorized(method: 'GET', path: '/auth/me');
    return Map<String, dynamic>.from(response['user'] as Map);
  }

  static Future<Map<String, dynamic>> getCurrentProfileForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/auth/me',
    );
    return Map<String, dynamic>.from(response['user'] as Map);
  }

  static Future<List<Map<String, dynamic>>> getAuthSessions() async {
    final response = await _authorized(method: 'GET', path: '/auth/sessions');
    return _strictMaps(response['sessions']);
  }

  static Future<void> revokeAuthSession(String sessionId) async {
    await _authorized(
      method: 'DELETE',
      path: '/auth/sessions/${Uri.encodeComponent(sessionId)}',
    );
  }

  static Future<void> logoutAllSessions() async {
    await _authorized(method: 'POST', path: '/auth/logout-all');
  }

  static Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _authorized(
      method: 'POST',
      path: '/auth/password/change',
      body: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  static Future<Map<String, dynamic>> accountDeletionPreflight() async {
    return _authorized(method: 'GET', path: '/account/deletion-preflight');
  }

  static Future<Map<String, dynamic>> exportAccountData({
    required AuthSessionOwner owner,
    required String currentPassword,
  }) async {
    return _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/account/export',
      body: {'currentPassword': currentPassword},
    );
  }

  static Future<void> deleteAccount({
    required AuthSessionOwner owner,
    required String currentPassword,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/account/deletion',
      body: {'currentPassword': currentPassword},
    );
  }

  /// Registers the installation token only for the exact auth-session epoch
  /// that requested the operation.
  ///
  /// FCM token acquisition is asynchronous. An account switch while the
  /// platform SDK is resolving a token must therefore never let a delayed
  /// registration fall through to the successor account's global session.
  static Future<bool> registerPushDevice({
    required int expectedSessionEpoch,
    required String token,
    required String platform,
    String? locale,
  }) async {
    if (expectedSessionEpoch != AuthService.sessionEpoch) return false;
    final session = await AuthService.readSession();
    if (session == null || expectedSessionEpoch != AuthService.sessionEpoch) {
      return false;
    }
    final owner = AuthService.captureSessionOwner(session);
    if (owner.epoch != expectedSessionEpoch ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      return false;
    }
    await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/auth/devices/push',
      body: {'token': token, 'platform': platform, 'locale': locale},
    );
    return await AuthService.isSessionOwnerDefinitelyCurrent(owner);
  }

  static int get authSessionEpoch => AuthService.sessionEpoch;

  static Future<void> deletePushDevice(String id) async {
    await _authorized(
      method: 'DELETE',
      path: '/auth/devices/push/${Uri.encodeComponent(id)}',
    );
  }

  static Future<int?> deleteCurrentSessionPushDevices({
    required int expectedSessionEpoch,
  }) async {
    if (expectedSessionEpoch != AuthService.sessionEpoch) return null;
    final session = await AuthService.readSession();
    if (session == null || expectedSessionEpoch != AuthService.sessionEpoch) {
      return null;
    }
    final owner = AuthService.captureSessionOwner(session);
    if (owner.epoch != expectedSessionEpoch ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      return null;
    }
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'DELETE',
      path: '/auth/devices/push/current',
    );
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) return null;
    return (response['deletedCount'] as num?)?.toInt() ?? 0;
  }

  static Future<Map<String, dynamic>> updateCurrentProfile(
    Map<String, dynamic> profile,
  ) async {
    final response = await _authorized(
      method: 'PATCH',
      path: '/profile',
      body: {'profile': profile},
    );
    return Map<String, dynamic>.from(response['user'] as Map);
  }

  static Future<Map<String, dynamic>> updateCurrentProfileForOwner(
    AuthSessionOwner owner,
    Map<String, dynamic> profile,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PATCH',
      path: '/profile',
      body: {'profile': profile},
    );
    return Map<String, dynamic>.from(response['user'] as Map);
  }

  static Future<List<Map<String, dynamic>>> autocompleteAddresses({
    required String input,
    String language = 'de',
    String country = 'de',
  }) async {
    final query = Uri(queryParameters: {
      'input': input,
      'language': language,
      'country': country,
    }).query;
    final response = await _authorized(
      method: 'GET',
      path: '/maps/places/autocomplete?$query',
    );
    return _maps(response['suggestions']);
  }

  static Future<Map<String, dynamic>?> getAddressPlaceDetails({
    required String placeId,
    String language = 'de',
  }) async {
    final query = Uri(queryParameters: {'language': language}).query;
    final response = await _authorized(
      method: 'GET',
      path: '/maps/places/${Uri.encodeComponent(placeId)}?$query',
    );
    final place = response['place'];
    return place is Map ? Map<String, dynamic>.from(place) : null;
  }

  static Future<Map<String, dynamic>?> getPublicProfile(String userId) async {
    try {
      final response = await BackendHttp.requestJson(
        method: 'GET',
        path: '/profiles/${Uri.encodeComponent(userId)}',
      );
      return Map<String, dynamic>.from(response['user'] as Map);
    } on BackendException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }

  static Future<List<Map<String, dynamic>>> getListings() async {
    final response = await BackendHttp.requestJson(
      method: 'GET',
      path: '/listings?sort=newest&limit=100',
    );
    final byId = <String, Map<String, dynamic>>{
      for (final listing in _maps(response['listings']))
        if ((listing['id']?.toString() ?? '').isNotEmpty)
          listing['id'].toString(): listing,
    };
    if (await AuthService.readSession() != null) {
      final mine = await _authorized(method: 'GET', path: '/listings/mine');
      for (final listing in _maps(mine['listings'])) {
        final id = listing['id']?.toString() ?? '';
        if (id.isNotEmpty) byId[id] = listing;
      }
    }
    return byId.values.toList();
  }

  /// Saved-cart prerequisite read: never adopt B's private listings or refresh
  /// B after an A request. This does not change the general catalog API.
  static Future<List<Map<String, dynamic>>> getListingsForSavedCart(
    LocalPrincipalActionOwner owner,
  ) async {
    await owner.assertCurrent();
    final response = await BackendHttp.requestJson(
      method: 'GET',
      path: '/listings?sort=newest&limit=100',
    );
    await owner.assertCurrent();
    final byId = <String, Map<String, dynamic>>{
      for (final listing in _strictMaps(response['listings']))
        if ((listing['id']?.toString() ?? '').isNotEmpty)
          listing['id'].toString(): listing,
    };
    final session = owner.sessionOwner;
    if (session != null) {
      final mine = await _authorizedForOwner(
        owner: session,
        method: 'GET',
        path: '/listings/mine',
      );
      await owner.assertCurrent();
      for (final listing in _strictMaps(mine['listings'])) {
        final id = listing['id']?.toString() ?? '';
        if (id.isNotEmpty) byId[id] = listing;
      }
    }
    await owner.assertCurrent();
    return byId.values.toList();
  }

  static Future<List<Map<String, dynamic>>> searchListings({
    String? query,
    List<String> categoryIds = const <String>[],
    List<String> conditions = const <String>[],
    double? minPrice,
    double? maxPrice,
    double? latitude,
    double? longitude,
    double? radiusKm,
    String sort = 'newest',
    int limit = 100,
    int offset = 0,
  }) async {
    final parameters = <String, String>{
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (categoryIds.isNotEmpty) 'categories': categoryIds.join(','),
      if (conditions.isNotEmpty) 'conditions': conditions.join(','),
      if (minPrice != null) 'minPrice': minPrice.toString(),
      if (maxPrice != null) 'maxPrice': maxPrice.toString(),
      if (latitude != null) 'lat': latitude.toString(),
      if (longitude != null) 'lng': longitude.toString(),
      if (radiusKm != null) 'radiusKm': radiusKm.toString(),
      'sort': sort,
      'limit': limit.clamp(1, 100).toString(),
      'offset': offset.clamp(0, 5000).toString(),
    };
    final encoded = Uri(queryParameters: parameters).query;
    final response = await BackendHttp.requestJson(
      method: 'GET',
      path: '/listings?$encoded',
    );
    return _maps(response['listings']);
  }

  static Future<Map<String, dynamic>> createListing(
      Map<String, dynamic> listing,
      {Map<String, dynamic>? supplyEnrichmentLink}) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listings',
      body: <String, dynamic>{
        ...listing,
        if (supplyEnrichmentLink != null)
          'supplyEnrichmentLink': supplyEnrichmentLink,
      },
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> createListingForOwner({
    required AuthSessionOwner owner,
    required Map<String, dynamic> listing,
    Map<String, dynamic>? supplyEnrichmentLink,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listings',
      body: <String, dynamic>{
        ...listing,
        if (supplyEnrichmentLink != null)
          'supplyEnrichmentLink': supplyEnrichmentLink,
      },
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> analyzeBlueOceanListingDraft({
    required String draftId,
    required String generationKey,
    required List<String> photoUrls,
    required Map<String, dynamic> consent,
    List<Map<String, dynamic>>? onDeviceAnalysis,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/blue-ocean/listing-drafts/analyze',
      body: <String, dynamic>{
        'draftId': draftId,
        'generationKey': generationKey,
        'photoUrls': photoUrls,
        'consent': consent,
        if (onDeviceAnalysis != null) 'onDeviceAnalysis': onDeviceAnalysis,
      },
      timeout: const Duration(seconds: 45),
    );
    return Map<String, dynamic>.from(response['assistant'] as Map);
  }

  static Future<Map<String, dynamic>> analyzeBlueOceanListingDraftForOwner({
    required AuthSessionOwner owner,
    required String draftId,
    required String generationKey,
    required List<String> photoUrls,
    required Map<String, dynamic> consent,
    List<Map<String, dynamic>>? onDeviceAnalysis,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/blue-ocean/listing-drafts/analyze',
      body: <String, dynamic>{
        'draftId': draftId,
        'generationKey': generationKey,
        'photoUrls': photoUrls,
        'consent': consent,
        if (onDeviceAnalysis != null) 'onDeviceAnalysis': onDeviceAnalysis,
      },
      timeout: const Duration(seconds: 45),
    );
    return Map<String, dynamic>.from(response['assistant'] as Map);
  }

  static Future<Map<String, dynamic>> reviewBlueOceanListingDraft({
    required String draftId,
    required Map<String, dynamic> review,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/blue-ocean/listing-drafts/${Uri.encodeComponent(draftId)}/review',
      body: review,
      timeout: const Duration(seconds: 30),
    );
    return Map<String, dynamic>.from(response['assistant'] as Map);
  }

  static Future<Map<String, dynamic>> reviewBlueOceanListingDraftForOwner({
    required AuthSessionOwner owner,
    required String draftId,
    required Map<String, dynamic> review,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/blue-ocean/listing-drafts/${Uri.encodeComponent(draftId)}/review',
      body: review,
      timeout: const Duration(seconds: 30),
    );
    return Map<String, dynamic>.from(response['assistant'] as Map);
  }

  static Future<Map<String, dynamic>> publishBlueOceanListing({
    required String draftId,
    required Map<String, dynamic> review,
    required Map<String, dynamic> listing,
    Map<String, dynamic>? supplyEnrichmentLink,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path:
          '/blue-ocean/listing-drafts/${Uri.encodeComponent(draftId)}/publish',
      body: <String, dynamic>{
        'explicitAction': 'Anzeige veröffentlichen',
        'review': review,
        'listing': listing,
        if (supplyEnrichmentLink != null)
          'supplyEnrichmentLink': supplyEnrichmentLink,
      },
      timeout: const Duration(seconds: 45),
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> publishBlueOceanListingForOwner({
    required AuthSessionOwner owner,
    required String draftId,
    required Map<String, dynamic> review,
    required Map<String, dynamic> listing,
    Map<String, dynamic>? supplyEnrichmentLink,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path:
          '/blue-ocean/listing-drafts/${Uri.encodeComponent(draftId)}/publish',
      body: <String, dynamic>{
        'explicitAction': 'Anzeige veröffentlichen',
        'review': review,
        'listing': listing,
        if (supplyEnrichmentLink != null)
          'supplyEnrichmentLink': supplyEnrichmentLink,
      },
      timeout: const Duration(seconds: 45),
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> generateListingSupplyEnrichment(
    String listingId,
  ) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listings/${Uri.encodeComponent(listingId)}/supply-enrichment',
    );
    return Map<String, dynamic>.from(response['enrichment'] as Map);
  }

  static Future<Map<String, dynamic>> generateListingSupplyEnrichmentForOwner({
    required AuthSessionOwner owner,
    required String listingId,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listings/${Uri.encodeComponent(listingId)}/supply-enrichment',
    );
    return Map<String, dynamic>.from(response['enrichment'] as Map);
  }

  static Future<Map<String, dynamic>> recordListingSupplyEnrichmentOutcome({
    required String listingId,
    required String suggestionId,
    required String outcome,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listings/${Uri.encodeComponent(listingId)}'
          '/supply-enrichment/${Uri.encodeComponent(suggestionId)}/outcome',
      body: <String, dynamic>{'outcome': outcome},
    );
    return Map<String, dynamic>.from(response['result'] as Map);
  }

  static Future<Map<String, dynamic>>
      recordListingSupplyEnrichmentOutcomeForOwner({
    required AuthSessionOwner owner,
    required String listingId,
    required String suggestionId,
    required String outcome,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listings/${Uri.encodeComponent(listingId)}'
          '/supply-enrichment/${Uri.encodeComponent(suggestionId)}/outcome',
      body: <String, dynamic>{'outcome': outcome},
    );
    return Map<String, dynamic>.from(response['result'] as Map);
  }

  static Future<List<Map<String, dynamic>>> getMyListingSets() async {
    final response =
        await _authorized(method: 'GET', path: '/listing-sets/mine');
    return _maps(response['sets']);
  }

  static Future<List<Map<String, dynamic>>> getMyListingSetsForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/listing-sets/mine',
    );
    return _strictMaps(response['sets']);
  }

  static Future<Map<String, dynamic>> createListingSet(
    Map<String, dynamic> listingSet,
  ) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listing-sets',
      body: listingSet,
    );
    return Map<String, dynamic>.from(response['listingSet'] as Map);
  }

  static Future<Map<String, dynamic>> createListingSetForOwner({
    required AuthSessionOwner owner,
    required Map<String, dynamic> listingSet,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listing-sets',
      body: listingSet,
    );
    return Map<String, dynamic>.from(response['listingSet'] as Map);
  }

  static Future<Map<String, dynamic>> reviseListingSet({
    required String listingSetId,
    required Map<String, dynamic> revision,
  }) async {
    final response = await _authorized(
      method: 'PUT',
      path: '/listing-sets/${Uri.encodeComponent(listingSetId)}',
      body: revision,
    );
    return Map<String, dynamic>.from(response['listingSet'] as Map);
  }

  static Future<Map<String, dynamic>> reviseListingSetForOwner({
    required AuthSessionOwner owner,
    required String listingSetId,
    required Map<String, dynamic> revision,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/listing-sets/${Uri.encodeComponent(listingSetId)}',
      body: revision,
    );
    return Map<String, dynamic>.from(response['listingSet'] as Map);
  }

  static Future<Map<String, dynamic>> resolveListingSet({
    required String listingSetId,
    required String startDate,
    required String endDate,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listing-sets/${Uri.encodeComponent(listingSetId)}/resolve',
      body: <String, dynamic>{'startDate': startDate, 'endDate': endDate},
    );
    return Map<String, dynamic>.from(response['resolution'] as Map);
  }

  static Future<Map<String, dynamic>> resolveListingSetForOwner({
    required AuthSessionOwner owner,
    required String listingSetId,
    required String startDate,
    required String endDate,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listing-sets/${Uri.encodeComponent(listingSetId)}/resolve',
      body: <String, dynamic>{'startDate': startDate, 'endDate': endDate},
    );
    return Map<String, dynamic>.from(response['resolution'] as Map);
  }

  static Future<Map<String, dynamic>> discoverListingSets({
    required String listingId,
    required String startDate,
    required String endDate,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/listing-sets/discover',
      body: <String, dynamic>{
        'listingId': listingId,
        'startDate': startDate,
        'endDate': endDate,
      },
    );
    return Map<String, dynamic>.from(response['discovery'] as Map);
  }

  static Future<Map<String, dynamic>> discoverListingSetsForOwner({
    required AuthSessionOwner owner,
    required String listingId,
    required String startDate,
    required String endDate,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/listing-sets/discover',
      body: <String, dynamic>{
        'listingId': listingId,
        'startDate': startDate,
        'endDate': endDate,
      },
    );
    return Map<String, dynamic>.from(response['discovery'] as Map);
  }

  static Future<Map<String, dynamic>> getPlannerTemplateCatalogForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/planner/templates',
    );
    return Map<String, dynamic>.from(response['catalog'] as Map);
  }

  static Future<Map<String, dynamic>> resolvePlannerForOwner({
    required AuthSessionOwner owner,
    required Map<String, dynamic> request,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/planner/resolve',
      body: request,
    );
    return Map<String, dynamic>.from(response['resolution'] as Map);
  }

  static Future<Map<String, dynamic>> addPlannerProjectToCartForOwner({
    required AuthSessionOwner owner,
    required String projectId,
    required Map<String, dynamic> request,
  }) =>
      _authorizedForOwner(
        owner: owner,
        method: 'POST',
        path: '/planner/projects/${Uri.encodeComponent(projectId)}/cart',
        body: request,
      );

  static Future<Map<String, dynamic>> updateListing(
    Map<String, dynamic> listing,
  ) async {
    final id = listing['id']?.toString() ?? '';
    final response = await _authorized(
      method: 'PUT',
      path: '/listings/${Uri.encodeComponent(id)}',
      body: listing,
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> updateListingForOwner({
    required AuthSessionOwner owner,
    required Map<String, dynamic> listing,
  }) async {
    final id = listing['id']?.toString() ?? '';
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/listings/${Uri.encodeComponent(id)}',
      body: listing,
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> updateListingStatus({
    required String id,
    required String status,
  }) async {
    final response = await _authorized(
      method: 'PATCH',
      path: '/listings/${Uri.encodeComponent(id)}/status',
      body: {'status': status},
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<Map<String, dynamic>> updateListingStatusForOwner({
    required AuthSessionOwner owner,
    required String id,
    required String status,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PATCH',
      path: '/listings/${Uri.encodeComponent(id)}/status',
      body: {'status': status},
    );
    return Map<String, dynamic>.from(response['listing'] as Map);
  }

  static Future<void> deleteListing(String id) async {
    await _authorized(
      method: 'DELETE',
      path: '/listings/${Uri.encodeComponent(id)}',
    );
  }

  static Future<void> deleteListingForOwner({
    required AuthSessionOwner owner,
    required String id,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'DELETE',
      path: '/listings/${Uri.encodeComponent(id)}',
    );
  }

  static Future<Map<String, dynamic>> getListingAvailability({
    required String listingId,
    required String fromDate,
    required String toDate,
  }) async {
    final query = Uri(
      queryParameters: <String, String>{'from': fromDate, 'to': toDate},
    ).query;
    final response = await BackendHttp.requestJson(
      method: 'GET',
      path: '/listings/${Uri.encodeComponent(listingId)}/availability?$query',
    );
    return Map<String, dynamic>.from(response['availability'] as Map);
  }

  static Future<bool> checkListingAvailability({
    required String listingId,
    required String startDate,
    required String endDate,
  }) async {
    try {
      final response = await BackendHttp.requestJson(
        method: 'POST',
        path: '/listings/${Uri.encodeComponent(listingId)}/availability/check',
        body: {'startDate': startDate, 'endDate': endDate},
      );
      return response['available'] == true;
    } on BackendException catch (error) {
      if (error.statusCode == 409) return false;
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> quoteBooking(
    Map<String, dynamic> booking,
  ) async {
    return _authorized(method: 'POST', path: '/bookings/quote', body: booking);
  }

  static Future<Map<String, dynamic>> requestBookingGroup({
    required List<String> listingIds,
    required String startDate,
    required String endDate,
    required String idempotencyKey,
  }) {
    return _authorized(
      method: 'POST',
      path: '/booking-groups',
      body: <String, dynamic>{
        'listingIds': listingIds,
        'startDate': startDate,
        'endDate': endDate,
      },
      additionalHeaders: <String, String>{
        'Idempotency-Key': idempotencyKey,
      },
    );
  }

  static Future<Map<String, dynamic>> getBookingGroup(String id) {
    return _authorized(
      method: 'GET',
      path: '/booking-groups/${Uri.encodeComponent(id)}',
    );
  }

  static Future<Map<String, dynamic>> decideBookingGroup({
    required String id,
    required String action,
    required String quoteId,
    required String quoteHash,
    required String idempotencyKey,
    List<String>? listingIds,
  }) {
    return _authorized(
      method: 'POST',
      path: '/booking-groups/${Uri.encodeComponent(id)}/owner-decision',
      body: <String, dynamic>{
        'action': action,
        'quoteId': quoteId,
        'quoteHash': quoteHash,
        if (listingIds != null) 'listingIds': listingIds,
      },
      additionalHeaders: <String, String>{
        'Idempotency-Key': idempotencyKey,
      },
    );
  }

  static Future<Map<String, dynamic>> acceptBookingGroupCounteroffer({
    required String id,
    required String quoteId,
    required String quoteHash,
    required String idempotencyKey,
  }) {
    return _authorized(
      method: 'POST',
      path: '/booking-groups/${Uri.encodeComponent(id)}/counteroffer-consent',
      body: <String, dynamic>{
        'accepted': true,
        'quoteId': quoteId,
        'quoteHash': quoteHash,
      },
      additionalHeaders: <String, String>{
        'Idempotency-Key': idempotencyKey,
      },
    );
  }

  static Future<Map<String, dynamic>> getBookingGroupHandoverReturn(String id) {
    return _authorized(
      method: 'GET',
      path: '/booking-groups/${Uri.encodeComponent(id)}/handover-return',
    );
  }

  static Future<Map<String, dynamic>> getRentalCart() async {
    final response = await _authorized(method: 'GET', path: '/rental-cart');
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Map<String, dynamic> _savedCartResponse(
      Map<String, dynamic> response) {
    final raw = response['cart'];
    if (raw is! Map) throw const FormatException('Expected a confirmed cart.');
    final cart = Map<String, dynamic>.from(raw);
    for (final key in ['projects', 'items']) {
      final entries = _strictMaps(cart[key]);
      final ids = <String>{};
      for (final entry in entries) {
        final id = entry['id'];
        final label = entry[key == 'projects' ? 'title' : 'listingId'];
        if (id is! String ||
            id.trim().isEmpty ||
            !ids.add(id) ||
            label is! String ||
            label.trim().isEmpty) {
          throw const FormatException('Invalid confirmed cart entry.');
        }
      }
    }
    return cart;
  }

  static Future<Map<String, dynamic>> getRentalCartForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/rental-cart',
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> putRentalCartProject({
    required String id,
    required String title,
    Map<String, dynamic> answers = const <String, dynamic>{},
    int sortOrder = 0,
  }) async {
    final response = await _authorized(
      method: 'PUT',
      path: '/rental-cart/projects/${Uri.encodeComponent(id)}',
      body: <String, dynamic>{
        'title': title,
        'answers': answers,
        'sortOrder': sortOrder,
      },
    );
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Future<Map<String, dynamic>> deleteRentalCartProject(String id) async {
    final response = await _authorized(
      method: 'DELETE',
      path: '/rental-cart/projects/${Uri.encodeComponent(id)}',
    );
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Future<Map<String, dynamic>> deleteRentalCartProjectForOwner({
    required AuthSessionOwner owner,
    required String id,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'DELETE',
      path: '/rental-cart/projects/${Uri.encodeComponent(id)}',
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> putRentalCartProjectForOwner({
    required AuthSessionOwner owner,
    required String id,
    required String title,
    Map<String, dynamic> answers = const <String, dynamic>{},
    int sortOrder = 0,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/rental-cart/projects/${Uri.encodeComponent(id)}',
      body: <String, dynamic>{
        'title': title,
        'answers': answers,
        'sortOrder': sortOrder,
      },
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> putRentalCartItemForOwner({
    required AuthSessionOwner owner,
    required String id,
    required String listingId,
    required String startDate,
    required String endDate,
    String? projectId,
    int sortOrder = 0,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/rental-cart/items/${Uri.encodeComponent(id)}',
      body: <String, dynamic>{
        'listingId': listingId,
        'startDate': startDate,
        'endDate': endDate,
        'projectId': projectId,
        'sortOrder': sortOrder,
      },
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> putRentalCartItem({
    required String id,
    required String listingId,
    required String startDate,
    required String endDate,
    String? projectId,
    int sortOrder = 0,
  }) async {
    final response = await _authorized(
      method: 'PUT',
      path: '/rental-cart/items/${Uri.encodeComponent(id)}',
      body: <String, dynamic>{
        'listingId': listingId,
        'startDate': startDate,
        'endDate': endDate,
        'projectId': projectId,
        'sortOrder': sortOrder,
      },
    );
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Future<Map<String, dynamic>> deleteRentalCartItem(String id) async {
    final response = await _authorized(
      method: 'DELETE',
      path: '/rental-cart/items/${Uri.encodeComponent(id)}',
    );
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Future<Map<String, dynamic>> recheckRentalCart() async {
    final response = await _authorized(
      method: 'POST',
      path: '/rental-cart/recheck',
    );
    return Map<String, dynamic>.from(response['cart'] as Map);
  }

  static Future<Map<String, dynamic>> deleteRentalCartItemForOwner({
    required AuthSessionOwner owner,
    required String id,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'DELETE',
      path: '/rental-cart/items/${Uri.encodeComponent(id)}',
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> recheckRentalCartForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/rental-cart/recheck',
    );
    return _savedCartResponse(response);
  }

  static Future<Map<String, dynamic>> createBooking(
    Map<String, dynamic> booking, {
    required String idempotencyKey,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/bookings',
      body: booking,
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response['booking'] as Map);
  }

  static Future<Map<String, dynamic>> amendBooking(
    Map<String, dynamic> booking, {
    required String bookingId,
    required String idempotencyKey,
  }) async {
    final response = await _authorized(
      method: 'PATCH',
      path: '/bookings/${Uri.encodeComponent(bookingId)}',
      body: booking,
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response['booking'] as Map);
  }

  static Future<Map<String, dynamic>> getBookingFlowTime(
    String bookingId,
  ) async {
    final response = await _authorized(
      method: 'GET',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/flow-time',
    );
    return Map<String, dynamic>.from(response['state'] as Map);
  }

  static Future<Map<String, dynamic>> getBookingAddressReveal({
    required String bookingId,
    String segment = 'pickup',
  }) async {
    final response = await _authorized(
      method: 'GET',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/address-reveal?segment=${Uri.encodeQueryComponent(segment)}',
    );
    return Map<String, dynamic>.from(response['visibility'] as Map);
  }

  static Future<Map<String, dynamic>> updateBookingFlowTime({
    required String bookingId,
    required String action,
    required String segment,
    String? label,
    DateTime? time,
    String? localDate,
    String? localTime,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/flow-time',
      body: {
        'action': action,
        'segment': segment,
        if (label != null) 'label': label,
        if (time != null) 'timeIso': time.toUtc().toIso8601String(),
        if (localDate != null) 'localDate': localDate,
        if (localTime != null) 'localTime': localTime,
      },
      additionalHeaders: {
        'Idempotency-Key':
            'flow_time_${bookingId}_${action}_${segment}_${DateTime.now().microsecondsSinceEpoch}',
      },
    );
    return Map<String, dynamic>.from(response['state'] as Map);
  }

  static Future<Map<String, dynamic>> transitionBooking({
    required String bookingId,
    required String status,
    required String idempotencyKey,
    int? expectedRevision,
    List<Map<String, dynamic>>? legalDeclarations,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/transitions',
      body: {
        'status': status,
        if (expectedRevision != null) 'expectedRevision': expectedRevision,
        if (legalDeclarations != null) 'legalDeclarations': legalDeclarations,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response['booking'] as Map);
  }

  static Future<Map<String, dynamic>> issueBookingConfirmationChallenge({
    required String bookingId,
    required String segment,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/confirmation-challenges',
      body: {'segment': segment},
    );
    return Map<String, dynamic>.from(response['challenge'] as Map);
  }

  static Future<Map<String, dynamic>> verifyBookingConfirmationChallenge({
    required String bookingId,
    String? qrPayload,
    String? challengeId,
    String? code,
    String? segment,
    String? presenterRole,
  }) async {
    return _authorized(
      method: 'POST',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/confirmation-challenges/verify',
      body: {
        if (qrPayload != null) 'qrPayload': qrPayload,
        if (challengeId != null) 'challengeId': challengeId,
        if (code != null) 'code': code,
        if (segment != null) 'segment': segment,
        if (presenterRole != null) 'presenterRole': presenterRole,
      },
    );
  }

  static Future<Map<String, dynamic>> recordPlatformWithdrawal({
    String? bookingId,
    required String scope,
    required String idempotencyKey,
  }) async {
    return _authorized(
      method: 'POST',
      path: scope == 'account_contract'
          ? '/platform-contracts/withdrawal'
          : '/bookings/${Uri.encodeComponent(bookingId!)}/withdrawal',
      body: {
        'scope': scope,
        'electronicChannel': 'in_app_download',
        'acknowledgedConsequences': true,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<BackendBinaryResponse> downloadWithdrawalReceipt(
    String withdrawalId,
  ) async {
    var token = await _token();
    try {
      return await BackendHttp.requestBytes(
        path: '/withdrawals/${Uri.encodeComponent(withdrawalId)}/receipt',
        accessToken: token,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestBytes(
        path: '/withdrawals/${Uri.encodeComponent(withdrawalId)}/receipt',
        accessToken: token,
      );
    }
  }

  static Future<Map<String, dynamic>> getActualLossCase(
    String bookingId,
  ) async {
    return _authorized(
      method: 'GET',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/actual-loss',
    );
  }

  static Future<Map<String, dynamic>> recordActualLossStatement({
    required String bookingId,
    required List<String> evidenceUploadIds,
    int? ownerClaimedLossMinor,
    int? savedExpenseMinor,
    int? replacementRentalMinor,
    int? provenLowerLossMinor,
    String? statementText,
    required String idempotencyKey,
  }) async {
    return _authorized(
      method: 'POST',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/actual-loss/statements',
      body: {
        'evidenceUploadIds': evidenceUploadIds,
        if (ownerClaimedLossMinor != null)
          'ownerClaimedLossMinor': ownerClaimedLossMinor,
        if (savedExpenseMinor != null) 'savedExpenseMinor': savedExpenseMinor,
        if (replacementRentalMinor != null)
          'replacementRentalMinor': replacementRentalMinor,
        if (provenLowerLossMinor != null)
          'provenLowerLossMinor': provenLowerLossMinor,
        if (statementText != null && statementText.trim().isNotEmpty)
          'statementText': statementText.trim(),
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<BackendBinaryResponse> downloadActualLossReceipt(
    String resolutionId,
  ) async {
    var token = await _token();
    try {
      return await BackendHttp.requestBytes(
        path:
            '/actual-loss-resolutions/${Uri.encodeComponent(resolutionId)}/receipt',
        accessToken: token,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestBytes(
        path:
            '/actual-loss-resolutions/${Uri.encodeComponent(resolutionId)}/receipt',
        accessToken: token,
      );
    }
  }

  static Future<BackendBinaryResponse> downloadPlatformContractReceipt(
    String contractId,
  ) async {
    var token = await _token();
    final path =
        '/platform-contracts/${Uri.encodeComponent(contractId)}/receipt';
    try {
      return await BackendHttp.requestBytes(
        path: path,
        accessToken: token,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestBytes(
        path: path,
        accessToken: token,
      );
    }
  }

  static Future<Map<String, dynamic>> getConnectStatus() async {
    final response = await _authorized(
      method: 'GET',
      path: '/payments/connect/status',
    );
    return {
      ...Map<String, dynamic>.from(response['account'] as Map),
      'capabilities': response['capabilities'] is Map
          ? Map<String, dynamic>.from(response['capabilities'] as Map)
          : const <String, dynamic>{},
    };
  }

  static Future<Map<String, dynamic>> getPaymentCapabilities() async {
    final response = await _authorized(
      method: 'GET',
      path: '/payments/capabilities',
    );
    return response['capabilities'] is Map
        ? Map<String, dynamic>.from(response['capabilities'] as Map)
        : const <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> startConnectOnboarding({
    required String idempotencyKey,
  }) async {
    return _authorized(
      method: 'POST',
      path: '/payments/connect/onboarding',
      body: const {'country': 'DE', 'currency': 'EUR'},
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<Map<String, dynamic>> getBookingPayment(
      String bookingId) async {
    return _authorized(
      method: 'GET',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/payment',
    );
  }

  static Future<List<Map<String, dynamic>>> getFinancialDocuments() async {
    final response = await _authorized(
      method: 'GET',
      path: '/financial-documents',
    );
    return _maps(response['documents']);
  }

  static Future<BackendBinaryResponse> downloadFinancialDocument(
    String documentId,
  ) async {
    var token = await _token();
    final path =
        '/financial-documents/${Uri.encodeComponent(documentId)}/artifact';
    try {
      return await BackendHttp.requestBytes(
        path: path,
        accessToken: token,
      );
    } on BackendException catch (error) {
      if (error.statusCode != 401) rethrow;
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isEmpty) rethrow;
      return BackendHttp.requestBytes(
        path: path,
        accessToken: token,
      );
    }
  }

  static Future<Map<String, dynamic>> createBookingCheckout({
    required String bookingId,
    required String idempotencyKey,
  }) async {
    return _authorized(
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/payment/checkout',
      body: const {},
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<List<Map<String, dynamic>>> getRentalRequests() async {
    final response = await _authorized(
      method: 'GET',
      path: '/rental-requests',
    );
    final requests = response['requests'];
    if (requests is! List || requests.any((entry) => entry is! Map)) {
      throw const BackendException(200, 'invalid_server_response');
    }
    return requests
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList(growable: false);
  }

  static Future<List<Map<String, dynamic>>> syncRentalRequests(
    List<Map<String, dynamic>> requests,
  ) async {
    final response = await _authorized(
      method: 'PUT',
      path: '/rental-requests/sync',
      body: {'requests': requests},
    );
    return _maps(response['requests']);
  }

  static Future<List<Map<String, dynamic>>> getMessageThreads({
    bool includeArchived = false,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final response = await _authorized(
      method: 'GET',
      path: '/message-threads${includeArchived ? '?includeArchived=true' : ''}',
      timeout: timeout,
    );
    return _maps(response['threads']);
  }

  static Future<List<Map<String, dynamic>>> getMessageThreadsForOwner(
    AuthSessionOwner owner, {
    bool includeArchived = false,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/message-threads${includeArchived ? '?includeArchived=true' : ''}',
      timeout: timeout,
    );
    return _maps(response['threads']);
  }

  static Future<Map<String, dynamic>> createOrGetBookingThread(
    String bookingId,
  ) async {
    final response = await _authorized(
      method: 'POST',
      path: '/message-threads/booking/${Uri.encodeComponent(bookingId)}',
    );
    return Map<String, dynamic>.from(response['thread'] as Map);
  }

  static Future<Map<String, dynamic>> sendThreadMessage({
    required String threadId,
    required String text,
    required String idempotencyKey,
    List<String> attachmentIds = const <String>[],
    Map<String, dynamic>? conditionEvidence,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/message-threads/${Uri.encodeComponent(threadId)}/messages',
      body: {
        'text': text,
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
        if (conditionEvidence != null) 'conditionEvidence': conditionEvidence,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response['message'] as Map);
  }

  static Future<void> markThreadRead(String threadId) async {
    await _authorized(
      method: 'POST',
      path: '/message-threads/${Uri.encodeComponent(threadId)}/read',
    );
  }

  static Future<void> markThreadReadForOwner({
    required AuthSessionOwner owner,
    required String threadId,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/message-threads/${Uri.encodeComponent(threadId)}/read',
    );
  }

  static Future<void> setThreadArchived({
    required String threadId,
    required bool archived,
  }) async {
    await _authorized(
      method: 'PATCH',
      path: '/message-threads/${Uri.encodeComponent(threadId)}',
      body: {'archived': archived},
    );
  }

  static Future<void> setThreadArchivedForOwner({
    required AuthSessionOwner owner,
    required String threadId,
    required bool archived,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'PATCH',
      path: '/message-threads/${Uri.encodeComponent(threadId)}',
      body: {'archived': archived},
    );
  }

  static Future<List<String>> getBlockedUserIds() async {
    final response = await _authorized(method: 'GET', path: '/user-blocks');
    return _maps(response['blocks'])
        .map((entry) => entry['userId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  static Future<List<String>> getBlockedUserIdsForOwner(
    AuthSessionOwner owner,
  ) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/user-blocks',
    );
    return _maps(response['blocks'])
        .map((entry) => entry['userId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  static Future<void> blockUser(String userId) async {
    await _authorized(
      method: 'PUT',
      path: '/user-blocks/${Uri.encodeComponent(userId)}',
      body: {'reasonCode': 'user_request'},
    );
  }

  static Future<void> blockUserForOwner({
    required AuthSessionOwner owner,
    required String userId,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'PUT',
      path: '/user-blocks/${Uri.encodeComponent(userId)}',
      body: {'reasonCode': 'user_request'},
    );
  }

  static Future<void> unblockUser(String userId) async {
    await _authorized(
      method: 'DELETE',
      path: '/user-blocks/${Uri.encodeComponent(userId)}',
    );
  }

  static Future<void> unblockUserForOwner({
    required AuthSessionOwner owner,
    required String userId,
  }) async {
    await _authorizedForOwner(
      owner: owner,
      method: 'DELETE',
      path: '/user-blocks/${Uri.encodeComponent(userId)}',
    );
  }

  static Future<Map<String, dynamic>> createReport({
    required String targetType,
    required String targetId,
    required String reasonCode,
    String details = '',
    String? reference,
    List<String> evidenceUploadIds = const <String>[],
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/reports',
      body: {
        'targetType': targetType,
        'targetId': targetId,
        'reasonCode': reasonCode,
        if (details.trim().isNotEmpty) 'details': details.trim(),
        if ((reference ?? '').trim().isNotEmpty) 'reference': reference!.trim(),
        if (evidenceUploadIds.isNotEmpty)
          'evidenceUploadIds': evidenceUploadIds,
      },
      additionalHeaders: {
        'Idempotency-Key': 'report_${DateTime.now().microsecondsSinceEpoch}',
      },
    );
    return Map<String, dynamic>.from(response['report'] as Map);
  }

  static Future<Map<String, dynamic>> createReportForOwner({
    required AuthSessionOwner owner,
    required String targetType,
    required String targetId,
    required String reasonCode,
    required String idempotencyKey,
    String details = '',
    String? reference,
    List<String> evidenceUploadIds = const <String>[],
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/reports',
      body: {
        'targetType': targetType,
        'targetId': targetId,
        'reasonCode': reasonCode,
        if (details.trim().isNotEmpty) 'details': details.trim(),
        if ((reference ?? '').trim().isNotEmpty) 'reference': reference!.trim(),
        if (evidenceUploadIds.isNotEmpty)
          'evidenceUploadIds': evidenceUploadIds,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response['report'] as Map);
  }

  static Future<Map<String, dynamic>> createHarassmentBlockReport({
    required String targetUserId,
    required bool immediateDanger,
    required String idempotencyKey,
    String details = '',
    String? reference,
    List<String> evidenceUploadIds = const <String>[],
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/reports/harassment-block',
      body: {
        'targetUserId': targetUserId,
        'immediateDanger': immediateDanger,
        if (details.trim().isNotEmpty) 'details': details.trim(),
        if ((reference ?? '').trim().isNotEmpty) 'reference': reference!.trim(),
        if (evidenceUploadIds.isNotEmpty)
          'evidenceUploadIds': evidenceUploadIds,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response);
  }

  static Future<Map<String, dynamic>> createHarassmentBlockReportForOwner({
    required AuthSessionOwner owner,
    required String targetUserId,
    required bool immediateDanger,
    required String idempotencyKey,
    String details = '',
    String? reference,
    List<String> evidenceUploadIds = const <String>[],
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/reports/harassment-block',
      body: {
        'targetUserId': targetUserId,
        'immediateDanger': immediateDanger,
        if (details.trim().isNotEmpty) 'details': details.trim(),
        if ((reference ?? '').trim().isNotEmpty) 'reference': reference!.trim(),
        if (evidenceUploadIds.isNotEmpty)
          'evidenceUploadIds': evidenceUploadIds,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    return Map<String, dynamic>.from(response);
  }

  static Future<List<Map<String, dynamic>>> getMyReports() async {
    final response = await _authorized(method: 'GET', path: '/reports/mine');
    return _maps(response['reports']);
  }

  static Future<List<Map<String, dynamic>>> getMyModerationDecisions() async {
    final response =
        await _authorized(method: 'GET', path: '/moderation/decisions');
    return _maps(response['decisions']);
  }

  static Future<Map<String, dynamic>> submitModerationReview({
    required String decisionId,
    required String reason,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/moderation/decisions/${Uri.encodeComponent(decisionId)}/review',
      body: {'reason': reason.trim()},
      additionalHeaders: {
        'Idempotency-Key': 'moderation_review_${decisionId.trim()}',
      },
    );
    final review = response['reviewRequest'];
    if (review is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(review);
  }

  static Future<Map<String, dynamic>> createSupportCase({
    required AuthSessionOwner owner,
    required Map<String, dynamic> intake,
    required String idempotencyKey,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/support/cases',
      body: intake,
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    final supportCase = response['supportCase'];
    if (supportCase is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(supportCase);
  }

  static Future<Map<String, dynamic>> reportHandoverException({
    required AuthSessionOwner owner,
    required String bookingId,
    required Map<String, dynamic> intake,
    required String idempotencyKey,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/handover-exceptions',
      body: intake,
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    final supportCase = response['supportCase'];
    if (supportCase is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(supportCase);
  }

  static Future<Map<String, dynamic>> previewLegacySupportMigration(
    Map<String, dynamic> payload,
  ) async {
    final response = await _authorized(
      method: 'POST',
      path: '/support/legacy-migrations/preview',
      body: payload,
    );
    final migration = response['migration'];
    if (migration is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(migration);
  }

  static Future<Map<String, dynamic>> importLegacySupportMigration({
    required Map<String, dynamic> payload,
    required String idempotencyKey,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/support/legacy-migrations',
      body: payload,
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    final supportCase = response['supportCase'];
    final migration = response['migration'];
    if (supportCase is! Map || migration is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return {
      'supportCase': Map<String, dynamic>.from(supportCase),
      'migration': Map<String, dynamic>.from(migration),
      'replayed': response['replayed'] == true,
    };
  }

  static Future<Map<String, dynamic>> getLegacySupportHistory(
    String caseId,
  ) async {
    final response = await _authorized(
      method: 'GET',
      path: '/support/cases/${Uri.encodeComponent(caseId)}/legacy-history',
    );
    final history = response['legacyHistory'];
    if (history is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(history);
  }

  static Future<List<Map<String, dynamic>>> getMySupportCases({
    required AuthSessionOwner owner,
  }) async {
    final response = await _authorizedForOwner(
        owner: owner, method: 'GET', path: '/support/cases');
    return _strictMaps(response['supportCases']);
  }

  static Future<Map<String, dynamic>> getSupportCase(
    String caseId, {
    required AuthSessionOwner owner,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'GET',
      path: '/support/cases/${Uri.encodeComponent(caseId)}',
    );
    final supportCase = response['supportCase'];
    final finalDecision = response['finalDecision'];
    final appeal = response['appeal'];
    final events = response['events'];
    final messages = response['messages'];
    if (supportCase is! Map ||
        (finalDecision != null && finalDecision is! Map) ||
        (appeal != null && appeal is! Map) ||
        events is! List ||
        events.any((event) => event is! Map)) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return {
      'supportCase': Map<String, dynamic>.from(supportCase),
      'finalDecision': finalDecision == null
          ? null
          : Map<String, dynamic>.from(finalDecision),
      'appeal': appeal == null ? null : Map<String, dynamic>.from(appeal),
      'events': _strictMaps(events),
      'messages': _strictMaps(messages),
    };
  }

  static Future<Map<String, dynamic>> completeSupportDsaNoticeLocator({
    required AuthSessionOwner owner,
    required String caseId,
    required String contentLocator,
    required int expectedVersion,
    required String idempotencyKey,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/support/cases/${Uri.encodeComponent(caseId)}/dsa-locator',
      body: {
        'contentLocator': contentLocator.trim(),
        'expectedVersion': expectedVersion,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    final supportCase = response['supportCase'];
    if (supportCase is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(supportCase);
  }

  static Future<Map<String, dynamic>> submitSupportAppeal({
    required AuthSessionOwner owner,
    required String caseId,
    required String grounds,
    required int expectedVersion,
    required String idempotencyKey,
  }) async {
    final response = await _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/support/cases/${Uri.encodeComponent(caseId)}/appeals',
      body: {
        'grounds': grounds.trim(),
        'expectedVersion': expectedVersion,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
    final appeal = response['appeal'];
    if (appeal is! Map) {
      throw const BackendException(502, 'invalid_server_response');
    }
    return Map<String, dynamic>.from(appeal);
  }

  static Future<Map<String, dynamic>> createBookingReview({
    required String bookingId,
    required String direction,
    required List<Map<String, dynamic>> criteria,
  }) async {
    final response = await _authorized(
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/reviews',
      body: {'direction': direction, 'criteria': criteria},
    );
    return Map<String, dynamic>.from(response['review'] as Map);
  }

  static Future<List<Map<String, dynamic>>> getUserReviews(
    String userId,
  ) async {
    final response = await BackendHttp.requestJson(
      method: 'GET',
      path: '/users/${Uri.encodeComponent(userId)}/reviews',
    );
    return _maps(response['reviews']);
  }

  static Future<void> elevateStaff(String currentPassword) async {
    final response = await _authorized(
      method: 'POST',
      path: '/admin/step-up',
      body: {'currentPassword': currentPassword},
    );
    final elevation = Map<String, dynamic>.from(response['elevation'] as Map);
    final token = elevation['token']?.toString() ?? '';
    if (token.isEmpty) {
      throw const BackendException(500, 'invalid_staff_elevation');
    }
    _staffStepUpToken = token;
  }

  static void clearStaffElevation() => _staffStepUpToken = null;

  static Future<Map<String, dynamic>> _staff({
    required String method,
    required String path,
    Object? body,
    String? idempotencyKey,
  }) async {
    final token = _staffStepUpToken;
    if (token == null || token.isEmpty) {
      throw const BackendException(401, 'staff_step_up_required');
    }
    try {
      return await _authorized(
        method: method,
        path: path,
        body: body,
        additionalHeaders: {
          'X-Admin-Step-Up': token,
          if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
        },
      );
    } on BackendException catch (error) {
      if (error.statusCode == 401) _staffStepUpToken = null;
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> getStaffOverview() async {
    final response = await _staff(method: 'GET', path: '/admin/overview');
    return Map<String, dynamic>.from(response['overview'] as Map);
  }

  static Future<List<Map<String, dynamic>>> getStaffReports() async {
    final response = await _staff(method: 'GET', path: '/admin/reports');
    return _maps(response['reports']);
  }

  static Future<List<Map<String, dynamic>>> getStaffModerationReviews() async {
    final response =
        await _staff(method: 'GET', path: '/admin/moderation/reviews');
    return _maps(response['reviewRequests']);
  }

  static Future<Map<String, dynamic>> claimStaffModerationReview(
    String reviewRequestId,
  ) async {
    final response = await _staff(
      method: 'POST',
      path:
          '/admin/moderation/reviews/${Uri.encodeComponent(reviewRequestId)}/claim',
      idempotencyKey:
          'moderation_review_claim_${DateTime.now().microsecondsSinceEpoch}',
    );
    return Map<String, dynamic>.from(response['reviewRequest'] as Map);
  }

  static Future<Map<String, dynamic>> resolveStaffModerationReview({
    required String reviewRequestId,
    required Map<String, dynamic> resolution,
  }) async {
    return _staff(
      method: 'POST',
      path:
          '/admin/moderation/reviews/${Uri.encodeComponent(reviewRequestId)}/resolve',
      body: resolution,
      idempotencyKey:
          'moderation_review_resolve_${DateTime.now().microsecondsSinceEpoch}',
    );
  }

  static Future<Map<String, dynamic>> getStaffReport(String reportId) async {
    final response = await _staff(
      method: 'GET',
      path: '/admin/reports/${Uri.encodeComponent(reportId)}',
    );
    return Map<String, dynamic>.from(response['report'] as Map);
  }

  static Future<Map<String, dynamic>> updateStaffReport({
    required String reportId,
    required Map<String, dynamic> update,
  }) async {
    final response = await _staff(
      method: 'PATCH',
      path: '/admin/reports/${Uri.encodeComponent(reportId)}',
      body: update,
      idempotencyKey: 'report_update_${DateTime.now().microsecondsSinceEpoch}',
    );
    return Map<String, dynamic>.from(response['report'] as Map);
  }

  static Future<List<Map<String, dynamic>>> getStaffUsers() async {
    final response = await _staff(method: 'GET', path: '/admin/users');
    return _maps(response['users']);
  }

  static Future<List<Map<String, dynamic>>> getStaffListings() async {
    final response = await _staff(method: 'GET', path: '/admin/listings');
    return _maps(response['listings']);
  }

  static Future<List<Map<String, dynamic>>> getStaffBookings() async {
    final response = await _staff(method: 'GET', path: '/admin/bookings');
    return _maps(response['bookings']);
  }

  static Future<List<Map<String, dynamic>>> getStaffPayments() async {
    final response = await _staff(method: 'GET', path: '/admin/payments');
    return _maps(response['payments']);
  }

  static Future<List<Map<String, dynamic>>> getStaffAudit() async {
    final response = await _staff(
      method: 'GET',
      path: '/admin/audit?limit=200',
    );
    return _maps(response['audit']);
  }

  static Future<void> suspendUser({
    required String userId,
    required String scope,
    required String reasonCode,
    String? reportId,
    String? note,
    required Map<String, dynamic> decision,
  }) async {
    await _staff(
      method: 'POST',
      path: '/admin/users/${Uri.encodeComponent(userId)}/suspensions',
      body: {
        'scope': scope,
        'reasonCode': reasonCode,
        if (reportId != null) 'reportId': reportId,
        if ((note ?? '').isNotEmpty) 'note': note,
        'decision': decision,
      },
      idempotencyKey: 'user_suspend_${DateTime.now().microsecondsSinceEpoch}',
    );
  }

  static Future<void> moderateListing({
    required String listingId,
    required String status,
    required String reasonCode,
    String? reportId,
    String? note,
    required Map<String, dynamic> decision,
  }) async {
    await _staff(
      method: 'PATCH',
      path: '/admin/listings/${Uri.encodeComponent(listingId)}/moderation',
      body: {
        'status': status,
        'reasonCode': reasonCode,
        if (reportId != null) 'reportId': reportId,
        if ((note ?? '').isNotEmpty) 'note': note,
        'decision': decision,
      },
      idempotencyKey:
          'listing_moderation_${DateTime.now().microsecondsSinceEpoch}',
    );
  }

  static Future<List<Map<String, dynamic>>> getNotifications() async {
    final response = await _authorized(
      method: 'GET',
      path: '/notifications?limit=100',
    );
    return _maps(response['notifications']);
  }

  static Future<void> updateNotification({
    required String id,
    bool? read,
    bool? archived,
  }) async {
    await _authorized(
      method: 'PATCH',
      path: '/notifications/${Uri.encodeComponent(id)}',
      body: {
        if (read != null) 'read': read,
        if (archived != null) 'archived': archived,
      },
    );
  }

  static Future<void> markAllNotificationsRead() async {
    await _authorized(method: 'POST', path: '/notifications/read-all');
  }

  static Future<List<Map<String, dynamic>>> syncMessageThreads(
    List<Map<String, dynamic>> threads,
  ) async {
    final response = await _authorized(
      method: 'PUT',
      path: '/message-threads/sync',
      body: {'threads': threads},
    );
    return _maps(response['threads']);
  }

  static Future<String> uploadImage({
    required Uint8List bytes,
    required String filename,
  }) async {
    var token = await _token();
    Future<http.StreamedResponse> send(String accessToken) {
      final request = http.MultipartRequest(
        'POST',
        BackendConfig.uri('/uploads'),
      )
        ..headers['Authorization'] = 'Bearer $accessToken'
        ..files.add(
          http.MultipartFile.fromBytes(
            'file',
            bytes,
            filename: filename,
          ),
        );
      return request.send().timeout(const Duration(seconds: 45));
    }

    var response = await send(token);
    if (response.statusCode == 401) {
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isNotEmpty) response = await send(token);
    }
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(response.statusCode, 'upload_failed');
    }
    final value = jsonDecode(body);
    if (value is! Map) {
      throw const BackendException(500, 'invalid_server_response');
    }
    final decoded = Map<String, dynamic>.from(value);
    final url = decoded['url']?.toString() ?? '';
    if (url.isEmpty) {
      throw const BackendException(500, 'invalid_upload_response');
    }
    return url;
  }

  static Future<String> uploadImageForOwner({
    required AuthSessionOwner owner,
    required Uint8List bytes,
    required String filename,
  }) async {
    final token = await AuthService.accessTokenForOwner(owner);
    if (token == null ||
        token.isEmpty ||
        !await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const BackendException(401, 'authentication_required');
    }
    final request = http.MultipartRequest(
      'POST',
      BackendConfig.uri('/uploads'),
    )
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(
        http.MultipartFile.fromBytes('file', bytes, filename: filename),
      );
    final response = await request.send().timeout(const Duration(seconds: 45));
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(response.statusCode, 'upload_failed');
    }
    final value = jsonDecode(body);
    if (value is! Map) {
      throw const BackendException(500, 'invalid_server_response');
    }
    final decoded = Map<String, dynamic>.from(value);
    final url = decoded['url']?.toString() ?? '';
    if (url.isEmpty) {
      throw const BackendException(500, 'invalid_upload_response');
    }
    return url;
  }

  static Future<Map<String, dynamic>> uploadMessageAttachment({
    required Uint8List bytes,
    required String filename,
    required String threadId,
    String purpose = 'message_attachment',
  }) async {
    var token = await _token();
    Future<http.StreamedResponse> send(String accessToken) {
      final request = http.MultipartRequest(
        'POST',
        BackendConfig.uri('/uploads'),
      )
        ..headers['Authorization'] = 'Bearer $accessToken'
        ..fields['purpose'] = purpose
        ..fields['threadId'] = threadId
        ..files.add(
          http.MultipartFile.fromBytes('file', bytes, filename: filename),
        );
      return request.send().timeout(const Duration(seconds: 45));
    }

    var response = await send(token);
    if (response.statusCode == 401) {
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isNotEmpty) response = await send(token);
    }
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(response.statusCode, 'attachment_upload_failed');
    }
    final value = jsonDecode(body);
    if (value is! Map) {
      throw const BackendException(500, 'invalid_server_response');
    }
    final decoded = Map<String, dynamic>.from(value);
    if ((decoded['id']?.toString() ?? '').isEmpty) {
      throw const BackendException(500, 'invalid_upload_response');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> getConditionEvidenceSummary({
    required String bookingId,
    required String segment,
  }) async {
    final response = await _authorized(
      method: 'GET',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/condition-evidence?segment=${Uri.encodeQueryComponent(segment)}',
    );
    return Map<String, dynamic>.from(response['summary'] as Map);
  }

  static Future<Map<String, dynamic>> recordConditionConfirmation({
    required String bookingId,
    required String segment,
    required String decision,
  }) async {
    return _authorized(
      method: 'POST',
      path:
          '/bookings/${Uri.encodeComponent(bookingId)}/condition-confirmations',
      body: {'segment': segment, 'decision': decision},
    );
  }

  static Future<Map<String, dynamic>> openV52ReturnCase({
    required String bookingId,
    required String reasonCode,
    required String details,
    required List<String> evidenceUploadIds,
    required int contestedAuthorizedMinor,
    required String idempotencyKey,
  }) async {
    return _authorized(
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/return-cases',
      body: {
        'reasonCode': reasonCode,
        'details': details.trim(),
        'evidenceUploadIds': evidenceUploadIds,
        'contestedAuthorizedMinor': contestedAuthorizedMinor,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<Map<String, dynamic>> openV52ReturnCaseForOwner({
    required AuthSessionOwner owner,
    required String bookingId,
    required String reasonCode,
    required String details,
    required List<String> evidenceUploadIds,
    required int contestedAuthorizedMinor,
    required String idempotencyKey,
  }) async {
    return _authorizedForOwner(
      owner: owner,
      method: 'POST',
      path: '/bookings/${Uri.encodeComponent(bookingId)}/return-cases',
      body: {
        'reasonCode': reasonCode,
        'details': details.trim(),
        'evidenceUploadIds': evidenceUploadIds,
        'contestedAuthorizedMinor': contestedAuthorizedMinor,
      },
      additionalHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  static Future<Map<String, dynamic>> uploadReportEvidence({
    required Uint8List bytes,
    required String filename,
  }) async {
    var token = await _token();
    Future<http.StreamedResponse> send(String accessToken) {
      final request = http.MultipartRequest(
          'POST', BackendConfig.uri('/uploads'))
        ..headers['Authorization'] = 'Bearer $accessToken'
        ..fields['purpose'] = 'report_evidence'
        ..files.add(
            http.MultipartFile.fromBytes('file', bytes, filename: filename));
      return request.send().timeout(const Duration(seconds: 45));
    }

    var response = await send(token);
    if (response.statusCode == 401) {
      token = await AuthService.refreshAccessToken() ?? '';
      if (token.isNotEmpty) response = await send(token);
    }
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(response.statusCode, 'evidence_upload_failed');
    }
    final value = jsonDecode(body);
    if (value is! Map || (value['id']?.toString() ?? '').isEmpty) {
      throw const BackendException(500, 'invalid_upload_response');
    }
    return Map<String, dynamic>.from(value);
  }

  static Future<Map<String, dynamic>> uploadReportEvidenceForOwner({
    required AuthSessionOwner owner,
    required Uint8List bytes,
    required String filename,
  }) async {
    final token = await AuthService.accessTokenForOwner(owner);
    if (token == null || token.isEmpty) {
      throw const BackendException(401, 'authentication_required');
    }
    if (!await AuthService.isSessionOwnerDefinitelyCurrent(owner)) {
      throw const BackendException(401, 'authentication_required');
    }
    final request = http.MultipartRequest(
      'POST',
      BackendConfig.uri('/uploads'),
    )
      ..headers['Authorization'] = 'Bearer $token'
      ..fields['purpose'] = 'report_evidence'
      ..files.add(
        http.MultipartFile.fromBytes('file', bytes, filename: filename),
      );
    final response = await request.send().timeout(const Duration(seconds: 45));
    final body = await response.stream.bytesToString();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'evidence_upload_failed';
      try {
        final decoded = jsonDecode(body);
        if (decoded is Map) {
          final structured = decoded['error']?.toString().trim() ?? '';
          if (structured.isNotEmpty) code = structured;
        }
      } catch (_) {
        // An unstructured intermediary response must remain outcome-unknown.
      }
      throw BackendException(response.statusCode, code);
    }
    final value = jsonDecode(body);
    if (value is! Map || (value['id']?.toString() ?? '').isEmpty) {
      throw const BackendException(500, 'invalid_upload_response');
    }
    return Map<String, dynamic>.from(value);
  }
}
