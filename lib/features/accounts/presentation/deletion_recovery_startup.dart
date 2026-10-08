import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import 'deletion_recovery_providers.dart';

/// Mounted above signed-in feature scopes so device cleanup survives sign-out.
final class DeletionRecoveryStartup extends ConsumerWidget {
  const DeletionRecoveryStartup({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(environmentProvider).mode != AppEnvironment.preview) {
      ref.watch(deletionRecoveryProvider);
    }
    return child;
  }
}
