import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final financialNowProvider = Provider<DateTime Function()>(
  (ref) =>
      () => DateTime.now().toUtc(),
);

final _clockTicksProvider = StreamProvider.autoDispose<DateTime>((ref) {
  final now = ref.watch(financialNowProvider);
  return Stream.multi((listener) {
    void tick() => listener.add(now());
    final observer = _ClockObserver(tick);
    WidgetsBinding.instance.addObserver(observer);
    final timer = Timer.periodic(const Duration(minutes: 1), (_) => tick());
    listener.onCancel = () {
      timer.cancel();
      WidgetsBinding.instance.removeObserver(observer);
    };
    tick();
  });
});

final financialClockProvider = Provider.autoDispose<DateTime>(
  (ref) =>
      ref.watch(_clockTicksProvider).value ?? ref.watch(financialNowProvider)(),
);

class _ClockObserver extends WidgetsBindingObserver {
  _ClockObserver(this.tick);
  final VoidCallback tick;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) tick();
  }
}
