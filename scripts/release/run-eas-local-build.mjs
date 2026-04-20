#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const platform = process.argv[2];
const outputArg = process.argv[3];

if (platform !== "android" && platform !== "ios") {
  throw new Error("Usage: run-eas-local-build.mjs <android|ios> <output-path>");
}

if (!outputArg) {
  throw new Error("Missing output path.");
}

const repoRoot = process.cwd();
const exampleDir = join(repoRoot, "example");
const tempRoot = mkdtempSync(join(tmpdir(), "rnvm-eas-local-"));
const tempExampleDir = join(tempRoot, "example");
const localPackagesDir = join(tempExampleDir, "local-packages");
const outputPath = resolve(repoRoot, outputArg);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const easCommand = process.platform === "win32" ? "eas.cmd" : "eas";
const cacheDir = join(tmpdir(), "react-native-viewport-metrics-npm-cache");

try {
  copyExampleProject();
  const tarballName = packLibraryTarball();
  rewriteExampleDependency(tarballName);
  refreshExampleLockfile();
  runEasLocalBuild();
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function copyExampleProject() {
  cpSync(exampleDir, tempExampleDir, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(exampleDir.length + 1);
      if (!relative) {
        return true;
      }

      return ![
        "node_modules",
        "android/.gradle",
        "android/build",
        "android/app/build",
        "ios/build",
        "ios/Pods",
      ].some((excludedPath) => (
        relative === excludedPath || relative.startsWith(`${excludedPath}/`)
      ));
    },
  });

  mkdirSync(localPackagesDir, { recursive: true });
}

function packLibraryTarball() {
  mkdirSync(cacheDir, { recursive: true });

  const result = spawnSync(
    npmCommand,
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      localPackagesDir,
      "--cache",
      cacheDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
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

  const [packInfo] = parsePackEntries(result.stdout ?? "");
  const tarballName = packInfo?.filename;

  if (!tarballName || !existsSync(join(localPackagesDir, tarballName))) {
    throw new Error("Unable to locate generated npm package tarball.");
  }

  console.log(`Prepared local package tarball for EAS: ${tarballName}`);
  return tarballName;
}

function rewriteExampleDependency(tarballName) {
  const packageJsonPath = join(tempExampleDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  packageJson.dependencies = {
    ...packageJson.dependencies,
    "react-native-viewport-metrics": `file:./local-packages/${tarballName}`,
  };

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function refreshExampleLockfile() {
  const result = spawnSync(
    npmCommand,
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--include=dev",
      "--cache",
      cacheDir,
    ],
    {
      cwd: tempExampleDir,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_cache: cacheDir,
        NPM_CONFIG_CACHE: cacheDir,
      },
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runEasLocalBuild() {
  mkdirSync(resolve(outputPath, ".."), { recursive: true });

  const result = spawnSync(
    easCommand,
    [
      "build",
      "--local",
      "--non-interactive",
      "--platform",
      platform,
      "--profile",
      "production",
      "--output",
      outputPath,
    ],
    {
      cwd: tempExampleDir,
      stdio: "inherit",
      env: {
        ...process.env,
        EAS_NO_VCS: "1",
      },
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parsePackEntries(output) {
  for (let index = output.lastIndexOf("["); index >= 0; index = output.lastIndexOf("[", index - 1)) {
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

  throw new Error("Unable to parse npm pack JSON output.");
}
