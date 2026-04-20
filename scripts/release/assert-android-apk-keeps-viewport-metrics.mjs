import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const apkPath =
  process.argv[2] ??
  "example/android/app/build/outputs/apk/release/app-release.apk";

const requiredDexDescriptors = [
  "Lexpo/modules/viewportmetrics/ViewportMetricsModule;",
  "Lexpo/modules/viewportmetrics/ViewportMetricsView;",
  "Lexpo/modules/viewportmetrics/ViewportMetricsAggregator;",
  "Lexpo/modules/viewportmetrics/ViewportMetricsAggregatorRegistry;",
];
const maxDexBuffer = 256 * 1024 * 1024;

if (!existsSync(apkPath)) {
  throw new Error(`APK does not exist: ${apkPath}`);
}

const entries = execFileSync("unzip", ["-Z1", apkPath], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter((entry) => /^classes.*\.dex$/.test(entry));

if (entries.length === 0) {
  throw new Error(`No classes*.dex entries found in ${apkPath}`);
}

const dexPayload = Buffer.concat(
  entries.map((entry) =>
    execFileSync("unzip", ["-p", apkPath, entry], {
      maxBuffer: maxDexBuffer,
    }),
  ),
);

const missing = requiredDexDescriptors.filter(
  (descriptor) => !dexPayload.includes(Buffer.from(descriptor)),
);

if (missing.length > 0) {
  throw new Error(
    [
      "Android release APK is missing viewport metrics native classes after R8/minify.",
      `APK: ${apkPath}`,
      `Missing descriptors: ${missing.join(", ")}`,
    ].join("\n"),
  );
}

console.log(
  `Verified ${requiredDexDescriptors.length} viewport metrics native classes in ${apkPath}`,
);
