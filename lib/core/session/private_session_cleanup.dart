import 'dart:async';

import '../identifiers/entity_ids.dart';

/// Retains an owner's asynchronous close after its provider has been disposed.
final class PrivateCleanupResource {
  PrivateCleanupResource._(this._begin);
  final Future<void> Function() _begin;
  Future<void>? _closing;
  Future<void> close() => _closing ??= _begin();
}

final class PrivateSessionCleanup {
  final _handlers = <Object, (OwnerUid, Future<void> Function())>{};
  final _resources = <Object, (OwnerUid, PrivateCleanupResource)>{};
  final _closing = <Object, (OwnerUid, Future<void>)>{};
  final _deleting = <OwnerUid>{};

  void Function() register(OwnerUid owner, Future<void> Function() cleanup) {
    if (_deleting.contains(owner)) {
      registerResource(owner, cleanup);
      return () {};
    }
    final key = Object();
    _handlers[key] = (owner, cleanup);
    return () => _handlers.remove(key);
  }

  PrivateCleanupResource registerResource(
    OwnerUid owner,
    Future<void> Function() cleanup,
  ) {
    final key = Object();
    final resource = PrivateCleanupResource._(() {
      _resources.remove(key);
      final future = Future<void>.sync(cleanup);
      _closing[key] = (owner, future);
      // Observe retired failures now; the deletion boundary still receives the
      // original failure when it awaits the retained close. Successful resources
      // do not accumulate after repeated provider/widget disposal.
      unawaited(
        future.then<void>(
          (_) => _closing.remove(key),
          onError: (Object _, StackTrace _) {},
        ),
      );
      return future;
    });
    _resources[key] = (owner, resource);
    if (_deleting.contains(owner)) unawaited(resource.close());
    return resource;
  }

  bool isQuiescing(OwnerUid owner) => _deleting.contains(owner);

  Future<void> quiesceForDeletion(OwnerUid owner) async {
    _deleting.add(owner);
    await prepareSignOut(owner);
  }

  Future<void> prepareSignOut(OwnerUid owner) async {
    final work = <Future<void>>[
      for (final entry
          in _handlers.values.where((value) => value.$1 == owner).toList())
        Future<void>.sync(entry.$2),
      for (final entry
          in _resources.values.where((value) => value.$1 == owner).toList())
        entry.$2.close(),
      for (final entry
          in _closing.values.where((value) => value.$1 == owner).toList())
        entry.$2,
    ];
    // One failed close must not prevent the other owned capabilities from
    // closing. Preserve the error so destructive local cleanup cannot proceed.
    await Future.wait(work, eagerError: false);
  }
}
