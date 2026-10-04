import 'package:flutter/material.dart';

import '../features/obligations/presentation/add_action_sheet.dart';
import '../shared/widgets/tally_brand.dart';

class ShellSidebar extends StatelessWidget {
  const ShellSidebar({
    super.key,
    required this.name,
    required this.selected,
    required this.go,
    required this.destinations,
  });
  final String name;
  final int selected;
  final ValueChanged<int> go;
  final List<(String, IconData)> destinations;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 230,
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(right: BorderSide(color: scheme.outlineVariant)),
      ),
      child: LayoutBuilder(
        builder: (context, bounds) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: bounds.maxHeight),
            child: IntrinsicHeight(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(22, 38, 22, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(left: 10),
                      child: TallyBrand(),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.only(left: 11),
                      child: Text(
                        'Know what’s due.',
                        style: TextStyle(
                          fontSize: 11,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(height: 29),
                    FilledButton.icon(
                      key: const Key('add-action'),
                      onPressed: () => openAddFlow(context),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text(
                        'Add obligation',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                    const SizedBox(height: 37),
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        'YOUR SPACE',
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.5,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(height: 13),
                    for (var i = 0; i < destinations.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 7),
                        child: _SidebarItem(
                          label: destinations[i].$1,
                          icon: destinations[i].$2,
                          selected: selected == i,
                          onTap: () => go(i),
                        ),
                      ),
                    const Spacer(),
                    const SizedBox(height: 30),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.lock_outline,
                          size: 18,
                          color: scheme.primary,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'A little clarity, just for you.\nYour records stay private.',
                            style: TextStyle(
                              fontSize: 11,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 26),
                    Divider(color: scheme.outlineVariant),
                    InkWell(
                      onTap: () => go(5),
                      child: Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 17,
                              backgroundColor: scheme.primaryContainer,
                              child: Text(
                                name.substring(0, 1).toUpperCase(),
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                            const SizedBox(width: 11),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    'Personal workspace',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              Icons.chevron_right,
                              size: 16,
                              color: scheme.onSurfaceVariant,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primaryContainer : Colors.transparent,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Stack(
          children: [
            if (selected)
              Positioned(
                left: 0,
                top: 14,
                child: Container(
                  width: 3,
                  height: 18,
                  decoration: BoxDecoration(
                    color: scheme.primary,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
              child: Row(
                children: [
                  Icon(
                    icon,
                    size: 19,
                    color: selected ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        color: selected
                            ? scheme.primary
                            : scheme.onSurfaceVariant,
                        fontWeight: selected
                            ? FontWeight.w600
                            : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
