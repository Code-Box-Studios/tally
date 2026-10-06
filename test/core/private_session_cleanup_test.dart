import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/session/private_session_cleanup.dart';

void main() {
  test('sign-out cleanup belongs to the current owner and can unregister a disposed scope', () async {
    final cleanup = PrivateSessionCleanup(), called = <String>[];
    final remove = cleanup.register(OwnerUid('alice'), () async {
      called.add('alice');
    });
    cleanup.register(OwnerUid('bob'), () async {
      called.add('bob');
    });
    await cleanup.prepareSignOut(OwnerUid('alice'));
    expect(called, ['alice']);
    remove();
    await cleanup.prepareSignOut(OwnerUid('alice'));
    expect(called, ['alice']);
    await cleanup.prepareSignOut(OwnerUid('bob'));
    expect(called, ['alice', 'bob']);
  });
}
