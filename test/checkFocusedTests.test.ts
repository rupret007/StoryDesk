import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const guardPath = resolve("scripts/check-focused-tests.mjs");
const fixtureRoots: string[] = [];

function runGuard(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "storydesk-focused-tests-"));
  fixtureRoots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return spawnSync(process.execPath, [guardPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000
  });
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("focused test guard", () => {
  it.each([
    'describe.only("focused", () => {});',
    'context.only("focused", () => {});',
    'suite.only("focused", () => {});',
    'it.only("focused", () => {});',
    'test.only("focused", () => {});',
    'fit("focused", () => {});',
    'fdescribe("focused", () => {});',
    'test.concurrent.only("focused", async () => {});',
    'it.only.each([1, 2])("focused %i", () => {});',
    'describe.only.each`value\n${1}`("focused", () => {});',
    'test.describe.serial.only("focused", () => {});',
    'test.describe.parallel.only("focused", () => {});',
    'test\n  .only("focused", () => {});',
    'test /* comment */ . /* comment */ only("focused", () => {});',
    'test["only"]("focused", () => {});',
    'suite[`only`]("focused", () => {});'
  ])("rejects executable focus: %s", (source) => {
    const result = runGuard({ "test/example.test.ts": `// fixture\n${source}` });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Focused tests were found.");
    expect(result.stderr).toContain("example.test.ts:2 matched");
  });

  it("accepts ordinary tests and focus examples inside comments and literals", () => {
    const result = runGuard({
      "test/example.test.ts": [
        'test("ordinary", () => {});',
        'describe.each([1, 2])("ordinary", () => {});',
        '// test.only("comment", () => {});',
        '/* fdescribe("comment", () => {}); */',
        'const text = "it.only( and fit(";',
        'const template = `suite.only("example")`;',
        String.raw`const pattern = /test\.only\(/;`,
        'const unrelated = { only() {}, fit() {} };',
        'unrelated.only(); unrelated.fit();'
      ].join("\n")
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No focused tests found.");
    expect(result.stderr).toBe("");
  });

  it("scans all supported source extensions and reports every focus location", () => {
    const files = Object.fromEntries(
      ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"].map((extension) => [
        `test/nested/example.test.${extension}`,
        '// fixture\r\ntest.only("one", () => {});\r\n\r\nfit("two", () => {});'
      ])
    );
    const result = runGuard(files);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    for (const file of Object.keys(files)) {
      expect(result.stderr).toContain(`${file}:2 matched`);
      expect(result.stderr).toContain(`${file}:4 matched`);
    }
  });

  it("ignores dependencies and generated outputs", () => {
    const files = Object.fromEntries(
      [".git", "node_modules", "dist", "dist-electron", "coverage", ".next", "out", "build"].map((dir) => [
        `${dir}/example.test.ts`,
        'test.only("ignored", () => {});'
      ])
    );
    const result = runGuard(files);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("accepts the guard and regression test source", () => {
    const result = runGuard({
      "scripts/check-focused-tests.mjs": readFileSync(guardPath, "utf8"),
      "test/checkFocusedTests.test.ts": readFileSync(resolve("test/checkFocusedTests.test.ts"), "utf8")
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("does not exempt the guard or regression test paths", () => {
    const files = {
      "scripts/check-focused-tests.mjs": 'test.only("focused", () => {});',
      "test/checkFocusedTests.test.ts": 'test.only("focused", () => {});'
    };
    const result = runGuard(files);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    for (const file of Object.keys(files)) {
      expect(result.stderr).toContain(`${file}:1 matched`);
    }
  });
});
