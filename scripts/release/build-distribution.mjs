#!/usr/bin/env node

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { transformSync } from "@babel/core";

const buildDir = join(process.cwd(), "build");
const cjsDir = join(buildDir, "cjs");
const esmDir = join(buildDir, "esm");

rmSync(cjsDir, { recursive: true, force: true });
rmSync(esmDir, { recursive: true, force: true });
mkdirSync(cjsDir, { recursive: true });
mkdirSync(esmDir, { recursive: true });

const buildFiles = readdirSync(buildDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => entry.name)
  .sort();

if (buildFiles.length === 0) {
  throw new Error("No JS build files found. Run expo-module build first.");
}

for (const fileName of buildFiles) {
  const inputPath = join(buildDir, fileName);
  const source = stripSourceMapComment(readFileSync(inputPath, "utf8"));

  const cjs = transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: inputPath,
    plugins: [["@babel/plugin-transform-modules-commonjs", { loose: false }]],
    sourceMaps: false,
  });

  if (!cjs?.code) {
    throw new Error(`Unable to generate CommonJS build for ${fileName}`);
  }

  writeFileSync(join(cjsDir, fileName), stripSourceMapComment(cjs.code));
  writeFileSync(
    join(esmDir, toMjsFileName(fileName)),
    rewriteEsmImports(source)
  );
}

console.log(
  `Generated ${buildFiles.length} CommonJS files in build/cjs and ${buildFiles.length} ESM files in build/esm.`
);

function toMjsFileName(fileName) {
  return `${basename(fileName, ".js")}.mjs`;
}

function stripSourceMapComment(source) {
  return source.replace(/\n\/\/# sourceMappingURL=.*?\.map\s*$/u, "");
}

function rewriteEsmImports(source) {
  return stripSourceMapComment(source)
    .replace(
      /(\bfrom\s*["'])(\.\/[^"']+)(["'])/gu,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${withMjsExtension(specifier)}${suffix}`
    )
    .replace(
      /(\bimport\s*\(\s*["'])(\.\/[^"']+)(["']\s*\))/gu,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${withMjsExtension(specifier)}${suffix}`
    );
}

function withMjsExtension(specifier) {
  if (/\.[cm]?js$/u.test(specifier)) {
    return specifier;
  }

  return `${specifier}.mjs`;
}
