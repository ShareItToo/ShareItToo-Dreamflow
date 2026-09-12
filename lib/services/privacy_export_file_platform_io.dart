import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

const _controlledDirectoryPrefix = 'sit_privacy_export_';
const _legacyTemporaryDirectoryPattern =
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

String _basename(String path) =>
    path.split(Platform.pathSeparator).where((part) => part.isNotEmpty).last;

Future<Directory> _temporaryDirectory(String? explicitPath) async =>
    explicitPath == null
        ? getTemporaryDirectory()
        : Directory(explicitPath).absolute;

Future<String?> createPrivacyExportShareFile(
  Uint8List bytes,
  String filename, {
  String? temporaryDirectoryPath,
}) async {
  final root = await _temporaryDirectory(temporaryDirectoryPath);
  await root.create(recursive: true);
  final directory = await root.createTemp(_controlledDirectoryPrefix);
  final file = File('${directory.path}${Platform.pathSeparator}$filename');
  await file.writeAsBytes(bytes, flush: true);
  return file.path;
}

Future<void> removePrivacyExportShareSource(
  String? path, {
  String? temporaryDirectoryPath,
}) async {
  if (path == null) return;
  final root = await _temporaryDirectory(temporaryDirectoryPath);
  final file = File(path).absolute;
  final parent = file.parent;
  if (parent.parent.absolute.path != root.absolute.path ||
      !_basename(parent.path).startsWith(_controlledDirectoryPrefix) ||
      _basename(file.path) != 'shareittoo-data-export.json') {
    throw const FileSystemException(
      'Refusing to remove a file outside the controlled privacy-export cache.',
    );
  }
  if (await parent.exists()) await parent.delete(recursive: true);
}

Future<void> purgeRetainedPrivacyExportFiles({
  String? temporaryDirectoryPath,
}) async {
  final root = await _temporaryDirectory(temporaryDirectoryPath);
  if (!await root.exists()) return;

  final legacyPattern = RegExp(_legacyTemporaryDirectoryPattern);
  await for (final entity in root.list(followLinks: false)) {
    if (entity is! Directory) continue;
    final name = _basename(entity.path);
    if (name.startsWith(_controlledDirectoryPrefix)) {
      await entity.delete(recursive: true);
      continue;
    }
    if (!legacyPattern.hasMatch(name)) continue;
    final entries = await entity.list(followLinks: false).toList();
    if (entries.length == 1 &&
        entries.single is File &&
        _basename(entries.single.path) == 'shareittoo-data-export.json') {
      await entity.delete(recursive: true);
    }
  }

  final pluginCopy = File(
    '${root.path}${Platform.pathSeparator}share_plus'
    '${Platform.pathSeparator}shareittoo-data-export.json',
  );
  if (await pluginCopy.exists()) await pluginCopy.delete();
}
