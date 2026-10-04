import 'package:flutter/foundation.dart';

import '../features/auth/domain/session_state.dart';

/// Holds one internal return route while identity and profile are loading.
final class SessionRouteGate extends ChangeNotifier {
  SessionState _session = const SessionState(SessionStage.initializing);
  String? _intended;
  Uri? _lastLocation;
  String? _logoutLocation;

  void update(SessionState state) {
    if (state.stage == SessionStage.signedOut &&
        _session.stage != SessionStage.signedOut &&
        _session.stage != SessionStage.initializing) {
      _intended = null;
      final previous = _lastLocation;
      _logoutLocation = previous != null && _private(previous)
          ? previous.toString()
          : null;
    }
    _session = state;
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
    _lastLocation = uri;
    final public = const [
      '/startup',
      '/sign-in',
      '/onboarding',
    ].contains(uri.path);
    if (_session.stage != SessionStage.ready && _private(uri)) {
      // The route still visible when logout fires belongs to the old session.
      // Consume that single redirect; later signed-out navigation is a new intent.
      if (_logoutLocation != uri.toString()) _intended ??= uri.toString();
      _logoutLocation = null;
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
