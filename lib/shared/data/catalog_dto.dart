import '../../core/identifiers/entity_ids.dart';
import '../domain/catalog.dart';
import 'document_reader.dart';

abstract final class CatalogDto {
  static Contact contact(String id, Map<String, Object?> data, OwnerUid owner) {
    final d = DocumentReader(data)..owner(owner);
    return Contact(
      id: ContactId(id),
      owner: owner,
      kind: d.enumeration('kind', ContactKind.values),
      name: d.text('displayName', max: 120, required: true),
      organizationType: d.nullableText('organizationType', max: 80),
      email: d.nullableText('email', max: 254),
      phone: d.nullableText('phone', max: 40),
      address: d.nullableText('address', max: 500),
      notes: d.text('notes'),
      archived: d.boolean('archived'),
      revision: d.revision(),
    );
  }

  static PaymentSource source(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)..owner(owner);
    return PaymentSource(
      id: SourceId(id),
      owner: owner,
      name: d.text('name', max: 120, required: true),
      kind: d.enumeration('type', SourceKind.values),
      nickname: d.nullableText('nickname', max: 120),
      lastFour: lastFour(d),
      notes: d.text('notes'),
      active: d.boolean('active'),
      revision: d.revision(),
    );
  }

  static Category category(
    String id,
    Map<String, Object?> data,
    OwnerUid owner,
  ) {
    final d = DocumentReader(data)..owner(owner);
    return Category(
      id: CategoryId(id),
      owner: owner,
      name: d.text('name', max: 80, required: true),
      active: d.boolean('active'),
      isDefault: d.boolean('isDefault'),
      revision: d.revision(),
    );
  }

  static String? lastFour(DocumentReader d) {
    final result = d.nullableText('lastFour', max: 4);
    if (result != null && !RegExp(r'^[0-9]{4}$').hasMatch(result)) {
      throw DocumentReader.invalid();
    }
    return result;
  }

  static ContactLabel? contactLabel(DocumentReader? d) => d == null
      ? null
      : ContactLabel(
          d.text('displayName', max: 120, required: true),
          d.enumeration('kind', ContactKind.values),
        );
  static SourceLabel? sourceLabel(DocumentReader? d) => d == null
      ? null
      : SourceLabel(
          d.text('name', max: 120, required: true),
          d.enumeration('type', SourceKind.values),
          lastFour(d),
        );
}
