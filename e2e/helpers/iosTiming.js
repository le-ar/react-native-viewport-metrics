const { execFileSync } = require("node:child_process");

const VIEWPORT_LOG_PATTERN = /\[(viewport-metrics-[^\]]+)\]\s+(\{.*\})$/;
const DEFAULT_LOOKBACK_MINUTES = 10;

function createTimingRunId(prefix = "viewport-metrics") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForIosNativeTimingDiagnosis({
  runId,
  targetLogicalOrientation = "landscape-left",
  blockStartEpochMs = null,
  blockEndEpochMs = null,
  lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
  timeoutMs = 15000,
  pollIntervalMs = 1000,
} = {}) {
  if (!runId) {
    throw new Error("waitForIosNativeTimingDiagnosis requires a runId");
  }

  const startedAt = Date.now();
  let lastAnalysis = createInsufficientDataAnalysis(runId);

  while (Date.now() - startedAt < timeoutMs) {
    lastAnalysis = diagnoseIosNativeTiming({
      runId,
      targetLogicalOrientation,
      blockStartEpochMs,
      blockEndEpochMs,
      lookbackMinutes,
    });

    if (lastAnalysis.classification !== "insufficient-data") {
      return lastAnalysis;
    }

    await sleep(pollIntervalMs);
  }

  return lastAnalysis;
}

function diagnoseIosNativeTiming({
  runId,
  targetLogicalOrientation = "landscape-left",
  blockStartEpochMs = null,
  blockEndEpochMs = null,
  lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
}) {
  const events = readViewportMetricEvents(lookbackMinutes).filter(
    (event) => event.runId === runId
  );

  const blockStart =
    blockStartEpochMs == null
      ? latestEvent(events, "block-js-start")
      : { epochMs: Number(blockStartEpochMs) };
  const blockEnd =
    blockEndEpochMs == null
      ? latestEvent(events, "block-js-end")
      : { epochMs: Number(blockEndEpochMs) };
  const firstTargetLogicalRead = firstEventAfter(
    events.filter(
      (event) =>
        event.channel === "viewport-metrics-native" &&
        event.marker === "logical-orientation-read-end" &&
        event.normalizedOrientation === targetLogicalOrientation
    ),
    blockStart?.epochMs
  );
  const firstTargetEmit = firstEventAfter(
    events.filter(
      (event) =>
        event.channel === "viewport-metrics-native" &&
        event.marker === "emit-snapshot-end" &&
        event.logicalOrientation === targetLogicalOrientation
    ),
    blockStart?.epochMs
  );

  if (!blockStart || !blockEnd || !firstTargetEmit) {
    return {
      ...createInsufficientDataAnalysis(runId),
      eventCount: events.length,
      blockStartEpochMs: blockStart?.epochMs ?? null,
      blockEndEpochMs: blockEnd?.epochMs ?? null,
      firstLogicalReadEpochMs: firstTargetLogicalRead?.epochMs ?? null,
      emitEpochMs: firstTargetEmit?.epochMs ?? null,
      markers: events.map((event) => `${event.channel}:${event.marker}`),
    };
  }

  const emitVsBlockEndMs = round(firstTargetEmit.epochMs - blockEnd.epochMs);
  const logicalReadVsBlockEndMs = firstTargetLogicalRead
    ? round(firstTargetLogicalRead.epochMs - blockEnd.epochMs)
    : null;
  const classification =
    firstTargetEmit.epochMs < blockEnd.epochMs ? "delivery-lag" : "source-lag";

  return {
    runId,
    classification,
    summary:
      classification === "delivery-lag"
        ? "Native iOS emit completed before JS unblocked; delay is after native emit."
        : "Native iOS emit did not complete before JS unblocked; delay is still on the native/source side.",
    eventCount: events.length,
    blockStartEpochMs: blockStart.epochMs,
    blockEndEpochMs: blockEnd.epochMs,
    firstLogicalReadEpochMs: firstTargetLogicalRead?.epochMs ?? null,
    emitEpochMs: firstTargetEmit.epochMs,
    logicalReadVsBlockEndMs,
    emitVsBlockEndMs,
  };
}

function readViewportMetricEvents(lookbackMinutes) {
  const rawLogs = execFileSync(
    "xcrun",
    [
      "simctl",
      "spawn",
      "booted",
      "log",
      "show",
      "--last",
      `${lookbackMinutes}m`,
      "--style",
      "compact",
      "--predicate",
      'eventMessage CONTAINS "[viewport-metrics-"',
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return rawLogs
    .split("\n")
    .map(parseViewportMetricEvent)
    .filter(Boolean);
}

function parseViewportMetricEvent(line) {
  const match = line.match(VIEWPORT_LOG_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(match[2]);
    return {
      ...payload,
      channel: match[1],
      epochMs: Number(payload.epochMs),
    };
  } catch {
    return null;
  }
}

function latestEvent(events, marker) {
  return [...events]
    .filter((event) => event.marker === marker)
    .sort((left, right) => left.epochMs - right.epochMs)
    .at(-1);
}

function firstEventAfter(events, epochMs) {
  const filteredEvents =
    epochMs == null
      ? events
      : events.filter((event) => Number(event.epochMs) >= epochMs);

  return [...filteredEvents].sort((left, right) => left.epochMs - right.epochMs)[0] ?? null;
}

function createInsufficientDataAnalysis(runId) {
  return {
    runId,
    classification: "insufficient-data",
    summary: "Native iOS timing markers were not sufficient to classify the delay.",
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createTimingRunId,
  diagnoseIosNativeTiming,
  waitForIosNativeTimingDiagnosis,
};
