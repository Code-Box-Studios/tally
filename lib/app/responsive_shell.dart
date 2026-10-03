import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/obligations/presentation/add_action_sheet.dart';
import '../shared/layout/breakpoints.dart';

const _destinations = [
  ('Home', Icons.home_outlined),
  ('Obligations', Icons.wallet_outlined),
  ('People', Icons.people_outline),
  ('Calendar', Icons.calendar_month_outlined),
  ('Activity', Icons.history),
  ('Settings', Icons.settings_outlined),
];

class ResponsiveShell extends StatelessWidget {
  const ResponsiveShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;
  void _go(int index) => navigationShell.goBranch(index);
  Future<void> _mobileGo(BuildContext context, int index) async {
    if (index < 4) {
      _go(index);
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
                leading: Icon(_destinations[i].$2),
                title: Text(_destinations[i].$1),
                onTap: () => Navigator.pop(context, i),
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (chosen != null && context.mounted) {
      _go(chosen);
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final layout = layoutClassFor(constraints.maxWidth);
      final compact = layout == LayoutClass.compact;
      final add = FilledButton.icon(
        key: const Key('add-action'),
        onPressed: () => showAddActionSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('Add'),
      );
      return Scaffold(
        appBar: compact
            ? AppBar(
                title: const Text(
                  'Tally',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                scrolledUnderElevation: 0,
              )
            : null,
        body: SafeArea(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (layout == LayoutClass.expanded)
                SizedBox(
                  key: const Key('desktop-sidebar'),
                  width: 230,
                  child: Material(
                    color: Theme.of(context).colorScheme.surface,
                    child: SingleChildScrollView(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 12),
                            const Icon(Icons.equalizer_rounded, size: 36),
                            const SizedBox(height: 12),
                            Text(
                              'Tally',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                            const Text('Know what’s due.'),
                            const SizedBox(height: 32),
                            add,
                            const SizedBox(height: 24),
                            for (var i = 0; i < _destinations.length; i++)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: ListTile(
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  selected: navigationShell.currentIndex == i,
                                  selectedTileColor: Theme.of(context)
                                      .colorScheme
                                      .primaryContainer,
                                  leading: Icon(_destinations[i].$2),
                                  title: Text(_destinations[i].$1),
                                  onTap: () => _go(i),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (layout == LayoutClass.medium)
                SingleChildScrollView(
                  child: IntrinsicHeight(
                    child: NavigationRail(
                      selectedIndex: navigationShell.currentIndex,
                      onDestinationSelected: _go,
                      labelType: NavigationRailLabelType.all,
                      leading: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Column(
                          children: [
                            const Text(
                              'Tally',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 16),
                            add,
                          ],
                        ),
                      ),
                      destinations: [
                        for (final (label, icon) in _destinations)
                          NavigationRailDestination(
                            icon: Icon(icon),
                            label: Text(label),
                          ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1400),
                    child: navigationShell,
                  ),
                ),
              ),
            ],
          ),
        ),
        floatingActionButton: compact
            ? FloatingActionButton.extended(
                key: const Key('add-action'),
                onPressed: () => showAddActionSheet(context),
                icon: const Icon(Icons.add),
                label: const Text('Add'),
              )
            : null,
        bottomNavigationBar: compact
            ? NavigationBar(
                selectedIndex: navigationShell.currentIndex.clamp(0, 4),
                onDestinationSelected: (index) => _mobileGo(context, index),
                destinations: [
                  for (final (label, icon) in _destinations.take(4))
                    NavigationDestination(icon: Icon(icon), label: label),
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
