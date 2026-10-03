import 'package:flutter/foundation.dart';

import '../features/auth/domain/session_state.dart';

/// Holds one internal return route while identity and profile are loading.
final class SessionRouteGate extends ChangeNotifier {
  SessionState _session = const SessionState(SessionStage.initializing);
  String? _intended;
  bool _hasBeenReady = false;

  void update(SessionState state) {
    if (state.stage == SessionStage.signedOut && _hasBeenReady) {
      _intended = null;
    }
    _session = state;
    if (state.stage == SessionStage.ready) _hasBeenReady = true;
    notifyListeners();
  }

  bool _private(Uri uri) =>
      !uri.hasScheme &&
      !uri.hasAuthority &&
      const [
        '/home',
        '/obligations',
        '/people',
        '/calendar',
        '/activity',
        '/settings',
      ].any((path) => uri.path == path || uri.path.startsWith('$path/'));

  String? redirect(Uri uri) {
    final public = const [
      '/startup',
      '/sign-in',
      '/onboarding',
    ].contains(uri.path);
    if (_session.stage != SessionStage.ready &&
        _private(uri) &&
        !_hasBeenReady) {
      _intended ??= uri.toString();
    }
    final target = switch (_session.stage) {
      SessionStage.initializing ||
      SessionStage.bootstrappingProfile ||
      SessionStage.failure => '/startup',
      SessionStage.signedOut => '/sign-in',
      SessionStage.needsOnboarding => '/onboarding',
      SessionStage.ready => public ? (_intended ?? '/home') : null,
    };
    if (_session.stage == SessionStage.ready && public) _intended = null;
    return target == uri.path ? null : target;
  }
}
