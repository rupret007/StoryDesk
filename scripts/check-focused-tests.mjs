#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const ROOT_DIR = process.cwd();
const ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "coverage",
  ".next",
  "out",
  "build",
]);
const TEST_FUNCTIONS = new Set(["describe", "context", "suite", "it", "test"]);
const FOCUSED_FUNCTIONS = new Set(["fdescribe", "fit"]);

const matches = [];

function walk(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!ALLOWED_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }

    scanFile(fullPath);
  }
}

function callChain(node) {
  if (ts.isIdentifier(node)) {
    return [node.text];
  }
  if (ts.isParenthesizedExpression(node) || ts.isCallExpression(node)) {
    return callChain(node.expression);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return [...callChain(node.expression), node.name.text];
  }
  if (ts.isElementAccessExpression(node)) {
    const property = node.argumentExpression;
    if (ts.isStringLiteral(property) || ts.isNoSubstitutionTemplateLiteral(property)) {
      return [...callChain(node.expression), property.text];
    }
  }
  return [];
}

function scanFile(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  const source = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest);

  function visit(node) {
    let label;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      // Inspect the focus modifier itself so chains such as only.each are covered.
      // Parsing keeps examples in comments and string literals out of the check.
      const chain = callChain(node);
      if (TEST_FUNCTIONS.has(chain[0]) && chain.at(-1) === "only") {
        label = chain.join(".");
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (FOCUSED_FUNCTIONS.has(node.expression.text)) {
        label = `${node.expression.text}(`;
      }
    }

    if (label) {
      const lineNumber = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      matches.push({
        filePath,
        lineNumber,
        label,
        line: lines[lineNumber - 1]?.trim() ?? "",
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (!statSync(ROOT_DIR).isDirectory()) {
  console.error("Current working directory is not a directory.");
  process.exit(2);
}

walk(ROOT_DIR);

if (matches.length > 0) {
  console.error("Focused tests were found. Remove .only/focused patterns:");
  for (const match of matches) {
    const relativePath = relative(ROOT_DIR, match.filePath);
    console.error(
      `- ${relativePath}:${match.lineNumber} matched ${match.label} -> ${match.line}`
    );
  }
  process.exit(1);
}

console.log("No focused tests found.");
