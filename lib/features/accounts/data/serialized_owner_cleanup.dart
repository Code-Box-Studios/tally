import '../../../core/identifiers/entity_ids.dart';
import '../domain/owner_local_cleanup.dart';

final class SerializedOwnerLocalCleanup implements OwnerLocalCleanup {
  SerializedOwnerLocalCleanup(this.delegate);
  final OwnerLocalCleanup delegate;
  final _running = <(OwnerUid, String), Future<void>>{};
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) =>
      _running.putIfAbsent(
        (owner, environment),
        () =>
            Future<void>.sync(
              () => delegate.quiesceAndPurge(owner, environment),
            ).whenComplete(() {
              _running.remove((owner, environment));
            }),
      );
}
