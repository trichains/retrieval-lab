import { z } from "zod";

/**
 * An evaluation dataset: documents, queries and graded relevance judgments (qrels).
 * Grades: 0 = not relevant, 1 = related, 2 = relevant, 3 = answers it fully. Anything not judged is 0.
 */
export const DocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  text: z.string().min(1),
  lang: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const QuerySchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  lang: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const JudgmentSchema = z.object({
  queryId: z.string().min(1),
  docId: z.string().min(1),
  grade: z.number().int().min(0).max(3),
});

export const DatasetSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    documents: z.array(DocumentSchema).min(1),
    queries: z.array(QuerySchema).min(1),
    judgments: z.array(JudgmentSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const docIds = new Set<string>();
    data.documents.forEach((d, i) => {
      if (docIds.has(d.id)) issue(`duplicate document id "${d.id}"`, ["documents", i, "id"]);
      docIds.add(d.id);
    });
    const queryIds = new Set<string>();
    data.queries.forEach((q, i) => {
      if (queryIds.has(q.id)) issue(`duplicate query id "${q.id}"`, ["queries", i, "id"]);
      queryIds.add(q.id);
    });
    const pairs = new Set<string>();
    const withRelevant = new Set<string>();
    data.judgments.forEach((j, i) => {
      if (!queryIds.has(j.queryId)) issue(`unknown query id "${j.queryId}"`, ["judgments", i, "queryId"]);
      if (!docIds.has(j.docId)) issue(`unknown document id "${j.docId}"`, ["judgments", i, "docId"]);
      const pair = `${j.queryId}\u0000${j.docId}`;
      if (pairs.has(pair)) issue(`duplicate judgment for ${j.queryId} / ${j.docId}`, ["judgments", i]);
      pairs.add(pair);
      if (j.grade > 0) withRelevant.add(j.queryId);
    });
    data.queries.forEach((q, i) => {
      if (!withRelevant.has(q.id)) issue(`query "${q.id}" has no relevant document (grade > 0)`, ["queries", i]);
    });
  });

export type Dataset = z.infer<typeof DatasetSchema>;
export type DatasetDocument = z.infer<typeof DocumentSchema>;
export type DatasetQuery = z.infer<typeof QuerySchema>;
export type Judgment = z.infer<typeof JudgmentSchema>;

/** docId -> grade, for one query. Only grades > 0 are stored. */
export type Qrels = ReadonlyMap<string, number>;

export function qrelsByQuery(dataset: Dataset): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const j of dataset.judgments) {
    if (j.grade <= 0) continue;
    let map = out.get(j.queryId);
    if (!map) out.set(j.queryId, (map = new Map()));
    map.set(j.docId, j.grade);
  }
  return out;
}

/** Validation with readable, path-prefixed messages (for the CLI and the upload form). */
export function parseDataset(input: unknown): { ok: true; dataset: Dataset } | { ok: false; errors: string[] } {
  const result = DatasetSchema.safeParse(input);
  if (result.success) return { ok: true, dataset: result.data };
  return {
    ok: false,
    errors: result.error.issues.slice(0, 20).map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`),
  };
}
