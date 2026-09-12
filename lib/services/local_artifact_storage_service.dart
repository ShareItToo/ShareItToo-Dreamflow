import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lendify/services/file_download_stub.dart'
    if (dart.library.html) 'package:lendify/services/file_download_web.dart';
import 'package:lendify/services/local_artifact_storage_platform_stub.dart'
    if (dart.library.io) 'package:lendify/services/local_artifact_storage_platform_io.dart';
import 'package:lendify/services/messages_settings_service.dart';

class LocalArtifactSaveResult {
  final bool attempted;
  final bool success;
  final bool skipped;
  final bool duplicate;
  final bool permissionDenied;
  final bool handledPrimaryAction;
  final String? message;
  final String? storedPath;

  const LocalArtifactSaveResult({
    required this.attempted,
    required this.success,
    this.skipped = false,
    this.duplicate = false,
    this.permissionDenied = false,
    this.handledPrimaryAction = false,
    this.message,
    this.storedPath,
  });

  bool get shouldNotify => message != null && message!.trim().isNotEmpty;
}

class LocalArtifactStorageService {
  static const _registryKey = 'local_artifact_registry_v1';
  static const _galleryAlbum = 'ShareItToo';
  static const _pdfDirectory = 'shareittoo_receipts';

  static Future<LocalArtifactSaveResult> maybeSaveEvidencePhoto({
    required XFile file,
    required String bookingId,
    required bool isReturn,
    required bool fromCamera,
    Uint8List? webBytes,
  }) async {
    if (!fromCamera) {
      return const LocalArtifactSaveResult(attempted: false, success: false, skipped: true);
    }

    final settings = await MessagesSettingsService.get();
    if (!settings.autoSaveHandoverPhotos) {
      return const LocalArtifactSaveResult(attempted: false, success: false, skipped: true);
    }

    final registry = await _registry();
    final sourceFingerprint = '${file.path}|${file.name}|${isReturn ? 'return' : 'handover'}';
    final artifactKey = 'photo:$bookingId:${_stableHash(sourceFingerprint)}';
    if (registry.containsKey(artifactKey)) {
      return const LocalArtifactSaveResult(attempted: false, success: true, skipped: true, duplicate: true);
    }

    final timestamp = _timestamp(DateTime.now());
    final safeBookingId = _sanitize(bookingId);
    final phase = isReturn ? 'Rueckgabe' : 'Uebergabe';
    final baseName = 'SIT_${phase}_${safeBookingId}_$timestamp';

    try {
      if (kIsWeb) {
        final bytes = webBytes ?? await file.readAsBytes();
        final ext = _inferExtension(file.name, fallback: 'jpg');
        final filename = '$baseName.$ext';
        await triggerFileDownload(bytes, filename, mimeType: _imageMimeForExtension(ext));
        registry[artifactKey] = 'web-download:$filename';
        await _persistRegistry(registry);
        return LocalArtifactSaveResult(
          attempted: true,
          success: true,
          handledPrimaryAction: true,
          message: 'Foto wurde lokal im Browser heruntergeladen.',
          storedPath: registry[artifactKey],
        );
      }

      final result = await saveImageToGallery(
        sourcePath: file.path,
        targetFileName: baseName,
        album: _galleryAlbum,
      );
      if (!result.success) {
        return LocalArtifactSaveResult(
          attempted: true,
          success: false,
          permissionDenied: result.permissionDenied,
          message: result.permissionDenied
              ? 'Galeriezugriff verweigert. Das Foto bleibt trotzdem in ShareItToo erhalten.'
              : 'Foto konnte nicht zusätzlich lokal gespeichert werden. Der Vorgang in ShareItToo läuft weiter.',
        );
      }

      registry[artifactKey] = result.storedPath ?? 'gallery:$baseName';
      await _persistRegistry(registry);
      return LocalArtifactSaveResult(
        attempted: true,
        success: true,
        message: 'Foto wurde zusätzlich in der Galerie gespeichert.',
        storedPath: registry[artifactKey],
      );
    } catch (_) {
      return const LocalArtifactSaveResult(
        attempted: true,
        success: false,
        message: 'Foto konnte nicht zusätzlich lokal gespeichert werden. Der Vorgang in ShareItToo läuft weiter.',
      );
    }
  }

  static Future<LocalArtifactSaveResult> maybeSaveReceiptPdf({
    required Uint8List bytes,
    required String artifactKey,
    required String filename,
  }) async {
    final settings = await MessagesSettingsService.get();
    if (!settings.saveReceiptsLocally) {
      return const LocalArtifactSaveResult(attempted: false, success: false, skipped: true);
    }

    final registry = await _registry();
    if (registry.containsKey(artifactKey)) {
      return const LocalArtifactSaveResult(attempted: false, success: true, skipped: true, duplicate: true);
    }

    try {
      if (kIsWeb) {
        await triggerFileDownload(bytes, filename, mimeType: 'application/pdf');
        registry[artifactKey] = 'web-download:$filename';
        await _persistRegistry(registry);
        return LocalArtifactSaveResult(
          attempted: true,
          success: true,
          handledPrimaryAction: true,
          message: 'Beleg wurde lokal im Browser heruntergeladen.',
          storedPath: registry[artifactKey],
        );
      }

      final storedPath = await savePdfToDocuments(
        bytes: bytes,
        targetFileName: filename,
        directoryName: _pdfDirectory,
      );
      registry[artifactKey] = storedPath;
      await _persistRegistry(registry);
      return LocalArtifactSaveResult(
        attempted: true,
        success: true,
        message: 'Beleg wurde lokal gespeichert.',
        storedPath: storedPath,
      );
    } catch (_) {
      return const LocalArtifactSaveResult(
        attempted: true,
        success: false,
        message: 'Beleg konnte nicht lokal gespeichert werden. Der Vorgang in ShareItToo läuft weiter.',
      );
    }
  }

  static Future<Map<String, String>> _registry() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_registryKey);
    if (raw == null || raw.isEmpty) return <String, String>{};
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return <String, String>{};
    return decoded.map((key, value) => MapEntry(key.toString(), value.toString()));
  }

  static Future<void> _persistRegistry(Map<String, String> registry) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_registryKey, jsonEncode(registry));
  }

  static String _sanitize(String value) {
    return value.replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_').replaceAll(RegExp(r'_+'), '_');
  }

  static String _timestamp(DateTime dt) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${dt.year}${two(dt.month)}${two(dt.day)}_${two(dt.hour)}${two(dt.minute)}${two(dt.second)}';
  }

  static String _inferExtension(String raw, {String fallback = 'bin'}) {
    final idx = raw.lastIndexOf('.');
    if (idx == -1 || idx == raw.length - 1) return fallback;
    return raw.substring(idx + 1).toLowerCase();
  }

  static String _imageMimeForExtension(String ext) {
    switch (ext.toLowerCase()) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return 'image/jpeg';
    }
  }

  static String _stableHash(String input) {
    return base64Url.encode(utf8.encode(input)).replaceAll('=', '');
  }
}
