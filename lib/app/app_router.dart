import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/dashboard/presentation/dashboard_screen.dart';
import '../features/activity/presentation/activity_screen.dart';
import '../features/calendar/presentation/calendar_screen.dart';
import '../features/obligations/presentation/obligations_screen.dart';
import '../features/people/presentation/people_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../shared/widgets/empty_state.dart';
import '../core/config/environment.dart';
import '../core/config/environment_providers.dart';
import '../features/auth/presentation/auth_providers.dart';
import '../features/auth/presentation/auth_screen.dart';
import '../features/auth/presentation/onboarding_screen.dart';
import '../features/auth/presentation/startup_screen.dart';
import '../features/auth/domain/session_state.dart';
import 'session_route_gate.dart';
import 'responsive_shell.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  SessionRouteGate? gate;
  if (ref.watch(environmentProvider).mode != AppEnvironment.preview) {
    final controller = ref.watch(sessionControllerProvider);
    gate = SessionRouteGate()..update(controller.state);
    final subscription = controller.watch().listen(gate.update);
    ref.onDispose(() => unawaited(subscription.cancel()));
    ref.onDispose(gate.dispose);
  }
  final router = createAppRouter(gate: gate);
  ref.onDispose(router.dispose);
  return router;
});

GoRouter createAppRouter({
  String initialLocation = '/home',
  SessionRouteGate? gate,
}) => GoRouter(
  initialLocation: initialLocation,
  refreshListenable: gate,
  redirect: gate == null ? null : (_, state) => gate.redirect(state.uri),
  errorBuilder: (context, state) => Scaffold(
    body: SingleChildScrollView(
      child: EmptyState(
        icon: Icons.explore_off_outlined,
        title: 'This page isn’t available',
        description: 'Head back home to see what’s due.',
        actionLabel: 'Go Home',
        onAction: () => context.go('/home'),
      ),
    ),
  ),
  routes: [
    if (gate != null) ...[
      GoRoute(path: '/startup', builder: (_, _) => const StartupScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const AuthScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
    ],
    GoRoute(path: '/', redirect: (_, _) => '/home'),
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => gate == null
          ? ResponsiveShell(navigationShell: shell)
          : _PrivateWorkspace(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(path: '/home', builder: (_, _) => const DashboardScreen()),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/obligations',
              builder: (_, state) => ObligationsScreen(
                section: state.uri.queryParameters['section'] ?? 'owe',
              ),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(path: '/people', builder: (_, _) => const PeopleScreen()),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/calendar',
              builder: (_, _) => const CalendarScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/activity',
              builder: (_, _) => const ActivityScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (_, _) => const SettingsScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
);

class _PrivateWorkspace extends ConsumerWidget {
  const _PrivateWorkspace({required this.navigationShell});
  final StatefulNavigationShell navigationShell;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session =
        ref.watch(sessionStateProvider).value ??
        ref.read(sessionControllerProvider).state;
    final profile = session.profile;
    if (session.stage != SessionStage.ready || profile == null) {
      return const StartupScreen();
    }
    return ProviderScope(
      key: ValueKey(profile.uid),
      overrides: [
        ownerUidProvider.overrideWithValue(profile.uid),
        userProfileProvider.overrideWithValue(profile),
      ],
      child: ResponsiveShell(navigationShell: navigationShell),
    );
  }
}
