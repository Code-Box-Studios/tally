import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/errors/app_failure.dart';

AppFailure authFailure(Object error) {
  if (error is AppFailure) return error;
  // The callable SDK reports a failed HTTP fetch as `internal`. It is an
  // availability failure, while explicit authorization/schema failures stay final.
  final code = error is FirebaseFunctionsException && error.code == 'internal'
      ? 'unavailable'
      : error is FirebaseException
      ? error.code
      : '';
  final message = switch (code) {
    'invalid-email' => 'auth.email',
    'weak-password' => 'auth.password',
    'email-already-in-use' => 'auth.emailInUse',
    'invalid-credential' ||
    'wrong-password' ||
    'user-not-found' => 'auth.credentials',
    'too-many-requests' => 'auth.rateLimited',
    'network-request-failed' ||
    'unavailable' ||
    'deadline-exceeded' => 'auth.network',
    'popup-closed-by-user' || 'canceled' || 'cancelled' => 'auth.cancelled',
    'popup-blocked' => 'auth.popupBlocked',
    'account-exists-with-different-credential' => 'auth.existingProvider',
    'aborted' => 'profile.conflict',
    _ => 'auth.unavailable',
  };
  return AppFailure(
    AppFailureCode.unavailable,
    messageKey: message,
    retryable: [
      'network-request-failed',
      'unavailable',
      'deadline-exceeded',
    ].contains(code),
  );
}

String authFailureMessage(Object error) => switch (authFailure(error)
    .messageKey) {
  'auth.email' => 'Enter a valid email address.',
  'auth.password' => 'Use a stronger password with at least 8 characters.',
  'auth.emailInUse' =>
    'This email is already registered. Sign in or reset your password.',
  'auth.credentials' => 'Check your email and password and try again.',
  'auth.rateLimited' => 'Too many attempts. Please try again later.',
  'auth.network' => 'Couldn’t connect. Check your connection and try again.',
  'auth.cancelled' => 'Sign-in was cancelled.',
  'auth.popupBlocked' =>
    'Allow pop-ups for Tally, then try Google sign-in again.',
  'auth.existingProvider' =>
    'Sign in with your existing method for this email.',
  'profile.conflict' =>
    'Your preferences changed on another device. Refresh and try again.',
  _ => 'Couldn’t complete this action. Please try again.',
};
