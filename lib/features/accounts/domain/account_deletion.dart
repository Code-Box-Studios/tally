import '../../../core/identifiers/entity_ids.dart';

enum DeletionStatus { pending, leased, needsRecovery, complete }

enum DeletionStep {
  revokeSessions,
  storage,
  tokenBindings,
  ownerCollections,
  systemJobs,
  deleteIdentity,
  deleteProfile,
  complete,
}

final class DeletionView {
  const DeletionView(this.owner, this.status, this.step);
  final OwnerUid owner;
  final DeletionStatus status;
  final DeletionStep step;
}

enum DeletionFailureCode {
  confirmation,
  changedOwner,
  credentials,
  cancelled,
  popupBlocked,
  unavailable,
  recentLogin,
  invalidResponse,
  localCleanup,
  recovery,
}

final class DeletionFailure implements Exception {
  const DeletionFailure(this.code);
  final DeletionFailureCode code;
  @override
  String toString() => 'Account deletion ${code.name}';
}

abstract interface class AccountDeletionRepository {
  OwnerUid get owner;
  Future<DeletionView> request(CommandId id);
  Future<DeletionView?> status();
}

enum ReauthenticationProvider { password, google }

abstract interface class RecentAuthentication {
  Set<ReauthenticationProvider> get providers;
  bool isOwnerActive(OwnerUid owner);
  Future<void> reauthenticate(
    OwnerUid owner, {
    String? password,
    ReauthenticationProvider? provider,
  });
  Future<void> signOutIfOwner(OwnerUid owner);
}

final class DeletionConfirmation {
  const DeletionConfirmation({required this.acknowledged, required this.text});
  final bool acknowledged;
  final String text;
  bool get valid => acknowledged && text == 'DELETE';
}

/// An ephemeral input; it is consumed before the server request begins.
final class DeletionAuthentication {
  DeletionAuthentication(this.provider, {String? password})
    // Keep the public input name while retaining the secret only privately.
    // ignore: prefer_initializing_formals
    : _password = password;
  final ReauthenticationProvider provider;
  String? _password;
  bool get hasSecret => _password != null;
  String? takePassword() {
    final value = _password;
    clear();
    return value;
  }

  void clear() => _password = null;
}
