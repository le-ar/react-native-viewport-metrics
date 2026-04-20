#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cleanupPublishDirectory,
  createPublishDirectory,
} from "./publish-staging.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const cacheDir = join(tmpdir(), "react-native-viewport-metrics-npm-cache");
mkdirSync(cacheDir, { recursive: true });

runNpm(["run", "release:verify:unit"]);
runNpm(["run", "release:pack"]);

const { publishDir } = createPublishDirectory();

try {
  const result = spawnSync(
    npmCommand,
    [
      "publish",
      publishDir,
      "--access",
      "public",
      "--ignore-scripts",
      "--cache",
      cacheDir,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        REACT_NATIVE_VIEWPORT_METRICS_ALLOW_PUBLISH: "1",
        npm_config_cache: cacheDir,
        NPM_CONFIG_CACHE: cacheDir,
      },
    },
  );

  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  cleanupPublishDirectory(publishDir);
}

function runNpm(args) {
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      REACT_NATIVE_VIEWPORT_METRICS_ALLOW_PUBLISH: "1",
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
