import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import '../../../core/identifiers/entity_ids.dart';
import '../domain/sync_capability.dart';
import '../domain/local_outbox_failure.dart';
import 'outbox_location.dart';

/// Every live persistent connection holds a shared owner/environment lock.
/// Erasure needs the exclusive lock. Browser crashes release locks automatically.
final class WebOwnerStorageLock {
  WebOwnerStorageLock._(this._release, this._finished);
  final Completer<void> _release;
  final Future<JSAny?> _finished;
  Future<void> close() async {
    if (!_release.isCompleted) _release.complete();
    await _finished;
  }

  static Future<WebOwnerStorageLock> acquire(
    OwnerUid owner,
    String environment, {
    bool exclusive = false,
  }) async {
    final ready = Completer<void>(), release = Completer<void>();
    final abort = web.AbortController();
    final options = exclusive
        ? web.LockOptions(mode: 'exclusive', ifAvailable: true)
        : web.LockOptions(mode: 'shared', signal: abort.signal);
    final request = web.window.navigator.locks
        .request(
          'tally-private-${outboxDatabaseName(owner, environment)}',
          options,
          ((web.Lock? lock) {
            if (lock == null) {
              ready.completeError(
                const LocalOutboxFailure(SyncAvailability.unavailable),
              );
              return Future<JSAny?>.value(null).toJS;
            }
            ready.complete();
            return release.future.then<JSAny?>((_) => null).toJS;
          }).toJS,
        )
        .toDart;
    unawaited(
      request.then<void>(
        (_) {
          if (!ready.isCompleted) {
            ready.completeError(
              const LocalOutboxFailure(SyncAvailability.unavailable),
            );
          }
        },
        onError: (Object error, StackTrace stack) {
          if (!ready.isCompleted) ready.completeError(error, stack);
        },
      ),
    );
    try {
      await ready.future.timeout(const Duration(seconds: 20));
      return WebOwnerStorageLock._(release, request);
    } catch (_) {
      abort.abort();
      if (!release.isCompleted) release.complete();
      rethrow;
    }
  }
}
