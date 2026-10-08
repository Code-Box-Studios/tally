import 'dart:math';

final class RetryPolicy {
  RetryPolicy({double Function()? jitter})
    : _jitter = jitter ?? Random().nextDouble;
  final double Function() _jitter;
  Duration delayFor(int attempts) {
    if (attempts < 1) {
      throw ArgumentError('Retry requires an attempted action.');
    }
    final jitter = _jitter();
    if (!jitter.isFinite || jitter < 0 || jitter > 1) {
      throw ArgumentError('Use bounded retry jitter.');
    }
    final base = attempts >= 10 ? 300000 : 1000 * (1 << (attempts - 1));
    return Duration(
      milliseconds: min(300000, (base * (1 + jitter / 2)).round()),
    );
  }
}
