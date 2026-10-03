export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  accent(s: string): string;
  good(s: string): string;
  bad(s: string): string;
}

const ansi = (code: number, reset: number) => (s: string) => `\u001b[${code}m${s}\u001b[${reset}m`;

export const COLOR: Style = {
  bold: ansi(1, 22),
  dim: ansi(2, 22),
  accent: ansi(36, 39),
  good: ansi(32, 39),
  bad: ansi(31, 39),
};

const id = (s: string) => s;
export const PLAIN: Style = { bold: id, dim: id, accent: id, good: id, bad: id };

/** Colors only on a TTY, never with NO_COLOR, always with FORCE_COLOR. */
export function pickStyle(stream: { isTTY?: boolean }, env: Record<string, string | undefined>): Style {
  if (env.NO_COLOR) return PLAIN;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return COLOR;
  return stream.isTTY ? COLOR : PLAIN;
}

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Display width: ignores ANSI codes, counts code points. */
export function visibleWidth(s: string): number {
  return Array.from(s.replace(ANSI_PATTERN, "")).length;
}

function pad(s: string, width: number, align: "left" | "right"): string {
  const gap = " ".repeat(Math.max(0, width - visibleWidth(s)));
  return align === "right" ? gap + s : s + gap;
}

export interface Column {
  header: string;
  align?: "left" | "right";
}

/** A plain text table with a header rule. Cells may contain ANSI codes. */
export function renderTable(
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
  style: Style = PLAIN,
): string {
  const widths = columns.map((c, i) => Math.max(visibleWidth(c.header), ...rows.map((r) => visibleWidth(r[i] ?? ""))));
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, i) => pad(cell, widths[i]!, columns[i]!.align ?? "left"))
      .join("  ")
      .trimEnd();
  return [
    style.bold(line(columns.map((c) => c.header))),
    style.dim(widths.map((w) => "─".repeat(w)).join("  ")),
    ...rows.map(line),
  ].join("\n");
}

/** Truncates to `max` visible characters with an ellipsis. Expects text without ANSI codes. */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}

/** Collapses whitespace so multi-line snippets fit on one table row. */
export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
