import '../../../core/identifiers/entity_ids.dart';

abstract interface class OwnerLocalCleanup {
  Future<void> quiesceAndPurge(OwnerUid owner, String environment);
}
