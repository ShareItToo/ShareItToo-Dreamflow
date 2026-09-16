import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/privacy_export_file_platform_io.dart';
import 'package:lendify/services/privacy_export_file_store.dart';
import 'package:lendify/widgets/privacy_export_cache_lifecycle_host.dart';

class _RecordingPrivacyExportFileStore extends PrivacyExportFileStore {
  int purgeCalls = 0;

  @override
  Future<void> purgeRetainedCopies() async {
    purgeCalls += 1;
  }
}

void main() {
  test('privacy export cache cleanup is exact and preserves unrelated files',
      () async {
    final root =
        await Directory.systemTemp.createTemp('sit_export_store_test_');
    addTearDown(() => root.delete(recursive: true));

    final controlled = await root.createTemp('sit_privacy_export_');
    await File('${controlled.path}/$privacyExportFilename')
        .writeAsString('controlled');
    final legacy = Directory(
      '${root.path}/123e4567-e89b-42d3-a456-426614174000',
    );
    await legacy.create();
    await File('${legacy.path}/$privacyExportFilename').writeAsString('legacy');
    final plugin = Directory('${root.path}/share_plus');
    await plugin.create();
    await File('${plugin.path}/$privacyExportFilename').writeAsString('copy');
    final unrelated = File('${root.path}/unrelated.txt');
    final unrelatedPlugin = File('${plugin.path}/other-share.txt');
    await unrelated.writeAsString('keep');
    await unrelatedPlugin.writeAsString('keep');

    await purgeRetainedPrivacyExportFiles(
      temporaryDirectoryPath: root.path,
    );

    expect(await controlled.exists(), isFalse);
    expect(await legacy.exists(), isFalse);
    expect(
      await File('${plugin.path}/$privacyExportFilename').exists(),
      isFalse,
    );
    expect(await unrelated.exists(), isTrue);
    expect(await unrelatedPlugin.exists(), isTrue);
  });

  test('prepared export source is private-scope controlled and removable',
      () async {
    final root =
        await Directory.systemTemp.createTemp('sit_export_store_test_');
    addTearDown(() => root.delete(recursive: true));
    final store = PrivacyExportFileStore(temporaryDirectoryPath: root.path);
    final expected = Uint8List.fromList(<int>[1, 2, 3, 4]);

    final prepared = await store.prepare(expected);
    final file = File(prepared.file.path);
    expect(await file.readAsBytes(), expected);
    expect(file.parent.parent.absolute.path, root.absolute.path);
    expect(file.parent.path, contains('sit_privacy_export_'));

    await prepared.removeControlledSource();
    expect(await file.parent.exists(), isFalse);
  });

  test('controlled cleanup refuses an unrelated exact-named file', () async {
    final root =
        await Directory.systemTemp.createTemp('sit_export_store_test_');
    addTearDown(() => root.delete(recursive: true));
    final unrelated = File('${root.path}/$privacyExportFilename');
    await unrelated.writeAsString('keep');

    await expectLater(
      removePrivacyExportShareSource(
        unrelated.path,
        temporaryDirectoryPath: root.path,
      ),
      throwsA(isA<FileSystemException>()),
    );
    expect(await unrelated.readAsString(), 'keep');
  });

  testWidgets('returning to the app purges retained privacy export copies',
      (tester) async {
    final store = _RecordingPrivacyExportFileStore();
    await tester.pumpWidget(
      MaterialApp(
        home: PrivacyExportCacheLifecycleHost(
          fileStore: store,
          child: const SizedBox(),
        ),
      ),
    );

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(store.purgeCalls, 0);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(store.purgeCalls, 1);
  });
}
