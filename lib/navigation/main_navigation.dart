import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'dart:math' as math;
import 'package:lendify/screens/explore_screen.dart';
import 'package:lendify/screens/wishlists_screen.dart';
import 'package:lendify/screens/bookings_screen.dart';
import 'package:lendify/screens/messages_screen.dart';
import 'package:lendify/screens/profile_screen.dart';
import 'package:lendify/theme.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/models/user.dart' as model;
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/widgets/login_nudge_sheet.dart';

bool shouldGateAccountTab({
  required bool hasSession,
  required bool hasCurrentUser,
  required bool backendEnabled,
  required bool releaseMode,
  required bool previewGuest,
}) {
  final guestGateEnabled = backendEnabled || releaseMode || previewGuest;
  return guestGateEnabled && (!hasSession || !hasCurrentUser);
}

@visibleForTesting
const List<String> mainNavigationLabelKeys = <String>[
  'Entdecken',
  'Mietkorb',
  'Buchungen',
  'Nachrichten',
  'Mein SIT',
];

@visibleForTesting
const double mainNavigationMinimumTouchTarget = kMinInteractiveDimension;

@visibleForTesting
Widget mainNavigationTouchTarget(Widget child) {
  return SizedBox(
    width: mainNavigationMinimumTouchTarget,
    height: mainNavigationMinimumTouchTarget,
    child: Center(child: child),
  );
}

