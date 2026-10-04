import 'package:flutter/material.dart';

import '../../features/obligations/domain/obligation.dart';
import '../../features/payments/domain/payment_entry.dart';
import '../domain/catalog.dart';

String statusLabel(FinancialStatus status) => switch (status) {
  FinancialStatus.partiallyPaid => 'Partially paid',
  FinancialStatus.paid => 'Paid',
  FinancialStatus.overdue => 'Overdue',
  FinancialStatus.cancelled => 'Cancelled',
  FinancialStatus.skipped => 'Skipped',
  FinancialStatus.upcoming => 'Upcoming',
  FinancialStatus.scheduled => 'Scheduled',
  FinancialStatus.expected => 'Awaiting confirmation',
  FinancialStatus.deducted => 'Deducted',
  FinancialStatus.failed => 'Automatic deduction failed',
  FinancialStatus.active || FinancialStatus.pending => 'Pending',
};
String sourceLabel(SourceKind kind) => switch (kind) {
  SourceKind.cash => 'Cash',
  SourceKind.bankAccount => 'Bank account',
  SourceKind.debitCard => 'Debit card',
  SourceKind.creditCard => 'Credit card',
  SourceKind.eWallet => 'E-wallet',
  SourceKind.payroll => 'Payroll',
  SourceKind.other => 'Other',
};
String methodLabel(PaymentMethod method) => switch (method) {
  PaymentMethod.cash => 'Cash',
  PaymentMethod.bankTransfer => 'Bank transfer',
  PaymentMethod.card => 'Card',
  PaymentMethod.eWallet => 'E-wallet',
  PaymentMethod.payroll => 'Payroll',
  PaymentMethod.other => 'Other',
};

class FinancialStatusChip extends StatelessWidget {
  const FinancialStatusChip(this.status, {super.key});
  final FinancialStatus status;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final urgent =
        status == FinancialStatus.overdue || status == FinancialStatus.failed;
    final color = urgent ? scheme.error : scheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            urgent
                ? Icons.error_outline
                : status == FinancialStatus.paid
                ? Icons.check_circle_outline
                : Icons.schedule,
            size: 13,
            color: color,
          ),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              statusLabel(status),
              style: TextStyle(fontSize: 11, color: color),
            ),
          ),
        ],
      ),
    );
  }
}
