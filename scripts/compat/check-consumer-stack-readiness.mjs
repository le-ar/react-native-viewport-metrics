import fs from "node:fs";
import path from "node:path";

import semver from "semver";

const ROOT_DIR = path.resolve(import.meta.dirname, "..", "..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const README_PATH = path.join(ROOT_DIR, "README.md");
const SOURCE_DIR = path.join(ROOT_DIR, "src");

const VERIFIED_TARGET = Object.freeze({
  expo: "54.0.33",
  reactNative: "0.81.5",
  reactNativeReanimated: "4.2.2",
  reactNativeWorklets: "0.7.4",
});

const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
const peerDependencies = packageJson.peerDependencies ?? {};
const readme = fs.readFileSync(README_PATH, "utf8");

assertSatisfies("expo", VERIFIED_TARGET.expo, peerDependencies.expo ?? "*");
assertSatisfies(
  "react-native",
  VERIFIED_TARGET.reactNative,
  peerDependencies["react-native"] ?? "*"
);
assertSatisfies(
  "react-native-reanimated",
  VERIFIED_TARGET.reactNativeReanimated,
  peerDependencies["react-native-reanimated"]
);

if ("react-native-worklets" in peerDependencies) {
  throw new Error(
    "react-native-worklets should not be a runtime peer dependency for this package."
  );
}

if (!readme.includes("Expo 54") || !readme.includes("Reanimated 4.2.x")) {
  throw new Error(
    "README must document the verified consumer stack for this package."
  );
}

const sourceFiles = collectSourceFiles(SOURCE_DIR);
const workletsImports = sourceFiles.filter((filePath) =>
  fs.readFileSync(filePath, "utf8").includes("react-native-worklets")
);

if (workletsImports.length > 0) {
  throw new Error(
    `Package source should not import react-native-worklets directly: ${workletsImports.join(
      ", "
    )}`
  );
}

console.log(
  `Consumer-stack readiness contract verified for Expo ${VERIFIED_TARGET.expo}, React Native ${VERIFIED_TARGET.reactNative}, Reanimated ${VERIFIED_TARGET.reactNativeReanimated}, Worklets ${VERIFIED_TARGET.reactNativeWorklets}.`
);

function assertSatisfies(name, version, range) {
  if (typeof range !== "string" || range.length === 0) {
    throw new Error(`Missing peer dependency range for ${name}.`);
  }

  if (!semver.satisfies(version, range, { includePrerelease: true })) {
    throw new Error(
      `${name} ${version} does not satisfy declared peer dependency range ${range}.`
    );
  }
}

function collectSourceFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}
