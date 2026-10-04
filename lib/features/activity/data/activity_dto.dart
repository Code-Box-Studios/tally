import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../../obligations/domain/obligation.dart';
import '../domain/activity_entry.dart';

abstract final class ActivityDto {
  static ActivityEntry fromMap(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    try {
      final d = DocumentReader(data)..owner(owner);
      final rawType = d.text('type', max: 100, required: true);
      final type =
          ActivityType.values
              .where((value) => value.name == rawType)
              .firstOrNull ??
          ActivityType.unknown;
      final rawAmount = d.value('amountMinor');
      final rawCurrency = d.value('currency');
      if ((rawAmount == null) != (rawCurrency == null)) {
        throw DocumentReader.invalid();
      }
      final currency = rawCurrency == null
          ? null
          : CurrencyCode.parse(d.text('currency', max: 3));
      final obligation = d.nullableText('obligationId', max: 128);
      final payment = data['paymentId'];
      final rawDirection = data['direction'];
      final reason = data['reason'];
      if (reason != null && (reason is! String || reason.length > 1000)) {
        throw DocumentReader.invalid();
      }
      return ActivityEntry(
        id: ActivityId(id),
        owner: owner,
        type: type,
        title: d.text('title', max: 120, required: true),
        amount: currency == null
            ? null
            : d.money('amountMinor', currency, positive: true),
        obligationId: obligation == null ? null : ObligationId(obligation),
        paymentId: payment == null
            ? null
            : PaymentId(d.text('paymentId', max: 128, required: true)),
        direction: rawDirection == null
            ? null
            : d.enumeration('direction', ObligationDirection.values),
        reason: reason as String?,
        createdAt: d.dateTime('createdAt'),
        recordedAt: d.dateTime('recordedAt'),
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }
}
