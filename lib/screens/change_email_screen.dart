import 'package:flutter/material.dart';
import 'contact_data_screen.dart';

/// Compatibility route for older deep links.
///
/// Email changes must use the canonical contact-verification flow instead of
/// presenting a local form that cannot persist or verify the new address.
class ChangeEmailScreen extends StatelessWidget {
  const ChangeEmailScreen({super.key});

  @override
  Widget build(BuildContext context) => const ContactDataScreen();
}
