import '../identifiers/entity_ids.dart';

final class PrivateSessionCleanup {
  final _handlers = <Object, (OwnerUid, Future<void> Function())>{};
  void Function() register(OwnerUid owner, Future<void> Function() cleanup) {
    final key = Object();
    _handlers[key] = (owner, cleanup);
    return () => _handlers.remove(key);
  }

  Future<void> prepareSignOut(OwnerUid owner) async {
    for (final handler
        in _handlers.values.where((entry) => entry.$1 == owner).toList()) {
      await handler.$2();
    }
  }
}
