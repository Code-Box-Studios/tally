import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../core/errors/app_failure.dart';
import '../domain/financial_failure.dart';

FinancialFailure financialFailure(Object error) {
  if (error is FinancialFailure) return error;
  final code = error is FirebaseException ? error.code : '';
  final details = error is FirebaseFunctionsException ? error.details : null;
  if (details is Map && details['reason'] == 'overpayment') {
    final remaining = details['remainingMinor'];
    return FinancialFailure(
      FinancialFailureCode.overpayment,
      'This payment exceeds the remaining balance. Refresh the obligation and enter a smaller amount.',
      remainingMinor: remaining is int ? remaining : null,
    );
  }
  return switch (code) {
    'aborted' || 'already-exists' => const FinancialFailure(
      FinancialFailureCode.conflict,
      'This record changed. Refresh it before saving again.',
    ),
    'unavailable' ||
    'deadline-exceeded' ||
    'network-request-failed' => const FinancialFailure(
      FinancialFailureCode.offline,
      'Could not confirm this save. Reconnect and retry this action.',
    ),
    'unauthenticated' || 'permission-denied' => const FinancialFailure(
      FinancialFailureCode.signIn,
      'Your sign-in changed or this record is unavailable. Sign in again.',
    ),
    'invalid-argument' || 'out-of-range' => const FinancialFailure(
      FinancialFailureCode.invalid,
      'Check the amount, dates and selected details before saving.',
    ),
    'failed-precondition' => const FinancialFailure(
      FinancialFailureCode.recovery,
      'This action needs a refresh or record recovery. Your history has been preserved.',
    ),
    _ =>
      error is AppFailure
          ? const FinancialFailure(
              FinancialFailureCode.invalid,
              'This record is invalid or uses an unsupported format. Refresh or update Tally.',
            )
          : const FinancialFailure(
              FinancialFailureCode.unavailable,
              'Could not confirm this action. Please retry.',
            ),
  };
}
