import {
  getViewportSnapshotByOrientation,
  isConcreteViewportOrientation,
  makeEmptyViewportSnapshotByOrientation,
  makeFallbackSnapshot,
  orientationToSnapshotByOrientationKey,
  snapshotFromNativeEvent,
  snapshotPayloadKey,
  updateViewportSnapshotByOrientation,
} from "../snapshot";

describe("snapshot helpers", () => {
  it("keeps payload comparison independent from revision and timestamp", () => {
    const snapshot = makeFallbackSnapshot();
    const updated = {
      ...snapshot,
      revision: snapshot.revision + 1,
      timestampMs: snapshot.timestampMs + 1000,
    };

    expect(snapshotPayloadKey(updated)).toBe(snapshotPayloadKey(snapshot));
  });

  it("models iOS navigation and home-indicator as separate areas", () => {
    const snapshot = makeFallbackSnapshot();

    expect(snapshot.systemAreas.navigationBar.kind).toBe("navigation-bar");
    expect(snapshot.systemAreas.navigationBar.present).toBe(false);
    expect(snapshot.systemAreas.homeIndicator.kind).toBe("home-indicator");
  });

  it("unwraps nativeEvent payloads from provider events", () => {
    const snapshot = makeFallbackSnapshot();

    expect(snapshotFromNativeEvent(snapshot)).toBe(snapshot);
    expect(snapshotFromNativeEvent({ nativeEvent: snapshot })).toBe(snapshot);
  });

  it("updates the correct logical-orientation bucket", () => {
    const snapshot = {
      ...makeFallbackSnapshot(),
      revision: 9,
      logicalOrientation: "landscape-right" as const,
    };

    const snapshotsByOrientation = updateViewportSnapshotByOrientation(
      makeEmptyViewportSnapshotByOrientation(),
      snapshot,
    );

    expect(snapshotsByOrientation.landscapeRight).toBe(snapshot);
    expect(
      getViewportSnapshotByOrientation(snapshotsByOrientation, "unknown"),
    ).toBeNull();
  });

  it("does not overwrite the bank when logical orientation is unknown", () => {
    const portraitSnapshot = {
      ...makeFallbackSnapshot(),
      revision: 4,
      logicalOrientation: "portrait-up" as const,
    };
    const unknownSnapshot = {
      ...makeFallbackSnapshot(),
      revision: 5,
      logicalOrientation: "unknown" as const,
    };

    const initialBank = updateViewportSnapshotByOrientation(
      makeEmptyViewportSnapshotByOrientation(),
      portraitSnapshot,
    );
    const nextBank = updateViewportSnapshotByOrientation(
      initialBank,
      unknownSnapshot,
    );

    expect(nextBank).toBe(initialBank);
    expect(nextBank.portraitUp).toBe(portraitSnapshot);
  });

  it("keeps previous orientation snapshots when a different logical orientation arrives", () => {
    const portraitSnapshot = {
      ...makeFallbackSnapshot(),
      revision: 2,
      logicalOrientation: "portrait-up" as const,
    };
    const landscapeSnapshot = {
      ...makeFallbackSnapshot(),
      revision: 3,
      logicalOrientation: "landscape-left" as const,
    };

    const initialBank = updateViewportSnapshotByOrientation(
      makeEmptyViewportSnapshotByOrientation(),
      portraitSnapshot,
    );
    const nextBank = updateViewportSnapshotByOrientation(
      initialBank,
      landscapeSnapshot,
    );

    expect(nextBank.portraitUp).toBe(portraitSnapshot);
    expect(nextBank.landscapeLeft).toBe(landscapeSnapshot);
  });

  it("maps concrete orientations to bank keys", () => {
    expect(isConcreteViewportOrientation("portrait-down")).toBe(true);
    expect(isConcreteViewportOrientation("unknown")).toBe(false);
    expect(orientationToSnapshotByOrientationKey("landscape-left")).toBe(
      "landscapeLeft",
    );
  });
});
