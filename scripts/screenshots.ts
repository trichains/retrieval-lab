/**
 * Captures the README screenshots from a running app (npm run dev or npm start), as small .webp files.
 *
 *   npm run screenshots                         # docs/img/*.webp from http://localhost:3120
 *   npm run screenshots -- --review <dir>       # full-page PNGs of every view, both languages,
 *                                               # desktop and 375 px, for visual review
 *
 * WebP encoding happens inside Chromium (canvas.toDataURL), so no image library is needed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3120";
const root = join(import.meta.dirname, "..");
const reviewIndex = process.argv.indexOf("--review");
const reviewDir = reviewIndex !== -1 ? process.argv[reviewIndex + 1] : undefined;

const VIEWS = [
  {
    name: "playground",
    path: (locale: string) =>
      `/${locale}?q=${encodeURIComponent("my endpoint keeps receiving the same event twice")}&k=3&rr=lexical`,
    ready: async (page: Page) => {
      await page.getByRole("article").first().waitFor();
    },
  },
  {
    name: "experiments",
    path: (locale: string) => `/${locale}/experiments`,
    ready: async (page: Page) => {
      await page.locator("#results-heading").waitFor({ timeout: 60_000 });
    },
  },
  {
    name: "corpus",
    path: (locale: string) => `/${locale}/corpus?doc=runbook-elevated-5xx&ch=recursive&cs=600&co=150`,
    ready: async (page: Page) => {
      await page.locator("#boundaries-heading").waitFor();
    },
  },
] as const;

async function toWebp(page: Page, png: Buffer, quality = 0.8): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ({ b64, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", q);
    },
    { b64: png.toString("base64"), q: quality },
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

const browser = await chromium.launch();
try {
  if (reviewDir) {
    mkdirSync(reviewDir, { recursive: true });
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["mobile", { width: 375, height: 812 }],
    ] as const) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      for (const locale of ["pt-BR", "en"]) {
        for (const view of VIEWS) {
          await page.goto(`${BASE}${view.path(locale)}`);
          await view.ready(page);
          await page.waitForTimeout(400);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 0) console.warn(`horizontal overflow of ${overflow}px on ${label} ${locale} ${view.name}`);
          const file = join(reviewDir, `${label}-${locale}-${view.name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          console.log(file);
        }
      }
      await context.close();
    }
  } else {
    const outDir = join(root, "docs", "img");
    mkdirSync(outDir, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const scratch = await context.newPage();
    for (const view of VIEWS) {
      await page.goto(`${BASE}${view.path("en")}`);
      await view.ready(page);
      await page.waitForTimeout(500);
      const png = await page.screenshot({ fullPage: false });
      const webp = await toWebp(scratch, png);
      const file = join(outDir, `${view.name}.webp`);
      writeFileSync(file, webp);
      console.log(`${file} (${(webp.length / 1024).toFixed(0)} KB)`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
