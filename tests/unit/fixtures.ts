import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, TAB_NAMES, type Tables } from "@/lib/sheets";

export function sampleTables(): Tables {
  const tables: Tables = {};
  for (const tab of TAB_NAMES) {
    const csv = readFileSync(path.join(__dirname, "../../fixtures/sample-sheet", `${tab}.csv`), "utf8");
    tables[tab] = parseCsv(csv).rows;
  }
  return tables;
}

export function sampleCsv(tab: string): string {
  return readFileSync(path.join(__dirname, "../../fixtures/sample-sheet", `${tab}.csv`), "utf8");
}
