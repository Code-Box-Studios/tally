import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../payments/data/payment_dto.dart';

/// Reads only an owned, validated canonical cache record. A missing record is
/// never replaced by a guessed serialization key or an extra callable field.
Future<ObligationId?> cachedPaymentResource(
  FirebaseFirestore firestore,
  OwnerUid owner,
  PaymentId id,
) async {
  try {
    final doc = await firestore
        .collection('users')
        .doc(owner.value)
        .collection('payments')
        .doc(id.value)
        .get(const GetOptions(source: Source.cache));
    if (!doc.exists) return null;
    return PaymentDto.fromMap(
      doc.id,
      Map<String, Object?>.from(doc.data()!),
      owner,
    ).obligationId;
  } catch (_) {
    return null;
  }
}
