import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/presentation/catalog_editor.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/money_text.dart';
import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/paged_records.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/presentation/obligation_row.dart';
import '../domain/contact_position.dart';

class ContactDetailScreen extends ConsumerWidget {
  const ContactDetailScreen({super.key, required this.id});
  final ContactId id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(contactProvider(id))
      .when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: FinancialActionError(error: error)),
        data: (record) {
          final contact = record.value;
          if (contact == null) {
            return const EmptyState(
              icon: Icons.person_off_outlined,
              title: 'Contact unavailable',
              description: 'This person or organization could not be found in your workspace.',
            );
          }
          return PageBody(
            title: contact.name,
            subtitle: [
              contact.email,
              contact.phone,
              contact.organizationType,
            ].whereType<String>().join(' · '),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (record.isFromCache)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: Text(
                      'Cached contact · reconnect to confirm current records.',
                    ),
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    onPressed: () => showFinancialDialog<Object?>(
                      context,
                      CatalogEditor(
                        kind: CatalogEditorKind.contact,
                        contact: contact,
                      ),
                    ),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Edit contact'),
                  ),
                ),
                if (contact.notes.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(contact.notes),
                  ),
                const SizedBox(height: 24),
                PagedRecords<Obligation>(
                  first: ref.watch(contactObligationsProvider(id)),
                  loadMore: (cursor) => ref
                      .read(obligationsRepositoryProvider)
                      .getObligations(contact: id, after: cursor),
                  identity: (value) => value.id.value,
                  onRetry: () => ref.invalidate(contactObligationsProvider(id)),
                  empty: const Card(
                    child: EmptyState(
                      icon: Icons.wallet_outlined,
                      title: 'No obligations linked yet',
                      description: 'Choose this person or organization when adding an obligation.',
                    ),
                  ),
                  builder: (context, values, complete) {
                    final positions = ContactPositionCalculator.calculate(
                      values,
                    );
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          complete
                              ? 'Current position'
                              : 'Position for loaded obligations',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        if (!complete)
                          const Text(
                            'Load every page for a complete position.',
                          ),
                        const Text(
                          'Each obligation keeps its own balance. Net position is informational.',
                        ),
                        const SizedBox(height: 16),
                        for (final position in positions.entries)
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(position.key.code),
                                  const SizedBox(height: 10),
                                  Wrap(
                                    spacing: 24,
                                    runSpacing: 16,
                                    children: [
                                      for (final value in [
                                        ('I owe', position.value.youOwe),
                                        (
                                          'Owed to me',
                                          position.value.owedToYou,
                                        ),
                                        ('Net position', position.value.net),
                                      ])
                                        Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(value.$1),
                                            MoneyText(
                                              money: value.$2,
                                              includeCode: true,
                                            ),
                                          ],
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        const SizedBox(height: 24),
                        Text(
                          'Obligations and payment histories',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 12),
                        Card(
                          child: Column(
                            children: [
                              for (final obligation in values)
                                ObligationRow(obligation),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          );
        },
      );
}
