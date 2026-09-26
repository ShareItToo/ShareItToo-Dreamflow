import 'package:flutter/material.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:provider/provider.dart';

class ProfileHeaderCard extends StatelessWidget {
  final User user;
  final int listingsCount;

  /// Number of completed bookings (as renter). Unknown values stay unknown.
  final int? completedBookingsCount;

  /// Callback when the card is tapped (e.g., navigate to public profile).
  final VoidCallback? onTap;
  const ProfileHeaderCard(
      {super.key,
      required this.user,
      required this.listingsCount,
      this.completedBookingsCount,
      this.onTap});

  bool get _isGuestUser => (user.role == 'guest') || (user.id == 'guest-user');

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final isGuest = _isGuestUser;
    final avatarUrl = isGuest ? null : user.photoURL;
    final largeText = MediaQuery.textScalerOf(context).scale(1) >= 1.6;
    final identity = _IdentitySummary(
      user: user,
      avatarUrl: avatarUrl,
      identityLabel: isGuest
          ? l10n.t('Nicht angemeldet')
          : user.isVerified
              ? l10n.t('Identität bestätigt')
              : l10n.t('Identität noch nicht geprüft'),
    );
    final metrics = _ProfileMetrics(
      rating: isGuest ? '—' : _ratingText(context, user),
      bookings: isGuest ? '—' : (completedBookingsCount?.toString() ?? '—'),
      joined: isGuest ? '—' : _joinedMonthYear(user.createdAt),
      listings: isGuest ? '—' : listingsCount.toString(),
    );
    return GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.20),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          padding: const EdgeInsets.all(16),
          child: largeText
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    identity,
                    const SizedBox(height: 16),
                    Divider(
                      height: 1,
                      thickness: 1,
                      color: Colors.white54.withValues(alpha: 0.15),
                    ),
                    const SizedBox(height: 16),
                    metrics,
                  ],
                )
              : IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      SizedBox(width: 132, child: identity),
                      const SizedBox(width: 8),
                      VerticalDivider(
                        width: 1,
                        thickness: 1,
                        color: Colors.white54.withValues(alpha: 0.15),
                      ),
                      const SizedBox(width: 8),
                      Expanded(child: Center(child: metrics)),
                    ],
                  ),
                ),
        ));
  }

  static String _ratingText(BuildContext context, User user) {
    final l10n = context.read<LocalizationController>();
    final c = user.reviewCount;
    if (c <= 0) return l10n.t('Keine Bewertung');
    final label = c == 1 ? l10n.t('Bewertung') : l10n.t('Bewertungen');
    return '${user.avgRating.toStringAsFixed(1)} ★ ($c $label)';
  }

  static String _joinedMonthYear(DateTime createdAt) {
    const monthsDe = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember'
    ];
    final m = monthsDe[createdAt.month - 1];
    return '$m ${createdAt.year}';
  }
}

class _IdentitySummary extends StatelessWidget {
  final User user;
  final String? avatarUrl;
  final String identityLabel;

  const _IdentitySummary({
    required this.user,
    required this.avatarUrl,
    required this.identityLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(children: [
          SitUserAvatar(
            url: avatarUrl,
            radius: 36,
            borderColor: Colors.white.withValues(alpha: 0.12),
          ),
          if (user.isVerified)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                decoration: const BoxDecoration(
                    color: Colors.white, shape: BoxShape.circle),
                padding: const EdgeInsets.all(4),
                child: const Icon(
                  Icons.verified,
                  size: 16,
                  color: Color(0xFF22C55E),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 8),
        Text(
          user.displayName,
          maxLines: 3,
          textAlign: TextAlign.center,
          overflow: TextOverflow.fade,
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(color: Colors.white, height: 1.2),
        ),
        const SizedBox(height: 4),
        Text(
          identityLabel,
          textAlign: TextAlign.center,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Colors.white70),
        ),
      ],
    );
  }
}

class _ProfileMetrics extends StatelessWidget {
  final String rating;
  final String bookings;
  final String joined;
  final String listings;

  const _ProfileMetrics({
    required this.rating,
    required this.bookings,
    required this.joined,
    required this.listings,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MetricLine(label: l10n.t('Bewertung'), value: rating),
        const SizedBox(height: 8),
        _MetricLine(label: l10n.t('Buchungen'), value: bookings),
        const SizedBox(height: 8),
        _MetricLine(label: l10n.t('Dabei seit'), value: joined),
        const SizedBox(height: 8),
        _MetricLine(label: l10n.t('Anzeigen'), value: listings),
      ],
    );
  }
}

class _MetricLine extends StatelessWidget {
  final String label;
  final String value;
  const _MetricLine({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final labelStyle = textTheme.labelSmall?.copyWith(color: Colors.white70);
    final valueStyle = textTheme.bodySmall
        ?.copyWith(color: Colors.white, fontWeight: FontWeight.w700);
    final largeText = MediaQuery.textScalerOf(context).scale(1) >= 1.6;
    if (largeText) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: labelStyle),
          const SizedBox(height: 2),
          Text(value, style: valueStyle),
        ],
      );
    }
    // Keep the value close to the label by using a fixed label column.
    // This avoids pushing values to the far right edge.
    return Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          SizedBox(
            width: 74,
            child: Text(
              label,
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              style: labelStyle,
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              style: valueStyle,
            ),
          ),
        ]);
  }
}
