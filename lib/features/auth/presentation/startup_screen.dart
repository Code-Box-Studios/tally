import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/error_panel.dart';
import '../domain/session_state.dart';
import 'auth_providers.dart';
import 'auth_frame.dart';
import 'auth_actions.dart';

class StartupScreen extends ConsumerWidget {
  const StartupScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session =
        ref.watch(sessionStateProvider).value ??
        ref.read(sessionControllerProvider).state;
    return AuthFrame(
      title: 'Your space is getting ready.',
      subtitle: 'Just a moment while Tally loads your account.',
      child: session.stage == SessionStage.failure
          ? Column(
              children: [
                ErrorPanel(
                  title: 'Couldn’t load your account',
                  onRetry: ref.read(sessionControllerProvider).retry,
                ),
                TextButton(
                  onPressed: () =>
                      ref.read(authActionsProvider.notifier).signOut(),
                  child: const Text('Sign out'),
                ),
              ],
            )
          : const Center(child: CircularProgressIndicator()),
    );
  }
}
