import { expect, test, type Page } from "@playwright/test";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("playground", () => {
  test("redirects / to Portuguese and searches the bundled corpus", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt-BR/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    const query = page.getByLabel("Consulta", { exact: true });
    await query.fill("rotate API key grace period");
    await expect(page.getByRole("article").first()).toContainText(/key/i);
    await expect(page.getByText("Consulta julgada no dataset")).toBeVisible();
    await expect(page).toHaveURL(/q=rotate\+API\+key/);
  });

  test("strategy changes are reflected in the URL and survive a language switch", async ({ page }) => {
    await page.goto("/pt-BR?q=webhook+signature");
    await page.getByText("BM25", { exact: true }).first().click();
    await expect(page).toHaveURL(/r=bm25/);
    const firstResult = page.getByRole("article").first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult.getByText("Vetor (cosseno)")).toHaveCount(0);
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(/\/en\?.*r=bm25/);
    await expect(page.getByLabel("Query", { exact: true })).toHaveValue("webhook signature");
  });

  test("shows a helpful message when nothing matches", async ({ page }) => {
    await page.goto("/en?q=zzqqxx&r=bm25");
    await expect(page.getByText(/No results/)).toBeVisible();
  });
});

test.describe("experiments", () => {
  test("runs the default grid in the browser and drills into a query", async ({ page }) => {
    await page.goto("/en/experiments");
    await expect(page.locator("#results-heading")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(20);
    await expect(page.getByText(/distinguishable from noise|Pick two different/).first()).toBeVisible();
    await page
      .getByRole("button", { name: /^q\d+ · / })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Query detail" })).toBeVisible();
    await expect(page).toHaveURL(/q=q\d+/);
  });

  test("switching the metric re-sorts the table", async ({ page }) => {
    await page.goto("/en/experiments?m=recall%405");
    await expect(page.locator("#results-heading")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Metric")).toHaveValue("recall@5");
  });
});

test.describe("corpus", () => {
  test("shows chunk boundaries and reacts to chunker settings", async ({ page }) => {
    await page.goto("/en/corpus?doc=deployments-guide&ch=recursive&cs=500&co=0");
    const stats = page.getByText(/\d+ chunks · min/);
    const before = await stats.textContent();
    await page.getByLabel("Size").fill("1500");
    await page.getByLabel("Size").press("Enter");
    await expect(stats).not.toHaveText(before ?? "");
    await expect(page).toHaveURL(/cs=1500/);
  });

  test("bring your own corpus stays in the browser and feeds the playground", async ({ page }) => {
    await page.goto("/en/corpus");
    await page
      .getByLabel("Paste text")
      .fill("# Penguin care\nPenguins need cold water and fish.\n---\n# Cactus care\nCacti need sun and little water.");
    await page.getByRole("button", { name: "Use this corpus" }).click();
    await expect(page.getByText("Using your corpus: 2 documents.")).toBeVisible();
    await page.getByRole("link", { name: "Playground" }).click();
    await page.getByLabel("Query", { exact: true }).fill("penguins fish");
    await expect(page.getByRole("article").first()).toContainText("Penguin care");
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const path of ["/pt-BR", "/en/experiments", "/pt-BR/corpus"]) {
    test(`no horizontal page scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.locator("main").waitFor();
      if (path.includes("experiments")) await page.locator("#results-heading").waitFor({ timeout: 60_000 });
      await page.waitForTimeout(300);
      await noHorizontalScroll(page);
    });
  }
});
