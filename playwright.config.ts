import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    // Chromium stands in for Safari here; the viewport, touch and user agent come from the iPhone profile.
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 -d out",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
