import '../../../shared/domain/data_page.dart';

final class QueryPage<T> {
  const QueryPage({
    required this.records,
    required this.scannedCandidates,
    required this.budgetReached,
  });
  final DataPage<T> records;
  final int scannedCandidates;
  final bool budgetReached;
}
