import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';
import 'package:lendify/theme.dart';
import 'package:lendify/navigation/main_navigation.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_realtime_service.dart';
import 'package:lendify/screens/onboarding_flow_screen.dart';
import 'package:lendify/services/background_theme_service.dart';
import 'package:lendify/services/qa_bootstrap_service.dart';
import 'package:lendify/services/app_link_service.dart';
import 'package:lendify/services/release_identity.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/screens/app_link_destination_screen.dart';
import 'package:lendify/widgets/foreground_push_host.dart';
import 'package:lendify/services/privacy_export_file_store.dart';
import 'package:lendify/widgets/privacy_export_cache_lifecycle_host.dart';

final GlobalKey<ScaffoldMessengerState> rootScaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  // Initialize bindings once in the same zone as runApp to avoid zone mismatch warnings.
  WidgetsFlutterBinding.ensureInitialized();
  ReleaseIdentity.validateCurrentBuild();
  try {
    await const PrivacyExportFileStore().purgeRetainedCopies();
  } catch (_) {
    debugPrint('[PrivacyExportCache] startup cleanup failed');
  }
  await FirebaseRuntime.initialize();
  // Firebase retains a cold notification intent while an existing backend
  // session refresh settles. App-link principal/epoch capture starts only
  // afterwards, so a same-account token refresh cannot discard the route and
  // a successor account can never inherit it.
  await settleInitialAppLinkPrincipal();

  // Surface synchronous Flutter framework errors to the console
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    debugPrint('FlutterError: ${details.exceptionAsString()}');
    if (details.stack != null) debugPrint(details.stack.toString());
    FirebaseRuntime.recordFlutterFatalError(details);
  };

  // Catch uncaught async errors
  PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    debugPrint('Uncaught async error: $error');
    debugPrint(stack.toString());
    FirebaseRuntime.recordUnhandledError(error, stack);
    return true; // handled
  };

  // Release startup must never seed showcase data or clear user data.
  debugPrint('[Main] showcase seed and destructive reset disabled');

  DeveloperUserState? initialPreview;
  try {
    initialPreview = await QaBootstrapService.maybeBootstrap() ??
        await DeveloperPreviewController.readStateOnce();
  } catch (e) {
    debugPrint('[Main] bootstrap/readStateOnce failed: $e');
  }

  // Resolve the persisted background family before the first frame. Rendering
  // with ThemeMode.system while the explicit choice is still loading can pair
  // a dark background with light-theme text during Android activity restarts.
  final backgroundThemeController = BackgroundThemeController();
  await backgroundThemeController.loadFromPrefs();

  debugPrint('[Main] runApp(MyApp)');
  runApp(
    MyApp(
      initialPreviewState: initialPreview,
      backgroundThemeController: backgroundThemeController,
    ),
  );
}

class MyApp extends StatelessWidget {
  final DeveloperUserState? initialPreviewState;
  final BackgroundThemeController backgroundThemeController;

  const MyApp({
    super.key,
    this.initialPreviewState,
    required this.backgroundThemeController,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<LocalizationController>(
          create: (_) => LocalizationController()..loadFromPrefs(),
        ),
        ChangeNotifierProvider<MainNavController>(
          create: (_) => MainNavController(),
        ),
        ChangeNotifierProvider<DeveloperPreviewController>(
          create: (_) =>
              DeveloperPreviewController(initialState: initialPreviewState)
                ..loadFromPrefs(),
        ),
        ChangeNotifierProvider<BackgroundThemeController>.value(
          value: backgroundThemeController,
        ),
        ChangeNotifierProvider<AppLinkController>(
          create: (_) => AppLinkController()..initialize(),
        ),
      ],
      child: Consumer2<LocalizationController, BackgroundThemeController>(
        builder: (context, l10n, backgroundTheme, _) {
          return MaterialApp(
            title: 'ShareItToo',
            debugShowCheckedModeBanner: false,
            navigatorKey: rootNavigatorKey,
            scaffoldMessengerKey: rootScaffoldMessengerKey,
            theme: buildLightTheme(context),
            darkTheme: buildDarkTheme(context),
            themeMode: backgroundTheme.themeMode,
            builder: (context, child) => PrivacyExportCacheLifecycleHost(
              child: ForegroundPushHost(
                navigatorKey: rootNavigatorKey,
                messengerKey: rootScaffoldMessengerKey,
                child: AppGradientBackground(
                  child: child ?? const SizedBox.shrink(),
                ),
              ),
            ),
            home: const AppLinkHost(child: AppRoot()),
          );
        },
      ),
    );
  }
}

