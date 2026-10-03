import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/auth/presentation/auth_screen.dart';

import 'session_controller_test.dart' show AuthFixture;

class SignInFixture extends AuthFixture {
  final result = Completer<void>();
  int attempts = 0;
  @override
  Future<void> signInWithEmail(String email, String password) {
    attempts++;
    if (email != 'jess@example.test' || password != 'long-password') {
      throw StateError('wrong credentials forwarded');
    }
    return result.future;
  }
}

void main() {
  testWidgets(
    'sign-in submits credentials once while busy and redacts raw failures',
    (tester) async {
      final auth = SignInFixture();
      addTearDown(auth.identities.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authRepositoryProvider.overrideWithValue(auth)],
          child: const MaterialApp(home: AuthScreen()),
        ),
      );
      await tester.enterText(
        find.byKey(const Key('auth-email')),
        'jess@example.test',
      );
      await tester.enterText(
        find.byKey(const Key('auth-password')),
        'long-password',
      );
      await tester.tap(find.byKey(const Key('auth-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('auth-submit')));
      await tester.pump();
      expect(auth.attempts, 1);
      auth.result.completeError(StateError('secret-token'));
      await tester.pumpAndSettle();
      expect(find.textContaining('secret-token'), findsNothing);
      expect(find.textContaining('Couldn’t complete'), findsOneWidget);
    },
  );
  testWidgets('password reset displays a neutral result', (tester) async {
    final auth = AuthFixture();
    addTearDown(auth.identities.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [authRepositoryProvider.overrideWithValue(auth)],
        child: const MaterialApp(home: AuthScreen()),
      ),
    );
    await tester.enterText(
      find.byKey(const Key('auth-email')),
      'unknown@example.test',
    );
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.textContaining('If an account exists'), findsOneWidget);
  });
  testWidgets(
    'auth form stays reachable on a short phone with keyboard and large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = AuthFixture();
      addTearDown(auth.identities.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [authRepositoryProvider.overrideWithValue(auth)],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(2),
                viewInsets: const EdgeInsets.only(bottom: 220),
              ),
              child: child!,
            ),
            home: const AuthScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('auth-submit')));
      expect(tester.takeException(), isNull);
    },
  );
}
