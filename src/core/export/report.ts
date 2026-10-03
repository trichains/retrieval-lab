import { rankConfigs, type ConfigResult, type ExperimentResult } from "../eval/experiment";

/** Metrics shown in compact tables: nDCG and recall at every cutoff, then MRR and MAP. */
export function summaryMetricKeys(result: ExperimentResult): string[] {
  return result.metricKeys.filter((k) => /^(ndcg|recall|mrr|map)@/.test(k));
}

const fmt = (n: number | undefined, digits = 3) => (n === undefined || Number.isNaN(n) ? "" : n.toFixed(digits));

// ------------------------------------------------------------------ JSON

export function toJson(result: ExperimentResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

// ------------------------------------------------------------------ CSV

/** RFC 4180 quoting: wrap in quotes when needed, double any embedded quote. */
export function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per configuration: every metric mean plus the lower/upper bound of its 95% CI. */
export function toCsv(result: ExperimentResult): string {
  const header = ["config", "chunks", ...result.metricKeys.flatMap((k) => [k, `${k}_ci_low`, `${k}_ci_high`])];
  const rows = result.configs.map((c) => [
    c.label,
    c.chunkCount,
    ...result.metricKeys.flatMap((k) => [fmt(c.metrics[k], 4), fmt(c.ci[k]?.[0], 4), fmt(c.ci[k]?.[1], 4)]),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ Markdown

function mdEscape(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** A GitHub-flavoured markdown table, best configuration first by the primary metric. */
export function toMarkdown(result: ExperimentResult): string {
  const keys = summaryMetricKeys(result);
  const primary = result.primaryMetric;
  const header = ["#", "configuration", "chunks", ...keys.map((k) => (k === primary ? `**${k}** (95% CI)` : k))];
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map((_, i) => (i <= 1 ? "---" : "---:")).join(" | ")} |`];
  rankConfigs(result).forEach((c, i) => {
    const cells = keys.map((k) => {
      const value = fmt(c.metrics[k]);
      const ci = c.ci[k];
      return k === primary && ci ? `**${value}** (${fmt(ci[0])}–${fmt(ci[1])})` : value;
    });
    lines.push(`| ${[String(i + 1), mdEscape(c.label), String(c.chunkCount), ...cells].join(" | ")} |`);
  });
  return `${lines.join("\n")}\n`;
}

// ------------------------------------------------------------------ HTML

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function barChart(configs: readonly ConfigResult[], metric: string): string {
  const rowH = 26;
  const labelW = 300;
  const plotW = 420;
  const height = configs.length * rowH + 30;
  const x = (v: number) => labelW + Math.max(0, Math.min(1, v)) * plotW;
  const rows = configs
    .map((c, i) => {
      const y = i * rowH + 8;
      const v = c.metrics[metric] ?? 0;
      const [lo, hi] = c.ci[metric] ?? [v, v];
      return `<g><text x="${labelW - 8}" y="${y + 13}" text-anchor="end">${escapeHtml(c.label)}</text>
<rect x="${labelW}" y="${y + 2}" width="${(x(v) - labelW).toFixed(1)}" height="14" rx="2" class="bar"/>
<line x1="${x(lo).toFixed(1)}" x2="${x(hi).toFixed(1)}" y1="${y + 9}" y2="${y + 9}" class="ci"/>
<text x="${(x(hi) + 6).toFixed(1)}" y="${y + 13}" class="val">${fmt(v)}</text></g>`;
    })
    .join("\n");
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => `<text x="${x(t)}" y="${height - 4}" text-anchor="middle" class="tick">${t}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${labelW + plotW + 60} ${height}" role="img" aria-label="${escapeHtml(metric)} by configuration, with 95% confidence intervals">${rows}${ticks}</svg>`;
}

export interface HtmlReportOptions {
  title?: string;
  /** Query id -> query text, to make the failure list readable. */
  queryText?: ReadonlyMap<string, string>;
  /** Shown in the footer, e.g. an ISO date. Omitted by default to keep reports reproducible. */
  generatedAt?: string;
}

/** A single self-contained HTML file: no scripts, no external assets. */
export function toHtml(result: ExperimentResult, options: HtmlReportOptions = {}): string {
  const title = options.title ?? `Retrieval Lab report: ${result.dataset.name}`;
  const ranked = rankConfigs(result);
  const keys = summaryMetricKeys(result);
  const best = ranked[0];
  const tableRows = ranked
    .map(
      (c, i) =>
        `<tr><td>${i + 1}</td><td class="cfg">${escapeHtml(c.label)}</td><td>${c.chunkCount}</td>${keys
          .map((k) => `<td>${fmt(c.metrics[k])}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  const failures = best
    ? best.perQuery
        .filter((q) => q.diagnosis.kind !== "ok")
        .map((q) => {
          const text = options.queryText?.get(q.queryId) ?? q.queryId;
          const rel = q.relevant.map((r) => `${escapeHtml(r.docId)} (g${r.grade}, rank ${r.rank ?? "–"})`).join(", ");
          return `<li><strong>${escapeHtml(text)}</strong> <span class="tag">${q.diagnosis.kind}</span><br><small>relevant: ${rel}</small></li>`;
        })
        .join("\n")
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;padding:24px;background:#0d1114;color:#d8dee4;font:14px/1.5 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;color:#9fb3c2}
p.meta{color:#8a99a6;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font:12px/1.4 ui-monospace,monospace}
th,td{padding:6px 8px;border-bottom:1px solid #222b32;text-align:right}
th:nth-child(2),td.cfg{text-align:left}
th{color:#8a99a6;font-weight:500}
.wrap{overflow-x:auto}
svg{width:100%;height:auto;font:11px ui-monospace,monospace;fill:#c7d0d8}
.bar{fill:#4fb6a5}.ci{stroke:#e6edf3;stroke-width:1.5}.val{fill:#e6edf3}.tick{fill:#6c7b88}
li{margin:0 0 8px}.tag{font:11px ui-monospace,monospace;color:#4fb6a5}
small{color:#8a99a6}
</style>
</head>
<body><main>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${result.dataset.documents} documents · ${result.dataset.queries} queries · ${result.configs.length} configurations · aggregation: ${result.grid.aggregation} · bootstrap: ${result.grid.bootstrap.samples} resamples, seed ${result.grid.bootstrap.seed}</p>
<h2>${escapeHtml(result.primaryMetric)} with 95% bootstrap confidence intervals</h2>
<div class="wrap">${barChart(ranked, result.primaryMetric)}</div>
<h2>All configurations</h2>
<div class="wrap"><table>
<thead><tr><th>#</th><th>configuration</th><th>chunks</th>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>
<tbody>
${tableRows}
</tbody></table></div>
${best ? `<h2>Queries the best configuration (${escapeHtml(best.label)}) did not rank first</h2>\n<ul>${failures || "<li>None.</li>"}</ul>` : ""}
<p class="meta">Generated by retrieval-lab${options.generatedAt ? ` on ${escapeHtml(options.generatedAt)}` : ""}. Results on a small dataset are noisy: read the intervals, not just the means.</p>
</main></body></html>
`;
}
