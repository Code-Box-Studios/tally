import type { AccountStatement } from "./statement";
import { statementHtml } from "./statement-html";

export async function exportStatementPdf(
  statement: AccountStatement,
  check: () => void,
): Promise<void> {
  check();
  const html = statementHtml(statement);
  // Open synchronously during the user's tap so browsers preserve the user gesture.
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error(
      "Allow pop-ups for Tally, then export again. Choose Save as PDF in the print dialog.",
    );
  try {
    popup.opener = null;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    check();
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  }
}
