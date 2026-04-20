#!/usr/bin/env node

if (process.env.REACT_NATIVE_VIEWPORT_METRICS_ALLOW_PUBLISH !== "1") {
  console.error(
    [
      "Direct `npm publish` from the repository root is blocked.",
      "Use `npm run release:publish` so npm publishes a sanitized staging package",
      "without devDependencies, test scripts, or repo-only metadata.",
    ].join(" "),
  );
  process.exit(1);
}
