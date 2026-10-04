import '../../core/identifiers/entity_ids.dart';
import '../domain/data_page.dart';
import 'financial_failure_mapper.dart';
import 'owner_command_gateway.dart';
import 'owner_document_gateway.dart';

abstract base class FinancialRepositoryBase {
  FinancialRepositoryBase(this.documents, this.commands) {
    if (documents.owner != commands.owner) {
      throw ArgumentError('Private repository owners must match.');
    }
  }
  final OwnerDocumentGateway documents;
  final OwnerCommandGateway commands;
  OwnerUid get owner => documents.owner;
  DataPage<T> mapPage<T>(RawPage page, T Function(RawDocument) map) => DataPage(
    items: page.documents.map(map).toList(),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
  );
  Stream<DataPage<T>> watch<T>(
    DocumentQuery query,
    T Function(RawDocument) map,
  ) async* {
    try {
      await for (final page in documents.watchPage(query)) {
        yield mapPage(page, map);
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }

  Future<DataPage<T>> get<T>(
    DocumentQuery query,
    T Function(RawDocument) map,
  ) async {
    try {
      return mapPage(await documents.getPage(query), map);
    } catch (error) {
      throw financialFailure(error);
    }
  }
}
