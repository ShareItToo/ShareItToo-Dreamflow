class WebAppleDirectConfig {
  final String clientId;
  final String redirectUri;

  const WebAppleDirectConfig({
    required this.clientId,
    required this.redirectUri,
  });

  bool get isValid {
    final uri = Uri.tryParse(redirectUri);
    return RegExp(r'^[A-Za-z0-9][A-Za-z0-9.-]{2,254}$').hasMatch(clientId) &&
        uri != null &&
        uri.scheme == 'https' &&
        uri.host == 'staging.shareittoo.com' &&
        uri.port == 443 &&
        uri.path.isNotEmpty &&
        uri.path != '/' &&
        !uri.hasQuery &&
        !uri.hasFragment &&
        uri.userInfo.isEmpty;
  }
}

class WebApplePopupRequest {
  final String clientId;
  final String redirectUri;
  final String state;
  final String nonce;

  const WebApplePopupRequest({
    required this.clientId,
    required this.redirectUri,
    required this.state,
    required this.nonce,
  });
}

class WebApplePopupResponse {
  final String state;
  final String authorizationCode;
  final String appleIdToken;

  const WebApplePopupResponse({
    required this.state,
    required this.authorizationCode,
    required this.appleIdToken,
  });

  @override
  String toString() => 'WebApplePopupResponse(redacted)';
}

class WebApplePopupFailure implements Exception {
  final String code;
  final bool cancelled;

  const WebApplePopupFailure(this.code, {this.cancelled = false});

  @override
  String toString() => 'WebApplePopupFailure($code)';
}
