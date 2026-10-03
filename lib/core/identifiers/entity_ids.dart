import '../errors/app_failure.dart';

abstract base class _EntityId {
  _EntityId(String raw) : value = _validate(raw);
  final String value;

  static final _pattern = RegExp(r'^[A-Za-z0-9_-]{1,128}$');
  static String _validate(String value) {
    final match = _pattern.firstMatch(value);
    if (match == null || match.end != value.length) {
      throw AppFailure(AppFailureCode.invalidId, messageKey: 'id.invalid');
    }
    return value;
  }

  @override
  bool operator ==(Object other) =>
      other is _EntityId &&
      runtimeType == other.runtimeType &&
      value == other.value;

  @override
  int get hashCode => Object.hash(runtimeType, value);
}

final class OwnerUid extends _EntityId {
  OwnerUid(super.value);
}

final class ObligationId extends _EntityId {
  ObligationId(super.value);
}

final class InstanceId extends _EntityId {
  InstanceId(super.value);
}

final class PaymentId extends _EntityId {
  PaymentId(super.value);
}

final class ContactId extends _EntityId {
  ContactId(super.value);
}

final class SourceId extends _EntityId {
  SourceId(super.value);
}

final class CategoryId extends _EntityId {
  CategoryId(super.value);
}

final class AttachmentId extends _EntityId {
  AttachmentId(super.value);
}

final class CommandId extends _EntityId {
  CommandId(super.value);
}
