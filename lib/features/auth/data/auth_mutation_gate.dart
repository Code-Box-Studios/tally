import 'package:firebase_auth/firebase_auth.dart';

/// Keeps application sign-in and sign-out operations in invocation order.
final class AuthMutationGate {
  Future<void> _tail = Future.value();
  Future<T> run<T>(Future<T> Function() operation) {
    final result = _tail.then((_) => operation());
    _tail = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }
}

final _gates = Expando<AuthMutationGate>();
AuthMutationGate authMutationGate(FirebaseAuth auth) =>
    _gates[auth] ??= AuthMutationGate();
