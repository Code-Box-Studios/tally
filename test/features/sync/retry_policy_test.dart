import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/sync/domain/retry_policy.dart';

void main() {
  test('retry begins at one second and saturates without integer overflow', () {
    final low = RetryPolicy(jitter: () => 0),
        high = RetryPolicy(jitter: () => 1);
    expect(low.delayFor(1), const Duration(seconds: 1));
    expect(high.delayFor(1), const Duration(milliseconds: 1500));
    expect(low.delayFor(2), const Duration(seconds: 2));
    expect(low.delayFor(9), const Duration(seconds: 256));
    expect(high.delayFor(9), const Duration(minutes: 5));
    for (final attempt in [10, 100, 9007199254740990]) {
      expect(high.delayFor(attempt), const Duration(minutes: 5));
    }
    expect(() => low.delayFor(0), throwsArgumentError);
    for (final jitter in [-0.1, 1.1, double.nan, double.infinity]) {
      expect(
        () => RetryPolicy(jitter: () => jitter).delayFor(1),
        throwsArgumentError,
      );
    }
  });
}
