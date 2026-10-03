import 'package:test/test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/errors/app_failure.dart';

void main() {
  test('valid identifiers keep their opaque value', () {
    expect(PaymentId('payment_01-A').value, 'payment_01-A');
    expect(OwnerUid('x' * 128).value.length, 128);
  });
  final constructors = <(String, Object Function(String))>[
    ('owner', OwnerUid.new),
    ('obligation', ObligationId.new),
    ('instance', InstanceId.new),
    ('payment', PaymentId.new),
    ('contact', ContactId.new),
    ('source', SourceId.new),
    ('category', CategoryId.new),
    ('attachment', AttachmentId.new),
    ('command', CommandId.new),
  ];
  for (final (name, create) in constructors) {
    test('$name rejects paths, controls, whitespace and excessive length', () {
      for (final value in [
        '',
        'a/b',
        '..',
        ' a',
        'a ',
        'a\n',
        'a\u0000b',
        '中文',
        'x' * 129,
      ]) {
        expect(
          () => create(value),
          throwsA(
            isA<AppFailure>().having(
              (e) => e.code,
              'code',
              AppFailureCode.invalidId,
            ),
          ),
        );
      }
    });
  }
  test('equal values remain distinct across financial identifier types', () {
    expect(PaymentId('same'), PaymentId('same'));
    expect(PaymentId('same'), isNot(ObligationId('same')));
    expect({PaymentId('same'), PaymentId('same')}.length, 1);
    expect({PaymentId('same'), ObligationId('same')}.length, 2);
  });
}
