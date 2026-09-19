String? registrationDisplayNameError(String? rawValue) {
  final value = (rawValue ?? '').trim();
  if (value.isEmpty) return 'Bitte gib deinen Namen ein.';
  if (value.length < 2) return 'Bitte gib einen gültigen Namen ein.';
  if (value.contains('@')) {
    return 'Bitte gib hier deinen Namen ein – nicht deine E-Mail-Adresse.';
  }
  return null;
}
