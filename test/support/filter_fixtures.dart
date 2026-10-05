import 'package:tally/features/obligations/data/instance_dto.dart';
import 'package:tally/features/obligations/domain/obligation_instance.dart';

import 'recurring_fixtures.dart';

ObligationInstance filterPeriod({Map<String, Object?> patch = const {}}) {
  final raw = recurringData('scheduled');
  raw['snapshot'] = {
    ...raw['snapshot'] as Map<String, Object?>,
    'title': 'Internet',
    'description': 'Home connection',
    'notes': 'Monthly reference ABC',
    'contactSnapshot': {'displayName': 'John Smith', 'kind': 'person'},
    'categorySnapshot': {'name': 'Utilities'},
    'sourceSnapshot': {
      'name': 'Credit card',
      'type': 'creditCard',
      'lastFour': '1234',
    },
  };
  raw.addAll({
    'amountMinor': 54900,
    'totalPaidMinor': 20000,
    'remainingMinor': 34900,
    'dueDate': '2026-10-04',
    'occurrenceDate': '2026-10-04',
    'contactId': 'john',
    'categoryId': 'utilities',
    'paymentSourceId': 'card',
    'paymentSourceOverrideSnapshot': raw['snapshot'] is Map
        ? (raw['snapshot'] as Map<String, Object?>)['sourceSnapshot']
        : null,
    'financialStatus': 'partiallyPaid',
    'closed': false,
    ...patch,
  });
  return InstanceDto.fromMap(raw['instanceId'] as String, raw, recurringOwner);
}
