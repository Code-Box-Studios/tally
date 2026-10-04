abstract interface class PageCursor {}

final class DataRecord<T> {
  const DataRecord(this.value, {required this.isFromCache});
  final T value;
  final bool isFromCache;
}

final class DataPage<T> {
  DataPage({
    required Iterable<T> items,
    required this.nextCursor,
    required this.hasMore,
    required this.isFromCache,
  }) : items = List.unmodifiable(items);
  final List<T> items;
  final PageCursor? nextCursor;
  final bool hasMore;
  final bool isFromCache;
}
