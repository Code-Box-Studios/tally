import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../shared/widgets/page_body.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../sync/presentation/sync_providers.dart';
import 'account_deletion_form.dart';
import 'account_deletion_providers.dart';
import 'deletion_handoff_host.dart';

final class AccountDeletionScreen extends ConsumerWidget {
  const AccountDeletionScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(environmentProvider).mode == AppEnvironment.preview) {
      return const PageBody(
        title: 'Your account',
        subtitle: 'Know what’s due.',
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.lock_outline),
                SizedBox(height: 16),
                Text('Account deletion is unavailable in preview'),
                SizedBox(height: 12),
                Text(
                  'The connected app lets you review and delete your own account after verifying sign-in. This preview uses sample data.',
                ),
              ],
            ),
          ),
        ),
      );
    }
    final scope = (
      owner: ref.watch(ownerUidProvider),
      environment: ref.watch(syncEnvironmentProvider),
    );
    final controller = ref.watch(accountDeletionControllerProvider(scope));
    return AccountDeletionForm(
      key: ValueKey(scope),
      controller: controller,
      onCancel: () => context.go('/settings'),
      onSubmitting: () =>
          ref.read(deletionActiveScopeProvider.notifier).select(scope),
    );
  }
}
