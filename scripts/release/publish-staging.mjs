#!/usr/bin/env node

import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const publishCopyTargets = [
  "build",
  "android",
  "ios",
  "expo-module.config.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
];

const allowedManifestFields = [
  "name",
  "version",
  "description",
  "keywords",
  "license",
  "author",
  "contributors",
  "funding",
  "homepage",
  "repository",
  "bugs",
  "main",
  "module",
  "types",
  "react-native",
  "browser",
  "exports",
  "sideEffects",
  "typesVersions",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundledDependencies",
  "engines",
  "os",
  "cpu",
  "publishConfig",
];

export function createPublishManifest(rootManifest) {
  const publishManifest = {};

  for (const field of allowedManifestFields) {
    if (rootManifest[field] !== undefined) {
      publishManifest[field] = rootManifest[field];
    }
  }

  return publishManifest;
}

export function assertPublishManifestIsSanitized(publishManifest) {
  const forbiddenManifestFields = [
    "devDependencies",
    "scripts",
    "jest",
    "private",
    "workspaces",
  ];

  const presentForbiddenFields = forbiddenManifestFields.filter(
    (field) => publishManifest[field] !== undefined,
  );

  if (presentForbiddenFields.length > 0) {
    throw new Error(
      `Publish manifest still contains forbidden fields:\n${presentForbiddenFields
        .map((field) => `- ${field}`)
        .join("\n")}`,
    );
  }
}

export function createPublishDirectory(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const rootManifest = JSON.parse(
    readFileSync(join(cwd, "package.json"), "utf8"),
  );
  const publishManifest = createPublishManifest(rootManifest);

  assertPublishManifestIsSanitized(publishManifest);

  const publishDir = mkdtempSync(
    join(tmpdir(), "react-native-viewport-metrics-publish-"),
  );

  for (const target of publishCopyTargets) {
    copyPublishTarget(cwd, publishDir, target);
  }

  writeFileSync(
    join(publishDir, "package.json"),
    `${JSON.stringify(publishManifest, null, 2)}\n`,
  );

  return {
    publishDir,
    publishManifest,
  };
}

export function cleanupPublishDirectory(publishDir) {
  rmSync(publishDir, { recursive: true, force: true });
}

function copyPublishTarget(rootDir, publishDir, relativePath) {
  const sourcePath = join(rootDir, relativePath);
  const destinationPath = join(publishDir, relativePath);

  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, {
    recursive: true,
    force: true,
    filter: (source) => shouldCopyPath(rootDir, source),
  });
}

function shouldCopyPath(rootDir, sourcePath) {
  const relativePath = relative(rootDir, sourcePath).replaceAll("\\", "/");

  if (relativePath === "") {
    return true;
  }

  if (
    relativePath === "android/build" ||
    relativePath.startsWith("android/build/") ||
    relativePath.endsWith(".map") ||
    relativePath.endsWith(".tsbuildinfo")
  ) {
    return false;
  }

  return true;
}
