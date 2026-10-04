import '../../core/identifiers/entity_ids.dart';

abstract interface class OwnerCommandGateway {
  OwnerUid get owner;
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  );
}
