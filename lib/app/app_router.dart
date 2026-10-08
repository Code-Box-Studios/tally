import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/dashboard/presentation/dashboard_screen.dart';
import '../features/activity/presentation/activity_screen.dart';
import '../features/calendar/presentation/calendar_screen.dart';
import '../features/obligations/presentation/obligations_screen.dart';
import '../features/obligations/presentation/obligation_editor.dart';
import '../features/obligations/presentation/obligation_detail_screen.dart';
import '../features/recurring/presentation/recurring_editor.dart';
import '../features/obligations/domain/obligation.dart';
import '../core/identifiers/entity_ids.dart';
import '../core/money/currency_code.dart';
import '../core/errors/app_failure.dart';
import '../features/people/presentation/people_screen.dart';
import '../features/people/presentation/contact_detail_screen.dart';
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
import '../features/notifications/presentation/reminders_screen.dart';
import '../features/notifications/presentation/notification_settings.dart';
import '../features/notifications/presentation/notification_session_providers.dart';
import '../features/notifications/domain/notification_platform.dart';
import '../features/sync/presentation/sync_screen.dart';
import '../features/sync/presentation/sync_session_host.dart';
import '../features/sync/presentation/pending_obligation_detail.dart';

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
              builder: (_, state) => _obligationsRoute(state.uri),
              routes: [
                GoRoute(
                  path: 'recurring/new',
                  builder: (_, state) => _FinancialRoute(
                    child: RecurringEditor(
                      key: ValueKey(
                        state.uri.queryParameters['mode'] ?? 'manual',
                      ),
                      automatic:
                          state.uri.queryParameters['mode'] == 'automatic',
                    ),
                  ),
                ),
                GoRoute(
                  path: 'new',
                  builder: (_, state) => _FinancialRoute(
                    child: ObligationEditor(
                      key: ValueKey(
                        state.uri.queryParameters['kind'] == 'lend'
                            ? 'lend'
                            : 'borrow',
                      ),
                      direction: state.uri.queryParameters['kind'] == 'lend'
                          ? ObligationDirection.owedToMe
                          : ObligationDirection.owedByMe,
                    ),
                  ),
                ),
                GoRoute(
                  path: ':id',
                  builder: (_, state) => _entityRoute(
                    () => ObligationDetailScreen(
                      id: ObligationId(state.pathParameters['id']!),
                      waitingForRecord: state.extra == true,
                      initialPeriod: state.uri.queryParameters['period'] == null
                          ? null
                          : InstanceId(state.uri.queryParameters['period']!),
                    ),
                  ),
                  routes: [
                    GoRoute(
                      path: 'edit',
                      builder: (_, state) => _entityRoute(
                        () => ObligationDetailScreen(
                          id: ObligationId(state.pathParameters['id']!),
                          editing: true,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/people',
              builder: (_, _) => const PeopleScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => _entityRoute(
                    () => ContactDetailScreen(
                      id: ContactId(state.pathParameters['id']!),
                    ),
                  ),
                ),
              ],
            ),
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
              routes: [
                GoRoute(
                  path: 'sync',
                  builder: (_, _) => const _FinancialRoute(child: SyncScreen()),
                  routes: [
                    GoRoute(
                      path: ':commandId',
                      builder: (_, state) => _entityRoute(
                        () => PendingObligationDetail(
                          commandId: CommandId(
                            state.pathParameters['commandId']!,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'reminders',
                  builder: (_, _) => const _FinancialRoute(
                    child: NotificationSettingsScreen(),
                  ),
                  routes: [
                    GoRoute(
                      path: 'inbox',
                      builder: (_, state) => _remindersRoute(state.uri),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

Widget _entityRoute(Widget Function() child) {
  try {
    return _FinancialRoute(child: child());
  } on AppFailure {
    return const EmptyState(
      icon: Icons.explore_off_outlined,
      title: 'This link isn’t available',
      description: 'Choose an obligation or person from your workspace.',
    );
  }
}

Widget _obligationsRoute(Uri uri) {
  try {
    final currency = uri.queryParameters['currency'];
    return ObligationsScreen(
      section: uri.queryParameters['section'] ?? 'owe',
      initialCurrency: currency == null ? null : CurrencyCode.parse(currency),
    );
  } on AppFailure {
    return const EmptyState(
      icon: Icons.currency_exchange,
      title: 'This currency isn’t supported',
      description:
          'Choose PHP, USD, EUR, SGD, AUD, JPY or GBP from your workspace.',
    );
  }
}

class _FinancialRoute extends ConsumerWidget {
  const _FinancialRoute({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(environmentProvider).mode == AppEnvironment.preview
      ? const EmptyState(
          icon: Icons.lock_outline,
          title: 'Your personal workspace needs sign-in',
          description:
              'Use the connected Tally app to save obligations and payments.',
        )
      : child;
}

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
      // Firestore manages reconnects. Surface terminal read errors immediately
      // so private screens can offer an explicit, owner-scoped retry.
      retry: (_, _) => null,
      overrides: [
        ownerUidProvider.overrideWithValue(profile.uid),
        userProfileProvider.overrideWithValue(profile),
      ],
      child: NotificationSessionHost(
        child: SyncSessionHost(
          child: ResponsiveShell(navigationShell: navigationShell),
        ),
      ),
    );
  }
}

Widget _remindersRoute(Uri uri) {
  try {
    final query = uri.queryParameters;
    final intent = query.keys.any({'reminder', 'obligation', 'period'}.contains)
        ? ReminderIntent.fromData({
            'reminderId': query['reminder'],
            'obligationId': query['obligation'],
            'instanceId': query['period'],
          })
        : null;
    return _FinancialRoute(child: RemindersScreen(initialIntent: intent));
  } catch (_) {
    return const _FinancialRoute(
      child: EmptyState(
        icon: Icons.notifications_off_outlined,
        title: 'This reminder link isn’t available',
        description: 'Open your inbox to see the latest reminders.',
      ),
    );
  }
}
