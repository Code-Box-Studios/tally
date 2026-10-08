import 'dart:async';

import '../../../core/errors/app_failure.dart';
import '../domain/auth_repository.dart';
import '../domain/session_state.dart';
import '../domain/user_profile.dart';

final class SessionController {
  SessionController(this.auth, this.profiles, {this.reportFailure}) {
    _authSubscription = auth.watchIdentity().listen((identity) {
      unawaited(_identityChanged(identity));
    }, onError: (Object error) => _fail(error));
  }
  final AuthRepository auth;
  final ProfileRepository profiles;
  final void Function(String messageKey)? reportFailure;
  final _changes = StreamController<SessionState>.broadcast(sync: true);
  late final StreamSubscription<AuthIdentity?> _authSubscription;
  StreamSubscription<UserProfile>? _profileSubscription;
  SessionState _state = const SessionState(SessionStage.initializing);
  AuthIdentity? _identity;
  int _generation = 0;
  bool _disposed = false;
  SessionState get state => _state;
  AuthIdentity? get identity => _identity;

  Stream<SessionState> watch() => Stream.multi((listener) {
    final subscription = _changes.stream.listen(
      listener.add,
      onError: listener.addError,
      onDone: listener.close,
    );
    listener.add(_state);
    listener.onCancel = subscription.cancel;
  });
  void _emit(SessionState state) {
    if (_disposed) return;
    _state = state;
    _changes.add(state);
  }

  void _fail(Object error) {
    final failure = error is AppFailure
        ? error
        : AppFailure(
            AppFailureCode.unavailable,
            messageKey: 'auth.unavailable',
            retryable: true,
          );
    reportFailure?.call(failure.messageKey);
    _emit(SessionState(SessionStage.failure, failure: failure));
  }

  Future<void> _identityChanged(
    AuthIdentity? identity, {
    bool force = false,
  }) async {
    if (_disposed) return;
    if (!force &&
        identity?.uid == _identity?.uid &&
        (_state.stage == SessionStage.ready ||
            _state.stage == SessionStage.needsOnboarding)) {
      return;
    }
    final generation = ++_generation;
    _identity = identity;
    // Clear owner data synchronously before waiting for listener cancellation.
    _emit(
      SessionState(
        identity == null
            ? SessionStage.signedOut
            : SessionStage.bootstrappingProfile,
      ),
    );
    final old = _profileSubscription;
    _profileSubscription = null;
    await old?.cancel();
    if (_disposed || generation != _generation || identity == null) return;
    try {
      final profile = await profiles.bootstrap(identity.uid);
      if (_disposed || generation != _generation) return;
      _accept(profile, identity, generation);
      _profileSubscription = profiles
          .watchProfile(identity.uid)
          .listen(
            (profile) {
              if (!_disposed && generation == _generation) {
                _accept(profile, identity, generation);
              }
            },
            onError: (Object error) {
              if (generation == _generation) _fail(error);
            },
          );
    } catch (error) {
      if (generation == _generation) _fail(error);
    }
  }

  void _accept(UserProfile profile, AuthIdentity identity, int generation) {
    if (profile.uid != identity.uid) {
      _fail(
        AppFailure(AppFailureCode.unavailable, messageKey: 'profile.owner'),
      );
      return;
    }
    _emit(
      SessionState(
        profile.onboardingComplete
            ? SessionStage.ready
            : SessionStage.needsOnboarding,
        profile: profile,
      ),
    );
  }

  void retry() => unawaited(_identityChanged(_identity, force: true));
  Future<void> signOut() => auth.signOut();
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    ++_generation;
    _identity = null;
    _state = const SessionState(SessionStage.signedOut);
    await _authSubscription.cancel();
    await _profileSubscription?.cancel();
    await _changes.close();
  }
}
