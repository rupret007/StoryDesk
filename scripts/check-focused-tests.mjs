#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT_DIR = process.cwd();
const ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
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
const SKIP_FILES = new Set(["scripts/check-focused-tests.mjs"]);

const CHECKS = [
  { pattern: /\b(?:describe|context)\.only\s*\(/g, label: "describe.only(" },
  { pattern: /\b(?:it|test)\.only\s*\(/g, label: "it/test.only(" },
  { pattern: /\bfdescribe\s*\(/g, label: "fdescribe(" },
  { pattern: /\bfit\s*\(/g, label: "fit(" },
];

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

function scanFile(filePath) {
  const relativePath = filePath.replace(`${ROOT_DIR}/`, "");
  if (SKIP_FILES.has(relativePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);

  for (const check of CHECKS) {
    let found;
    while ((found = check.pattern.exec(contents)) !== null) {
      const index = found.index;
      const lineNumber = contents.slice(0, index).split(/\r?\n/).length;
      const line = lines[lineNumber - 1]?.trim() ?? "";
      matches.push({
        filePath,
        lineNumber,
        label: check.label,
        line,
      });
    }
    check.pattern.lastIndex = 0;
  }
}

if (!statSync(ROOT_DIR).isDirectory()) {
  console.error("Current working directory is not a directory.");
  process.exit(2);
}

walk(ROOT_DIR);

if (matches.length > 0) {
  console.error("Focused tests were found. Remove .only/focused patterns:");
  for (const match of matches) {
    const relativePath = match.filePath.replace(`${ROOT_DIR}/`, "");
    console.error(
      `- ${relativePath}:${match.lineNumber} matched ${match.label} -> ${match.line}`
    );
  }
  process.exit(1);
}

console.log("No focused tests found.");
