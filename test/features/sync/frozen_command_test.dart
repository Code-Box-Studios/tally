import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';

final now = DateTime.utc(2026, 10, 8);
final owner = OwnerUid('alice');
FrozenCommand command({
  Map<String, Object?>? payload,
  List<CommandDependency> dependencies = const [],
  DateTime? createdAt,
  String resourceKey = 'obligation:debt-1',
}) => FrozenCommand(
  owner: owner,
  id: CommandId('pay-1'),
  name: CommandName.recordPayment,
  payload: payload ?? {'amountMinor': 30000, 'currency': 'PHP'},
  resourceKey: resourceKey,
  dependencies: dependencies,
  createdAt: createdAt ?? now,
);

void main() {
  test(
    'nested caller changes cannot rewrite an action already frozen for retry',
    () {
      final allocation = <String, Object?>{
        'instanceId': 'period-1',
        'amountMinor': 30000,
      };
      final rows = <Object?>[allocation],
          input = <String, Object?>{'allocations': rows, 'notes': 'Paid part'};
      final frozen = command(payload: input), hash = frozen.payloadHash;
      allocation['amountMinor'] = 90000;
      rows.clear();
      input['notes'] = 'Changed';
      expect(
        frozen.payloadJson,
        '{"allocations":[{"amountMinor":30000,"instanceId":"period-1"}],"notes":"Paid part"}',
      );
      expect(frozen.payloadHash, hash);
      expect(() => frozen.payload['notes'] = 'Edited', throwsUnsupportedError);
      expect(
        () => (frozen.payload['allocations'] as List).clear(),
        throwsUnsupportedError,
      );
      expect(
        () =>
            ((frozen.payload['allocations'] as List).single
                    as Map)['amountMinor'] =
                1,
        throwsUnsupportedError,
      );
    },
  );
  test('JSON key order and dependency order do not change the frozen action identity', () {
    final first = command(
      payload: {'currency': 'PHP', 'amountMinor': 30000},
      dependencies: [
        CommandDependency(owner, CommandId('parent-2')),
        CommandDependency(owner, CommandId('parent-1')),
      ],
    );
    final retry = command(
      payload: {'amountMinor': 30000, 'currency': 'PHP'},
      dependencies: [
        CommandDependency(owner, CommandId('parent-1')),
        CommandDependency(owner, CommandId('parent-2')),
      ],
      createdAt: now.add(const Duration(seconds: 1)),
    );
    expect(first.sameIdentity(retry), isTrue);
    expect(first.payloadHash, retry.payloadHash);
    expect(
      first.sameIdentity(
        command(payload: {'amountMinor': 30001, 'currency': 'PHP'}),
      ),
      isFalse,
    );
    expect(
      first.sameIdentity(
        command(payload: {'amountMinor': 30000, 'currency': 'USD'}),
      ),
      isFalse,
    );
  });
  test('invalid JSON, unsafe numbers, excessive nesting and credential fields never persist', () {
    Object? deep = 0;
    for (var i = 0; i < 18; i++) {
      deep = [deep];
    }
    for (final value in [
      1.25,
      9007199254740992,
      -9007199254740992,
      DateTime.utc(2026),
      double.nan,
      double.infinity,
      deep,
    ]) {
      expect(() => command(payload: {'value': value}), throwsArgumentError);
    }
    expect(
      () => command(
        payload: {
          'value': <Object, Object>{1: 'bad key'},
        },
      ),
      throwsArgumentError,
    );
    expect(
      () => command(payload: {'contentBase64': 'private bytes'}),
      throwsArgumentError,
    );
    expect(
      () => command(
        payload: {
          'nested': {'refreshToken': 'secret'},
        },
      ),
      throwsArgumentError,
    );
    expect(
      command(payload: {'value': 9007199254740991}).payload['value'],
      9007199254740991,
    );
    expect(command(payload: {'value': 1.0}).payloadJson, '{"value":1}');
  });
  test(
    'UTF-8 payload boundary includes JSON syntax and rejects one extra byte',
    () {
      final exact = command(payload: {'notes': 'a' * 65524});
      expect(utf8.encode(exact.payloadJson).length, 65536);
      expect(
        () => command(payload: {'notes': 'a' * 65525}),
        throwsArgumentError,
      );
      expect(
        () => command(payload: {'notes': '€' * 22000}),
        throwsArgumentError,
      );
      expect(
        () => command(payload: {'notes': List.filled(40000, 0)}),
        throwsArgumentError,
      );
    },
  );
  test('dependencies are owned, unique, bounded and cannot reference the action itself', () {
    for (final dependencies in [
      [CommandDependency(OwnerUid('bob'), CommandId('parent'))],
      [CommandDependency(owner, CommandId('pay-1'))],
      [
        CommandDependency(owner, CommandId('parent')),
        CommandDependency(owner, CommandId('parent')),
      ],
      List.generate(
        17,
        (i) => CommandDependency(owner, CommandId('parent-$i')),
      ),
    ]) {
      expect(() => command(dependencies: dependencies), throwsArgumentError);
    }
    expect(
      () => command(createdAt: DateTime(2026, 10, 8)),
      throwsArgumentError,
    );
    expect(() => command(resourceKey: 'not a resource'), throwsArgumentError);
    expect(
      () => command().dependencies.add(
        CommandDependency(owner, CommandId('parent')),
      ),
      throwsUnsupportedError,
    );
  });
  test('saved action decoding rejects foreign owners, versions, unknown endpoints and altered hashes', () {
    final frozen = command(), stored = frozen.toStored();
    expect(
      FrozenCommand.fromStored(
        stored,
        expectedOwner: owner,
      ).sameIdentity(frozen),
      isTrue,
    );
    for (final patch in [
      {'userId': 'bob'},
      {'schemaVersion': 2},
      {'name': 'downloadAttachment'},
      {'payloadHash': 'a' * 64},
      {'createdAt': 'invalid'},
      {
        'dependencies': ['pay-1'],
      },
      {'payloadJson': '{"amountMinor":1.0}'},
    ]) {
      expect(
        () => FrozenCommand.fromStored({
          ...stored,
          ...patch,
        }, expectedOwner: owner),
        throwsArgumentError,
      );
    }
    expect(() => CommandName.parse('unknown'), throwsArgumentError);
  });
}
