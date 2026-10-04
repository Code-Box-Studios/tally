import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/session_route_gate.dart';
import 'package:tally/features/auth/domain/session_state.dart';

import '../features/auth/session_controller_test.dart' show profile;

void main() {
  test('abandoning onboarding clears the previous account return route', () {
    final gate = SessionRouteGate();
    addTearDown(gate.dispose);
    gate.update(const SessionState(SessionStage.signedOut));
    gate.redirect(Uri.parse('/obligations?section=owed'));
    gate.update(
      SessionState(
        SessionStage.needsOnboarding,
        profile: profile('alice', complete: false),
      ),
    );
    gate.redirect(Uri.parse('/sign-in'));
    gate.redirect(Uri.parse('/onboarding'));
    gate.update(const SessionState(SessionStage.signedOut));
    gate.redirect(Uri.parse('/onboarding'));
    gate.update(SessionState(SessionStage.ready, profile: profile('bob')));
    expect(gate.redirect(Uri.parse('/sign-in')), '/home');
  });
  test(
    'a new signed-out deep link works after an earlier complete session',
    () {
      final gate = SessionRouteGate();
      addTearDown(gate.dispose);
      gate.update(SessionState(SessionStage.ready, profile: profile('alice')));
      gate.redirect(Uri.parse('/settings'));
      gate.update(const SessionState(SessionStage.signedOut));
      expect(gate.redirect(Uri.parse('/settings')), '/sign-in');
      gate.redirect(Uri.parse('/sign-in'));
      expect(gate.redirect(Uri.parse('/calendar?view=agenda')), '/sign-in');
      gate.update(SessionState(SessionStage.ready, profile: profile('bob')));
      expect(gate.redirect(Uri.parse('/sign-in')), '/calendar?view=agenda');
    },
  );
  test(
    'login preserves permitted private deep link and returns after setup',
    () {
      final gate = SessionRouteGate();
      addTearDown(gate.dispose);
      gate.update(const SessionState(SessionStage.signedOut));
      expect(gate.redirect(Uri.parse('/obligations?section=owed')), '/sign-in');
      gate.update(
        SessionState(
          SessionStage.needsOnboarding,
          profile: profile('alice', complete: false),
        ),
      );
      expect(gate.redirect(Uri.parse('/sign-in')), '/onboarding');
      gate.update(SessionState(SessionStage.ready, profile: profile('alice')));
      expect(
        gate.redirect(Uri.parse('/onboarding')),
        '/obligations?section=owed',
      );
    },
  );
  test('external return URLs are ignored and logout forgets the prior owner navigation', () {
    final gate = SessionRouteGate();
    addTearDown(gate.dispose);
    gate.update(const SessionState(SessionStage.signedOut));
    gate.redirect(Uri.parse('/sign-in?return=https://malicious.example'));
    gate.update(SessionState(SessionStage.ready, profile: profile('alice')));
    expect(
      gate.redirect(Uri.parse('/sign-in?return=https://malicious.example')),
      '/home',
    );
    gate.redirect(Uri.parse('/settings'));
    gate.update(const SessionState(SessionStage.signedOut));
    expect(gate.redirect(Uri.parse('/settings')), '/sign-in');
    gate.update(SessionState(SessionStage.ready, profile: profile('bob')));
    expect(gate.redirect(Uri.parse('/sign-in')), '/home');
  });
  test(
    'private navigation waits for identity hydration and profile readiness',
    () {
      final gate = SessionRouteGate();
      addTearDown(gate.dispose);
      expect(gate.redirect(Uri.parse('/calendar')), '/startup');
      gate.update(const SessionState(SessionStage.bootstrappingProfile));
      expect(gate.redirect(Uri.parse('/startup')), isNull);
      gate.update(SessionState(SessionStage.ready, profile: profile('alice')));
      expect(gate.redirect(Uri.parse('/startup')), '/calendar');
      expect(gate, isA<Listenable>());
    },
  );
}
