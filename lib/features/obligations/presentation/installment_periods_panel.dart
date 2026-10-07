import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../attachments/domain/attachment.dart';
import '../../attachments/presentation/attachment_panel.dart';

import '../../../core/dates/financial_clock.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/money_text.dart';
import '../../dashboard/presentation/widgets/home_due.dart';
import '../../payments/presentation/payment_editor.dart';
import '../domain/installment_periods.dart';
import '../domain/obligation.dart';
import '../domain/obligation_instance.dart';
import 'installment_providers.dart';
import 'obligation_editor.dart';

class InstallmentPeriodsPanel extends ConsumerWidget {
  const InstallmentPeriodsPanel({
    super.key,
    required this.parent,
    this.editing = false,
  });
  final Obligation parent;
  final bool editing;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(installmentInstancesProvider(parent.id))
      .when(
        loading: () => const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (error, _) => Column(
          children: [
            FinancialActionError(error: error),
            TextButton(
              onPressed: () =>
                  ref.invalidate(installmentInstancesProvider(parent.id)),
              child: const Text('Try again'),
            ),
          ],
        ),
        data: (page) {
          List<ObligationInstance> periods;
          try {
            periods = InstallmentPeriods.checked(parent, page.items);
          } catch (_) {
            return Column(
              children: [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Loading a complete, consistent installment schedule…',
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(installmentInstancesProvider(parent.id)),
                  child: const Text('Refresh installments'),
                ),
              ],
            );
          }
          if (editing) {
            return ObligationEditor(
              key: ValueKey(parent.id),
              initial: parent,
              initialInstances: periods,
            );
          }
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Installments',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (page.isFromCache)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Cached installments · reconnect to confirm.',
                      ),
                    ),
                  for (var i = 0; i < periods.length; i++) ...[
                    const SizedBox(height: 18),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          'Installment ${i + 1}',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        Text('Due ${periods[i].dueDate}'),
                        Text(
                          periods[i].closed
                              ? (periods[i].status == FinancialStatus.cancelled
                                    ? 'Cancelled'
                                    : 'Paid')
                              : dueLabel(
                                  periods[i],
                                  ref.watch(financialClockProvider),
                                ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 18,
                      runSpacing: 8,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Paid'),
                            MoneyText(
                              money: periods[i].paidAmount,
                              includeCode: true,
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Remaining'),
                            MoneyText(
                              money: periods[i].remainingAmount!,
                              includeCode: true,
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (!periods[i].closed &&
                        parent.lifecycle == ObligationLifecycle.active &&
                        periods[i].remainingAmount!.minorUnits > 0)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          key: Key('pay-period-${periods[i].id.value}'),
                          onPressed: () => showFinancialDialog<Object?>(
                            context,
                            PaymentEditor(
                              obligation: parent,
                              selectedInstance: periods[i],
                            ),
                          ),
                          child: const Text('Pay this installment'),
                        ),
                      ),
                    AttachmentPanel(
                      target: AttachmentTarget.forInstance(periods[i].id),
                      title: 'Files for this installment',
                    ),
                    const Divider(),
                  ],
                ],
              ),
            ),
          );
        },
      );
}
