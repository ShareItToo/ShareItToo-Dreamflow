import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lendify/models/private_shelf_item.dart';
import 'package:lendify/screens/private_shelf_screen.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_http.dart';
import 'package:lendify/services/listing_mutation_service.dart';
import 'package:lendify/services/private_shelf_gateway.dart';
import 'package:lendify/services/session_transition_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';

import 'support/test_builders.dart';

const _itemA = 'shelf_item_11111111-1111-4111-8111-111111111111';
const _itemB = 'shelf_item_22222222-2222-4222-8222-222222222222';
const _itemServer = 'shelf_item_33333333-3333-4333-8333-333333333333';
const _mediaId = '44444444-4444-4444-8444-444444444444';

final Uint8List _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);

PrivateShelfMedia _media(String itemId) => PrivateShelfMedia(
      mediaId: _mediaId,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      fullPath: '/v1/private-shelf/$itemId/media/$_mediaId/full',
      thumbnailPath: '/v1/private-shelf/$itemId/media/$_mediaId/thumbnail',
      createdAt: DateTime.utc(2026, 10, 1, 8),
    );

PrivateShelfItem _item(
  String id,
  String title, {
  bool withMedia = false,
}) =>
    PrivateShelfItem(
      shelfItemId: id,
      domainVersion: privateShelfDomainVersion,
      title: title,
      categoryKey: 'werkzeug',
      condition: PrivateShelfCondition.good,
      media: withMedia ? <PrivateShelfMedia>[_media(id)] : const [],
      createdAt: DateTime.utc(2026, 10, 1, 8),
      updatedAt: DateTime.utc(2026, 10, 1, 8),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'creates, uploads, reloads authoritative media, views and confirms delete accessibly',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final semantics = tester.ensureSemantics();
    final contextService = _SwitchableContextService();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Vorhandenes Regalobjekt')],
      accountB: <PrivateShelfItem>[],
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        photoPicker: () async => XFile.fromData(_png, name: 'privat.png'),
        idempotencyKeyFactory: () => 'shelf-widget-create-0001',
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Privat · kein Inserat'), findsWidgets);
    expect(
      find.bySemanticsLabel(
        'Privat. Kein Inserat, keine Suche, Reservierung, Buchung oder Zahlung.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('private-shelf-new')));
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('private-shelf-title')),
      'Akkuschrauber',
    );
    await tester.enterText(
      find.byKey(const Key('private-shelf-category')),
      'werkzeug',
    );
    await tester.ensureVisible(find.byKey(const Key('private-shelf-create')));
    await tester.tap(find.byKey(const Key('private-shelf-create')));
    await tester.pumpAndSettle();

    expect(gateway.creates, 1);
    expect(gateway.lastCreateKey, 'shelf-widget-create-0001');
    expect(find.textContaining('kein Inserat erstellt'), findsOneWidget);

    await tester
        .ensureVisible(find.byKey(const Key('private-shelf-pick-photo')));
    await tester.tap(find.byKey(const Key('private-shelf-pick-photo')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Noch nicht hochgeladen'), findsOneWidget);
    await tester.tap(find.byKey(const Key('private-shelf-upload-photo')));
    await tester.pumpAndSettle();

    expect(gateway.uploads, 1);
    expect(gateway.loads, greaterThanOrEqualTo(1));
    expect(find.textContaining('Serverstand neu geladen'), findsOneWidget);
    final photo = find.bySemanticsLabel(RegExp('vergrößern'));
    expect(photo, findsOneWidget);
    final photoButton = find.byKey(
      const ValueKey('private-shelf-photo-$_mediaId'),
    );
    expect(photoButton, findsOneWidget);

    await tester.ensureVisible(photoButton);
    await tester.pumpAndSettle();
    await tester.tap(photoButton);
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel(RegExp('Privates Foto von')),
      findsAtLeastNWidgets(1),
    );
    expect(find.byType(Dialog), findsOneWidget);
    expect(
      tester.getSize(find.byTooltip('Foto schließen')).shortestSide,
      greaterThanOrEqualTo(48),
    );
    await tester.tap(find.byKey(const Key('private-shelf-photo-close')));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);

    await tester.ensureVisible(find.byKey(const Key('private-shelf-delete')));
    expect(
      tester.getSize(find.byKey(const Key('private-shelf-delete'))).height,
      greaterThanOrEqualTo(48),
    );
    await tester.tap(find.byKey(const Key('private-shelf-delete')));
    await tester.pumpAndSettle();
    expect(find.text('Privates Objekt löschen?'), findsOneWidget);
    await tester.tap(find.text('Privat löschen'));
    await tester.pumpAndSettle();
    expect(gateway.deletes, 1);
    expect(find.text('Privates Objekt gelöscht.'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets(
      'picker cancel is inert and an unknown upload outcome is never retried',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Privates A')],
      accountB: <PrivateShelfItem>[],
    )..uploadError = const BackendException(503, 'outcome_unknown');
    var pickCalls = 0;

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        photoPicker: () async {
          pickCalls += 1;
          return pickCalls == 1 ? null : XFile.fromData(_png, name: 'a.png');
        },
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Privates A'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('private-shelf-pick-photo')));
    await tester.pumpAndSettle();
    expect(gateway.uploads, 0);
    expect(find.byKey(const Key('private-shelf-upload-photo')), findsNothing);

    await tester.tap(find.byKey(const Key('private-shelf-pick-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('private-shelf-upload-photo')));
    await tester.pumpAndSettle();
    expect(gateway.uploads, 1);
    expect(find.textContaining('nicht automatisch erneut'), findsOneWidget);
    expect(find.byKey(const Key('private-shelf-reload-after-upload')),
        findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const Key('private-shelf-upload-photo')),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets(
      'account switch, logout and restart discard a late account-A list',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final lateList = Completer<List<PrivateShelfItem>>();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Fremdes A', withMedia: true)],
      accountB: <PrivateShelfItem>[_item(_itemB, 'Eigenes B')],
      firstAccountAList: lateList,
    );

    Widget screen() => MaterialApp(
          home: PrivateShelfScreen(
            gateway: gateway,
            listingMutationService: contextService,
            enableForTesting: true,
          ),
        );

    await tester.pumpWidget(screen());
    await tester.pump();
    contextService.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.text('Eigenes B'), findsOneWidget);
    expect(find.text('Fremdes A'), findsNothing);

    lateList.complete(<PrivateShelfItem>[
      _item(_itemA, 'Fremdes A', withMedia: true),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Fremdes A'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(find.text('Eigenes B'), findsOneWidget);
    expect(find.text('Fremdes A'), findsNothing);

    contextService.logout();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.text('Eigenes B'), findsNothing);
    expect(find.textContaining('aktuell angemeldete Konto'), findsOneWidget);
  });

  testWidgets('late account-A private image bytes never render for account B',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final lateMedia = Completer<PrivateShelfMediaBytes>();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Fremdes A', withMedia: true)],
      accountB: <PrivateShelfItem>[_item(_itemB, 'Eigenes B')],
      firstAccountAMedia: lateMedia,
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Fremdes A'), findsOneWidget);

    contextService.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    lateMedia.complete(
      PrivateShelfMediaBytes(bytes: _png, mimeType: 'image/png'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Eigenes B'), findsOneWidget);
    expect(find.text('Fremdes A'), findsNothing);
    expect(find.bySemanticsLabel(RegExp('Fremdes A')), findsNothing);
  });

  testWidgets('late account-A upload and delete never mutate account-B UI',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final upload = Completer<void>();
    final delete = Completer<void>();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Privates A')],
      accountB: <PrivateShelfItem>[_item(_itemB, 'Privates B')],
      uploadBarrier: upload,
      deleteBarrier: delete,
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        photoPicker: () async => XFile.fromData(_png, name: 'a.png'),
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Privates A'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('private-shelf-pick-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('private-shelf-upload-photo')));
    await tester.pump();
    contextService.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    upload.complete();
    await tester.pumpAndSettle();
    expect(find.text('Privates B'), findsOneWidget);
    expect(find.text('Privates A'), findsNothing);
    expect(find.textContaining('Foto hochgeladen'), findsNothing);

    await tester.tap(find.text('Privates B'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('private-shelf-delete')));
    await tester.tap(find.byKey(const Key('private-shelf-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Privat löschen'));
    await tester.pump();
    contextService.logout();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    delete.complete();
    await tester.pumpAndSettle();
    expect(find.text('Privates Objekt gelöscht.'), findsNothing);
    expect(find.textContaining('aktuell angemeldete Konto'), findsOneWidget);
  });

  testWidgets(
      'private photo modal is single-flight and account switch dismisses it',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final fullPhoto = Completer<PrivateShelfMediaBytes>();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[
        _item(_itemA, 'Privates Foto A', withMedia: true),
      ],
      accountB: <PrivateShelfItem>[_item(_itemB, 'Eigenes B')],
      fullMediaBarrier: fullPhoto,
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Privates Foto A'));
    await tester.pumpAndSettle();
    final photo = find.byKey(
      const ValueKey('private-shelf-photo-$_mediaId'),
    );
    await tester.ensureVisible(photo);
    final openPhoto = tester.widget<InkWell>(photo).onTap!;
    openPhoto();
    openPhoto();
    await tester.pump();
    expect(gateway.fullMediaReads, 1);

    fullPhoto.complete(
      PrivateShelfMediaBytes(bytes: _png, mimeType: 'image/png'),
    );
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);

    contextService.activateAccountB();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);
    expect(find.textContaining('Privates Foto A'), findsNothing);
    expect(find.text('Eigenes B'), findsOneWidget);
  });

  testWidgets(
      'delete modal is single-flight and logout dismisses all account content',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[_item(_itemA, 'Nur Account A')],
      accountB: <PrivateShelfItem>[],
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nur Account A'));
    await tester.pumpAndSettle();
    final delete = find.byKey(const Key('private-shelf-delete'));
    await tester.ensureVisible(delete);
    final openDelete = tester.widget<OutlinedButton>(delete).onPressed!;
    openDelete();
    openDelete();
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.textContaining('Nur Account A'), findsWidgets);

    contextService.logout();
    SharedPersistenceSync.notify(
      SharedPersistenceSync.accountSecurityStateKey,
    );
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.textContaining('Nur Account A'), findsNothing);
    expect(find.textContaining('aktuell angemeldete Konto'), findsOneWidget);
  });

  testWidgets(
      'authoritative refresh reconciles detail and media but preserves draft key',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final contextService = _SwitchableContextService();
    final staleThumbnail = Completer<PrivateShelfMediaBytes>();
    final gateway = _ShelfGateway(
      accountA: <PrivateShelfItem>[
        _item(_itemA, 'Alter Serverstand', withMedia: true),
      ],
      accountB: <PrivateShelfItem>[],
      firstAccountAMedia: staleThumbnail,
    );

    await tester.pumpWidget(MaterialApp(
      home: PrivateShelfScreen(
        gateway: gateway,
        listingMutationService: contextService,
        idempotencyKeyFactory: () => 'shelf-refresh-draft-0001',
        enableForTesting: true,
      ),
    ));
    await tester.pumpAndSettle();
    expect(
      tester.widget<ListView>(find.byType(ListView)).physics,
      isA<AlwaysScrollableScrollPhysics>(),
    );
    await tester.tap(find.text('Alter Serverstand'));
    await tester.pumpAndSettle();
    final mediaReadsBeforeRefresh = gateway.mediaReads;

    gateway.accountA[0] = _item(
      _itemA,
      'Neuer Serverstand',
      withMedia: true,
    );
    await tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Alter Serverstand'), findsNothing);
    expect(find.text('Neuer Serverstand'), findsWidgets);
    expect(gateway.mediaReads, greaterThan(mediaReadsBeforeRefresh));
    staleThumbnail.complete(
      PrivateShelfMediaBytes(bytes: _png, mimeType: 'image/png'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Alter Serverstand'), findsNothing);

    gateway.accountA.clear();
    await tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Neuer Serverstand'), findsNothing);
    expect(find.byKey(const Key('private-shelf-delete')), findsNothing);
    expect(find.text('Noch kein privates Objekt gespeichert.'), findsOneWidget);

    gateway.createError = const BackendException(503, 'not_confirmed');
    await tester.tap(find.byKey(const Key('private-shelf-new')));
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('private-shelf-title')),
      'Unversendeter Entwurf',
    );
    await tester.enterText(
      find.byKey(const Key('private-shelf-category')),
      'werkzeug',
    );
    await tester.ensureVisible(find.byKey(const Key('private-shelf-create')));
    await tester.tap(find.byKey(const Key('private-shelf-create')));
    await tester.pumpAndSettle();
    expect(gateway.createKeys, <String>['shelf-refresh-draft-0001']);

    gateway.listError = const BackendException(503, 'list_unavailable');
    await tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Unversendeter Entwurf'), findsOneWidget);
    expect(find.text('werkzeug'), findsOneWidget);
    expect(gateway.createKeys, <String>['shelf-refresh-draft-0001']);

    gateway.listError = null;
    await tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    await tester.pumpAndSettle();
    expect(find.text('Unversendeter Entwurf'), findsOneWidget);
    expect(find.text('werkzeug'), findsOneWidget);

    gateway.createError = null;
    await tester.tap(find.byKey(const Key('private-shelf-create')));
    await tester.pumpAndSettle();
    expect(gateway.createKeys, <String>[
      'shelf-refresh-draft-0001',
      'shelf-refresh-draft-0001',
    ]);
  });
}

