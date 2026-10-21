import { defineConfig } from "@playwright/test";

// BASE_URL=https://asfunz-lavoro.github.io/studylab/ runs the same tests against the live site.
const live = process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: { baseURL: live ?? "http://localhost:4173", channel: "chrome", headless: true, locale: "it-IT", screenshot: "only-on-failure" },
  webServer: live ? undefined : { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 860 } } },
  ],
});
