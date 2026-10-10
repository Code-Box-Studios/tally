import { expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(path, e.name))
      // Web-only DOM components do not participate in native rendering.
      : e.name.endsWith(".tsx") && !e.name.endsWith(".web.tsx")
        ? [join(path, e.name)]
        : [],
  );
}
it("renders every literal string inside a native text component", () => {
  const problems: string[] = [];
  for (const path of files("src")) {
    const file = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node)) {
        const name = node.openingElement.tagName.getText(file);
        if (!["Txt", "Text"].includes(name)) {
          for (const child of node.children) {
            if (
              (ts.isJsxText(child) && child.text.trim()) ||
              (ts.isJsxExpression(child) &&
                child.expression &&
                ts.isStringLiteral(child.expression) &&
                child.expression.text.length)
            )
              problems.push(
                `${path}:${file.getLineAndCharacterOfPosition(child.pos).line + 1}`,
              );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  expect(problems).toEqual([]);
});