final _userA = buildTestUser(
  'account-a',
  name: 'Account A',
  email: 'a@example.invalid',
);
final _userB = buildTestUser(
  'account-b',
  name: 'Account B',
  email: 'b@example.invalid',
);

ListingMutationContext _context(String id, int epoch) => ListingMutationContext(
      user: id == 'account-a' ? _userA : _userB,
      owner: SessionTransitionOwner(
        authOwner: AuthSessionOwner(
          userId: id,
          sessionId: 'session-$id',
          email: id == 'account-a' ? _userA.email : _userB.email,
          createdAt: DateTime.utc(2026, 10, 1, epoch),
          epoch: epoch,
        ),
        profileUserId: id,
      ),
    );

class _SwitchableContextService extends ListingMutationService {
  final ListingMutationContext contextA = _context('account-a', 1);
  final ListingMutationContext contextB = _context('account-b', 2);
  bool accountBActive = false;
  bool loggedOut = false;

  void activateAccountB() => accountBActive = true;
  void logout() => loggedOut = true;

  @override
  Future<ListingMutationContext?> loadCurrentContext() async => loggedOut
      ? null
      : accountBActive
          ? contextB
          : contextA;

  @override
  Future<bool> isContextCurrent(ListingMutationContext context) async =>
      loggedOut
          ? false
          : accountBActive
              ? identical(context, contextB)
              : identical(context, contextA);
}

