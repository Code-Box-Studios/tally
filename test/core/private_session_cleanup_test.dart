import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:fake_async/fake_async.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/session/private_session_cleanup.dart';

void main() {
  test('sign-out cleanup belongs to the current owner and can unregister a disposed scope', () async {
    final cleanup = PrivateSessionCleanup(), called = <String>[];
    final remove = cleanup.register(OwnerUid('alice'), () async {
      called.add('alice');
    });
    cleanup.register(OwnerUid('bob'), () async {
      called.add('bob');
    });
    await cleanup.prepareSignOut(OwnerUid('alice'));
    expect(called, ['alice']);
    remove();
    await cleanup.prepareSignOut(OwnerUid('alice'));
    expect(called, ['alice']);
    await cleanup.prepareSignOut(OwnerUid('bob'));
    expect(called, ['alice', 'bob']);
  });

  test(
    'a failed private close still closes the other resources of that owner',
    () async {
      final cleanup = PrivateSessionCleanup(), called = <String>[];
      cleanup.register(OwnerUid('alice'), () async {
        called.add('first');
        throw StateError('close unavailable');
      });
      cleanup.register(OwnerUid('alice'), () async => called.add('second'));
      cleanup.register(OwnerUid('bob'), () async => called.add('bob'));
      await expectLater(
        cleanup.prepareSignOut(OwnerUid('alice')),
        throwsStateError,
      );
      expect(called, ['first', 'second']);
    },
  );

  test('disposed resource closing stays awaitable after the signed-in scope disappears', () async {
    final cleanup = PrivateSessionCleanup(), gate = Completer<void>();
    var closed = false, purged = false;
    final handle = cleanup.registerResource(OwnerUid('alice'), () async {
      await gate.future;
      closed = true;
    });
    final Future<void> disposing = handle.close();
    final Future<void> finishing = cleanup.quiesceForDeletion(
      OwnerUid('alice'),
    );
    final waiting = finishing.then((_) => purged = true);
    await Future<void>.delayed(Duration.zero);
    expect(closed, isFalse);
    expect(purged, isFalse);
    gate.complete();
    await disposing;
    await waiting;
    expect(closed, isTrue);
    expect(purged, isTrue);
  });

  test('deletion quiescence closes Alice resources and blocks late Alice registration without closing Bob', () async {
    final cleanup = PrivateSessionCleanup(), called = <String>[];
    cleanup.registerResource(
      OwnerUid('alice'),
      () async => called.add('alice'),
    );
    cleanup.registerResource(OwnerUid('bob'), () async => called.add('bob'));
    await cleanup.quiesceForDeletion(OwnerUid('alice'));
    final lateHandle = cleanup.registerResource(
      OwnerUid('alice'),
      () async => called.add('late'),
    );
    await lateHandle.close();
    expect(called, ['alice', 'late']);
  });

  test('a stuck owner close times out without permitting purge and can finish on retry', () {
    fakeAsync((clock) {
      final cleanup = PrivateSessionCleanup(),
          gate = Completer<void>(),
          owner = OwnerUid('stuck-alice');
      cleanup.registerResource(owner, () => gate.future);
      Object? failure;
      var purged = false;
      unawaited(
        cleanup
            .quiesceForDeletion(owner)
            .then<void>(
              (_) {
                purged = true;
              },
              onError: (Object error, StackTrace _) {
                failure = error;
              },
            ),
      );
      clock.flushMicrotasks();
      clock.elapse(const Duration(seconds: 20));
      clock.flushMicrotasks();
      expect(failure, isA<TimeoutException>());
      expect(purged, isFalse);
      expect(cleanup.isQuiescing(owner), isTrue);
      gate.complete();
      clock.flushMicrotasks();
      unawaited(
        cleanup.quiesceForDeletion(owner).then<void>((_) {
          purged = true;
        }),
      );
      clock.flushMicrotasks();
      expect(purged, isTrue);
    });
  });
}