class AppRoot extends StatefulWidget {
  /// Tests may provide a held session read to prove that a harmless rebuild
  /// cannot restart startup authentication.
  @visibleForTesting
  final Future<AuthSession?> Function()? sessionLoader;

  const AppRoot({super.key, this.sessionLoader});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {

  // Preview-only: auto sign-in with a local demo user in developer builds.
  static const bool _enableDeveloperPreviewDemoAuth = true;

  late final Future<AuthSession?> _sessionFuture;

  @override
  void initState() {
    super.initState();
    // The future is intentionally owned by this state, not recreated by
    // FutureBuilder on every inherited-widget rebuild. Restarting a pending
    // session read could otherwise put the visible startup surface back into
    // loading without a new process or principal transition.
    _sessionFuture = widget.sessionLoader?.call() ??
        _loadSessionWithPreviewFallback();
  }

  Future<AuthSession?> _loadSessionWithPreviewFallback() async {
    try {
      final existing = await AuthService.readSession();
      if (existing != null) {
        if (BackendConfig.enabled) {
          final accessToken = await AuthService.accessToken();
          if (accessToken == null || accessToken.isEmpty) return null;
          final activeSession = await AuthService.readSession();
          if (activeSession == null) return null;
          await BackendRealtimeService.connect(accessToken);
          unawaited(FirebaseRuntime.syncPushRegistration());
          return activeSession;
        }
        return existing;
      }
      if (_enableDeveloperPreviewDemoAuth && !kReleaseMode) {
        await AuthService.ensureSeeded();
        final result = await AuthService.signInWithEmailPassword(
          email: AuthService.demoEmail,
          password: AuthService.demoPassword,
        );
        if (result.ok) {
          return await AuthService.readSession();
        }
      }
    } catch (e) {
      debugPrint('[AppRoot] preview auto-login failed: $e');
    }
    return null;
  }

  Widget _buildPreviewRoute(DeveloperPreviewController preview) {
    switch (preview.state) {
      case DeveloperUserState.firstLaunch:
        return FirstLaunchFlowScreen(
          onFinished: () => preview.setState(DeveloperUserState.loggedOut),
        );
      case DeveloperUserState.loggedOut:
        return const LoggedOutLandingScreen();
      case DeveloperUserState.loggedIn:
      case DeveloperUserState.verifiedUser:
        return const MainNavigation();
    }
  }

  @override
  Widget build(BuildContext context) {
    final preview = context.watch<DeveloperPreviewController>();
    if (!preview.hydrated) {
      // Startup hydration phase: show a premium brand loader instead of a generic spinner.
      return const _StartupBrandLoader();
    }

    return FutureBuilder<AuthSession?>(
      future: _sessionFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _StartupBrandLoader();
        }
        if (snapshot.data != null) {
          return const MainNavigation();
        }
        if (BackendConfig.enabled || kReleaseMode) {
          return const MainNavigation();
        }
        return _buildPreviewRoute(preview);
      },
    );
  }
}

class _StartupBrandLoader extends StatefulWidget {
  const _StartupBrandLoader();

  @override
  State<_StartupBrandLoader> createState() => _StartupBrandLoaderState();
}

class _StartupBrandLoaderState extends State<_StartupBrandLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat();
  late final Animation<double> _turns = Tween<double>(
    begin: 0,
    end: 1,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOutCubic));
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween<double>(
        begin: 0.75,
        end: 1.25,
      ).chain(CurveTween(curve: Curves.easeInOutCubic)),
      weight: 1,
    ),
    TweenSequenceItem(
      tween: Tween<double>(
        begin: 1.25,
        end: 0.75,
      ).chain(CurveTween(curve: Curves.easeInOutCubic)),
      weight: 1,
    ),
  ]).animate(_controller);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Match the Explore page logo vibe, but slightly larger for the startup moment.
    final baseSize = 84.0; // ~50% larger than the 56px header icon.

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Center(
        child: Semantics(
          label: 'ShareItToo lädt',
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              return Transform.scale(
                scale: _scale.value,
                child: RotationTransition(
                  turns: _turns,
                  child: Image.asset(
                    'assets/images/icononly_transparent_nobuffer.png',
                    width: baseSize,
                    height: baseSize,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => Icon(
                      Icons.all_inclusive,
                      color: theme.colorScheme.onSurface,
                      size: baseSize * 0.55,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
