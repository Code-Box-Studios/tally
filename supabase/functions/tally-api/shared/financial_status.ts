export type FinancialStatus = "pending" | "partiallyPaid" | "paid" | "overdue";
export function statusForBalance(
  paid: number,
  remaining: number,
  dueDate: string | null,
  today: string,
): FinancialStatus {
  if (remaining === 0) return "paid";
  if (dueDate !== null && dueDate < today) return "overdue";
  return paid > 0 ? "partiallyPaid" : "pending";
}
