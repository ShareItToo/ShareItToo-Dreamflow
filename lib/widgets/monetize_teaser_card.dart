import 'dart:async';
import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';

class MonetizeTeaserCard extends StatefulWidget {
  final Future<void> Function(Item created)? onListingCreated;
  const MonetizeTeaserCard({super.key, this.onListingCreated});
  @override
  State<MonetizeTeaserCard> createState() => _MonetizeTeaserCardState();
}

class _MonetizeTeaserCardState extends State<MonetizeTeaserCard> with TickerProviderStateMixin {
  late final AnimationController _fadeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
  late final AnimationController _ctaSlideCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 320));
  late final Animation<Offset> _ctaSlide = Tween<Offset>(begin: const Offset(1, 0), end: Offset.zero).animate(CurvedAnimation(parent: _ctaSlideCtrl, curve: Curves.easeOutCubic));
  late final AnimationController _symbolsCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  static const double _heroVideoAspect = 16 / 9;

  VideoPlayerController? _videoCtrl;
  bool _showQuestion = true;
  bool _ctaVisible = false; // Start hidden to avoid initial flicker
  bool _videoCompleted = false;
  Timer? _sequenceTimer;

  @override
  void initState() {
    super.initState();
    _initVideo();
    _ctaSlideCtrl.forward();
    _symbolsCtrl.forward();
  }

  Future<void> _initVideo() async {
    final ctrl = VideoPlayerController.asset('assets/videos/video_full_2.mp4');
    _videoCtrl = ctrl;
    await ctrl.initialize();
    ctrl.setLooping(false);
    ctrl.setVolume(0);
    ctrl.addListener(_onVideoTick);
    if (!mounted) return;
    _startSequence();
  }

  void _onVideoTick() {
    final v = _videoCtrl;
    if (v == null || !v.value.isInitialized) return;

    // Show CTA 4 seconds before video ends
    final Duration dur = v.value.duration;
    Duration threshold = dur - const Duration(seconds: 4);
    if (threshold.isNegative) threshold = Duration.zero;
    if (!_ctaVisible && v.value.position >= threshold) {
      setState(() => _ctaVisible = true);
      _ctaSlideCtrl
        ..reset()
        ..forward();
    }

    // Fallback: when video actually completes
    if (!_videoCompleted && !v.value.isPlaying && v.value.position >= dur) {
      _videoCompleted = true;
      if (!_ctaVisible) {
        setState(() => _ctaVisible = true);
        _ctaSlideCtrl
          ..reset()
          ..forward();
      }
    }
  }

  void _startSequence() {
    _sequenceTimer?.cancel();
    setState(() {
      _showQuestion = true;
      _ctaVisible = false;
      _videoCompleted = false;
    });
    _symbolsCtrl
      ..reset()
      ..forward();
    _fadeCtrl.value = 1.0;
    _sequenceTimer = Timer(const Duration(milliseconds: 2500), () async {
      if (!mounted) return;
      await _fadeCtrl.reverse();
      setState(() => _showQuestion = false);
      await _videoCtrl?.play();
    });
  }

  @override
  void dispose() {
    _sequenceTimer?.cancel();
    _fadeCtrl.dispose();
    _ctaSlideCtrl.dispose();
    _symbolsCtrl.dispose();
    _videoCtrl?..removeListener(_onVideoTick)..dispose();
    super.dispose();
  }

  Future<void> _onTapCreate(BuildContext context, LocalizationController l10n) async {
    final created = await Navigator.of(context).push<Item?>(
      MaterialPageRoute(
        builder: (_) => const CreateListingScreen(),
      ),
    );
    if (created != null && widget.onListingCreated != null) {
      await widget.onListingCreated!(created);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final screenSize = MediaQuery.of(context).size;
    final screenW = screenSize.width;
    final double maxCardW = screenW >= 1024
        ? 720
        : screenW >= 900
            ? 640
            : screenW >= 600
                ? 520
                : screenW;
    const String heroPosterUrl = 'https://images.unsplash.com/photo-1512207857427-d33e6d6fef85?auto=format&fit=crop&w=1600&q=80';
    final bool videoReady = _videoCtrl != null && _videoCtrl!.value.isInitialized;

    return Align(
      alignment: Alignment.center,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxCardW),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GestureDetector(
              onTap: () => _onTapCreate(context, l10n),
              child: SizedBox(
                width: double.infinity,
                child: AspectRatio(
                  aspectRatio: _heroVideoAspect,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Positioned.fill(
                          child: AppImage(
                            url: heroPosterUrl,
                            fit: BoxFit.cover,
                            fallback: const ColoredBox(color: Color(0x1A000000)),
                          ),
                        ),
                        if (videoReady)
                          Positioned.fill(
                            child: FittedBox(
                              fit: BoxFit.cover,
                              alignment: Alignment.center,
                              child: SizedBox(
                                width: _videoCtrl!.value.size.width,
                                height: _videoCtrl!.value.size.height,
                                child: VideoPlayer(_videoCtrl!),
                              ),
                            ),
                          ),
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.black.withValues(alpha: 0.35),
                                  Colors.transparent,
                                  Colors.black.withValues(alpha: 0.35),
                                ],
                              ),
                            ),
                          ),
                        ),
                        if (_showQuestion)
                          Positioned.fill(
                            child: FadeTransition(
                              opacity: _fadeCtrl,
                              child: Container(
                                alignment: Alignment.center,
                                color: Colors.black.withValues(alpha: 0.25),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16),
                                  child: _CurrencyAssembleIntro(
                                    text: l10n.t('Willst du mit jedem Gegenstand, den du besitzt, Geld verdienen?'),
                                    progress: _symbolsCtrl.value,
                                    fontSize: screenW >= 900 ? 40 : screenW >= 600 ? 32 : 24,
                                    strokeWidth: screenW >= 600 ? 3 : 2,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => _onTapCreate(context, l10n),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                ),
                child: Row(children: [
                  const Icon(Icons.add_business, color: Colors.lightBlueAccent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      switchInCurve: Curves.easeOut,
                      switchOutCurve: Curves.easeIn,
                      child: _ctaVisible
                          ? SlideTransition(
                              position: _ctaSlide,
                              child: Text(
                                l10n.t('Erstelle eine neue Anzeige'),
                                key: const ValueKey('cta-text'),
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                                overflow: TextOverflow.ellipsis,
                                softWrap: true,
                              ),
                            )
                          : const SizedBox.shrink(key: ValueKey('cta-empty')),
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.white70),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CurrencyAssembleIntro extends StatelessWidget {
  final String text;
  final double progress;
  final double fontSize;
  final double strokeWidth;
  const _CurrencyAssembleIntro({required this.text, required this.progress, required this.fontSize, required this.strokeWidth});
  @override
  Widget build(BuildContext context) {
    final Color stroke = Theme.of(context).colorScheme.primary;
    final TextStyle base = TextStyle(
      fontSize: fontSize,
      fontWeight: FontWeight.w800,
      height: 1.15,
    );
    return Stack(alignment: Alignment.center, children: [
      // Currency particles assembling
      SizedBox(
        height: fontSize * 3,
        child: LayoutBuilder(builder: (context, c) {
          final center = Offset(c.maxWidth / 2, c.maxHeight / 2);
          final count = 24;
          return Stack(children: List.generate(count, (i) {
            final angle = (2 * pi * i) / count;
            final startR = max(c.maxWidth, c.maxHeight) * 0.7;
            final start = center + Offset(cos(angle) * startR, sin(angle) * startR);
            final end = center + Offset(cos(angle) * (fontSize * 0.4), sin(angle) * (fontSize * 0.2));
            final t = Curves.easeOutCubic.transform(progress.clamp(0, 1));
            final pos = Offset(ui.lerpDouble(start.dx, end.dx, t)!, ui.lerpDouble(start.dy, end.dy, t)!);
            final sym = i.isEven ? '€' : r'$';
            final opacity = (0.2 + 0.8 * progress).clamp(0.0, 1.0);
            return Positioned(
              left: pos.dx,
              top: pos.dy,
              child: Transform.scale(
                scale: 1.0 - 0.3 * (1 - progress),
                child: Text(sym, style: TextStyle(color: Colors.lightBlueAccent.withValues(alpha: opacity), fontSize: fontSize * 0.6, fontWeight: FontWeight.w800)),
              ),
            );
          }));
        }),
      ),
      // Outlined headline on top
      Stack(alignment: Alignment.center, children: [
        Text(
          text,
          textAlign: TextAlign.center,
          softWrap: true,
          overflow: TextOverflow.visible,
          style: base.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = strokeWidth
              ..color = stroke,
          ),
        ),
        Text(
          text,
          textAlign: TextAlign.center,
          softWrap: true,
          overflow: TextOverflow.visible,
          style: base.copyWith(color: Colors.white),
        ),
      ]),
    ]);
  }
}
