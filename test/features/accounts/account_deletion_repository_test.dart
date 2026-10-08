import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/data/firebase_account_deletion_repository.dart';
import 'package:tally/features/accounts/domain/account_deletion.dart';

void main() {
  final alice = OwnerUid('alice'), id = CommandId('delete-original');
  final accepted = <String, Object?>{
    'userId': 'alice',
    'status': 'pending',
    'step': 'revokeSessions',
  };
  FirebaseAccountDeletionRepository repository(
    DeletionInvocation call, {
    bool Function()? active,
  }) => FirebaseAccountDeletionRepository(
    owner: alice,
    isOwnerActive: active ?? () => true,
    invoke: call,
  );
  test(
    'request uses the raw protected DELETE envelope and parses acceptance',
    () async {
      final calls = <(String, Map<String, Object?>)>[];
      final view = await repository((name, envelope) async {
        calls.add((name, envelope));
        return accepted;
      }).request(id);
      expect(calls, hasLength(1));
      expect(calls.single.$1, 'requestAccountDeletion');
      expect(calls.single.$2, {
        'commandId': id.value,
        'expectedOwnerUid': 'alice',
        'payload': {'confirmation': 'DELETE'},
      });
      expect(view.owner, alice);
      expect(view.status, DeletionStatus.pending);
      expect(view.step, DeletionStep.revokeSessions);
    },
  );
  test(
    'status permits a missing job without manufacturing acceptance',
    () async {
      String? called;
      final view = await repository((name, envelope) async {
        called = name;
        expect(envelope['payload'], isEmpty);
        expect(envelope['expectedOwnerUid'], 'alice');
        return null;
      }).status();
      expect(called, 'readAccountDeletionStatus');
      expect(view, isNull);
    },
  );
  test('a changed owner prevents every outbound request', () async {
    var calls = 0;
    final repo = repository((_, _) async {
      calls++;
      return accepted;
    }, active: () => false);
    await expectLater(
      repo.request(id),
      throwsA(
        isA<DeletionFailure>().having(
          (e) => e.code,
          'code',
          DeletionFailureCode.changedOwner,
        ),
      ),
    );
    await expectLater(repo.status(), throwsA(isA<DeletionFailure>()));
    expect(calls, 0);
  });
  test('valid captured acceptance survives an owner switch while the RPC is in flight', () async {
    var active = true;
    final held = Completer<Object?>();
    final pending = repository(
      (_, _) => held.future,
      active: () => active,
    ).request(id);
    active = false;
    held.complete(accepted);
    expect((await pending).owner, alice);
  });
  for (final (name, response) in <(String, Object?)>[
    ('null request', null),
    ('list', []),
    ('foreign owner', {...accepted, 'userId': 'bob'}),
    ('unknown status', {...accepted, 'status': 'future'}),
    ('unknown step', {...accepted, 'step': 'future'}),
    ('extra data', {...accepted, 'password': 'must-not-escape'}),
    ('missing data', {'userId': 'alice', 'status': 'pending'}),
    ('partial completion', {...accepted, 'status': 'complete'}),
    ('premature completion', {...accepted, 'step': 'complete'}),
  ]) {
    test('$name response cannot authorize local erasure', () async {
      await expectLater(
        repository((_, _) async => response).request(id),
        throwsA(
          isA<DeletionFailure>().having(
            (e) => e.code,
            'code',
            DeletionFailureCode.invalidResponse,
          ),
        ),
      );
    });
  }
  test('raw transport errors are sanitized and never echoed', () async {
    await expectLater(
      repository((_, _) async => throw StateError('secret-token-private-path'))
          .request(id),
      throwsA(
        isA<DeletionFailure>().having(
          (e) => e.toString(),
          'message',
          isNot(contains('secret-token')),
        ),
      ),
    );
  });
}
