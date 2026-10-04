import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/money/money_formatter.dart';

import '../../../../core/money/money.dart';
import '../../../../shared/widgets/money_text.dart';
import '../../domain/dashboard_summary.dart';

class HomeMetrics extends StatelessWidget {
  const HomeMetrics({super.key, required this.summary});
  final ProjectedDashboardSummary? summary;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final enlarged = MediaQuery.textScalerOf(context).scale(14) > 20;
      final cards = [
        _HomeMetric(
          key: const Key('home-you-owe'),
          label: 'You owe',
          value: summary?.youOwe,
          icon: Icons.south_west,
          hint: 'Active loans & installments',
          light: const Color(0xffeef4e9),
          dark: const Color(0xff2a3c2b),
          route: '/obligations?section=owe',
        ),
        _HomeMetric(
          key: const Key('home-owed-to-you'),
          label: 'Owed to you',
          value: summary?.owedToYou,
          icon: Icons.north_east,
          hint: 'Money coming back to you',
          light: const Color(0xffedf2f8),
          dark: const Color(0xff293b4d),
          route: '/obligations?section=owed',
        ),
        _HomeMetric(
          key: const Key('home-remaining-month'),
          label: 'Remaining this month',
          value: summary?.month.outgoing.remaining,
          icon: Icons.calendar_today_outlined,
          hint: summary == null
              ? 'For this month’s due dates'
              : 'of ${MoneyFormatter.format(summary!.month.outgoing.scheduled)} scheduled',
          light: const Color(0xfff8f3e6),
          dark: const Color(0xff403727),
          route: '/calendar',
        ),
      ];
      if (box.maxWidth >= 850 && !enlarged) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < cards.length; i++) ...[
              if (i > 0) const SizedBox(width: 17),
              Expanded(child: cards[i]),
            ],
          ],
        );
      }
      if (box.maxWidth >= 280 && !enlarged) {
        return Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: cards[0]),
                const SizedBox(width: 12),
                Expanded(child: cards[1]),
              ],
            ),
            const SizedBox(height: 12),
            cards[2],
          ],
        );
      }
      return Column(
        children: [
          for (var i = 0; i < cards.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            cards[i],
          ],
        ],
      );
    },
  );
}

class _HomeMetric extends StatelessWidget {
  const _HomeMetric({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.hint,
    required this.light,
    required this.dark,
    required this.route,
  });
  final String label, hint, route;
  final Money? value;
  final IconData icon;
  final Color light, dark;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: theme.brightness == Brightness.dark ? dark : light,
        borderRadius: BorderRadius.circular(15),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: theme.textTheme.labelLarge)),
              Icon(icon, size: 19),
            ],
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: value == null
                  ? Text('—', style: theme.textTheme.headlineLarge)
                  : MoneyText(
                      money: value!,
                      style: theme.textTheme.headlineLarge,
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Text(hint, style: theme.textTheme.bodySmall),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: InkWell(
              onTap: () => context.go(route),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Text(
                  route == '/calendar' ? 'See calendar →' : 'View details →',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
