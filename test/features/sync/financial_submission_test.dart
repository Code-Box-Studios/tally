import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/local_outbox_failure.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_actions.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../financial/repository_paging_test.dart' show FakeDocuments;
import '../financial/financial_scope_test.dart' show draft;

class SubmissionCommands implements OwnerCommandGateway {
  @override
  OwnerUid get owner => OwnerUid('alice');
  final ids = <CommandId>[];
  Object? failure;
  bool queued = false;
  Completer<void>? held;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    ids.add(id);
    if (held != null) await held!.future;
    if (failure != null) throw failure!;
    if (queued) throw QueuedCommand(owner, id);
    return {
      'obligationId': 'canonical',
      'obligationInstanceId': 'period',
      'obligationRevision': 1,
      'instanceRevision': 1,
    };
  }
}

void main() {
  late ProviderContainer scope;
  late SubmissionCommands commands;
  setUp(() {
    commands = SubmissionCommands();
    scope = ProviderContainer(
      overrides: [
        ownerUidProvider.overrideWithValue(commands.owner),
        ownerDocumentsFactoryProvider.overrideWithValue(
          (owner) => FakeDocuments(owner),
        ),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
    );
    scope.listen(financialActionsProvider, (_, _) {});
  });
  tearDown(() => scope.dispose());
  test('accepted action exposes canonical result while queued exposes only owner and identity', () async {
    final actions = scope.read(financialActionsProvider.notifier);
    final accepted = await actions.createObligation(draft());
    expect(accepted, isA<AcceptedSubmission<Object?>>());
    commands.queued = true;
    final queued = await actions.createObligation(draft());
    expect(queued, isA<QueuedSubmission<Object?>>());
    final queuedResult = queued as QueuedSubmission<Object?>;
    expect(queuedResult.owner, commands.owner);
    expect(queuedResult.commandId, commands.ids.last);
    expect(scope.read(financialActionsProvider).hasError, isFalse);
    await actions.createObligation(draft());
    expect(commands.ids[2], commands.ids[1]);
  });
  test(
    'storage quota retains draft failure and never reports a queued save',
    () async {
      commands.failure = const LocalOutboxFailure(SyncAvailability.quota);
      expect(
        await scope
            .read(financialActionsProvider.notifier)
            .createObligation(draft()),
        isNull,
      );
      expect(
        scope.read(financialActionsProvider).error,
        isA<LocalOutboxFailure>(),
      );
    },
  );
  test('reviewed definitive rejection gets a new ID; uncertain raw retries keep their ID', () async {
    final actions = scope.read(financialActionsProvider.notifier);
    commands.failure = const FinancialFailure(
      FinancialFailureCode.conflict,
      'Refresh.',
    );
    expect(await actions.createObligation(draft()), isNull);
    commands.failure = null;
    expect(await actions.createObligation(draft()), isNotNull);
    expect(commands.ids[1], isNot(commands.ids[0]));
    commands.failure = const FinancialFailure(
      FinancialFailureCode.offline,
      'Reconnect.',
    );
    expect(await actions.createObligation(draft()), isNull);
    commands.failure = null;
    expect(await actions.createObligation(draft()), isNotNull);
    expect(commands.ids[3], commands.ids[2]);
  });
  test(
    'duplicate Save cannot create a second request while submission is held',
    () async {
      commands.held = Completer<void>();
      final actions = scope.read(financialActionsProvider.notifier);
      final first = actions.createObligation(draft());
      expect(await actions.createObligation(draft()), isNull);
      expect(commands.ids.length, 1);
      commands.held!.complete();
      expect(await first, isNotNull);
    },
  );
}
