import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates/local_date.dart';
import '../../core/dates/timezone_catalog.dart';
import '../../core/money/currency_code.dart';
import '../../core/money/money.dart';
import '../domain/financial_failure.dart';
import 'financial_actions.dart';

LocalDate todayIn(String zone) {
  final now = TimezoneCatalog.now(zone);
  return LocalDate.fromParts(now.year, now.month, now.day);
}

String moneyEntry(Money money) {
  final exponent = money.currency.exponent;
  final digits = money.minorUnits.toString().padLeft(exponent + 1, '0');
  return exponent == 0
      ? digits
      : '${digits.substring(0, digits.length - exponent)}.${digits.substring(digits.length - exponent)}';
}

String? amountValidation(String? text, CurrencyCode currency) {
  try {
    Money.parse(text ?? '', currency);
    return null;
  } catch (_) {
    return 'Enter a valid amount for ${currency.code}.';
  }
}

String? dateValidation(String? text, {bool optional = false}) {
  if (optional && (text ?? '').trim().isEmpty) return null;
  try {
    LocalDate.parse((text ?? '').trim());
    return null;
  } catch (_) {
    return 'Enter a valid date (YYYY-MM-DD).';
  }
}

String? requiredText(String? text) =>
    (text ?? '').trim().isEmpty ? 'Enter a name or description.' : null;
String financialMessage(Object error) => error is FinancialFailure
    ? error.message
    : 'Could not confirm this action. Please retry.';

class FinancialActionError extends StatelessWidget {
  const FinancialActionError({super.key, required this.error});
  final Object? error;
  @override
  Widget build(BuildContext context) => error == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            financialMessage(error!),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        );
}

Future<T?> showFinancialDialog<T>(
  BuildContext context,
  Widget child, {
  bool guardSubmission = true,
}) => showDialog<T>(
  context: context,
  useRootNavigator: false,
  barrierDismissible: false,
  builder: (_) => Consumer(
    builder: (context, ref, _) => PopScope(
      canPop:
          !guardSubmission || !ref.watch(financialActionsProvider).isLoading,
      child: Dialog(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Padding(padding: const EdgeInsets.all(24), child: child),
        ),
      ),
    ),
  ),
);

class FinancialDialogBody extends ConsumerWidget {
  const FinancialDialogBody({
    super.key,
    required this.title,
    required this.children,
    this.guardSubmission = true,
  });
  final String title;
  final List<Widget> children;
  final bool guardSubmission;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final busy =
        guardSubmission && ref.watch(financialActionsProvider).isLoading;
    return AbsorbPointer(
      absorbing: busy,
      child: ExcludeFocus(
        excluding: busy,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .72,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 20),
                ...children,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
