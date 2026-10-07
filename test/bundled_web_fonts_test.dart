import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _fonts = <String, String>{
  'assets/fonts/Roboto-Regular.ttf':
      '1ee8483b140ddfbbb8548838935a9878a6eda018aa1c39f4bf29d65b14a052db',
  'assets/fonts/Roboto-Bold.ttf':
      '28874d37d069dc482e8486d5db06a3fcb31ab9c38b37c210afaf14bc7b550535',
};

void _requireBundledRoboto(List<dynamic> manifest) {
  final families = manifest.where((f) => f is Map && f['family'] == 'Roboto');
  if (families.length != 1 ||
      !equals([
        {'asset': _fonts.keys.first, 'weight': 400},
        {'asset': _fonts.keys.last, 'weight': 700},
      ]).matches(families.single['fonts'], <dynamic, dynamic>{})) {
    throw const FormatException('bundled_roboto_manifest');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('generated FontManifest declares local Roboto before application main',
      () async {
    // Flutter 3.41.7 CanvasKit fonts.dart loadAssetFonts selects its startup CDN
    // fallback only if this generated manifest contains no Roboto family.
    // This is generated-asset evidence, not a real-browser no-network claim.
    final manifest =
        jsonDecode(await rootBundle.loadString('FontManifest.json'))
            as List<dynamic>;
    _requireBundledRoboto(manifest);
  });

  test('both bundled font weights retain exact reviewed local font bytes',
      () async {
    for (final font in _fonts.entries) {
      final data = await rootBundle.load(font.key);
      final bytes =
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      expect(sha256.convert(bytes).toString(), font.value);
    }
  });

  test(
      'missing, renamed, duplicate, remote and mismatched font declarations fail',
      () {
    final valid = [
      {
        'family': 'Roboto',
        'fonts': [
          {'asset': _fonts.keys.first, 'weight': 400},
          {'asset': _fonts.keys.last, 'weight': 700},
        ],
      },
    ];
    _requireBundledRoboto(valid);
    for (final mutate in <void Function(List<dynamic>)>[
      (v) => v.clear(),
      (v) => v.first['family'] = 'Other',
      (v) => v.add(v.first),
      (v) => v.first['fonts'].removeLast(),
      (v) => v.first['fonts'][0]['asset'] = 'https://example.invalid/font.ttf',
      (v) => v.first['fonts'][1]['weight'] = 400,
    ]) {
      final changed = jsonDecode(jsonEncode(valid)) as List<dynamic>;
      mutate(changed);
      expect(() => _requireBundledRoboto(changed), throwsFormatException);
    }
  });
}