class _ShelfGateway implements PrivateShelfGateway {
  _ShelfGateway({
    required List<PrivateShelfItem> accountA,
    required List<PrivateShelfItem> accountB,
    this.firstAccountAList,
    this.firstAccountAMedia,
    this.uploadBarrier,
    this.deleteBarrier,
    this.fullMediaBarrier,
  })  : accountA = List<PrivateShelfItem>.from(accountA),
        accountB = List<PrivateShelfItem>.from(accountB);

  final List<PrivateShelfItem> accountA;
  final List<PrivateShelfItem> accountB;
  final Completer<List<PrivateShelfItem>>? firstAccountAList;
  final Completer<PrivateShelfMediaBytes>? firstAccountAMedia;
  final Completer<void>? uploadBarrier;
  final Completer<void>? deleteBarrier;
  final Completer<PrivateShelfMediaBytes>? fullMediaBarrier;
  int creates = 0;
  int loads = 0;
  int uploads = 0;
  int deletes = 0;
  int mediaReads = 0;
  int fullMediaReads = 0;
  bool _usedDelayedList = false;
  bool _usedDelayedMedia = false;
  String? lastCreateKey;
  final List<String> createKeys = <String>[];
  BackendException? listError;
  BackendException? createError;
  BackendException? uploadError;

