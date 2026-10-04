import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../shared/domain/catalog.dart';
import '../../../shared/presentation/catalog_editor.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/paged_records.dart';

class PeopleScreen extends ConsumerWidget {
  const PeopleScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preview =
        ref.watch(environmentProvider).mode == AppEnvironment.preview;
    const empty = EmptyState(
      icon: Icons.people_outline,
      title: 'People make it personal',
      description:
          'Add the people and organizations connected to your obligations.',
    );
    return PageBody(
      title: 'People',
      subtitle: 'A clearer picture, person by person.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!preview)
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed: () => showFinancialDialog<Object?>(
                  context,
                  const CatalogEditor(kind: CatalogEditorKind.contact),
                ),
                icon: const Icon(Icons.add),
                label: const Text('Add person or organization'),
              ),
            ),
          const SizedBox(height: 20),
          if (preview)
            const Card(child: empty)
          else
            PagedRecords<Contact>(
              first: ref.watch(contactsPageProvider),
              loadMore: (cursor) => ref
                  .read(catalogRepositoryProvider)
                  .getContacts(after: cursor),
              identity: (value) => value.id.value,
              onRetry: () => ref.invalidate(contactsPageProvider),
              empty: const Card(child: empty),
              builder: (context, people, complete) => LayoutBuilder(
                builder: (context, bounds) {
                  final columns =
                      MediaQuery.textScalerOf(context).scale(1) > 1.5
                      ? 1
                      : bounds.maxWidth < 600
                      ? 1
                      : bounds.maxWidth < 1000
                      ? 2
                      : 3;
                  final width =
                      (bounds.maxWidth - (columns - 1) * 16) / columns;
                  return Wrap(
                    spacing: 16,
                    runSpacing: 16,
                    children: [
                      for (final person in people)
                        SizedBox(
                          width: width,
                          child: Card(
                            child: InkWell(
                              onTap: () =>
                                  context.go('/people/${person.id.value}'),
                              borderRadius: BorderRadius.circular(14),
                              child: Padding(
                                padding: const EdgeInsets.all(22),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        CircleAvatar(
                                          backgroundColor: Theme.of(context)
                                              .colorScheme
                                              .primaryContainer,
                                          child: Icon(
                                            person.kind == ContactKind.person
                                                ? Icons.person_outline
                                                : Icons.business_outlined,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Text(
                                            person.name,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleMedium,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 14),
                                    Text(
                                      '${person.kind == ContactKind.person ? 'Person' : 'Organization'}${person.archived ? ' · Inactive' : ''}',
                                    ),
                                    if (person.email != null)
                                      Text(person.email!),
                                    if (person.phone != null)
                                      Text(person.phone!),
                                    const SizedBox(height: 14),
                                    const Text(
                                      'View obligations and payment histories',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
