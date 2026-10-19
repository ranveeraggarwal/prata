import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serveSampleSheet, setUp, SHEET_URL } from "./helpers";

test("first visit: connect the Sheet and take the placement tests", async ({ page }) => {
  await serveSampleSheet(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Kom igång" }).click();
  await page.getByLabel("Google Sheet link").fill(SHEET_URL);
  await page.getByRole("button", { name: "Hämta materialet" }).click();

  await page.getByRole("link", { name: "Gör nivåtestet" }).click();
  await expect(page.getByRole("heading", { name: "Placement test 1 (sample)" })).toBeVisible();
  await page.getByRole("radio", { name: "dina" }).check();
  await page.getByRole("radio", { name: "döttrar" }).check();
  await page.getByRole("radio", { name: "svara", exact: true }).check();
  await page.getByLabel("Svar 4").fill("för");
  await page.getByRole("button", { name: "Lämna in" }).click();
  await expect(page.getByText("4 / 4")).toBeVisible();

  await page.getByRole("button", { name: "Till test 2" }).click();
  await page.getByRole("radio", { name: "hit" }).check();
  await page.getByRole("radio", { name: "yngre" }).check();
  await page.getByRole("button", { name: "Lämna in" }).click();
  await expect(page.getByText("Du börjar på Nivå 3.")).toBeVisible();

  await page.getByRole("link", { name: "Till startsidan" }).click();
  await expect(page.getByText(/^Nivå 3 · /)).toBeVisible();
  await expect(page.getByText("Hitta min nivå")).toHaveCount(0);
});

test("sync problems are shown before moving on", async ({ page }) => {
  await serveSampleSheet(page, { prompts: readFileSync("fixtures/sample-sheet/texts.csv", "utf8") });
  await page.goto("/start/");
  await page.getByLabel("Google Sheet link").fill(SHEET_URL);
  await page.getByRole("button", { name: "Hämta materialet" }).click();
  await expect(page.getByText('Tab "prompts" was not found.')).toBeVisible();
  await page.getByRole("link", { name: "Fortsätt ändå" }).click();
  await expect(page.getByRole("heading", { name: "Hitta din nivå" })).toBeVisible();
});

test("settings: the saved link can be synced again", async ({ page }) => {
  await setUp(page);
  await page.goto("/installningar/");
  await expect(page.getByLabel("Google Sheet link")).toHaveValue(SHEET_URL);
  const sync = page.getByRole("button", { name: "Hämta materialet" });
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect(sync).toHaveText("Hämta materialet");
  await expect(page.getByText(/4 texter · 7 kort/)).toBeVisible();
});

test("the library opens at the learner's level", async ({ page }) => {
  await setUp(page, "Nivå 3");
  await page.goto("/las/");
  await expect(page.getByRole("tab", { name: "Nivå 3" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("En vecka i fjällen")).toBeVisible();
});

test("a private Sheet gets the sharing hint, not just 'Failed to fetch'", async ({ page }) => {
  for (const mode of ["blocked", "refused"] as const) {
    await page.route("https://docs.google.com/spreadsheets/**", (route) =>
      mode === "blocked" ? route.abort("failed") : route.fulfill({ status: 401, contentType: "text/html", body: "<html>Sign in</html>" }),
    );
    await page.goto("/start/");
    await page.getByLabel("Google Sheet link").fill(SHEET_URL);
    await page.getByRole("button", { name: "Hämta materialet" }).click();
    await expect(page.getByText(/Anyone with the link → Viewer/).last()).toBeVisible();
    await expect(page.getByText(/Failed to fetch/)).toHaveCount(0);
    await page.unroute("https://docs.google.com/spreadsheets/**");
  }
});

test("the setup steps tell people to share the Sheet by link", async ({ page }) => {
  await page.goto("/start/");
  await expect(page.getByText("Anyone with the link").first()).toBeVisible();
  await expect(page.getByText(/Publish to web/)).toHaveCount(0);
});

test("a pasted Publish-to-web link gets a clear explanation", async ({ page }) => {
  await page.goto("/start/");
  await page.getByLabel("Google Sheet link").fill("https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc/pubhtml");
  await page.getByRole("button", { name: "Hämta materialet" }).click();
  await expect(page.getByText(/Publish to web" link/)).toBeVisible();
});

test("review session: typed answers, word order and self-check, kept after reload", async ({ page }) => {
  await setUp(page, "Nivå 2");
  await page.goto("/installningar/");
  await page.getByLabel("Nya kort per dag").selectOption("30");
  await page.goto("/");
  await page.getByRole("link", { name: /Repetera/ }).click();
  await expect(page.getByText("13 kvar")).toBeVisible();

  // The queue alternates cards and exercises, easiest level first.
  await expect(page.getByText("to wake up")).toBeVisible();
  await page.getByLabel("Ditt svar").fill("vakna");
  await page.getByRole("button", { name: "Kontrollera" }).click();
  await expect(page.getByText("Rätt!")).toBeVisible();
  await expect(page.getByText("Jag vaknar tidigt.")).toBeVisible();
  await page.getByRole("button", { name: "Nästa" }).click();

  await expect(page.getByText("Boken ligger ___ bordet.")).toBeVisible();
  await page.getByLabel("Ditt svar").fill("under");
  await page.getByRole("button", { name: "Kontrollera" }).click();
  await expect(page.getByText("Inte riktigt.")).toBeVisible();
  await expect(page.getByText("Svar: på")).toBeVisible();
  await page.getByRole("button", { name: "Nästa" }).click();

  await expect(page.getByText("a sandwich")).toBeVisible();
  await page.getByLabel("Ditt svar").fill("smorgas");
  await page.getByRole("button", { name: "Kontrollera" }).click();
  await expect(page.getByText("Nästan! Kolla å, ä och ö.")).toBeVisible();
  await page.getByRole("button", { name: "Nästa" }).click();

  // Skip forward to the word-order exercise.
  for (let i = 0; i < 12; i++) {
    if (await page.getByText("Ordföljd").isVisible()) break;
    const input = page.getByLabel("Ditt svar");
    if (await page.getByRole("button", { name: "Visa svar" }).isVisible()) {
      await page.getByRole("button", { name: "Visa svar" }).click();
      await page.getByRole("button", { name: "Bra" }).click();
      continue;
    }
    if (await page.getByRole("button", { name: "Klar" }).isVisible()) {
      await page.getByRole("button", { name: "Klar" }).click();
      await page.getByRole("button", { name: "Bra" }).click();
      continue;
    }
    await input.fill("x");
    await page.getByRole("button", { name: "Kontrollera" }).click();
    await page.getByRole("button", { name: "Nästa" }).click();
  }
  await expect(page.getByText("Idag ___")).toBeVisible();
  for (const tile of ["jag", "äter", "glass."]) await page.getByRole("button", { name: tile, exact: true }).click();
  await page.getByRole("button", { name: "Kontrollera" }).click();
  await expect(page.getByText("Inte riktigt.")).toBeVisible();
  await expect(page.getByText("Verbet kommer på andra plats.")).toBeVisible();

  await page.goto("/ova/");
  const before = await page.getByText(/saker i repetitionen/).textContent();
  expect(Number(before!.match(/\d+/)![0])).toBeGreaterThanOrEqual(4);
  await page.reload();
  await expect(page.getByText(before!)).toBeVisible();
});

test("reading: look up and save a word, answer questions, mark as read", async ({ page }) => {
  await setUp(page);
  await page.getByRole("link", { name: /Läs/ }).first().click();
  await expect(page.getByRole("heading", { name: "En vanlig morgon" })).toBeVisible();

  await page.locator("[data-w='cyklar']").click();
  await expect(page.getByRole("dialog")).toContainText("cycles");
  await expect(page.getByRole("dialog")).toContainText("(cykla)");
  await page.getByRole("button", { name: "Spara ordet" }).click();
  await expect(page.getByRole("button", { name: "Sparat i Öva ✓" })).toBeDisabled();
  await page.getByRole("button", { name: "Stäng" }).click();

  await page.getByRole("button", { name: "Med cykel" }).click();
  await page.getByRole("button", { name: "Markera som läst" }).click();
  await expect(page.getByText("Läst ✓")).toBeVisible();

  await page.goto("/las/");
  await expect(page.getByText("1 av 1 lästa på den här nivån")).toBeVisible();
  await page.goto("/ova/");
  await expect(page.getByText(/1 sparade ord/)).toBeVisible();

  // Saved words come first in the next review.
  await page.getByRole("link", { name: "Starta" }).click();
  await expect(page.getByText("Sparat ord")).toBeVisible();
  await expect(page.getByText("cycles")).toBeVisible();
});

test("writing: draft, target words, checklist, history and review card", async ({ page }) => {
  await setUp(page);
  await page.getByRole("link", { name: /Skriv/ }).first().click();
  await expect(page.getByRole("heading", { name: "Min semester" })).toBeVisible();

  const box = page.getByLabel("Din text");
  await box.fill("I somras åkte jag till Göteborg. Jag var glad hela tiden.");
  await expect(page.getByText("11 ord")).toBeVisible();
  await expect(page.locator("span", { hasText: /^glad ✓$/ })).toBeVisible();

  // The draft survives a reload.
  await page.reload();
  await expect(page.getByLabel("Din text")).toHaveValue(/Göteborg/);

  await page.getByRole("button", { name: "Klar – gå igenom checklistan" }).click();
  await page.getByRole("button", { name: /preteritum/ }).click();
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText(/1 punkt att öva på har lagts till i Öva/)).toBeVisible();

  await page.goto("/skriv/");
  await expect(page.getByText("1 texter skrivna")).toBeVisible();
  await page.getByText("Min semester").last().click();
  await expect(page.getByText("Att tänka på: Har du rätt form av verbet (preteritum)?")).toBeVisible();

  await page.goto("/ova/pass/");
  await expect(page.getByText("Från din skrivning")).toBeVisible();
  await expect(page.getByText(/tänk på: Har du rätt form av verbet/)).toBeVisible();
});

test("checkpoint test moves the learner up a level", async ({ page }) => {
  await setUp(page);
  await page.goto("/ova/");
  await page.getByRole("link", { name: /Checkpoint nivå 1/ }).click();
  await page.getByRole("radio", { name: "kommer du" }).check();
  await page.getByRole("radio", { name: "äter" }).check();
  await page.getByRole("button", { name: "Lämna in" }).click();
  await expect(page.getByText("Godkänt! Du är nu på Nivå 2.")).toBeVisible();
  await page.goto("/ova/");
  await expect(page.getByRole("link", { name: /Checkpoint nivå 1/ })).toContainText("100%");
});

test("backup: export, delete everything, import", async ({ page }) => {
  await setUp(page, "Nivå 2");
  await page.goto("/skriv/uppgift/?id=brev");
  await page.getByLabel("Din text").fill("Hej Sara! Den här veckan har jag jobbat mycket.");
  await page.getByRole("button", { name: "Klar – gå igenom checklistan" }).click();
  await page.getByRole("button", { name: "Spara" }).click();

  await page.goto("/installningar/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Spara backup" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(JSON.parse(readFileSync(file!, "utf8")).format).toBe("prata-progress");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Radera all progress" }).click();
  await expect(page.getByText("Progress deleted.")).toBeVisible();
  await page.goto("/skriv/");
  await expect(page.getByText("0 texter skrivna")).toBeVisible();

  await page.goto("/installningar/");
  await page.locator("input[type=file]").setInputFiles(file!);
  await expect(page.getByText("Progress restored.")).toBeVisible();
  await page.goto("/skriv/");
  await expect(page.getByText("1 texter skrivna")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/^Nivå 2 · /)).toBeVisible();
});
