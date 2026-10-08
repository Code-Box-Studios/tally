@TestOn('browser')
library;

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:web/web.dart' as web;
import 'package:tally/features/sync/presentation/sync_online_events_web.dart';

void main() {
  test(
    'the same browser event stream supports successive signed-in owners',
    () async {
      final events = syncOnlineEvents();
      var received = 0;
      var event = Completer<void>();
      final first = events.listen((_) {
        received++;
        event.complete();
      });
      web.window.dispatchEvent(web.Event('online'));
      await event.future;
      await first.cancel();
      event = Completer<void>();
      final next = events.listen((_) {
        received++;
        event.complete();
      });
      web.window.dispatchEvent(web.Event('online'));
      await event.future;
      await next.cancel();
      expect(received, 2);
    },
  );
}
