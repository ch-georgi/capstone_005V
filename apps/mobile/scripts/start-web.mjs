import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const cwd = resolve(import.meta.dirname, "..");
process.env.NODE_ENV ??= "development";
createRequire(import.meta.url)("@expo/env").load(cwd);
const result = spawnSync(process.execPath, ["node_modules/expo/bin/cli", "start", "--web", ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
  env: { ...process.env, WELLQ_APP_ENV: "development", EXPO_PUBLIC_API_URL: process.env.WELLQ_WEB_API_URL ?? "http://localhost:3000/api/v1" },
});
process.exit(result.status ?? 1);
