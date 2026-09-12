import 'package:flutter/material.dart';

import 'package:lendify/widgets/messages_settings_sheet.dart';

/// Full page version of "Nachrichten-Einstellungen".
class MessagesSettingsScreen extends StatelessWidget {
  const MessagesSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.arrow_back)),
        title: const Text('Nachrichten-Einstellungen'),
      ),
      body: SafeArea(
        child: MessagesSettingsView(
          presentation: MessagesSettingsPresentation.page,
          onCancel: () => Navigator.of(context).maybePop(),
          onSaved: () => Navigator.of(context).maybePop(true),
        ),
      ),
    );
  }
}
