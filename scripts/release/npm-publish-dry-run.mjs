#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const cacheDir = join(tmpdir(), "react-native-viewport-metrics-npm-cache");
mkdirSync(cacheDir, { recursive: true });

const result = spawnSync(
  npmCommand,
  ["publish", "--dry-run", "--access", "public", "--cache", cacheDir],
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

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
