import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const localeDir = path.resolve("src/locales");
const sourceRoot = path.resolve("src");
const errors = [];

const flatten = (object, prefix = "", result = {}) => {
  for (const [key, value] of Object.entries(object)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, fullKey, result);
    else result[fullKey] = value;
  }
  return result;
};

const placeholderNames = (value) => [...String(value).matchAll(/{{\s*([^},\s]+).*?}}/g)].map((match) => match[1]).sort();
const localeFiles = fs
  .readdirSync(localeDir)
  .filter((name) => name.endsWith(".json"))
  .sort();
const english = flatten(JSON.parse(fs.readFileSync(path.join(localeDir, "en.json"), "utf8")));
const englishKeys = Object.keys(english).sort();
const requiredTechnicalTokens = {
  "ui.invalid-datetime": ["2023-12-31 23:59:59"],
  "ui.mermaid-error": ["Mermaid"],
  "ui.upstream-description": ["MemoArk", "Memos", "v0.29.1"],
  "ui.upstream-license": ["MemoArk", "Memos", "MIT", "Git"],
  "ui.shortcut-expression-tip": ["&&", "||", "Unix", "now()"],
};

for (const filename of localeFiles) {
  const locale = filename.slice(0, -5);
  const translation = flatten(JSON.parse(fs.readFileSync(path.join(localeDir, filename), "utf8")));
  const keys = Object.keys(translation).sort();
  const missing = englishKeys.filter((key) => !(key in translation));
  const extra = keys.filter((key) => !(key in english));
  if (missing.length) errors.push(`${filename}: missing keys: ${missing.join(", ")}`);
  if (extra.length) errors.push(`${filename}: unknown keys: ${extra.join(", ")}`);

  for (const key of englishKeys) {
    if (!(key in translation)) continue;
    if (/\?{2,}/.test(String(translation[key]))) errors.push(`${filename}: suspicious replacement characters at ${key}`);
    const expected = placeholderNames(english[key]);
    const actual = placeholderNames(translation[key]);
    if (expected.join("\u0000") !== actual.join("\u0000")) {
      errors.push(`${filename}: placeholder mismatch at ${key}: expected [${expected}], got [${actual}]`);
    }
  }

  for (const [key, tokens] of Object.entries(requiredTechnicalTokens)) {
    for (const token of tokens) {
      if (!String(translation[key]).includes(token)) errors.push(`${filename}: ${key} must preserve ${token}`);
    }
  }

  if (!["en", "en-GB"].includes(locale) && translation["auth.protected-memo-notice"] === english["auth.protected-memo-notice"]) {
    errors.push(`${filename}: auth.protected-memo-notice still falls back to English`);
  }
}

const translatableAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "cancelText",
  "confirmText",
  "description",
  "emptyText",
  "label",
  "placeholder",
  "title",
]);
const allowedLiterals = new Set([
  "GitHub",
  "GitLab",
  "Google",
  "OpenAI",
  "text",
  "url",
  "abcd efgh ijkl mnop",
  "smtp.gmail.com",
  "your.name@gmail.com",
  "MemoArk",
  "support@example.com",
  'pinned && tag in ["work"]',
]);
const normalize = (value) => value.replace(/\s+/g, " ").trim();
const shouldReport = (value) => {
  const text = normalize(value);
  return /\p{L}{2,}/u.test(text) && !/^https?:\/\//.test(text) && !allowedLiterals.has(text);
};

const sourceFiles = [];
const visitDirectory = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!new Set(["__tests__", "test", "tests"]).has(entry.name)) visitDirectory(fullPath);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      sourceFiles.push(fullPath);
    }
  }
};
visitDirectory(sourceRoot);

for (const file of sourceFiles) {
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const reported = new Set();
  const report = (node, value) => {
    if (!shouldReport(value)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const message = `${path.relative(process.cwd(), file)}:${line + 1}: user-visible text is not translated: ${normalize(value)}`;
    if (!reported.has(message)) {
      reported.add(message);
      errors.push(message);
    }
  };
  const reportVisibleExpression = (node) => {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      report(node.head, node.head.text);
      for (const span of node.templateSpans) {
        reportVisibleExpression(span.expression);
        report(span.literal, span.literal.text);
      }
      return;
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
      reportVisibleExpression(node.expression);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      reportVisibleExpression(node.whenTrue);
      reportVisibleExpression(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      if (
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        reportVisibleExpression(node.left);
        reportVisibleExpression(node.right);
      }
    }
  };
  const visibleVariableName =
    /(?:ariaLabel|caption|confirmText|cancelText|description|emptyText|label|message|notice|placeholder|subtitle|title|tooltipText)$/i;
  const walk = (node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    if (ts.isJsxAttribute(node) && translatableAttributes.has(node.name.text) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) report(node, node.initializer.text);
      else if (ts.isJsxExpression(node.initializer)) reportVisibleExpression(node.initializer.expression);
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) reportVisibleExpression(node.expression);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && visibleVariableName.test(node.name.text)) {
      reportVisibleExpression(node.initializer);
    }
    if (ts.isPropertyAssignment(node)) {
      const propertyName = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      if (visibleVariableName.test(propertyName)) reportVisibleExpression(node.initializer);
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (/^(toast\.(success|error|info|warning)|window\.(alert|confirm)|alert|confirm)$/.test(expression)) {
        const first = node.arguments[0];
        reportVisibleExpression(first);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}

if (errors.length) {
  console.error(`i18n validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`i18n validation passed: ${localeFiles.length} locales, ${englishKeys.length} keys, no visible hardcoded copy.`);
