import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// Structural XMLHttpRequest fake: image decoding receives real PNG bytes,
/// but no browser network request is ever created.
JSObject avatarXhr(Uint8List bytes,
    void Function(String url, Map<String, String> headers) onGet) {
  final xhr = JSObject();
  final headers = <String, String>{};
  final listeners = <JSFunction>[];
  var url = '';
  xhr.setProperty('status'.toJS, 200.toJS);
  xhr.setProperty('response'.toJS, bytes.buffer.toJS);
  xhr.setProperty(
      'open'.toJS,
      ((String method, String target, bool async) {
        if (method != 'GET') throw StateError('Unexpected image method');
        url = target;
      }).toJS);
  xhr.setProperty(
      'setRequestHeader'.toJS,
      ((String key, String value) {
        headers[key] = value;
      }).toJS);
  xhr.setProperty(
      'addEventListener'.toJS,
      ((String type, JSFunction listener) {
        if (type == 'load') listeners.add(listener);
      }).toJS);
  xhr.setProperty(
      'send'.toJS,
      (() {
        onGet(url, headers);
        for (final listener in listeners) {
          listener.callAsFunction(xhr, web.Event('load'));
        }
      }).toJS);
  return xhr;
}
