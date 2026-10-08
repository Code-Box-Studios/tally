import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/auth/data/auth_failure.dart';

void main() {
  test(
    'callable transport internal errors are retryable availability failures',
    () {
      final failure = authFailure(
        FirebaseFunctionsException(code: 'internal', message: 'internal'),
      );
      expect(failure.messageKey, 'auth.network');
      expect(failure.retryable, true);
    },
  );
  test('explicit callable authorization and validation failures are never offline availability', () {
    for (final code in [
      'unauthenticated',
      'permission-denied',
      'failed-precondition',
      'invalid-argument',
    ]) {
      final failure = authFailure(
        FirebaseFunctionsException(
          code: code,
          message: 'private server detail',
        ),
      );
      expect(failure.retryable, false);
      expect(failure.messageKey, isNot('auth.network'));
      expect(failure.toString(), isNot(contains('private server detail')));
    }
  });
}
