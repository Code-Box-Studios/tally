import type { AccountStatement } from "./statement";
import { statementHtml } from "./statement-html";
import { exportHtmlPdf } from "../../shared/pdf-export.web";

export function exportStatementPdf(
  statement: AccountStatement,
  check: () => void,
): Promise<void> {
  return exportHtmlPdf(
    "Save Tally statement of account",
    () => statementHtml(statement),
    check,
  );
}
