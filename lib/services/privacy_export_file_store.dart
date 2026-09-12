import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

import 'privacy_export_file_platform_stub.dart'
    if (dart.library.io) 'privacy_export_file_platform_io.dart';

const privacyExportFilename = 'shareittoo-data-export.json';

class PreparedPrivacyExportFile {
  final XFile file;
  final String? _controlledPath;
  final String? _temporaryDirectoryPath;

  const PreparedPrivacyExportFile._(
    this.file,
    this._controlledPath,
    this._temporaryDirectoryPath,
  );

  Future<void> removeControlledSource() => removePrivacyExportShareSource(
        _controlledPath,
        temporaryDirectoryPath: _temporaryDirectoryPath,
      );
}

class PrivacyExportFileStore {
  final String? temporaryDirectoryPath;

  const PrivacyExportFileStore({this.temporaryDirectoryPath});

  Future<PreparedPrivacyExportFile> prepare(Uint8List bytes) async {
    await purgeRetainedCopies();
    final path = await createPrivacyExportShareFile(
      bytes,
      privacyExportFilename,
      temporaryDirectoryPath: temporaryDirectoryPath,
    );
    return PreparedPrivacyExportFile._(
      path == null
          ? XFile.fromData(
              bytes,
              name: privacyExportFilename,
              mimeType: 'application/json',
            )
          : XFile(path, mimeType: 'application/json'),
      path,
      temporaryDirectoryPath,
    );
  }

  Future<void> purgeRetainedCopies() => purgeRetainedPrivacyExportFiles(
        temporaryDirectoryPath: temporaryDirectoryPath,
      );
}
