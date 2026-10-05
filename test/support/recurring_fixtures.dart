import 'dart:convert';
import 'dart:io';

import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/payments/domain/payment_commands.dart';
import 'package:tally/features/payments/domain/payment_entry.dart';
import 'package:tally/features/recurring/domain/recurrence_rule.dart';
import 'package:tally/features/recurring/domain/recurring_commands.dart';

Object? _restore(Object? value) {
  if (value is Map) {
    if (value.length == 1 && value['timestamp'] is String) {
      return DateTime.parse(value['timestamp'] as String);
    }
    return <String, Object?>{
      for (final entry in value.entries)
        entry.key as String: _restore(entry.value),
    };
  }
  if (value is List) return value.map(_restore).toList();
  return value;
}

final recurringFixtures = _restore(
  jsonDecode(
    File('firebase/fixtures/recurring_documents.json').readAsStringSync(),
  ),
) as Map<String, Object?>;
final recurringOwner = OwnerUid(recurringFixtures['owner'] as String);
Map<String, Object?> recurringData(String name) =>
    Map<String, Object?>.from(recurringFixtures[name] as Map);
RecurringDraft recurringDraft() => RecurringDraft(
  title: 'Netflix',
  description: 'Subscription',
  notes: '',
  currency: CurrencyCode.php,
  amountKind: AmountKind.fixed,
  defaultAmount: Money.fromMinorUnits(54900, CurrencyCode.php),
  paymentMode: PaymentMode.automaticConfirmation,
  categoryId: CategoryId('default-subscription'),
  contactId: null,
  paymentSourceId: null,
  recurrence: RecurrenceRule(
    frequency: RecurrenceFrequency.monthly,
    anchorDate: LocalDate.parse('2026-10-04'),
    startDate: LocalDate.parse('2026-10-04'),
    timezone: 'Asia/Manila',
  ),
  reminderPolicy: ReminderPolicy(
    enabled: false,
    offsetDays: const [],
    localTime: '09:00',
  ),
);
PaymentTerms deductionTerms() => PaymentTerms(
  amount: Money.fromMinorUnits(54900, CurrencyCode.php),
  date: LocalDate.parse('2026-10-04'),
  sourceId: null,
  method: PaymentMethod.other,
);
