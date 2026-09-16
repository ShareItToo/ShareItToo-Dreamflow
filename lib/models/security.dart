import 'package:flutter/material.dart';

class SecurityDevice {
  final String id;
  final String name;
  final String location;
  final DateTime lastActive;
  final bool isThisDevice;

  const SecurityDevice({
    required this.id,
    required this.name,
    required this.location,
    required this.lastActive,
    this.isThisDevice = false,
  });

  IconData get icon {
    final n = name.toLowerCase();
    if (n.contains('iphone') || n.contains('android')) {
      return Icons.smartphone_outlined;
    }
    if (n.contains('chrome') || n.contains('browser')) {
      return Icons.language_outlined;
    }
    if (n.contains('mac') || n.contains('windows') || n.contains('linux')) {
      return Icons.laptop_outlined;
    }
    return Icons.devices_other_outlined;
  }

  String get lastActiveLabel {
    final now = DateTime.now();
    final diff = now.difference(lastActive);
    if (diff.inMinutes < 3) return 'Letzte Aktivität gerade eben';
    if (diff.inHours < 1) return 'Letzte Aktivität vor ${diff.inMinutes} Min.';
    if (diff.inHours < 24) return 'Letzte Aktivität heute';
    if (diff.inDays == 1) return 'Letzte Aktivität gestern';
    return 'Letzte Aktivität vor ${diff.inDays} Tagen';
  }
}
