import { defineConfig } from "@playwright/test";
import path from "path";

const FRONTEND_PORT = 5273;
const BACKEND_PORT = 4400;
const PROJECT_ROOT = path.join(__dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  timeout: 300000,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30000,
    // app.js's own booking-request submit (handleRequestSubmit) ignores the
    // typed address text and geolocates via navigator.geolocation, falling
    // back to a hardcoded central-Chennai point if permission isn't granted
    // — confirmed live: customer-flow.spec.ts's UI-submitted booking was
    // landing ~25km from the isolated TAMBARAM test worker (outside its
    // serviceAreaRadiusKm), so it never received a dispatch offer. Mock
    // geolocation to the same TAMBARAM point every spec uses.
    permissions: ["geolocation"],
    geolocation: { latitude: 12.9249, longitude: 80.1 }
  },
  webServer: [
    {
      command: `npx ts-node src/app.ts`,
      cwd: __dirname,
      env: { PORT: String(BACKEND_PORT) },
      url: `http://localhost:${BACKEND_PORT}/api/v1/public/stats`,
      reuseExistingServer: false,
      timeout: 90000
    },
    {
      command: `npx http-server "${PROJECT_ROOT}" -p ${FRONTEND_PORT} -c-1`,
      cwd: PROJECT_ROOT,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 30000
    }
  ]
});

export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
