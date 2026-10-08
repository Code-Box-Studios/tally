import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/account_deletion.dart';

typedef DeletionInvocation = Future<Object?> Function(
  String name,
  Map<String, Object?> envelope,
);

final class FirebaseAccountDeletionRepository
    implements AccountDeletionRepository {
  const FirebaseAccountDeletionRepository({
    required this.owner,
    required this.isOwnerActive,
    required this.invoke,
  });
  factory FirebaseAccountDeletionRepository.firebase({
    required OwnerUid owner,
    required FirebaseAuth auth,
    required FirebaseFunctions functions,
  }) => FirebaseAccountDeletionRepository(
    owner: owner,
    isOwnerActive: () => auth.currentUser?.uid == owner.value,
    invoke: (name, envelope) async =>
        (await functions.httpsCallable(name).call<Object?>(envelope)).data,
  );
  @override
  final OwnerUid owner;
  final bool Function() isOwnerActive;
  final DeletionInvocation invoke;
  @override
  Future<DeletionView> request(CommandId id) async => _parse(
    await _call('requestAccountDeletion', id, {'confirmation': 'DELETE'}),
  );
  @override
  Future<DeletionView?> status() async {
    final result = await _call(
      'readAccountDeletionStatus',
      CommandId('deletion-status'),
      const {},
    );
    return result == null ? null : _parse(result);
  }

  Future<Object?> _call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    if (!isOwnerActive()) {
      throw const DeletionFailure(DeletionFailureCode.changedOwner);
    }
    try {
      return await invoke(name, {
        'commandId': id.value,
        'expectedOwnerUid': owner.value,
        'payload': payload,
      });
    } on FirebaseFunctionsException catch (error) {
      throw DeletionFailure(
        error.code == 'failed-precondition' &&
                error.details is Map &&
                (error.details as Map)['reason'] == 'requires-recent-login'
            ? DeletionFailureCode.recentLogin
            : DeletionFailureCode.unavailable,
      );
    } catch (_) {
      throw const DeletionFailure(DeletionFailureCode.unavailable);
    }
  }

  DeletionView _parse(Object? raw) {
    const invalid = DeletionFailure(DeletionFailureCode.invalidResponse);
    if (raw is! Map ||
        raw.length != 3 ||
        !raw.containsKey('userId') ||
        !raw.containsKey('status') ||
        !raw.containsKey('step') ||
        raw['userId'] != owner.value ||
        raw['status'] is! String ||
        raw['step'] is! String) {
      throw invalid;
    }
    try {
      final status = DeletionStatus.values.byName(raw['status'] as String),
          step = DeletionStep.values.byName(raw['step'] as String);
      if ((status == DeletionStatus.complete) !=
          (step == DeletionStep.complete)) {
        throw invalid;
      }
      return DeletionView(owner, status, step);
    } catch (_) {
      throw invalid;
    }
  }
}
