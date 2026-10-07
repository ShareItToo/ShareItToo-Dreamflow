import 'dart:async';

typedef SearchRecomputeOperation = Future<void> Function(int generation);

/// Coalesces rapid text changes and makes late asynchronous search results
/// distinguishable from the latest requested input.
class LatestSearchRecompute {
  LatestSearchRecompute({
    this.debounce = const Duration(milliseconds: 450),
  });

  final Duration debounce;
  Timer? _timer;
  int _generation = 0;
  bool _disposed = false;

  int schedule(SearchRecomputeOperation operation) {
    _assertActive();
    _timer?.cancel();
    final generation = ++_generation;
    _timer = Timer(debounce, () async {
      _timer = null;
      if (!isCurrent(generation)) return;
      await operation(generation);
    });
    return generation;
  }

  int beginImmediate() {
    _assertActive();
    _timer?.cancel();
    _timer = null;
    return ++_generation;
  }

  bool isCurrent(int generation) =>
      !_disposed && generation > 0 && generation == _generation;

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _generation += 1;
    _timer?.cancel();
    _timer = null;
  }

  void _assertActive() {
    if (_disposed) {
      throw StateError('LatestSearchRecompute is already disposed.');
    }
  }
}
