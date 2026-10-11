/**
 * Minimal HCL writer. Output is laid out exactly as `tofu fmt` would format it
 * (two-space indent, `=` aligned across consecutive one-line attributes), so
 * `tofu fmt -check` passes and regenerating never produces a diff.
 */

/** A raw HCL expression, written as-is. */
export class Expr {
  constructor(readonly text: string) {}
}

export const expr = (text: string) => new Expr(text);

/** HCL string literal; escapes quotes/backslashes and template sequences. */
export function str(value: string): Expr {
  // Replacer functions, because "$$" in a replacement string means a literal "$".
  const quoted = JSON.stringify(value)
    .replace(/\$\{/g, () => "$${")
    .replace(/%\{/g, () => "%%{");
  return new Expr(quoted);
}

/** Template string; the caller is responsible for the interpolations. */
export function tpl(text: string): Expr {
  return new Expr(`"${text}"`);
}

export type Value = Expr | number | boolean | Value[] | ObjectValue;
export interface ObjectValue {
  [key: string]: Value;
}

export interface Attr {
  kind: "attr";
  key: string;
  value: Value;
}

export interface Block {
  kind: "block";
  type: string;
  labels: string[];
  body: Item[];
}

export interface Blank {
  kind: "blank";
}

export type Item = Attr | Block | Blank;

export const attr = (key: string, value: Value): Attr => ({ kind: "attr", key, value });
export const block = (type: string, labels: string[], body: Item[] = []): Block => ({
  kind: "block",
  type,
  labels,
  body,
});
export const blank: Blank = { kind: "blank" };

function isObjectValue(v: Value): v is ObjectValue {
  return typeof v === "object" && !(v instanceof Expr) && !Array.isArray(v);
}

const pad = (n: number) => "  ".repeat(n);

function renderValue(v: Value, depth: number): string {
  if (v instanceof Expr) return v.text;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => renderValue(x, depth)).join(", ")}]`;
  const entries = Object.entries(v);
  if (entries.length === 0) return "{}";
  return `{\n${renderAttrs(entries.map(([k, x]) => attr(k, x)), depth + 1)}${pad(depth)}}`;
}

function isOneLine(a: Attr): boolean {
  return !(isObjectValue(a.value) && Object.keys(a.value).length > 0);
}

/** Render a run of attributes, aligning `=` within each group of one-liners. */
function renderAttrs(attrs: Attr[], depth: number): string {
  let out = "";
  let i = 0;
  while (i < attrs.length) {
    const group: Attr[] = [attrs[i]!];
    if (isOneLine(attrs[i]!)) {
      while (i + group.length < attrs.length && isOneLine(attrs[i + group.length]!)) {
        group.push(attrs[i + group.length]!);
      }
    }
    // A multi-line attribute still aligns with the one-liners directly above it.
    const next = attrs[i + group.length];
    if (next && !isOneLine(next) && group.every(isOneLine)) group.push(next);

    const width = Math.max(...group.map((a) => a.key.length));
    for (const a of group) {
      out += `${pad(depth)}${a.key.padEnd(width)} = ${renderValue(a.value, depth)}\n`;
    }
    i += group.length;
  }
  return out;
}

function renderBody(items: Item[], depth: number): string {
  let out = "";
  let run: Attr[] = [];
  const flush = () => {
    if (run.length) out += renderAttrs(run, depth);
    run = [];
  };
  for (const item of items) {
    if (item.kind === "attr") {
      run.push(item);
      continue;
    }
    flush();
    out += item.kind === "blank" ? "\n" : renderBlock(item, depth);
  }
  flush();
  return out;
}

export function renderBlock(b: Block, depth = 0): string {
  const head = [b.type, ...b.labels.map((l) => JSON.stringify(l))].join(" ");
  if (b.body.length === 0) return `${pad(depth)}${head} {}\n`;
  return `${pad(depth)}${head} {\n${renderBody(b.body, depth + 1)}${pad(depth)}}\n`;
}

export function renderFile(blocks: Block[], header?: string): string {
  const parts = blocks.map((b) => renderBlock(b));
  return (header ? `${header}\n\n` : "") + parts.join("\n");
}
