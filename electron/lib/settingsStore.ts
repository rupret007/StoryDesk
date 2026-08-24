import fs from "node:fs";
import path from "node:path";

export class SettingsStore<T extends object> {
  constructor(
    private readonly filePath: string,
    private readonly defaults: T
  ) {}

  read(): T {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<T>;
      return deepMerge(this.defaults, parsed);
    } catch {
      return this.defaults;
    }
  }

  write(settings: T): T {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
    return settings;
  }
}

function deepMerge<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides)) {
    const defaultValue = (defaults as Record<string, unknown>)[key];
    if (isPlainObject(defaultValue) && isPlainObject(value)) {
      result[key] = deepMerge(defaultValue, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
