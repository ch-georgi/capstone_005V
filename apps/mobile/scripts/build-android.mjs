import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const cwd = resolve(import.meta.dirname, "..");
const version = createRequire(import.meta.url)("../package.json").version;
process.env.NODE_ENV ??= "production";
createRequire(import.meta.url)("@expo/env").load(cwd);
const production = process.argv.includes("--production");
const demo = process.argv.includes("--demo");
if (demo && production) throw new Error("Elige demo o producción, no ambos.");
if (demo) process.env.WELLQ_DEMO_MODE = "true";
if (production) process.env.WELLQ_DEMO_MODE = "false";
if (production) {
  const envFile = resolve(cwd, ".env.production.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const { productionApiUrl } = createRequire(import.meta.url)("./environment.cjs");
  try {
    process.env.EXPO_PUBLIC_API_URL = productionApiUrl(process.env.WELLQ_PRODUCTION_API_URL);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.env.WELLQ_APP_ENV = "production";
} else {
  process.env.WELLQ_APP_ENV = "development";
}
if (process.argv.includes("--check-config")) {
  console.log(`Entorno: ${process.env.WELLQ_APP_ENV}; demo: ${process.env.WELLQ_DEMO_MODE === "true"}; API: ${process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000/api/v1"}`);
  process.exit(0);
}
if (!process.env.ANDROID_HOME && process.env.LOCALAPPDATA)
  process.env.ANDROID_HOME = resolve(
    process.env.LOCALAPPDATA,
    "Android",
    "Sdk",
  );
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (
  !process.argv.includes("--reuse-native") ||
  !existsSync(resolve(cwd, "android", "gradlew"))
) {
  run(process.execPath, [
    "node_modules/expo/bin/cli",
    "prebuild",
    "--platform",
    "android",
    "--no-install",
  ]);
}
const native = resolve(cwd, "android");
const gradleArgs = [
  ":app:assembleRelease",
  "--no-daemon",
  "--max-workers=2",
  "-Dorg.gradle.jvmargs=-Xmx4096m",
  "-PreactNativeArchitectures=arm64-v8a,x86_64",
];
function gradle(args) {
  if (process.platform === "win32")
    run(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", `gradlew.bat ${args.join(" ")}`],
      { cwd: native },
    );
  else run("./gradlew", args, { cwd: native });
}
// Rebuild only JS/config unconditionally so an environment change cannot reuse the previous API URL.
gradle([
  ":expo-constants:createExpoConfig",
  ":app:createBundleReleaseJsAndAssets",
  "--rerun-tasks",
  ...gradleArgs.slice(1),
]);
gradle(gradleArgs);
const output = resolve(native, "app/build/outputs/apk/release/app-release.apk");
if (!existsSync(output)) throw new Error("No se encontrÃ³ el APK de salida");
mkdirSync(resolve(cwd, "artifacts"), { recursive: true });
const filename = process.env.WELLQ_DEMO_MODE === "true" ? `wellq-${version}-demo.apk` : production ? `wellq-${version}-production.apk` : `wellq-${version}-preview.apk`;
copyFileSync(output, resolve(cwd, "artifacts", filename));
console.log(
  `APK: apps/mobile/artifacts/${filename} (firma de desarrollo)`,
);
