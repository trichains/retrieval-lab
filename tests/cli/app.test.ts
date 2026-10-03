import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run, type Io } from "@/src/cli/app";
import { COLOR, PLAIN, pickStyle, renderTable, truncate, visibleWidth } from "@/src/cli/table";

const root = join(import.meta.dirname, "..", "..");
const tmp = mkdtempSync(join(tmpdir(), "rlab-cli-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function capture(cwd = root): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (t) => stdout.push(t), err: (t) => stderr.push(t), style: PLAIN, cwd };
}

describe("cli", () => {
  it("prints help with exit 0, and with exit 2 when no command is given", async () => {
    const io = capture();
    expect(await run(["--help"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("Commands:");
    expect(await run([], capture())).toBe(2);
  });

  it("rejects unknown commands, options and values with exit 2", async () => {
    for (const argv of [
      ["frobnicate"],
      ["search", "x", "--bogus"],
      ["search", "x", "--retriever", "magic"],
      ["search", "x", "--k", "zero"],
    ]) {
      const io = capture();
      expect(await run(argv, io)).toBe(2);
      expect(io.stderr.join("\n")).toMatch(/--help/);
    }
  });

  it("validates chunker settings", async () => {
    const io = capture();
    expect(await run(["search", "x", "--chunker", "recursive", "--size", "100", "--overlap", "100"], io)).toBe(2);
    expect(io.stderr.join("\n")).toContain("overlap must be smaller than size");
  });

  it("requires a query", async () => {
    expect(await run(["search"], capture())).toBe(2);
  });

  it("returns exit 1 for runtime errors such as a missing corpus", async () => {
    const io = capture();
    expect(await run(["search", "x", "--corpus", "does-not-exist"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("Corpus not found");
  });

  it("searches the bundled dataset and shows the score breakdown", async () => {
    const io = capture();
    expect(await run(["search", "verify webhook signature", "--retriever", "hybrid", "--k", "3"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("hybrid(rrf60)");
    expect(out).toMatch(/bm25\s+vector/);
    expect(out).toContain("webhooks-signature-verification");
  });

  it("prints JSON with --json", async () => {
    const io = capture();
    expect(await run(["search", "rate limit", "--retriever", "bm25", "--json", "--k", "2"], io)).toBe(0);
    const parsed = JSON.parse(io.stdout.join("\n"));
    expect(parsed.hits).toHaveLength(2);
    expect(parsed.config.retriever.type).toBe("bm25");
  });

  it("searches a directory corpus", async () => {
    writeFileSync(join(tmp, "a.md"), "# Alpha\nThe alpha document talks about rockets.");
    writeFileSync(join(tmp, "b.md"), "# Beta\nThe beta document talks about gardens.");
    const io = capture();
    expect(await run(["search", "gardens", "--corpus", tmp, "--retriever", "bm25"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("Beta");
  });

  it("says so when nothing matches", async () => {
    const io = capture();
    expect(await run(["search", "zzzqqq", "--retriever", "bm25"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("No results");
  });

  it("previews chunks", async () => {
    const io = capture();
    expect(await run(["chunk", "datasets/nimbus/docs/rate-limits.md", "--chunker", "markdown", "--preview"], io)).toBe(
      0,
    );
    const out = io.stdout.join("\n");
    expect(out).toMatch(/chunks\s+\d+ from \d+ chars/);
    expect(out).toContain("#0 [0, ");
  });

  it("runs an experiment grid and writes all report formats", async () => {
    const grid = join(tmp, "grid.json");
    writeFileSync(
      grid,
      JSON.stringify({
        chunkers: [{ type: "none" }],
        retrievers: [{ type: "bm25" }, { type: "vector" }],
        bootstrap: { samples: 200 },
      }),
    );
    const out = join(tmp, "reports");
    const io = capture();
    expect(await run(["eval", "--grid", grid, "--out", out], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("ndcg@10 95% CI");
    expect(io.stdout.join("\n")).toContain("paired bootstrap");
    for (const ext of ["md", "json", "csv", "html"])
      expect(readFileSync(join(out, `report.${ext}`), "utf8").length).toBeGreaterThan(50);
  });

  it("reports an invalid grid clearly", async () => {
    const grid = join(tmp, "bad-grid.json");
    writeFileSync(grid, JSON.stringify({ chunkers: [], retrievers: [{ type: "bm25" }] }));
    const io = capture();
    expect(await run(["eval", "--grid", grid], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("Invalid grid");
  });

  it("rejects an unknown report format or metric", async () => {
    expect(await run(["eval", "--format", "pdf"], capture())).toBe(2);
    const grid = join(tmp, "grid-small.json");
    writeFileSync(
      grid,
      JSON.stringify({ chunkers: [{ type: "none" }], retrievers: [{ type: "bm25" }], bootstrap: { samples: 100 } }),
    );
    expect(await run(["eval", "--grid", grid, "--metric", "ndcg@99"], capture())).toBe(2);
  });
});

describe("table rendering", () => {
  it("aligns columns and ignores ANSI codes when measuring", () => {
    const table = renderTable(
      [{ header: "name" }, { header: "n", align: "right" }],
      [
        ["a", "1"],
        [COLOR.bold("bbb"), "22"],
      ],
    );
    const lines = table.split("\n");
    expect(lines[0]).toBe("name   n");
    expect(lines[2]).toBe("a      1");
    expect(visibleWidth(lines[3]!)).toBe(8);
  });

  it("truncates with an ellipsis by code point", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("ação", 4)).toBe("ação");
  });

  it("honours NO_COLOR and FORCE_COLOR", () => {
    expect(pickStyle({ isTTY: true }, { NO_COLOR: "1" })).toBe(PLAIN);
    expect(pickStyle({ isTTY: false }, { FORCE_COLOR: "1" })).toBe(COLOR);
    expect(pickStyle({ isTTY: true }, {})).toBe(COLOR);
    expect(pickStyle({ isTTY: false }, {})).toBe(PLAIN);
  });
});
