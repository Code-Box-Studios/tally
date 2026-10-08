import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_command_gateway.dart';
import '../../../shared/domain/financial_failure.dart';

/// Guards the online fallback against an identity change before scope disposal.
final class GuardedOwnerCommands implements OwnerCommandGateway {
  const GuardedOwnerCommands({required this.raw, required this.isOwnerActive});
  final OwnerCommandGateway raw;
  final bool Function() isOwnerActive;
  @override
  OwnerUid get owner => raw.owner;
  void _checkOwner() {
    if (!isOwnerActive()) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Sign in to the same account to sync your changes.',
      );
    }
  }

  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    _checkOwner();
    final result = await raw.call(name, id, payload);
    _checkOwner();
    return result;
  }
}
