import '../../core/identifiers/entity_ids.dart';

enum ContactKind { person, organization }

enum SourceKind {
  cash,
  bankAccount,
  debitCard,
  creditCard,
  eWallet,
  payroll,
  other,
}

final class Contact {
  const Contact({
    required this.id,
    required this.owner,
    required this.kind,
    required this.name,
    required this.organizationType,
    required this.email,
    required this.phone,
    required this.address,
    required this.notes,
    required this.archived,
    required this.revision,
  });
  final ContactId id;
  final OwnerUid owner;
  final ContactKind kind;
  final String name;
  final String? organizationType, email, phone, address;
  final String notes;
  final bool archived;
  final int revision;
}

final class PaymentSource {
  const PaymentSource({
    required this.id,
    required this.owner,
    required this.name,
    required this.kind,
    required this.nickname,
    required this.lastFour,
    required this.notes,
    required this.active,
    required this.revision,
  });
  final SourceId id;
  final OwnerUid owner;
  final String name;
  final SourceKind kind;
  final String? nickname, lastFour;
  final String notes;
  final bool active;
  final int revision;
}

final class Category {
  const Category({
    required this.id,
    required this.owner,
    required this.name,
    required this.active,
    required this.isDefault,
    required this.revision,
  });
  final CategoryId id;
  final OwnerUid owner;
  final String name;
  final bool active, isDefault;
  final int revision;
}

final class ContactLabel {
  const ContactLabel(this.name, this.kind);
  final String name;
  final ContactKind kind;
}

final class SourceLabel {
  const SourceLabel(this.name, this.kind, this.lastFour);
  final String name;
  final SourceKind kind;
  final String? lastFour;
}

final class ContactDraft {
  const ContactDraft({
    required this.name,
    this.kind = ContactKind.person,
    this.organizationType,
    this.email,
    this.phone,
    this.address,
    this.notes = '',
    this.archived = false,
  });
  final String name;
  final ContactKind kind;
  final String? organizationType, email, phone, address;
  final String notes;
  final bool archived;
  Map<String, Object?> toPayload() => {
    'kind': kind.name,
    'displayName': name,
    'organizationType': organizationType,
    'email': email,
    'phone': phone,
    'address': address,
    'notes': notes,
    'archived': archived,
  };
}

final class SourceDraft {
  const SourceDraft({
    required this.name,
    required this.kind,
    this.nickname,
    this.lastFour,
    this.notes = '',
    this.active = true,
  });
  final String name;
  final SourceKind kind;
  final String? nickname, lastFour;
  final String notes;
  final bool active;
  Map<String, Object?> toPayload() => {
    'name': name,
    'type': kind.name,
    'nickname': nickname,
    'lastFour': lastFour,
    'notes': notes,
    'active': active,
  };
}

final class CategoryDraft {
  const CategoryDraft({required this.name, this.active = true});
  final String name;
  final bool active;
  Map<String, Object?> toPayload() => {'name': name, 'active': active};
}

final class CatalogResult<I> {
  const CatalogResult(this.id, this.revision);
  final I id;
  final int revision;
}
