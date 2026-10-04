import 'package:flutter/material.dart';
import 'package:lendify/screens/verification_screen.dart';

@Deprecated('Use VerificationScreen directly.')
Future<void> showIdentityVerificationUnavailable(BuildContext context) {
  return Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => const VerificationScreen()),
  );
}
