import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/command_transport.dart';
import '../domain/frozen_command.dart';

typedef ProtectedCommandInvocation = Future<Object?> Function(
  String name,
  Map<String, Object?> envelope,
);

final class FirebaseCommandTransport implements CommandTransport {
  const FirebaseCommandTransport({
    required this.owner,
    required this._isOwnerActive,
    required this._invoke,
  });
  factory FirebaseCommandTransport.firebase({
    required OwnerUid owner,
    required FirebaseAuth auth,
    required FirebaseFunctions functions,
  }) => FirebaseCommandTransport(
    owner: owner,
    isOwnerActive: () => auth.currentUser?.uid == owner.value,
    invoke: (name, envelope) async =>
        (await functions.httpsCallable(name).call<Object?>(envelope)).data,
  );
  @override
  final OwnerUid owner;
  final bool Function() _isOwnerActive;
  final ProtectedCommandInvocation _invoke;
  @override
  bool get isOwnerActive => _isOwnerActive();
  void _check(FrozenCommand command) {
    if (!isOwnerActive || command.owner != owner) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Sign in to the same account to sync your changes.',
      );
    }
  }

  @override
  Future<Map<String, Object?>> execute(FrozenCommand command) async {
    _check(command);
    Object? result;
    try {
      result = await _invoke(command.name.name, {
        'commandId': command.id.value,
        'expectedOwnerUid': owner.value,
        'payload': command.payload,
      });
    } catch (error) {
      _check(command);
      throw financialFailure(error);
    }
    _check(command);
    try {
      if (result is! Map || result.keys.any((key) => key is! String)) {
        throw const UnverifiedCommandResponse();
      }
      return freezeCommandJson(Map<String, Object?>.from(result));
    } catch (_) {
      throw const UnverifiedCommandResponse();
    }
  }
}
