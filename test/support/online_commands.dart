import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';

/// Canonical UI/repository fixtures inject their original online gateway. The
/// dedicated sync tests instead inject real SQLite and the durable transport.
Future<SyncRuntime> onlineOnlyTestRuntime(
  OwnerUid owner,
  String environment,
  bool trusted,
  OwnerCommandGateway raw,
  bool Function() active,
) async => SyncRuntime(
  owner: owner,
  capability: const SyncCapability(SyncAvailability.unavailable),
  gateway: raw,
);
