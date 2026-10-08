import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/data/outbox_open_result.dart';
import 'package:tally/features/sync/data/outbox_open_web.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';

void main() {
  if (!['localhost', '127.0.0.1'].contains(Uri.base.host) ||
      Uri.base.scheme != 'http') {
    throw StateError('This isolated storage probe requires localhost.');
  }
  OpenedOutbox? opened;
  DispatchLease? held;
  final owner = OwnerUid('outbox-qa-owner');
  Future<JSString> operation(JSString method, JSString encoded) async {
    final arguments = Map<String, Object?>.from(
      jsonDecode(encoded.toDart) as Map,
    );
    Object? result;
    switch (method.toDart) {
      case 'open':
        opened = await openPlatformOutbox(
          owner: owner,
          environmentKey: arguments['environment']! as String,
          trustedDevice: true,
        );
        result = {
          'durable': opened!.capability.canQueue,
          'mode': opened!.storageMode,
        };
      case 'enqueue':
        final entry = await opened!.store!.enqueue(
          FrozenCommand(
            owner: owner,
            id: CommandId('probe-payment'),
            name: CommandName.recordPayment,
            payload: {'amountMinor': 2500, 'currency': 'PHP'},
            resourceKey: 'obligation:probe',
            createdAt: DateTime.utc(2026, 10, 8),
          ),
        );
        result = {
          'sequence': entry.sequence,
          'payload': entry.command.payloadJson,
        };
      case 'read':
        final entry = await opened!.store!.get(CommandId('probe-payment'));
        result = {
          'sequence': entry?.sequence,
          'payload': entry?.command.payloadJson,
          'state': entry?.state.name,
        };
      case 'claim':
        held = await opened!.store!.claimDispatch(
          DateTime.now().toUtc(),
          token: arguments['token']! as String,
        );
        result = {'acquired': held != null, 'generation': held?.generation};
      case 'release':
        if (held != null) await opened!.store!.releaseDispatch(held!);
        held = null;
        result = true;
      case 'close':
        await opened?.store?.close();
        opened = null;
        result = true;
      default:
        throw ArgumentError('Unknown probe operation.');
    }
    return jsonEncode(result).toJS;
  }

  globalContext.setProperty(
    'tallyOutboxProbe'.toJS,
    ((JSString method, JSString json) => operation(method, json).toJS).toJS,
  );
  web.document.body!.textContent =
      'Tally isolated outbox storage probe. No Firebase.';
}
