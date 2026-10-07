/// Only these protected mutations participate in the durable financial outbox.
enum CommandName {
  createObligation,
  editObligation,
  cancelObligation,
  createInstallment,
  editInstallment,
  cancelInstallment,
  recordPayment,
  recordInstallmentPayment,
  correctPayment,
  createRecurring,
  editRecurring,
  changeRecurringLifecycle,
  setRecurringAmount,
  editRecurringInstance,
  skipRecurringInstance,
  confirmDeduction,
  reportDeductionFailure,
  saveCatalog,
  setObligationReminder,
  updateNotificationPreferences;

  static CommandName parse(String value) {
    for (final candidate in values) {
      if (candidate.name == value) return candidate;
    }
    throw ArgumentError(
      'Unsupported saved action. Update Tally before syncing.',
    );
  }
}
