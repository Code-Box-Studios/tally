import 'dart:async';

import '../../../core/identifiers/entity_ids.dart';
import 'account_deletion.dart';
import 'deletion_handoff_store.dart';
import 'owner_local_cleanup.dart';

typedef DeletionScope = ({OwnerUid owner, String environment});

enum DeletionPhase {
  idle,
  reauthenticating,
  authenticationFailed,
  requesting,
  uncertain,
  accepted,
  cleaning,
  cleanupRequired,
  localComplete,
  recoveryRequired,
}

final class DeletionState {
  const DeletionState(this.phase, {this.requestId, this.view, this.failure});
  final DeletionPhase phase;
  final CommandId? requestId;
  final DeletionView? view;
  final DeletionFailureCode? failure;
}

final class AccountDeletionController {
  AccountDeletionController({
    required this.scope,
    required this.repository,
    required this.authentication,
    required this.handoffs,
    required this.cleanup,
    required this.newId,
  }) {
    if (repository.owner != scope.owner) {
      throw ArgumentError('Deletion repository owner mismatch.');
    }
  }
  final DeletionScope scope;
  final AccountDeletionRepository repository;
  final RecentAuthentication authentication;
  final DeletionHandoffStore handoffs;
  final OwnerLocalCleanup cleanup;
  final CommandId Function() newId;
  DeletionState _state = const DeletionState(DeletionPhase.idle);
  final _changes = StreamController<DeletionState>.broadcast(sync: true);
  bool _busy = false, _accepted = false, _disposed = false;
  CommandId? _requestId;
  DeletionView? _view;
  DeletionState get state => _state;
  DeletionState? visibleState(OwnerUid? owner) =>
      owner == scope.owner ? state : null;
  Stream<DeletionState> watch() => Stream.multi((events) {
    final subscription = _changes.stream.listen(
      events.addSync,
      onDone: events.closeSync,
    );
    events.addSync(state);
    events.onCancel = subscription.cancel;
  });

  void _set(DeletionPhase phase, [DeletionFailureCode? failure]) {
    _state = DeletionState(
      phase,
      requestId: _requestId,
      view: _view,
      failure: failure,
    );
    if (!_disposed) _changes.add(_state);
  }

  void _checkOwner() {
    if (_disposed || !authentication.isOwnerActive(scope.owner)) {
      throw const DeletionFailure(DeletionFailureCode.changedOwner);
    }
  }

  DeletionFailureCode _code(Object error) =>
      error is DeletionFailure ? error.code : DeletionFailureCode.unavailable;

  Future<void> _load() async {
    final marker = await handoffs.read(scope.owner, scope.environment);
    if (marker == null) return;
    if (_requestId != null && _requestId != marker.requestId) {
      throw const DeletionFailure(DeletionFailureCode.recovery);
    }
    _requestId = marker.requestId;
    _accepted = _accepted || marker.accepted;
  }

  Future<void> _verify(DeletionAuthentication input) async {
    final password = input.takePassword();
    await authentication.reauthenticate(
      scope.owner,
      password: password,
      provider: input.provider,
    );
  }

  Future<void> submit(
    DeletionConfirmation confirmation,
    DeletionAuthentication input,
  ) async {
    if (_disposed || _busy || state.phase == DeletionPhase.localComplete) {
      input.clear();
      return;
    }
    _busy = true;
    try {
      if (!confirmation.valid) {
        _set(DeletionPhase.idle, DeletionFailureCode.confirmation);
        return;
      }
      try {
        await _load();
      } catch (_) {
        _set(DeletionPhase.recoveryRequired, DeletionFailureCode.recovery);
        return;
      }
      if (_accepted) {
        input.clear();
        await _finishAccepted();
        return;
      }
      _checkOwner();
      _set(DeletionPhase.reauthenticating);
      await _verify(input);
      _checkOwner();
      _requestId ??= newId();
      try {
        await handoffs.write(_marker(DeletionHandoffPhase.uncertain));
      } catch (_) {
        _set(DeletionPhase.recoveryRequired, DeletionFailureCode.recovery);
        return;
      }
      _checkOwner();
      await _request();
    } catch (error) {
      _set(DeletionPhase.authenticationFailed, _code(error));
    } finally {
      input.clear();
      _busy = false;
    }
  }

  DeletionHandoff _marker(DeletionHandoffPhase phase) => DeletionHandoff(
    owner: scope.owner,
    environment: scope.environment,
    requestId: _requestId!,
    phase: phase,
  );

  Future<void> _request() async {
    _set(DeletionPhase.requesting);
    try {
      await _accept(await repository.request(_requestId!));
    } catch (error) {
      _set(DeletionPhase.uncertain, _code(error));
    }
  }

  Future<void> _accept(DeletionView view) async {
    if (view.owner != scope.owner) {
      throw const DeletionFailure(DeletionFailureCode.invalidResponse);
    }
    _view = view;
    _accepted = true;
    await _finishAccepted();
  }

  Future<void> _finishAccepted() async {
    _set(DeletionPhase.accepted);
    try {
      await handoffs.write(_marker(DeletionHandoffPhase.accepted));
      _set(DeletionPhase.cleaning);
      await cleanup.quiesceAndPurge(scope.owner, scope.environment);
      await authentication.signOutIfOwner(scope.owner);
      _set(DeletionPhase.localComplete);
    } catch (_) {
      _set(DeletionPhase.cleanupRequired, DeletionFailureCode.localCleanup);
    }
  }

  Future<void> retryOriginal() async {
    if (_disposed || _busy || state.phase == DeletionPhase.localComplete) {
      return;
    }
    _busy = true;
    try {
      try {
        await _load();
      } catch (_) {
        _set(DeletionPhase.recoveryRequired, DeletionFailureCode.recovery);
        return;
      }
      if (_accepted) {
        await _finishAccepted();
        return;
      }
      if (_requestId == null) return;
      _checkOwner();
      _set(DeletionPhase.requesting);
      final view = await repository.status();
      if (view != null) {
        await _accept(view);
      } else {
        _checkOwner();
        await _request();
      }
    } catch (error) {
      _set(DeletionPhase.uncertain, _code(error));
    } finally {
      _busy = false;
    }
  }

  Future<void> retryCleanup() async {
    if (_disposed || _busy || state.phase == DeletionPhase.localComplete) {
      return;
    }
    _busy = true;
    try {
      try {
        await _load();
      } catch (_) {
        _set(DeletionPhase.recoveryRequired, DeletionFailureCode.recovery);
        return;
      }
      if (_accepted) await _finishAccepted();
    } finally {
      _busy = false;
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_changes.close());
  }
}
