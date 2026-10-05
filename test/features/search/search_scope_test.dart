import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/search/presentation/search_providers.dart';
import 'package:tally/features/search/domain/financial_filter.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/search_gateway.dart';

void main() {
  test('search repositories are private UID dependencies and dispose old pending reads', () async {
    final pending = Completer<RawPage>(), docs = <String, CandidateDocuments>{};
    final root = ProviderContainer(
      overrides: [
        ownerDocumentsFactoryProvider.overrideWithValue(
          (uid) =>
              docs.putIfAbsent(uid.value, () => CandidateDocuments(uid, [])),
        ),
      ],
    );
    addTearDown(root.dispose);
    final alice = ProviderContainer(
          parent: root,
          overrides: [ownerUidProvider.overrideWithValue(OwnerUid('alice'))],
        ),
        bob = ProviderContainer(
          parent: root,
          overrides: [ownerUidProvider.overrideWithValue(OwnerUid('bob'))],
        );
    addTearDown(bob.dispose);
    final old = alice.read(searchRepositoryProvider);
    expect(old.owner, OwnerUid('alice'));
    expect(bob.read(searchRepositoryProvider).owner, OwnerUid('bob'));
    expect(() => root.read(searchRepositoryProvider), throwsA(anything));
    docs['alice']!.onGet = (_) => pending.future;
    final future = old.getObligations(
      FinancialFilter(),
      DateTime.utc(2026, 10, 5),
    );
    alice.dispose();
    pending.complete(
      RawPage(
        documents: [],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      ),
    );
    await expectLater(future, throwsA(anything));
    expect(docs['bob']!.queries, isEmpty);
  });
}
