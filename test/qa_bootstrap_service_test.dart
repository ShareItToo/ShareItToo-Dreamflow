import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/qa_bootstrap_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/test_builders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final ownerMain = buildTestUser('u1', name: 'Walid Chraibi');
  final renterMain = buildTestUser('u2', name: 'Max Mustermann');
  final outsider = buildTestUser('u3', name: 'Sarah Schmidt');

  final baseUsers = [ownerMain, renterMain, outsider];
  final baseItems = [
    buildTestItem(
      id: 'item-owner-main',
      ownerId: ownerMain.id,
      title: 'Main Drill',
    ),
    buildTestItem(
      id: 'item-renter-main',
      ownerId: renterMain.id,
      title: 'Renter Main Router',
    ),
    buildTestItem(
      id: 'item-outsider',
      ownerId: outsider.id,
      title: 'Outsider Speaker',
    ),
  ];

  Future<void> seedQaBase({String currentUserId = 'u1'}) async {
    QaRuntimeService.reset();
    final currentUser = baseUsers.singleWhere((u) => u.id == currentUserId);
    SharedPreferences.setMockInitialValues({
      'users': jsonEncode(baseUsers.map((u) => u.toJson()).toList()),
      'items': jsonEncode(baseItems.map((i) => i.toJson()).toList()),
      'rental_requests': '[]',
      'message_threads_v1': '[]',
      'notifications': '[]',
      'review_reminders_v1': '[]',
      'multi_reviews_v1': '[]',
      'currentUser': jsonEncode(currentUser.toJson()),
    });
  }

  setUp(() async {
    await seedQaBase();
  });

  test('qa=1 without persona keeps u1 default', () async {
    final state = await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1'),
      debugMode: true,
    );

    final current = await DataService.getCurrentUser();
    expect(state, DeveloperUserState.loggedIn);
    expect(current, isNotNull);
    expect(current!.id, 'u1');
    expect(current.displayName, 'Walid Chraibi');
  });

  test('qa=1&persona=u1 selects u1 deterministically', () async {
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u1'),
      debugMode: true,
    );

    final current = await DataService.getCurrentUser();
    expect(current, isNotNull);
    expect(current!.id, 'u1');
    expect(current.displayName, 'Walid Chraibi');
  });

  test('qa=1&persona=u2 selects u2 deterministically', () async {
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u2'),
      debugMode: true,
    );

    final current = await DataService.getCurrentUser();
    expect(current, isNotNull);
    expect(current!.id, 'u2');
    expect(current.displayName, 'Max Mustermann');
  });

  test('qa persona stays tab-local across shared preferences reload', () async {
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u2'),
      debugMode: true,
    );
    final prefs = await SharedPreferences.getInstance();
    final persistedBeforeReload = jsonDecode(
      prefs.getString('currentUser')!,
    ) as Map<String, dynamic>;

    await prefs.reload();
    final runtimeCurrent = await DataService.getCurrentUser();

    expect(runtimeCurrent?.id, 'u2');
    expect(persistedBeforeReload['id'], 'u1');
    expect(jsonDecode(prefs.getString('currentUser')!)['id'], 'u1');
  });

  test('unknown persona falls back to u1 default safely', () async {
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u999'),
      debugMode: true,
    );

    final current = await DataService.getCurrentUser();
    expect(current, isNotNull);
    expect(current!.id, 'u1');
  });

  test('without qa mode persona=u2 does not switch persona', () async {
    final state = await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?persona=u2'),
      debugMode: true,
    );

    expect(state, isNull);
    final current = await DataService.getCurrentUser();
    expect(current, isNotNull);
    expect(current!.id, 'u1');
  });

  test('release/non-debug mode blocks persona bootstrap', () async {
    final state = await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u2'),
      debugMode: false,
    );

    expect(state, isNull);
    final current = await DataService.getCurrentUser();
    expect(current, isNotNull);
    expect(current!.id, 'u1');
  });

  test('normal runtime never creates a demo message thread', () async {
    QaRuntimeService.reset();
    SharedPreferences.setMockInitialValues({'message_threads_v1': '[]'});

    final created = await DataService.ensureSeededMessageThreadsForUser('u1');
    final prefs = await SharedPreferences.getInstance();

    expect(created, isFalse);
    expect(jsonDecode(prefs.getString('message_threads_v1')!), isEmpty);
  });

  test('shared request and thread stay unchanged for both u1 and u2', () async {
    await seedQaBase(currentUserId: 'u1');
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u1'),
      debugMode: true,
    );
    final bootedOwner = await DataService.getCurrentUser();
    expect(bootedOwner, isNotNull);
    expect(bootedOwner!.id, 'u1');

    final ownerRequest = await DataService.getRentalRequestById(
      'qa_shared_request_u1_u2',
    );
    final ownerThread = await DataService.getMessageThreadByRequestId(
      'qa_shared_request_u1_u2',
    );

    expect(ownerRequest, isNotNull);
    expect(ownerRequest!.ownerId, 'u1');
    expect(ownerRequest.renterId, 'u2');
    expect(ownerThread, isNotNull);
    expect(ownerThread!.id, 'qa_shared_thread_u1_u2');

    await seedQaBase(currentUserId: 'u2');
    await QaBootstrapService.maybeBootstrap(
      uri: Uri.parse('http://127.0.0.1:8131/?qa=1&persona=u2'),
      debugMode: true,
    );
    final bootedRenter = await DataService.getCurrentUser();
    expect(bootedRenter, isNotNull);
    expect(bootedRenter!.id, 'u2');

    final renterRequest = await DataService.getRentalRequestById(
      'qa_shared_request_u1_u2',
    );
    final renterThread = await DataService.getMessageThreadByRequestId(
      'qa_shared_request_u1_u2',
    );

    expect(renterRequest, isNotNull);
    expect(renterRequest!.id, ownerRequest.id);
    expect(renterThread, isNotNull);
    expect(renterThread!.id, ownerThread.id);
  });
}
