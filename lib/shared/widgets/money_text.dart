import 'package:flutter/material.dart';

import '../../core/money/money.dart';
import '../../core/money/money_formatter.dart';

class MoneyText extends StatelessWidget {
  const MoneyText({
    super.key,
    required this.money,
    this.includeCode = false,
    this.style,
  });
  final Money money;
  final bool includeCode;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) => Semantics(
    label: MoneyFormatter.format(money, includeCode: true),
    excludeSemantics: true,
    child: Text(
      MoneyFormatter.format(money, includeCode: includeCode),
      style: style,
    ),
  );
}
