"use client";

import { useId, useState } from "react";
import {
  dedupeIds,
  documentFromText,
  documentsFromJsonl,
  documentsFromPastedText,
  parseDataset,
  type Dataset,
  type DatasetDocument,
} from "@/src/core";
import { useCorpus } from "@/lib/corpus-store";
import { useDict } from "@/lib/locale-context";
import { Button, Eyebrow, Notice, Panel } from "../ui";

const MAX_TOTAL_CHARS = 5_000_000;

/** Reads files and pasted text into documents, entirely in the browser. */
export async function readCorpusInput(
  pasted: string,
  files: readonly File[],
): Promise<{ docs: DatasetDocument[]; dataset: Dataset | null; errors: string[] }> {
  const docs: DatasetDocument[] = [];
  const errors: string[] = [];
  let dataset: Dataset | null = null;
  if (pasted.trim()) docs.push(...documentsFromPastedText(pasted));
  for (const file of files) {
    const name = file.name;
    try {
      const text = await file.text();
      if (/\.jsonl$/i.test(name)) docs.push(...documentsFromJsonl(text, name));
      else if (/\.json$/i.test(name)) {
        const parsed = parseDataset(JSON.parse(text));
        if (!parsed.ok) errors.push(`${name}: ${parsed.errors.slice(0, 3).join("; ")}`);
        else {
          dataset = parsed.dataset;
          docs.push(...parsed.dataset.documents);
        }
      } else docs.push(documentFromText(text, name));
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const total = docs.reduce((s, d) => s + d.text.length, 0);
  if (total > MAX_TOTAL_CHARS) errors.push(`> ${MAX_TOTAL_CHARS.toLocaleString()} chars`);
  // A dataset keeps its judgments only when it is the whole input.
  const onlyDataset = dataset !== null && docs.length === (dataset as Dataset).documents.length;
  return { docs: dedupeIds(docs), dataset: onlyDataset ? dataset : null, errors };
}

export function BringYourOwn() {
  const dict = useDict();
  const { setCustom } = useCorpus();
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pasteId = useId();
  const fileId = useId();

  async function apply() {
    setErrors([]);
    if (!pasted.trim() && files.length === 0) {
      setErrors([dict.corpus.emptyInput]);
      return;
    }
    setBusy(true);
    const { docs, dataset, errors: found } = await readCorpusInput(pasted, files);
    setBusy(false);
    if (found.length > 0) {
      setErrors(found.map((e) => `${dict.corpus.parseError} ${e}`));
      return;
    }
    if (docs.length === 0) {
      setErrors([dict.corpus.emptyInput]);
      return;
    }
    setCustom(dataset?.name ?? files[0]?.name ?? "pasted", docs, dataset);
    setPasted("");
    setFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="byo-heading">
      <Eyebrow id="byo-heading">{dict.corpus.byo}</Eyebrow>
      <p className="mt-1 flex items-center gap-2 text-[0.82rem] text-muted">
        <svg
          viewBox="0 0 16 16"
          className="size-4 shrink-0 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
        </svg>
        {dict.corpus.byoPrivacy}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={pasteId} className="mb-1 block text-[0.8rem] font-medium text-muted">
            {dict.corpus.paste}
          </label>
          <textarea
            id={pasteId}
            className="field h-36 font-mono text-[0.78rem]"
            placeholder={dict.corpus.pastePlaceholder}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={fileId} className="mb-1 block text-[0.8rem] font-medium text-muted">
            {dict.corpus.files}
          </label>
          <input
            id={fileId}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.jsonl,.json,text/plain,text/markdown,application/json"
            className="block w-full text-[0.8rem] text-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-raised file:px-3 file:py-1.5 file:text-fg"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[0.72rem] text-faint">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`}>
                  {f.name} · {(f.size / 1024).toFixed(1)} KB
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {errors.length > 0 && (
        <div className="mt-3">
          <Notice tone="danger">
            {errors.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
          </Notice>
        </div>
      )}
      <div className="mt-4">
        <Button onClick={() => void apply()} disabled={busy}>
          {dict.corpus.use}
        </Button>
      </div>
    </Panel>
  );
}
