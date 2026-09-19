import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';

class ChangePhoneScreen extends StatefulWidget {
  const ChangePhoneScreen({super.key});
  @override
  State<ChangePhoneScreen> createState() => _ChangePhoneScreenState();
}

class _ChangePhoneScreenState extends State<ChangePhoneScreen> {
  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Positioned.fill(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), child: Container(color: Colors.black.withValues(alpha: 0.35)))),
      Scaffold(
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          title: const Text('Telefonnummer ändern'),
          centerTitle: true,
          leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (!_sent) TextField(controller: _phoneCtrl, decoration: const InputDecoration(prefixIcon: Icon(Icons.phone_outlined), labelText: 'Neue Telefonnummer')),
            if (_sent) TextField(controller: _codeCtrl, decoration: const InputDecoration(prefixIcon: Icon(Icons.sms_outlined), labelText: 'Code (6‑stellig)')),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                if (!_sent) {
                  setState(() => _sent = true);
                } else {
                  Navigator.of(context).maybePop();
                }
              },
              child: Text(_sent ? 'Bestätigen' : 'Code senden'),
            ),
          ]),
        ),
      ),
    ]);
  }
}
