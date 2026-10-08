import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

Stream<void> syncOnlineEvents() {
  late StreamController<void> events;
  final listener = ((web.Event _) {
    events.add(null);
  }).toJS;
  events = StreamController<void>.broadcast(
    onListen: () => web.window.addEventListener('online', listener),
    onCancel: () => web.window.removeEventListener('online', listener),
  );
  return events.stream;
}
