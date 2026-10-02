import 'dart:convert';
import 'dart:io';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/search_results_screen.dart';
import 'package:lendify/screens/explore_screen.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/image_gallery_overlay.dart';
import 'package:lendify/widgets/item_details_overlay.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final managedPhoto = BackendConfig.uri(
  '/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp',
).toString();

Item catalogItem({required bool synthetic}) {
  final json = jsonDecode(
      File('test/fixtures/staging_synthetic_catalog_public_listing.json')
          .readAsStringSync()) as Map<String, dynamic>;
  json['photos'] = [managedPhoto];
  if (!synthetic) {
    for (final key in [
      'catalogClass',
      'realOffer',
      'ownerDeclaration',
      'bookingAllowed',
      'paymentAllowed',
      'syntheticNotice'
    ]) {
      json.remove(key);
    }
    json['id'] = 'ordinary-public-listing';
    json['title'] = 'Ordinary public listing';
  }
  return Item.fromJson(json);
}

void main() {
  late _ImageClient client;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    client = _ImageClient();
    debugNetworkImageHttpClientProvider = () => client;
  });
  tearDown(() {
    debugNetworkImageHttpClientProvider = null;
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  });

  for (final synthetic in [true, false]) {
    imageTest(
        'guest canonical ${synthetic ? 'synthetic detail' : 'ordinary search card'} requests its public image',
        (tester) async {
      expect(BackendConfig.isManagedListingImageUrl(managedPhoto), isTrue);
      await tester.pumpWidget(ChangeNotifierProvider(
        create: (_) => LocalizationController(),
        child: MaterialApp(
            home: SearchResultsScreen(
          queryText: 'Katalog',
          results: [catalogItem(synthetic: synthetic)],
        )),
      ));
      await tester.pumpAndSettle();
      if (synthetic) {
        await tester.ensureVisible(find.text('Testansicht öffnen'));
        await tester.tap(find.text('Testansicht öffnen'));
        await tester.pumpAndSettle();
      }
      final image = tester.widget<Image>(find.byType(Image));
      final provider = image.image as NetworkImage;
      expect(provider.url, managedPhoto);
      expect(provider.headers ?? {}, isEmpty);
      await _decode(tester, provider);
      expect(client.urls, [Uri.parse(managedPhoto)]);
      expect(client.headers.values, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  imageTest('default private managed image remains absent for a guest',
      (tester) async {
    await tester.pumpWidget(MaterialApp(home: AppImage(url: managedPhoto)));
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsNothing);
    expect(client.urls, isEmpty);
  });

  for (final action in ['Anzeige öffnen', 'Verfügbarkeit prüfen']) {
    imageTest('public search options $action preserves the public image',
        (tester) async {
      await tester.pumpWidget(_localized(SearchResultsScreen(
        queryText: 'Katalog',
        results: [catalogItem(synthetic: false)],
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Anzeigenoptionen'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(action));
      await tester.pumpAndSettle();
      final provider =
          tester.widget<Image>(find.byType(Image).first).image as NetworkImage;
      expect(provider.url, managedPhoto);
      expect(provider.headers ?? {}, isEmpty);
      await _decode(tester, provider);
      expect(tester.takeException(), isNull);
    });
  }

  imageTest('public opt-in never forwards persisted credentials',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'auth_session_v1': jsonEncode({
        'userId': 'owner-a',
        'email': 'owner@example.invalid',
        'sessionId': 'synthetic-session',
        'createdAt': '2026-01-01T00:00:00Z',
        'accessToken': 'synthetic-access-token',
        'accessTokenExpiresAt':
            DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
      })
    });
    await tester.pumpWidget(MaterialApp(
        home: AppImage(url: managedPhoto, publicCatalogImage: true)));
    await tester.pumpAndSettle();
    final provider =
        tester.widget<Image>(find.byType(Image)).image as NetworkImage;
    expect(provider.headers ?? {}, isEmpty);
    await _decode(tester, provider);
    expect(client.headers.values, isEmpty);
  });

  imageTest(
      'forged public opt-in cannot turn a denied media response into pixels',
      (tester) async {
    client.statusCode = 401;
    await tester.pumpWidget(MaterialApp(
        home: AppImage(url: managedPhoto, publicCatalogImage: true)));
    final provider = NetworkImage(managedPhoto);
    await tester.runAsync(() async {
      await expectLater(
          _loadImage(provider), throwsA(isA<NetworkImageLoadException>()));
    });
    await tester.pumpAndSettle();
    expect(find.byType(RawImage), findsNothing);
    expect(client.headers.values, isEmpty);
    expect(tester.takeException(), isNull);
  });

  imageTest(
      'guest Explore carousel and live grid opt in; synthetic grid stays noncontractual',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({
      'items': jsonEncode([
        catalogItem(synthetic: false).toJson()..['id'] = 'ordinary',
        catalogItem(synthetic: true).toJson(),
      ]),
      'users': '[]',
    });
    await tester.pumpWidget(ChangeNotifierProvider(
      create: (_) => MainNavController(),
      child: _localized(const ExploreScreen()),
    ));
    await tester.pumpAndSettle();
    final images = tester
        .widgetList<AppImage>(find.byType(AppImage))
        .where((image) => image.url == managedPhoto)
        .toList();
    expect(images.length, greaterThanOrEqualTo(2),
        reason: 'ordinary carousel and live grid');
    expect(images.every((image) => image.publicCatalogImage), isTrue);
    expect(find.text(Item.syntheticCatalogNotice), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  imageTest('public detail and gallery preserve anonymous image access',
      (tester) async {
    await tester.pumpWidget(_localized(LinkedListingDetailsScreen(
      item: catalogItem(synthetic: false),
      publicCatalogImage: true,
    )));
    await tester.pumpAndSettle();
    final provider =
        tester.widget<Image>(find.byType(Image).first).image as NetworkImage;
    expect(provider.url, managedPhoto);
    expect(provider.headers ?? {}, isEmpty);
    await _decode(tester, provider);
    await tester.pumpWidget(MaterialApp(
        home: ImageGalleryOverlay(
      images: [managedPhoto],
      initialIndex: 0,
      isWishlisted: () => false,
      onWishlistPressed: () async {},
      publicCatalogImage: true,
    )));
    await tester.pumpAndSettle();
    expect(
        (tester.widget<Image>(find.byType(Image)).image as NetworkImage)
                .headers ??
            {},
        isEmpty);
  });

  imageTest('owner and default linked detail never opt into public reads',
      (tester) async {
    for (final screen in [
      OwnerListingDetailsScreen(item: catalogItem(synthetic: false)),
      LinkedListingDetailsScreen(item: catalogItem(synthetic: false)),
    ]) {
      await tester.pumpWidget(_localized(screen));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNothing);
      expect(client.urls, isEmpty);
    }
  });

  imageTest(
      'public opt-in rejects noncanonical and foreign URLs without any request',
      (tester) async {
    for (final url in [
      'https://shareittoo.com/api/v1/uploads/synthetic.jpg',
      managedPhoto.replaceFirst('shareittoo.com', 'foreign.invalid'),
      managedPhoto.replaceFirst('/uploads/', '/private/'),
      managedPhoto.replaceFirst('-full.', '-thumb.'),
      '$managedPhoto?token=synthetic-token',
      '$managedPhoto#fragment',
      managedPhoto.replaceFirst('://', '://user@'),
      managedPhoto.replaceFirst('/uploads/', '/uploads/%61'),
      'data:image/png;base64,AAAA',
    ]) {
      expect(BackendConfig.isPublicCatalogImageUrl(url), isFalse);
      await tester.pumpWidget(
          MaterialApp(home: AppImage(url: url, publicCatalogImage: true)));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNothing, reason: url);
      expect(client.urls, isEmpty);
    }
  });
}

Widget _localized(Widget screen) => ChangeNotifierProvider(
      create: (_) => LocalizationController(),
      child: MaterialApp(home: screen),
    );

void imageTest(String description, WidgetTesterCallback callback) {
  testWidgets(description, (tester) async {
    try {
      await callback(tester);
    } finally {
      debugNetworkImageHttpClientProvider = null;
    }
  });
}

Future<void> _decode(WidgetTester tester, NetworkImage provider) async {
  await tester.runAsync(() => _loadImage(provider));
  await tester.pump();
  expect(tester.widget<RawImage>(find.byType(RawImage).first).image, isNotNull);
}

Future<void> _loadImage(NetworkImage provider) async {
  final completion = Completer<void>();
  final stream = provider.resolve(ImageConfiguration.empty);
  final listener = ImageStreamListener((_, __) => completion.complete(),
      onError: (Object error, StackTrace? stack) =>
          completion.completeError(error, stack));
  stream.addListener(listener);
  try {
    await completion.future;
  } finally {
    stream.removeListener(listener);
  }
}

class _ImageClient extends Fake implements HttpClient {
  int statusCode = 200;
  final urls = <Uri>[];
  final headers = _Headers();
  @override
  set autoUncompress(bool value) {}
  @override
  Future<HttpClientRequest> getUrl(Uri url) async {
    urls.add(url);
    return _Request(headers, statusCode);
  }
}

class _Headers extends Fake implements HttpHeaders {
  final values = <String, Object>{};
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {
    values[name] = value;
  }
}

class _Request extends Fake implements HttpClientRequest {
  _Request(this.headers, this.statusCode);
  final int statusCode;
  @override
  final HttpHeaders headers;
  @override
  Future<HttpClientResponse> close() async => _Response(statusCode);
}

class _Response extends Stream<List<int>> implements HttpClientResponse {
  _Response(this.statusCode);
  static final bytes = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==');
  @override
  final int statusCode;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  StreamSubscription<List<int>> listen(void Function(List<int>)? onData,
          {Function? onError, void Function()? onDone, bool? cancelOnError}) =>
      Stream.value(bytes).listen(onData,
          onError: onError, onDone: onDone, cancelOnError: cancelOnError);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
