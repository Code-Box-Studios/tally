import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/guarded_owner_commands.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

void main() {
  test(
    'raw online fallback refuses a changed identity before sending',
    () async {
      final raw = FakeCommands(OwnerUid('alice'));
      final gateway = GuardedOwnerCommands(
        raw: raw,
        isOwnerActive: () => false,
      );
      await expectLater(
        gateway.call('createObligation', CommandId('held'), {}),
        throwsA(
          isA<FinancialFailure>().having(
            (e) => e.code,
            'code',
            FinancialFailureCode.signIn,
          ),
        ),
      );
      expect(raw.commandIds, isEmpty);
    },
  );
  test(
    'late raw acknowledgement cannot be shown to the next identity',
    () async {
      final held = Completer<Map<String, Object?>>();
      var active = true;
      final raw = FakeCommands(OwnerUid('alice'))..pending = held;
      final gateway = GuardedOwnerCommands(
        raw: raw,
        isOwnerActive: () => active,
      );
      final call = gateway.call('createObligation', CommandId('held'), {});
      final check = expectLater(
        call,
        throwsA(
          isA<FinancialFailure>().having(
            (e) => e.code,
            'code',
            FinancialFailureCode.signIn,
          ),
        ),
      );
      active = false;
      held.complete({'obligationId': 'late'});
      await check;
      expect(raw.commandIds.length, 1);
    },
  );
}
