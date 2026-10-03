/**
 * Compiles the authoring files of the bundled dataset (datasets/nimbus/docs/*.md and queries.json)
 * into datasets/nimbus.json, the single file the CLI, the tests and the web UI load.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDatasetFromSource } from "../src/cli/corpus";
import { NIMBUS_DESCRIPTION } from "./dataset-meta";

const root = join(import.meta.dirname, "..");
const dataset = buildDatasetFromSource(join(root, "datasets", "nimbus"), "nimbus", NIMBUS_DESCRIPTION);
const out = join(root, "datasets", "nimbus.json");
writeFileSync(out, `${JSON.stringify(dataset, null, 1)}\n`);
console.log(
  `Wrote ${out}: ${dataset.documents.length} documents, ${dataset.queries.length} queries, ${dataset.judgments.length} judgments`,
);