class MainNavigation extends StatefulWidget {
  final int initialIndex;
  const MainNavigation({super.key, this.initialIndex = 0});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  int _currentIndex = 0;
  model.User? _currentUser;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, _screens.length - 1);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<MainNavController>().setIndex(_currentIndex);
    });
    _loadUser();
  }

  Future<void> _loadUser() async {
    try {
      final u = await DataService.getCurrentUser();
      if (mounted) setState(() => _currentUser = u);
    } catch (_) {}
  }

  final List<Widget> _screens = [
    const ExploreScreen(),
    const RentalCartScreen(),
    const BookingsScreen(),
    const MessagesScreen(),
    const ProfileScreen(),
  ];

  Widget _navIcon(IconData icon, int index) =>
      _HoveringNavIcon(icon: icon, active: _currentIndex == index);

  Widget _buildProfileNavIcon({required bool active}) {
    return FutureBuilder<AuthSession?>(
      future: AuthService.readSession(),
      builder: (context, sessionSnap) {
        final hasSession = sessionSnap.data != null;
        if (!hasSession) {
          return KeyedSubtree(
            key: ValueKey('profile_guest_${active ? 'active' : 'idle'}'),
            child: _ProfileNavIcon(photoUrl: null, active: active),
          );
        }
        return FutureBuilder<model.User?>(
          future: DataService.getCurrentUser(),
          builder: (context, userSnap) {
            final user = userSnap.data;
            final rawPhotoUrl = user?.photoURL?.trim();
            final photoUrl = rawPhotoUrl != null && rawPhotoUrl.isNotEmpty
                ? rawPhotoUrl
                : null;
            final keySuffix = photoUrl == null
                ? 'profile_guest_${active ? 'active' : 'idle'}'
                : 'profile_${user?.id ?? 'unknown'}_${photoUrl}_${active ? 'active' : 'idle'}';
            return KeyedSubtree(
              key: ValueKey(keySuffix),
              child: _ProfileNavIcon(photoUrl: photoUrl, active: active),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final nav = context.watch<MainNavController>();

    if (nav.index != _currentIndex) {
      // Keep internal state in sync with the global controller.
      _currentIndex = nav.index;
    }
    return PopScope(
      canPop: _currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _currentIndex != 0) {
          context.read<MainNavController>().setIndex(0);
        }
      },
      child: AppGradientBackground(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          extendBody: true,
          body: _screens[_currentIndex],
          bottomNavigationBar: BottomNavigationBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            type: BottomNavigationBarType.fixed,
            currentIndex: _currentIndex,
            onTap: (index) async {
              final preview = context.read<DeveloperPreviewController>();
              final session = await AuthService.readSession();
              final currentUser =
                  session == null ? null : await DataService.getCurrentUser();
              if (mounted && _currentUser?.id != currentUser?.id) {
                setState(() => _currentUser = currentUser);
              }
              final isGuest = shouldGateAccountTab(
                hasSession: session != null,
                hasCurrentUser: currentUser != null,
                backendEnabled: BackendConfig.enabled,
                releaseMode: kReleaseMode,
                previewGuest: preview.isGuest,
              );
              // Soft logged-out experience:
              // - Guests can prepare a local Mietkorb and explore Profile.
              // - Booking and communication tabs remain account-bound.
              if (isGuest && index != 0 && index != 1 && index != 4) {
                final gateContext = switch (index) {
                  2 => GuestGateContext.booking,
                  3 => GuestGateContext.messages,
                  _ => GuestGateContext.generic,
                };
                if (!context.mounted) return;
                showGuestRestrictionSheet(context, gateContext: gateContext);
                context.read<MainNavController>().setIndex(0);
                return;
              }
              if (!context.mounted) return;
              context.read<MainNavController>().setIndex(index);
            },
            selectedItemColor: BrandColors.primary,
            unselectedItemColor: AppTheme.navInactive(context),
            selectedIconTheme: const IconThemeData(size: 20),
            unselectedIconTheme: const IconThemeData(size: 20),
            selectedLabelStyle:
                const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
            unselectedLabelStyle:
                const TextStyle(fontSize: 10, fontWeight: FontWeight.w500),
            items: [
              BottomNavigationBarItem(
                icon: mainNavigationTouchTarget(_navIcon(Icons.search, 0)),
                activeIcon: mainNavigationTouchTarget(
                  const _HoveringNavIcon(icon: Icons.search, active: true),
                ),
                label: l10n.t(mainNavigationLabelKeys[0]),
              ),
              BottomNavigationBarItem(
                icon: mainNavigationTouchTarget(
                  _navIcon(Icons.shopping_bag_outlined, 1),
                ),
                activeIcon: mainNavigationTouchTarget(
                  const _HoveringNavIcon(
                    icon: Icons.shopping_bag_outlined,
                    active: true,
                  ),
                ),
                label: l10n.t(mainNavigationLabelKeys[1]),
              ),
              BottomNavigationBarItem(
                icon: mainNavigationTouchTarget(_HoveringAssetNavIcon(
                    asset: 'assets/images/icononly_transparent_nobuffer.png',
                    active: _currentIndex == 2,
                    baseSize: 32.0)),
                activeIcon: mainNavigationTouchTarget(_HoveringAssetNavIcon(
                    asset: 'assets/images/icononly_transparent_nobuffer.png',
                    active: true,
                    baseSize: 32.0)),
                label: l10n.t(mainNavigationLabelKeys[2]),
              ),
              BottomNavigationBarItem(
                icon: mainNavigationTouchTarget(_MessagesNavIcon(
                  active: _currentIndex == 3,
                  userId: _currentUser?.id,
                )),
                activeIcon: mainNavigationTouchTarget(_MessagesNavIcon(
                  active: true,
                  userId: _currentUser?.id,
                )),
                label: l10n.t(mainNavigationLabelKeys[3]),
              ),
              BottomNavigationBarItem(
                icon: mainNavigationTouchTarget(
                  _buildProfileNavIcon(active: _currentIndex == 4),
                ),
                activeIcon: mainNavigationTouchTarget(
                  _buildProfileNavIcon(active: true),
                ),
                label: l10n.t(mainNavigationLabelKeys[4]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HoveringNavIcon extends StatefulWidget {
  final IconData icon;
  final bool active;
  const _HoveringNavIcon({required this.icon, required this.active});
  @override
  State<_HoveringNavIcon> createState() => _HoveringNavIconState();
}

class _HoveringNavIconState extends State<_HoveringNavIcon> {
  bool _hovering = false;
  @override
  Widget build(BuildContext context) {
    final color = widget.active || _hovering
        ? BrandColors.primary
        : AppTheme.navInactive(context);
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: AnimatedScale(
          scale: _hovering ? 1.33 : 1.0,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: Icon(widget.icon, size: 20, color: color)),
    );
  }
}

class _HoveringAssetNavIcon extends StatefulWidget {
  final String asset;
  final bool active;
  final double baseSize;
  const _HoveringAssetNavIcon(
      {required this.asset, required this.active, this.baseSize = 22});
  @override
  State<_HoveringAssetNavIcon> createState() => _HoveringAssetNavIconState();
}

class _HoveringAssetNavIconState extends State<_HoveringAssetNavIcon>
    with SingleTickerProviderStateMixin {
  bool _hovering = false;
  late final AnimationController _spinController;

  @override
  void initState() {
    super.initState();
    // 3x faster per rotation than the main logo (700ms per 1 rotation)
    // Main logo: 1 rotation in 700ms; this does 3 rotations in 700ms total => 233ms per rotation.
    _spinController = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 700));
  }

  @override
  void didUpdateWidget(covariant _HoveringAssetNavIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    // No automatic spinning on active state; spin only on hover enter.
  }

  @override
  void dispose() {
    _spinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.active || _hovering
        ? BrandColors.primary
        : AppTheme.navInactive(context);
    return MouseRegion(
      onEnter: (_) {
        setState(() => _hovering = true);
        _spinController.forward(from: 0); // Single 360° rotation on hover enter
      },
      onExit: (_) => setState(() => _hovering = false),
      child: AnimatedScale(
        scale: _hovering ? 1.33 : 1.0,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        child: AnimatedBuilder(
          animation: _spinController,
          builder: (context, child) => Transform.rotate(
            angle: _spinController.value * 2 * math.pi * 3,
            child: child,
          ),
          child: ImageIcon(AssetImage(widget.asset),
              size: widget.baseSize, color: color),
        ),
      ),
    );
  }
}

class _ProfileNavIcon extends StatelessWidget {
  final String? photoUrl;
  final bool active;
  const _ProfileNavIcon({required this.photoUrl, required this.active});

  @override
  Widget build(BuildContext context) {
    final Color border =
        active ? BrandColors.primary : AppTheme.navInactive(context);
    final double size = 20;
    return MouseRegion(
      child: SitUserAvatar(
          url: photoUrl,
          radius: size / 2,
          borderColor: border,
          placeholderIcon: Icons.person_outline),
    );
  }
}

class _MessagesNavIcon extends StatelessWidget {
  final bool active;
  final String? userId;
  const _MessagesNavIcon({required this.active, required this.userId});

  @override
  Widget build(BuildContext context) {
    final base =
        _HoveringNavIcon(icon: Icons.chat_bubble_outline, active: active);
    final uid = (userId ?? '').trim();
    if (uid.isEmpty) return base;

    return FutureBuilder<int>(
      future: DataService.getUnreadThreadCountForUser(uid),
      builder: (context, snap) {
        final count = snap.data ?? 0;
        if (count <= 0) return base;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            base,
            const Positioned(
              right: -2,
              top: -2,
              child: DecoratedBox(
                decoration: BoxDecoration(
                    color: BrandColors.logoAccent, shape: BoxShape.circle),
                child: SizedBox(width: 10, height: 10),
              ),
            ),
          ],
        );
      },
    );
  }
}
