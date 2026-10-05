import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../domain/notification_preferences.dart';
import '../domain/reminder_entry.dart';

abstract final class NotificationDto {
  static NotificationPreferences preferences(
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    try {
      final reader = DocumentReader(data)..owner(owner);
      return NotificationPreferences.fromPolicyMap(owner, {
        for (final field in [
          'enabled',
          'enabledKinds',
          'offsetDays',
          'localTime',
          'quietStart',
          'quietEnd',
          'pushEnabled',
          'localEnabled',
          'allowSensitivePushText',
          'timezonePolicy',
        ])
          field: reader.value(field),
      }, revision: reader.revision());
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }

  static ReminderEntry entry(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    try {
      CommandId(id);
      final d = DocumentReader(data)
        ..owner(owner)
        ..storedId('reminderId', id);
      final currency = CurrencyCode.parse(d.text('currency', max: 3));
      final visible = d.boolean('visible'),
          status = d.enumeration('status', ReminderStatus.values);
      final visibleAt = d.value('visibleAt') == null
          ? null
          : d.dateTime('visibleAt');
      if (visible != (visibleAt != null) ||
          status == ReminderStatus.cancelled && visible) {
        throw DocumentReader.invalid();
      }
      d.integer('parentRevision', min: 1);
      d.integer('instanceRevision', min: 1);
      d.text('messageKey', max: 100, required: true);
      d.object('deliverySummary');
      return ReminderEntry(
        id: id,
        owner: owner,
        obligationId: ObligationId(
          d.text('obligationId', max: 128, required: true),
        ),
        instanceId: InstanceId(d.text('instanceId', max: 128, required: true)),
        kind: d.enumeration('kind', ReminderKind.values),
        phase: d.enumeration('phase', ReminderPhase.values),
        civilTargetDate: d.date('civilTargetDate'),
        scheduledAt: d.dateTime('scheduledAt'),
        savedTimezone: d.timezone('savedTimezone'),
        quietTimezone: d.timezone('quietTimezone'),
        preferenceRevision: d.integer('preferenceRevision', min: 1),
        policyRevision: d.integer('policyRevision', min: 1),
        status: status,
        readAt: d.value('readAt') == null ? null : d.dateTime('readAt'),
        revision: d.revision(),
        title: d.text('title', max: 120, required: true),
        amount: d.nullableMoney('amountMinor', currency, positive: true),
        currency: currency,
        visibleAt: visibleAt,
      );
    } catch (_) {
      throw DocumentReader.invalid();
    }
  }
}
