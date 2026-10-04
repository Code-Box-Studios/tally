import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/catalog.dart';
import '../widgets/empty_state.dart';
import '../widgets/financial_labels.dart';
import '../widgets/paged_records.dart';
import 'catalog_editor.dart';
import 'financial_form_support.dart';
import 'financial_providers.dart';

export 'catalog_editor.dart' show CatalogEditorKind;

class CatalogManager extends ConsumerWidget {
  const CatalogManager({super.key, required this.kind});
  final CatalogEditorKind kind;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final source = kind == CatalogEditorKind.source;
    final noun = source ? 'payment source' : 'category';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  source ? 'Payment sources' : 'Categories',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                OutlinedButton.icon(
                  key: Key(source ? 'add-source' : 'add-category'),
                  onPressed: () => showFinancialDialog<Object?>(
                    context,
                    CatalogEditor(kind: kind),
                  ),
                  icon: const Icon(Icons.add, size: 18),
                  label: Text('Add $noun'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (source)
              const Text(
                'Labels for cash, bank accounts, cards, e-wallets and payroll.',
              ),
            const SizedBox(height: 12),
            if (source)
              PagedRecords<PaymentSource>(
                first: ref.watch(sourcesPageProvider),
                loadMore: (cursor) => ref
                    .read(catalogRepositoryProvider)
                    .getSources(after: cursor),
                identity: (value) => value.id.value,
                onRetry: () => ref.invalidate(sourcesPageProvider),
                empty: const EmptyState(
                  icon: Icons.wallet_outlined,
                  title: 'Give your payments a place',
                  description: 'Add a source to remember how you paid.',
                ),
                builder: (context, values, complete) => Column(
                  children: [
                    for (final value in values)
                      _CatalogRow(
                        name: value.name,
                        detail:
                            '${sourceLabel(value.kind)}${value.lastFour == null ? '' : ' · •••• ${value.lastFour}'}${value.active ? '' : ' · Inactive'}',
                        edit: () => showFinancialDialog<Object?>(
                          context,
                          CatalogEditor(kind: kind, source: value),
                        ),
                      ),
                  ],
                ),
              )
            else
              PagedRecords<Category>(
                first: ref.watch(categoriesPageProvider),
                loadMore: (cursor) => ref
                    .read(catalogRepositoryProvider)
                    .getCategories(after: cursor),
                identity: (value) => value.id.value,
                onRetry: () => ref.invalidate(categoriesPageProvider),
                empty: const EmptyState(
                  icon: Icons.label_outline,
                  title: 'Organize what’s due',
                  description: 'Add a category that makes sense to you.',
                ),
                builder: (context, values, complete) => Column(
                  children: [
                    for (final value in values)
                      _CatalogRow(
                        name: value.name,
                        detail:
                            '${value.isDefault ? 'Default category' : 'Your category'}${value.active ? '' : ' · Inactive'}',
                        edit: () => showFinancialDialog<Object?>(
                          context,
                          CatalogEditor(kind: kind, category: value),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CatalogRow extends StatelessWidget {
  const _CatalogRow({
    required this.name,
    required this.detail,
    required this.edit,
  });
  final String name, detail;
  final VoidCallback edit;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                detail,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Edit $name',
          onPressed: edit,
          icon: const Icon(Icons.edit_outlined, size: 18),
        ),
      ],
    ),
  );
}
