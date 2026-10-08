import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/accounts/domain/account_deletion.dart';
import 'package:tally/features/accounts/domain/account_deletion_controller.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/accounts/domain/owner_local_cleanup.dart';
import 'package:tally/features/accounts/presentation/account_deletion_form.dart';

@JS('tallyDeletionUiReady')
external set ready(JSBoolean value);

/// Isolated localhost UI evidence. It never connects to Firebase or private stores.
Future<void> main() async {
  if (!kIsWeb || !{'localhost', '127.0.0.1'}.contains(Uri.base.host)) {
    throw UnsupportedError('Owned local UI probe required.');
  }
  WidgetsFlutterBinding.ensureInitialized().ensureSemantics();
  final parameters = Uri.base.queryParameters;
  final scenario = parameters['scenario'] ?? 'confirmation';
  final owner = OwnerUid('deletion-ui-synthetic');
  final handoffs = _Handoffs();
  final authentication = _Authentication(owner, scenario);
  final controller = AccountDeletionController(
    scope: (owner: owner, environment: 'emulator-demo-tally'),
    repository: _Repository(owner, scenario),
    authentication: authentication,
    handoffs: handoffs,
    cleanup: _Cleanup(handoffs, scenario),
    newId: () => CommandId('synthetic-ui-request'),
  );
  if (scenario != 'confirmation') {
    await controller.submit(
      const DeletionConfirmation(acknowledged: true, text: 'DELETE'),
      DeletionAuthentication(
        ReauthenticationProvider.password,
        password: 'synthetic-ui-input',
      ),
    );
  }
  runApp(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: parameters['dark'] == '1' ? TallyTheme.dark() : TallyTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(parameters['scale'] == '2' ? 2 : 1),
        ),
        child: child!,
      ),
      home: Scaffold(
        body: AccountDeletionForm(controller: controller, onCancel: () {}),
      ),
    ),
  );
  ready = true.toJS;
}

final class _Authentication implements RecentAuthentication {
  _Authentication(this.owner, this.scenario);
  final OwnerUid owner;
  final String scenario;
  @override
  Set<ReauthenticationProvider> get providers => {
    ReauthenticationProvider.password,
    ReauthenticationProvider.google,
  };
  @override
  bool isOwnerActive(OwnerUid owner) => owner == this.owner;
  @override
  Future<void> reauthenticate(
    OwnerUid owner, {
    String? password,
    ReauthenticationProvider? provider,
  }) async {}
  @override
  Future<void> signOutIfOwner(OwnerUid owner) async {
    if (scenario == 'signout') {
      throw const DeletionFailure(DeletionFailureCode.unavailable);
    }
  }
}

final class _Repository implements AccountDeletionRepository {
  _Repository(this.owner, this.scenario);
  @override
  final OwnerUid owner;
  final String scenario;
  @override
  Future<DeletionView> request(CommandId id) async {
    if (scenario == 'uncertain') {
      throw const DeletionFailure(DeletionFailureCode.unavailable);
    }
    return DeletionView(
      owner,
      DeletionStatus.pending,
      DeletionStep.revokeSessions,
    );
  }

  @override
  Future<DeletionView?> status() async => null;
}

final class _Handoffs implements DeletionHandoffStore {
  DeletionHandoff? saved;
  @override
  Future<DeletionHandoff?> read(OwnerUid owner, String environment) async =>
      saved;
  @override
  Future<void> write(DeletionHandoff value) async {
    saved = value;
  }

  @override
  Future<void> remove(DeletionHandoff expected) async {
    saved = null;
  }

  @override
  Future<List<DeletionHandoff>> readEnvironment(String environment) async =>
      saved == null ? [] : [saved!];
}

final class _Cleanup implements OwnerLocalCleanup {
  _Cleanup(this.handoffs, this.scenario);
  final _Handoffs handoffs;
  final String scenario;
  @override
  Future<void> quiesceAndPurge(OwnerUid owner, String environment) async {
    if (scenario == 'cleanup') {
      throw const OwnerLocalCleanupFailure('Synthetic cleanup retry');
    }
    handoffs.saved = null;
  }
}
