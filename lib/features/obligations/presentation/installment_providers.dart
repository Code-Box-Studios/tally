import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../domain/obligation_instance.dart';

final installmentInstancesProvider = StreamProvider.autoDispose
    .family<DataPage<ObligationInstance>, ObligationId>(
      (ref, id) => ref
          .watch(obligationsRepositoryProvider)
          .watchInstances(id, limit: 120),
      dependencies: [obligationsRepositoryProvider],
    );
