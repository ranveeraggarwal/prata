import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const SHEET_URL = "https://docs.google.com/spreadsheets/d/1SampleSheetIdForPrataTests_0123456789abc/edit";

/** Answers the app's Google Sheets requests with the sample Sheet in fixtures/. */
export async function serveSampleSheet(page: Page, overrides: Record<string, string> = {}) {
  await page.route("https://docs.google.com/spreadsheets/**", async (route) => {
    const tab = new URL(route.request().url()).searchParams.get("sheet") ?? "texts";
    const body =
      overrides[tab] ?? readFileSync(path.join(__dirname, "../../fixtures/sample-sheet", `${tab}.csv`), "utf8");
    await route.fulfill({ status: 200, contentType: "text/csv", body, headers: { "access-control-allow-origin": "*" } });
  });
}

/** Connects the sample Sheet and picks a level, as a new user would. */
export async function setUp(page: Page, level = "Nivå 1") {
  await serveSampleSheet(page);
  await page.goto("/start/");
  await page.getByLabel("Google Sheet link").fill(SHEET_URL);
  await page.getByRole("button", { name: "Hämta materialet" }).click();
  await page.getByRole("heading", { name: "Hitta din nivå" }).waitFor();
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("heading", { name: "Dagens pass" }).waitFor();
}
