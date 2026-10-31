import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/on_device_listing_analysis_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.shareittoo.app/on_device_listing_ai');

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('normalizes a bounded native ML Kit result', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'analyzeImages');
      expect(call.arguments, <String, Object>{
        'imagePaths': <String>['/private/app/cache/drill.jpg'],
      });
      return <Object?>[
        <String, Object?>{
          'modelVersion': onDeviceListingAnalysisModelVersion,
          'labels': <Object?>[
            <String, Object?>{
              'text': 'Power drill',
              'confidence': 0.918765,
              'index': 42,
            },
          ],
          'ocrText': 'Bosch GSR18V',
        },
      ];
    });

    final result = await const OnDeviceListingAnalysisService(
      platformOverride: TargetPlatform.android,
    ).analyzeImagePaths(<String>['/private/app/cache/drill.jpg']);

    expect(result.single['modelVersion'], onDeviceListingAnalysisModelVersion);
    expect(result.single['ocrText'], 'Bosch GSR18V');
    expect(
      (result.single['labels'] as List).single,
      <String, Object>{
        'text': 'Power drill',
        'confidence': 0.9188,
        'index': 42,
      },
    );
  });

  test('rejects schema drift and model drift', () async {
    for (final response in <Object?>[
      <Object?>[],
      <Object?>[
        <String, Object?>{
          'modelVersion': 'stale-model',
          'labels': <Object?>[],
          'ocrText': '',
        },
      ],
      <Object?>[
        <String, Object?>{
          'modelVersion': onDeviceListingAnalysisModelVersion,
          'labels': <Object?>[
            <String, Object?>{
              'text': 'Drill',
              'confidence': 2,
              'index': 1,
            },
          ],
          'ocrText': '',
        },
      ],
    ]) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (_) async => response);
      await expectLater(
        const OnDeviceListingAnalysisService(
          platformOverride: TargetPlatform.android,
        ).analyzeImagePaths(<String>['/private/app/cache/drill.jpg']),
        throwsA(isA<OnDeviceListingAnalysisException>()),
      );
    }
  });

  test('maps native failures to a privacy-safe typed result', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
      throw PlatformException(
        code: 'on_device_listing_analysis_failed',
        message: 'private native detail must not cross the service boundary',
      );
    });

    await expectLater(
      const OnDeviceListingAnalysisService(
        platformOverride: TargetPlatform.android,
      ).analyzeImagePaths(<String>['/private/app/cache/drill.jpg']),
      throwsA(
        isA<OnDeviceListingAnalysisException>().having(
          (failure) => failure.code,
          'code',
          'on_device_listing_analysis_failed',
        ),
      ),
    );
  });

  test('fails closed when the native method never returns', () async {
    final never = Completer<Object?>().future;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) => never);

    await expectLater(
      const OnDeviceListingAnalysisService(
        platformOverride: TargetPlatform.android,
        timeoutOverride: Duration(milliseconds: 5),
      ).analyzeImagePaths(<String>['/private/app/cache/drill.jpg']),
      throwsA(
        isA<OnDeviceListingAnalysisException>().having(
          (failure) => failure.code,
          'code',
          'on_device_listing_analysis_timeout',
        ),
      ),
    );
  });

  test('late native response cannot replace the typed timeout', () async {
    final late = Completer<Object?>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) => late.future);

    final outcome = const OnDeviceListingAnalysisService(
      platformOverride: TargetPlatform.android,
      timeoutOverride: Duration(milliseconds: 5),
    ).analyzeImagePaths(<String>['/private/app/cache/drill.jpg']);
    await expectLater(
      outcome,
      throwsA(
        isA<OnDeviceListingAnalysisException>().having(
          (failure) => failure.code,
          'code',
          'on_device_listing_analysis_timeout',
        ),
      ),
    );

    late.complete(<Object?>[
      <String, Object?>{
        'modelVersion': onDeviceListingAnalysisModelVersion,
        'labels': <Object?>[],
        'ocrText': '',
      },
    ]);
    await Future<void>.delayed(Duration.zero);
  });

  test('maps the native sequential bound plus callback margin by image count',
      () {
    expect(
      <int>[1, 2, 3, 4]
          .map(OnDeviceListingAnalysisService.timeoutForImageCount)
          .map((duration) => duration.inSeconds)
          .toList(),
      <int>[40, 70, 100, 130],
    );
    expect(
      () => OnDeviceListingAnalysisService.timeoutForImageCount(0),
      throwsArgumentError,
    );
    expect(
      () => OnDeviceListingAnalysisService.timeoutForImageCount(5),
      throwsArgumentError,
    );
  });
}
