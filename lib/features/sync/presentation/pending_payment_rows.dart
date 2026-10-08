import 'package:flutter/material.dart';

import 'pending_actions.dart';

/// Local payment history is displayed separately from canonical payment rows.
class PendingPaymentRows extends StatelessWidget {
  const PendingPaymentRows({super.key, required this.resourceKey});
  final String resourceKey;
  @override
  Widget build(BuildContext context) =>
      PendingActions(resourceKey: resourceKey, paymentsOnly: true);
}
