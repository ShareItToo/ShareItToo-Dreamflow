import 'package:flutter/material.dart';
import 'security_screen.dart';

/// Compatibility route for older deep links.
///
/// Password changes must go through the canonical security flow, which owns
/// the authenticated backend mutation and fail-closed result handling.
class ChangePasswordScreen extends StatelessWidget {
  const ChangePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) => const SecurityScreen();
}
