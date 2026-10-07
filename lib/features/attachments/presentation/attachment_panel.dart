import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/widgets/paged_records.dart';
import '../domain/attachment.dart';
import 'attachment_actions.dart';
import 'attachment_providers.dart';
import 'attachment_tile.dart';

class AttachmentPanel extends StatefulWidget {
  const AttachmentPanel({
    super.key,
    required this.target,
    this.title = 'Files',
    this.initiallyExpanded = false,
  });
  final AttachmentTarget target;
  final String title;
  final bool initiallyExpanded;
  @override
  State<AttachmentPanel> createState() => _AttachmentPanelState();
}

class _AttachmentPanelState extends State<AttachmentPanel> {
  late bool _expanded = widget.initiallyExpanded;
  @override
  Widget build(BuildContext context) => Card(
    child: ExpansionTile(
      key: ValueKey(widget.target),
      initiallyExpanded: widget.initiallyExpanded,
      leading: const Icon(Icons.attach_file),
      title: Text(widget.title),
      onExpansionChanged: (value) => setState(() => _expanded = value),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [if (_expanded) _TargetFiles(target: widget.target)],
    ),
  );
}

class _TargetFiles extends ConsumerWidget {
  const _TargetFiles({required this.target});
  final AttachmentTarget target;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(attachmentActionsProvider);
    final applies = action.target == target;
    final pendingElsewhere =
        action.target != null && !applies && (action.isBusy || action.canRetry);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('JPEG, PNG, WebP or PDF · up to 10 MB'),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: action.isBusy || action.canRetry
                ? null
                : () => ref
                      .read(attachmentActionsProvider.notifier)
                      .select(target),
            icon: const Icon(Icons.add),
            label: const Text('Add file'),
          ),
        ),
        if (pendingElsewhere)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Finish the pending file in its original section before adding another.',
            ),
          ),
        if (applies && action.isBusy) ...[
          const SizedBox(height: 8),
          const LinearProgressIndicator(),
          const SizedBox(height: 8),
          Text(switch (action.phase) {
            AttachmentActionPhase.selecting => 'Choose a file…',
            AttachmentActionPhase.reserving =>
              'Preparing ${action.filename ?? 'file'}…',
            _ => 'Uploading ${action.filename ?? 'file'}…',
          }),
        ],
        if (applies && action.failure != null)
          FinancialActionError(error: action.failure),
        if (applies && action.canRetry)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: action.isBusy
                  ? null
                  : () => ref.read(attachmentActionsProvider.notifier).retry(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry upload'),
            ),
          ),
        PagedRecords<Attachment>(
          key: ValueKey(target),
          first: ref.watch(targetAttachmentsProvider(target)),
          loadMore: (cursor) => ref
              .read(attachmentsRepositoryProvider)
              .getTarget(target, after: cursor),
          identity: (file) => file.id.value,
          onRetry: () => ref.invalidate(targetAttachmentsProvider(target)),
          empty: const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text(
              'Keep a receipt, agreement or bill here. Files stay private to your Tally account.',
            ),
          ),
          builder: (_, files, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final file in files)
                AttachmentTile(key: ValueKey(file.id), file: file),
            ],
          ),
        ),
        if (applies && action.canRetry)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: action.isBusy
                  ? null
                  : () => ref
                        .read(attachmentActionsProvider.notifier)
                        .stopRetrying(),
              child: const Text('Stop retrying'),
            ),
          ),
      ],
    );
  }
}
