import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const String onDeviceListingAnalysisModelVersion =
    'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1';

class OnDeviceListingAnalysisException implements Exception {
  const OnDeviceListingAnalysisException(this.code);

  final String code;

  @override
  String toString() => 'OnDeviceListingAnalysisException($code)';
}

class OnDeviceListingAnalysisService {
  const OnDeviceListingAnalysisService({this.platformOverride});

  @visibleForTesting
  final TargetPlatform? platformOverride;

  static const MethodChannel _channel =
      MethodChannel('com.shareittoo.app/on_device_listing_ai');

  Future<List<Map<String, dynamic>>> analyzeImagePaths(
    List<String> imagePaths,
  ) async {
    if (kIsWeb ||
        (platformOverride ?? defaultTargetPlatform) != TargetPlatform.android) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_analysis_android_required',
      );
    }
    if (imagePaths.isEmpty || imagePaths.length > 4) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_image_count_invalid',
      );
    }
    if (imagePaths.any((path) => path.trim().isEmpty || path.length > 1024)) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_image_path_invalid',
      );
    }
    final Object? raw;
    try {
      raw = await _channel.invokeMethod<Object?>(
        'analyzeImages',
        <String, Object>{'imagePaths': List<String>.unmodifiable(imagePaths)},
      );
    } on PlatformException catch (failure) {
      final code = failure.code.startsWith('on_device_listing_')
          ? failure.code
          : 'on_device_listing_analysis_failed';
      throw OnDeviceListingAnalysisException(code);
    }
    if (raw is! List || raw.length != imagePaths.length) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_result_invalid',
      );
    }
    return List<Map<String, dynamic>>.unmodifiable(
      raw.map(_normalizeObservation),
    );
  }

  static Map<String, dynamic> _normalizeObservation(Object? raw) {
    if (raw is! Map ||
        !setEquals(raw.keys.map((key) => key.toString()).toSet(),
            const <String>{'modelVersion', 'labels', 'ocrText'})) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_observation_invalid',
      );
    }
    final modelVersion = raw['modelVersion'];
    final labels = raw['labels'];
    final ocrText = raw['ocrText'];
    if (modelVersion != onDeviceListingAnalysisModelVersion ||
        labels is! List ||
        labels.length > 20 ||
        ocrText is! String ||
        ocrText.length > 1000) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_observation_invalid',
      );
    }
    return Map<String, dynamic>.unmodifiable(<String, dynamic>{
      'modelVersion': modelVersion,
      'labels': List<Map<String, dynamic>>.unmodifiable(
        labels.map(_normalizeLabel),
      ),
      'ocrText': ocrText.trim(),
    });
  }

  static Map<String, dynamic> _normalizeLabel(Object? raw) {
    if (raw is! Map ||
        !setEquals(raw.keys.map((key) => key.toString()).toSet(),
            const <String>{'text', 'confidence', 'index'})) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_label_invalid',
      );
    }
    final text = raw['text'];
    final confidence = raw['confidence'];
    final index = raw['index'];
    if (text is! String ||
        text.trim().isEmpty ||
        text.length > 80 ||
        confidence is! num ||
        !confidence.isFinite ||
        confidence < 0 ||
        confidence > 1 ||
        index is! int ||
        index < 0 ||
        index > 10000) {
      throw const OnDeviceListingAnalysisException(
        'on_device_listing_label_invalid',
      );
    }
    return Map<String, dynamic>.unmodifiable(<String, dynamic>{
      'text': text.trim(),
      'confidence': double.parse(confidence.toStringAsFixed(4)),
      'index': index,
    });
  }
}
