import 'package:web/web.dart' as web;

// The sole platform operation: no parsing or mutation before classification.
String? readBrowserSerializedHref() {
  try {
    return web.window.location.href;
  } catch (_) {
    return null;
  }
}
