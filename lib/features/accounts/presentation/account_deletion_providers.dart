import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../sync/presentation/sync_providers.dart';
import '../data/firebase_account_deletion_repository.dart';
import '../data/firebase_recent_authentication.dart';
import '../domain/account_deletion.dart';
import '../domain/account_deletion_controller.dart';
import 'deletion_recovery_providers.dart';

typedef AccountDeletionRepositoryFactory = AccountDeletionRepository Function(
  OwnerUid owner,
);
typedef RecentAuthenticationFactory = RecentAuthentication Function(
  OwnerUid owner,
);
final accountDeletionRepositoryFactoryProvider =
    Provider<AccountDeletionRepositoryFactory>((ref) {
      final clients = ref.watch(firebaseClientsProvider);
      return (owner) => FirebaseAccountDeletionRepository.firebase(
        owner: owner,
        auth: clients.auth,
        functions: clients.functions,
      );
    });
final recentAuthenticationFactoryProvider =
    Provider<RecentAuthenticationFactory>((ref) {
      final auth = ref.watch(firebaseClientsProvider).auth;
      return (owner) => FirebaseRecentAuthentication(owner: owner, auth: auth);
    });

typedef AccountDeletionControllerFactory = AccountDeletionController Function(
  DeletionScope scope,
);
final accountDeletionControllerFactoryProvider =
    Provider<AccountDeletionControllerFactory>((ref) {
      final repository = ref.watch(accountDeletionRepositoryFactoryProvider),
          authentication = ref.watch(recentAuthenticationFactoryProvider),
          handoffs = ref.watch(deletionHandoffStoreProvider),
          cleanup = ref.watch(ownerLocalCleanupProvider),
          environment = ref.watch(syncEnvironmentProvider);
      return (scope) {
        if (scope.environment != environment) {
          throw const DeletionFailure(DeletionFailureCode.recovery);
        }
        return AccountDeletionController(
          scope: scope,
          repository: repository(scope.owner),
          authentication: authentication(scope.owner),
          handoffs: handoffs,
          cleanup: cleanup,
          newId: newCommandId,
        );
      };
    });
final accountDeletionControllerProvider =
    Provider.family<AccountDeletionController, DeletionScope>((ref, scope) {
      final controller = ref.watch(accountDeletionControllerFactoryProvider)(
        scope,
      );
      ref.onDispose(controller.dispose);
      return controller;
    });
final accountDeletionStateProvider = StreamProvider.autoDispose
    .family<DeletionState, DeletionScope>(
      (ref, scope) =>
          ref.watch(accountDeletionControllerProvider(scope)).watch(),
    );