  List<PrivateShelfItem> _for(AuthSessionOwner owner) =>
      owner.userId == 'account-a' ? accountA : accountB;

  @override
  Future<List<PrivateShelfItem>> list(AuthSessionOwner owner) {
    if (owner.userId == 'account-a' &&
        firstAccountAList != null &&
        !_usedDelayedList) {
      _usedDelayedList = true;
      return firstAccountAList!.future;
    }
    if (listError case final error?) {
      return Future<List<PrivateShelfItem>>.error(error);
    }
    return Future<List<PrivateShelfItem>>.value(
      List<PrivateShelfItem>.unmodifiable(_for(owner)),
    );
  }

  @override
  Future<PrivateShelfItem> load({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async {
    loads += 1;
    return _for(owner).singleWhere((item) => item.shelfItemId == shelfItemId);
  }

  @override
  Future<PrivateShelfWriteResult> create({
    required AuthSessionOwner owner,
    required PrivateShelfItemPayload payload,
    required String idempotencyKey,
  }) async {
    creates += 1;
    lastCreateKey = idempotencyKey;
    createKeys.add(idempotencyKey);
    if (createError case final error?) throw error;
    final item = PrivateShelfItem(
      shelfItemId: _itemServer,
      domainVersion: privateShelfDomainVersion,
      title: payload.title,
      categoryKey: payload.categoryKey,
      condition: payload.condition,
      media: const <PrivateShelfMedia>[],
      createdAt: DateTime.utc(2026, 10, 1, 9),
      updatedAt: DateTime.utc(2026, 10, 1, 9),
    );
    _for(owner).insert(0, item);
    return PrivateShelfWriteResult(shelfItem: item, replayed: false);
  }

  @override
  Future<void> delete({
    required AuthSessionOwner owner,
    required String shelfItemId,
  }) async {
    deletes += 1;
    if (deleteBarrier != null) await deleteBarrier!.future;
    _for(owner).removeWhere((item) => item.shelfItemId == shelfItemId);
  }

  @override
  Future<PrivateShelfMedia> uploadMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required Uint8List bytes,
    required String filename,
  }) async {
    uploads += 1;
    if (uploadBarrier != null) await uploadBarrier!.future;
    if (uploadError case final error?) throw error;
    final source = _for(owner);
    final index = source.indexWhere((item) => item.shelfItemId == shelfItemId);
    final current = source[index];
    final media = _media(shelfItemId);
    source[index] = PrivateShelfItem(
      shelfItemId: current.shelfItemId,
      domainVersion: current.domainVersion,
      title: current.title,
      categoryKey: current.categoryKey,
      condition: current.condition,
      media: <PrivateShelfMedia>[...current.media, media],
      createdAt: current.createdAt,
      updatedAt: DateTime.utc(2026, 10, 1, 10),
    );
    return media;
  }

  @override
  Future<PrivateShelfMediaBytes> readMedia({
    required AuthSessionOwner owner,
    required String shelfItemId,
    required PrivateShelfMedia media,
    required bool thumbnail,
  }) async {
    mediaReads += 1;
    if (!thumbnail) {
      fullMediaReads += 1;
      if (fullMediaBarrier != null) return fullMediaBarrier!.future;
    }
    if (owner.userId == 'account-a' &&
        firstAccountAMedia != null &&
        !_usedDelayedMedia) {
      _usedDelayedMedia = true;
      return firstAccountAMedia!.future;
    }
    return PrivateShelfMediaBytes(bytes: _png, mimeType: 'image/png');
  }
}
