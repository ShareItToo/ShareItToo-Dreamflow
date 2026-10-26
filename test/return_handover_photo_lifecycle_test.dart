import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'return_handover_challenge_test.dart' as fixture;

// Synthetic pixels exercise local selection only, never authentic condition
// evidence, upload, booking progression or a real camera/browser permission.
final png = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAASElEQVR42u3PMQ0AMAgAsGFjL/4tYQU08JLWQSN/9TsgREREREREREREREREREREREREREREREREREREREREREREREREREQ2BgNuaUcSjuqqAAAAAElFTkSuQmCC');
const channel = MethodChannel('miguelruivo.flutter.plugins.filepicker');
const gallerySaveChannel = MethodChannel('gal');

class Camera extends ImagePickerPlatform {
  final result = Completer<XFile?>();
  int calls = 0;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) {
    expect(source, ImageSource.camera);
    calls++;
    return result.future;
  }
}

class DelayedPhoto extends XFile {
  DelayedPhoto() : super('synthetic-camera.png');
  final bytes = Completer<Uint8List>();
  int reads = 0;

  @override
  Future<Uint8List> readAsBytes() {
    reads++;
    return bytes.future;
  }
}

Future<void> switchSession({bool samePrincipal = false}) async {
  final prefs = await SharedPreferences.getInstance();
  final stored = prefs.getString('auth_session_v1')!;
  if (samePrincipal) {
    final owner =
        AuthService.captureSessionOwner((await AuthService.readSession())!);
    await AuthService.clearSessionOwnerIfMatches(owner,
        runLogoutCleanup: false);
    await prefs.setString('auth_session_v1', stored);
  } else {
    await prefs.setString(
        'auth_session_v1',
        jsonEncode({
          'userId': 'foreign-synthetic-owner',
          'email': 'foreign@example.invalid',
          'sessionId': 'foreign-synthetic-session',
        }));
  }
}

Future<void> openPicker(WidgetTester tester, String source) async {
  final add = find.byIcon(Icons.add_a_photo).hitTestable();
  expect(add, findsOneWidget);
  await tester.tap(add);
  await tester.pumpAndSettle();
  final action = find.text(source).hitTestable();
  expect(action, findsOneWidget);
  await tester.tap(action);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => WidgetController.hitTestWarningShouldBeFatal = true);

  for (final segment in ['pickup', 'return']) {
    for (final source in ['Galerie', 'Kamera']) {
      for (final outcome in [
        'selected',
        'cancelled',
        'disposed',
        'foreign-session',
        'same-principal-new-epoch',
        'failed',
      ]) {
        testWidgets('$segment $source $outcome keeps selection owner-bound',
            (tester) async {
          final gallery = Completer<List<Map<String, Object>>?>();
          var galleryCalls = 0;
          tester.binding.defaultBinaryMessenger
              .setMockMethodCallHandler(channel, (_) {
            galleryCalls++;
            return gallery.future;
          });
          var gallerySaveCalls = 0;
          tester.binding.defaultBinaryMessenger
              .setMockMethodCallHandler(gallerySaveChannel, (_) async {
            gallerySaveCalls++;
            return false; // Synthetic denied permission: no filesystem write.
          });
          final camera = Camera();
          final originalCamera = ImagePickerPlatform.instance;
          ImagePickerPlatform.instance = camera;
          addTearDown(() {
            ImagePickerPlatform.instance = originalCamera;
            tester.binding.defaultBinaryMessenger
                .setMockMethodCallHandler(channel, null);
            tester.binding.defaultBinaryMessenger
                .setMockMethodCallHandler(gallerySaveChannel, null);
          });
          await fixture.mountStepper(tester,
              segment: segment, photos: 0, loader: () async => null);
          await openPicker(tester, source);
          expect(source == 'Galerie' ? galleryCalls : camera.calls, 1);
          final add = find.ancestor(
              of: find.byIcon(Icons.add_a_photo),
              matching: find.byType(InkWell));
          expect(tester.widget<InkWell>(add).onTap, isNull,
              reason: 'pending selection must remain single-flight');
          if (outcome == 'disposed') {
            await tester.pumpWidget(const SizedBox());
          } else if (outcome == 'foreign-session') {
            await switchSession();
          } else if (outcome == 'same-principal-new-epoch') {
            await switchSession(samePrincipal: true);
          }
          if (source == 'Galerie') {
            if (outcome == 'failed') {
              gallery
                  .completeError(PlatformException(code: 'synthetic_denied'));
            } else {
              gallery.complete(outcome == 'cancelled'
                  ? null
                  : [
                      {
                        'name': 'synthetic.png',
                        'size': png.length,
                        'bytes': png
                      },
                    ]);
            }
          } else if (outcome == 'failed') {
            camera.result
                .completeError(PlatformException(code: 'synthetic_denied'));
          } else {
            camera.result.complete(outcome == 'cancelled'
                ? null
                : XFile.fromData(png, name: 'synthetic.png'));
          }
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          if (outcome != 'disposed') {
            final label = segment == 'pickup' ? 'Übergabe' : 'Rückgabe';
            expect(
                find.text('$label-Fotos (${outcome == 'selected' ? 1 : 0}/4)'),
                findsOneWidget);
            if (outcome == 'failed') {
              expect(
                  find.text(source == 'Galerie'
                      ? 'Fotos konnten nicht geladen werden'
                      : 'Kamera nicht verfügbar'),
                  findsOneWidget);
            }
          }
          expect(gallerySaveCalls,
              source == 'Kamera' && outcome == 'selected' ? greaterThan(0) : 0,
              reason: 'stale selection must not reach local photo storage');
          await tester.pump(const Duration(seconds: 3));
          await tester.pumpAndSettle();
          if (outcome != 'disposed') {
            expect(tester.widget<InkWell>(add).onTap, isNotNull,
                reason: 'cancellation or failure must allow another selection');
          }
          final prefs = await SharedPreferences.getInstance();
          expect(prefs.getString('local_artifact_registry_v1'), isNull);
        });
      }
    }
  }

  for (final transition in ['disposed', 'foreign-session', 'step-changed']) {
    testWidgets('camera bytes completed after $transition are discarded',
        (tester) async {
      var gallerySaveCalls = 0;
      tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(gallerySaveChannel, (_) async {
        gallerySaveCalls++;
        return false;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(gallerySaveChannel, null));
      final camera = Camera();
      final originalCamera = ImagePickerPlatform.instance;
      ImagePickerPlatform.instance = camera;
      addTearDown(() => ImagePickerPlatform.instance = originalCamera);
      await fixture.mountStepper(tester,
          segment: 'pickup',
          photos: transition == 'step-changed' ? 4 : 0,
          loader: () async => fixture.challenge('pickup'));
      await openPicker(tester, 'Kamera');
      final file = DelayedPhoto();
      camera.result.complete(file);
      await tester.pumpAndSettle();
      expect(file.reads, 1);
      if (transition == 'disposed') {
        await tester.pumpWidget(const SizedBox());
      } else if (transition == 'step-changed') {
        await tester.tap(find.text('Weiter').hitTestable());
        await tester.pumpAndSettle();
        await tester.tap(find.text('Zurück').hitTestable());
        await tester.pumpAndSettle();
      } else {
        await switchSession();
      }
      file.bytes.complete(png);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      if (transition != 'disposed') {
        expect(
            find.text(
                'Übergabe-Fotos (${transition == 'step-changed' ? 4 : 0}/4)'),
            findsOneWidget);
      }
      expect(gallerySaveCalls, 0);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('local_artifact_registry_v1'), isNull);
    });
  }
}
