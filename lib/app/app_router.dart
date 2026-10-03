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
import 'responsive_shell.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = createAppRouter();
  ref.onDispose(router.dispose);
  return router;
});

GoRouter createAppRouter({String initialLocation = '/home'}) => GoRouter(
  initialLocation: initialLocation,
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
    GoRoute(path: '/', redirect: (_, _) => '/home'),
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) => ResponsiveShell(navigationShell: shell),
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
