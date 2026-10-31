export 'web_apple_browser_types.dart';

import 'web_apple_browser_bridge_stub.dart'
    if (dart.library.html) 'web_apple_browser_bridge_web.dart' as platform;

import 'web_apple_browser_types.dart';

Future<WebApplePopupResponse> openWebApplePopup(WebApplePopupRequest request) =>
    platform.openWebApplePopup(request);
