import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config/environment.dart';
import '../core/config/environment_providers.dart';
import '../core/dates/timezone_catalog.dart';
import '../features/auth/presentation/auth_providers.dart';
import '../features/obligations/presentation/add_action_sheet.dart';
import '../shared/layout/breakpoints.dart';
import '../shared/widgets/tally_brand.dart';
import 'shell_sidebar.dart';

const shellDestinations = [
  ('Home', Icons.home_outlined),
  ('Obligations', Icons.wallet_outlined),
  ('People', Icons.people_outline),
  ('Calendar', Icons.calendar_month_outlined),
  ('Activity', Icons.history),
  ('Settings', Icons.settings_outlined),
];

class ResponsiveShell extends ConsumerWidget {
  const ResponsiveShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;
  void _go(BuildContext context, int index) {
    const roots = [
      '/home',
      '/obligations',
      '/people',
      '/calendar',
      '/activity',
      '/settings',
    ];
    final path = GoRouterState.of(context).uri.path;
    navigationShell.goBranch(
      index,
      initialLocation:
          index == navigationShell.currentIndex && path != roots[index],
    );
  }

  Future<void> _mobileGo(BuildContext context, int index) async {
    if (index < 4) {
      _go(context, index);
      return;
    }
    final chosen = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 4; i < 6; i++)
              ListTile(
                leading: Icon(shellDestinations[i].$2),
                title: Text(shellDestinations[i].$1),
                onTap: () => Navigator.pop(context, i),
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (chosen != null && context.mounted) _go(context, chosen);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview =
        ref.watch(environmentProvider).mode == AppEnvironment.preview;
    final profile = preview ? null : ref.watch(userProfileProvider);
    final name = profile?.displayName.trim().isNotEmpty == true
        ? profile!.displayName
        : 'Personal workspace';
    final currency = profile?.defaultCurrency.code ?? 'PHP';
    final date = TimezoneCatalog.now(profile?.timezone ?? 'Asia/Manila');
    return LayoutBuilder(
      builder: (context, constraints) {
        final layout = layoutClassFor(constraints.maxWidth);
        final compact = layout == LayoutClass.compact;
        return Scaffold(
          body: SafeArea(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (layout == LayoutClass.expanded)
                  ShellSidebar(
                    key: const Key('desktop-sidebar'),
                    name: name,
                    selected: navigationShell.currentIndex,
                    go: (index) => _go(context, index),
                    destinations: shellDestinations,
                  ),
                if (layout == LayoutClass.medium)
                  SingleChildScrollView(
                    child: IntrinsicHeight(
                      child: NavigationRail(
                        selectedIndex: navigationShell.currentIndex,
                        onDestinationSelected: (index) => _go(context, index),
                        labelType: NavigationRailLabelType.all,
                        leading: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          child: Column(
                            children: [
                              const TallyBrand(size: 20),
                              const SizedBox(height: 26),
                              IconButton.filled(
                                key: const Key('add-action'),
                                tooltip: 'Add obligation',
                                onPressed: () => openAddFlow(context),
                                icon: const Icon(Icons.add),
                              ),
                            ],
                          ),
                        ),
                        destinations: [
                          for (final (label, icon) in shellDestinations)
                            NavigationRailDestination(
                              icon: Icon(icon, size: 20),
                              label: Text(
                                label,
                                style: const TextStyle(fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                Expanded(
                  child: Column(
                    children: [
                      _Header(
                        compact: compact,
                        showDate: constraints.maxWidth > 1150,
                        date:
                            '${MaterialLocalizations.of(context).formatMediumDate(date)}, ${date.year}',
                        currency: currency,
                        label:
                            shellDestinations[navigationShell.currentIndex].$1,
                        go: (index) => _go(context, index),
                      ),
                      Expanded(child: navigationShell),
                    ],
                  ),
                ),
              ],
            ),
          ),
          floatingActionButton: compact
              ? FloatingActionButton(
                  key: const Key('add-action'),
                  tooltip: 'Add obligation',
                  onPressed: () => openAddFlow(context),
                  child: const Icon(Icons.add),
                )
              : null,
          bottomNavigationBar: compact
              ? NavigationBar(
                  height: 72,
                  selectedIndex: navigationShell.currentIndex.clamp(0, 4),
                  onDestinationSelected: (index) => _mobileGo(context, index),
                  destinations: [
                    for (final (label, icon) in shellDestinations.take(4))
                      NavigationDestination(
                        icon: Icon(icon, size: 19),
                        label: label,
                      ),
                    const NavigationDestination(
                      icon: Icon(Icons.more_horiz),
                      label: 'More',
                    ),
                  ],
                )
              : null,
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.compact,
    required this.showDate,
    required this.date,
    required this.currency,
    required this.label,
    required this.go,
  });
  final bool compact, showDate;
  final String date, currency, label;
  final ValueChanged<int> go;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      key: const Key('workspace-topbar'),
      constraints: BoxConstraints(minHeight: compact ? 68 : 82),
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 20 : 40,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      ),
      child: Row(
        children: [
          Expanded(
            child: compact
                ? const TallyBrand(size: 24)
                : Text(
                    'Your workspace   /   $label',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
          ),
          if (showDate && MediaQuery.textScalerOf(context).scale(1) < 1.8)
            Padding(
              padding: const EdgeInsets.only(right: 19),
              child: Text(
                date,
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ),
          OutlinedButton(
            onPressed: () => go(5),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(60, 34),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            child: Text(currency, style: const TextStyle(fontSize: 11)),
          ),
          const SizedBox(width: 12),
          IconButton.outlined(
            tooltip: 'Reminders',
            onPressed: () => context.go('/settings/reminders/inbox'),
            icon: const Icon(Icons.notifications_none, size: 18),
          ),
        ],
      ),
    );
  }
}
