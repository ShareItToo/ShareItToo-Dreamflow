import 'dart:typed_data';

Future<String?> createPrivacyExportShareFile(
  Uint8List bytes,
  String filename, {
  String? temporaryDirectoryPath,
}) async =>
    null;

Future<void> removePrivacyExportShareSource(
  String? path, {
  String? temporaryDirectoryPath,
}) async {}

Future<void> purgeRetainedPrivacyExportFiles({
  String? temporaryDirectoryPath,
}) async {}
