#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const requiredPackageFiles = [
  "build/index.js",
  "build/index.d.ts",
  "build/cjs/index.js",
  "build/esm/index.mjs",
  "android/build.gradle",
  "android/consumer-rules.pro",
  "android/src/main/java/expo/modules/viewportmetrics/ViewportMetricsModule.kt",
  "android/src/main/java/expo/modules/viewportmetrics/ViewportMetricsAggregator.kt",
  "android/src/main/java/expo/modules/viewportmetrics/ViewportMetricsView.kt",
  "ios/ViewportMetricsModule.swift",
  "ios/ViewportMetricsAggregator.swift",
  "ios/ViewportMetricsView.swift",
  "ios/ViewportMetrics.podspec",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
];

const forbiddenPackagePathPrefixes = [
  "android/build/",
  "artifacts/",
  "example/",
  "e2e/",
  "scripts/",
  "src/",
  "node_modules/",
];

const forbiddenPackageFiles = ["PLAN.md", "WORKLOG.md", "idea.md"];
const forbiddenPackagePathSuffixes = [".map"];

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const cacheDir = join(tmpdir(), "react-native-viewport-metrics-npm-cache");
mkdirSync(cacheDir, { recursive: true });

const result = spawnSync(
  npmCommand,
  ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cacheDir],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir,
    },
  }
);

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

const packEntries = parsePackEntries(result.stdout ?? "");
const [packInfo] = packEntries;

if (!packInfo?.files) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  throw new Error("Unable to read npm pack dry-run file list.");
}

const packageFiles = new Set(packInfo.files.map((file) => file.path));
const missingFiles = requiredPackageFiles.filter(
  (file) => !packageFiles.has(file)
);

if (missingFiles.length > 0) {
  throw new Error(
    `npm pack dry-run is missing required package files:\n${missingFiles
      .map((file) => `- ${file}`)
      .join("\n")}`
  );
}

const forbiddenFiles = packInfo.files
  .map((file) => file.path)
  .filter((file) =>
    forbiddenPackagePathPrefixes.some((prefix) => file.startsWith(prefix)) ||
    forbiddenPackagePathSuffixes.some((suffix) => file.endsWith(suffix)) ||
    forbiddenPackageFiles.includes(file)
  );

if (forbiddenFiles.length > 0) {
  throw new Error(
    `npm pack dry-run includes forbidden files:\n${forbiddenFiles
      .slice(0, 20)
      .map((file) => `- ${file}`)
      .join("\n")}${forbiddenFiles.length > 20 ? "\n- ..." : ""}`
  );
}

console.log(
  `Verified npm pack dry-run includes ${packInfo.files.length} files: compiled JS/types, CJS/ESM entries, native sources, and release docs only.`
);

function parsePackEntries(output) {
  for (
    let index = output.lastIndexOf("[");
    index >= 0;
    index = output.lastIndexOf("[", index - 1)
  ) {
    const candidate = output.slice(index).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // npm lifecycle logs can precede --json output; keep searching.
    }
  }

  throw new Error("Unable to parse npm pack dry-run JSON output.");
}
