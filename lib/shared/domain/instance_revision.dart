import '../../core/identifiers/entity_ids.dart';

final class InstanceRevision {
  const InstanceRevision(this.id, this.revision);
  final InstanceId id;
  final int revision;
}
