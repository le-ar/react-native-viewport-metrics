import * as NavigationBar from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  StatusBar as ExpoStatusBar,
  setStatusBarHidden,
} from "expo-status-bar";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  NativeModules,
  Platform,
  ScrollView,
  TextInput,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { LaunchArguments } from "react-native-launch-arguments";
import Animated, {
  runOnUI,
  useAnimatedReaction,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  addViewportSnapshotListener,
  addViewportSnapshotWorkletListener,
  getViewportSnapshot,
  useViewportMetricsSharedValues,
  useViewportOrientationSnapshotsSharedValues,
  useViewportSnapshot,
  useViewportSnapshotSharedValue,
} from "react-native-viewport-metrics";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type SystemBarsMode =
  | "visible"
  | "hidden-default"
  | "hidden-transient"
  | "locked-hidden";

type SystemBarsTarget = "visible" | "hidden";

type OrientationLockName =
  | "default"
  | "portrait-up"
  | "landscape-left"
  | "landscape-right";

type ExampleLaunchArgs = {
  autoSyncReadOnSnapshot?: boolean | string;
  e2eMode?: boolean | string;
  hideHomeIndicatorOnMount?: boolean | string;
  hideSystemBarsOnMount?: boolean | string;
  systemBarsModeOnMount?: string;
  hideStatusBarOnMount?: boolean | string;
  blockJsOnMountMs?: number | string;
  blockJsOnMountDelayMs?: number | string;
  initialOrientationLock?: string;
  systemBarsShowAfterMountMs?: number | string;
  systemBarsRehideAfterShowMs?: number | string;
  viewportMetricsNativeTiming?: boolean | string;
  viewportMetricsTimingRunId?: string;
};

type ExampleSystemUiModule = {
  setSystemBarsHidden(hidden: boolean): Promise<void>;
  setSystemBarsMode(mode: SystemBarsMode): Promise<void>;
  requestShowSystemBars(): Promise<void>;
};

type DevMenuPreferencesModule = {
  setPreferencesAsync(settings: {
    keyCommandsEnabled?: boolean;
    motionGestureEnabled?: boolean;
    showFloatingActionButton?: boolean;
    showsAtLaunch?: boolean;
    touchGestureEnabled?: boolean;
  }): Promise<void>;
};

type DevMenuInternalModule = {
  closeMenu(): Promise<void>;
  setOnboardingFinished(finished: boolean): Promise<void>;
};

const exampleSystemUi =
  (NativeModules.ExampleSystemUi as ExampleSystemUiModule | undefined) ?? null;
const devMenuPreferences =
  (NativeModules.DevMenuPreferences as DevMenuPreferencesModule | undefined) ??
  null;
const devMenuInternal =
  (NativeModules.ExpoDevMenuInternal as DevMenuInternalModule | undefined) ??
  null;

export function SnapshotScreen() {
  const snapshot = useViewportSnapshot();
  const sharedSnapshot = useViewportSnapshotSharedValue();
  const sharedMetrics = useViewportMetricsSharedValues();
  const orientationSnapshots = useViewportOrientationSnapshotsSharedValues();
  const workletEventCount = useSharedValue(0);
  const jsListenerCountShared = useSharedValue(0);
  const jsBlockActive = useSharedValue(0);
  const workletBeatJsDuringBlock = useSharedValue(0);
  const sharedSnapshotBeatJsDuringBlock = useSharedValue(0);
  const launchArgs = useMemo(() => safeReadLaunchArgs(), []);
  const autoSyncReadOnSnapshot = useMemo(
    () => readBoolean(launchArgs.autoSyncReadOnSnapshot),
    [launchArgs]
  );
  const e2eMode = useMemo(() => readBoolean(launchArgs.e2eMode), [launchArgs]);
  const timingRunId = useMemo(
    () => readString(launchArgs.viewportMetricsTimingRunId),
    [launchArgs]
  );
  const jsListenerCountRef = useRef(0);
  const [e2eReady, setE2eReady] = useState(false);
  const [automationCommand, setAutomationCommand] = useState("");
  const [systemBarsMode, setSystemBarsMode] =
    useState<SystemBarsMode>("visible");
  const [systemBarsTarget, setSystemBarsTarget] =
    useState<SystemBarsTarget>("visible");
  const [systemBarsHidden, setSystemBarsHidden] = useState(false);
  const [statusBarVisible, setStatusBarVisible] = useState(true);
  const [homeIndicatorAutoHidden, setHomeIndicatorAutoHidden] = useState(
    Platform.OS === "ios" && readBoolean(launchArgs.hideHomeIndicatorOnMount)
  );
  const [navigationBarApiVisibility, setNavigationBarApiVisibility] =
    useState("unknown");
  const [orientationLockLabel, setOrientationLockLabel] =
    useState<OrientationLockName>("default");
  const [syncSnapshot, setSyncSnapshot] = useState(() => getViewportSnapshot());
  const [syncReadCount, setSyncReadCount] = useState(0);
  const [jsBlockCount, setJsBlockCount] = useState(0);
  const [jsBlockStartEpochMs, setJsBlockStartEpochMs] = useState(0);
  const [jsBlockEndEpochMs, setJsBlockEndEpochMs] = useState(0);
  const [jsListenerCount, setJsListenerCount] = useState(0);

  useEffect(() => {
    const subscription = addViewportSnapshotListener((nextSnapshot) => {
      console.log("[viewport-metrics-listener]", nextSnapshot.revision);
      const nextCount = jsListenerCountRef.current + 1;
      jsListenerCountRef.current = nextCount;
      jsListenerCountShared.value = nextCount;
      setJsListenerCount(nextCount);
    });

    return subscription.remove;
  }, [jsListenerCountShared]);

  useEffect(() => {
    const subscription = addViewportSnapshotWorkletListener((nextSnapshot) => {
      "worklet";
      workletEventCount.value += 1;

      if (
        jsBlockActive.value === 1 &&
        workletEventCount.value > jsListenerCountShared.value
      ) {
        workletBeatJsDuringBlock.value = 1;
      }
    });

    return subscription.remove;
  }, [
    jsBlockActive,
    jsListenerCountShared,
    sharedSnapshot,
    sharedSnapshotBeatJsDuringBlock,
    workletBeatJsDuringBlock,
    workletEventCount,
  ]);

  useAnimatedReaction(
    () => ({
      revision: sharedSnapshot.value.revision,
      blocked: jsBlockActive.value,
    }),
    (current, previous) => {
      if (
        current.blocked === 1 &&
        previous != null &&
        current.revision !== previous.revision
      ) {
        sharedSnapshotBeatJsDuringBlock.value = 1;
      }
    }
  );

  useEffect(() => {
    console.log(
      "[viewport-metrics]",
      JSON.stringify({
        revision: snapshot.revision,
        physicalOrientation: snapshot.physicalOrientation,
        logicalOrientation: snapshot.logicalOrientation,
        window: snapshot.window,
        rootView: snapshot.rootView,
        safeAreaInsets: snapshot.safeAreaInsets,
        stableSystemInsets: snapshot.stableSystemInsets,
        statusBar: snapshot.systemAreas.statusBar,
        navigationBar: snapshot.systemAreas.navigationBar,
        homeIndicator: snapshot.systemAreas.homeIndicator,
        bottomGestureArea: snapshot.systemAreas.bottomGestureArea,
      })
    );
  }, [snapshot.revision]);

  const sharedRevisionProps = useAnimatedProps(() => ({
    text: String(sharedSnapshot.value.revision),
    value: String(sharedSnapshot.value.revision),
  }));

  const workletCountProps = useAnimatedProps(() => ({
    text: String(workletEventCount.value),
    value: String(workletEventCount.value),
  }));

  const workletBeatProps = useAnimatedProps(() => ({
    text: String(workletBeatJsDuringBlock.value === 1),
    value: String(workletBeatJsDuringBlock.value === 1),
  }));

  const jsBlockActiveProps = useAnimatedProps(() => ({
    text: String(jsBlockActive.value === 1),
    value: String(jsBlockActive.value === 1),
  }));

  const sharedSnapshotBeatProps = useAnimatedProps(() => ({
    text: String(sharedSnapshotBeatJsDuringBlock.value === 1),
    value: String(sharedSnapshotBeatJsDuringBlock.value === 1),
  }));

  const sharedLogicalOrientationProps = useAnimatedProps(() => ({
    text: sharedMetrics.logicalOrientation.value,
    value: sharedMetrics.logicalOrientation.value,
  }));

  const sharedWindowWidthProps = useAnimatedProps(() => {
    const value = String(round(sharedMetrics.window.value.width));
    return {
      text: value,
      value,
    };
  });

  const sharedNavigationVisibilityProps = useAnimatedProps(() => ({
    text: sharedMetrics.navigationBar.value.visibility,
    value: sharedMetrics.navigationBar.value.visibility,
  }));

  const bankPortraitUpRevisionProps = useAnimatedProps(() => {
    const value = String(orientationSnapshots.portraitUp.value?.revision ?? 0);
    return {
      text: value,
      value,
    };
  });

  const bankPortraitDownRevisionProps = useAnimatedProps(() => {
    const value = String(
      orientationSnapshots.portraitDown.value?.revision ?? 0
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeLeftRevisionProps = useAnimatedProps(() => {
    const value = String(
      orientationSnapshots.landscapeLeft.value?.revision ?? 0
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeRightRevisionProps = useAnimatedProps(() => {
    const value = String(
      orientationSnapshots.landscapeRight.value?.revision ?? 0
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeLeftNavigationRightProps = useAnimatedProps(() => {
    const value = String(
      round(
        orientationSnapshots.landscapeLeft.value?.systemAreas.navigationBar
          .insets.right ?? 0
      )
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeRightNavigationLeftProps = useAnimatedProps(() => {
    const value = String(
      round(
        orientationSnapshots.landscapeRight.value?.systemAreas.navigationBar
          .insets.left ?? 0
      )
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeLeftStableRightProps = useAnimatedProps(() => {
    const value = String(
      round(
        orientationSnapshots.landscapeLeft.value?.systemAreas.navigationBar
          .stableInsets.right ?? 0
      )
    );
    return {
      text: value,
      value,
    };
  });

  const bankLandscapeRightStableLeftProps = useAnimatedProps(() => {
    const value = String(
      round(
        orientationSnapshots.landscapeRight.value?.systemAreas.navigationBar
          .stableInsets.left ?? 0
      )
    );
    return {
      text: value,
      value,
    };
  });

  const workletPulseStyle = useAnimatedStyle(() => {
    const width = 48 + (sharedSnapshot.value.revision % 12) * 10;
    const hue = (sharedSnapshot.value.revision * 41) % 360;

    return {
      width,
      backgroundColor: `hsl(${hue} 75% 58%)`,
    };
  });

  const logActionEvent = useCallback(
    (marker: string, payload: Record<string, unknown> = {}) => {
      console.log(
        "[viewport-metrics-action]",
        JSON.stringify({
          marker,
          epochMs: Date.now(),
          uptimeMs: globalThis.performance?.now?.() ?? null,
          runId: timingRunId ?? "",
          ...payload,
        })
      );
    },
    [timingRunId]
  );

  const blockJsThread = useCallback(
    (durationMs: number) => {
      if (durationMs <= 0) {
        return;
      }

      const startedAt = Date.now();
      setJsBlockStartEpochMs(startedAt);
      logActionEvent("block-js-start", { durationMs, epochMs: startedAt });
      runOnUI(() => {
        "worklet";
        workletBeatJsDuringBlock.value = 0;
        sharedSnapshotBeatJsDuringBlock.value = 0;
        jsBlockActive.value = 1;
      })();

      try {
        while (Date.now() - startedAt < durationMs) {
          Math.sqrt((Date.now() - startedAt) * Math.random());
        }
      } finally {
        const endedAt = Date.now();
        runOnUI(() => {
          "worklet";
          jsBlockActive.value = 0;
        })();
        setJsBlockCount((current) => current + 1);
        setJsBlockEndEpochMs(endedAt);
        logActionEvent("block-js-end", { durationMs, epochMs: endedAt });
      }
    },
    [
      jsBlockActive,
      logActionEvent,
      sharedSnapshotBeatJsDuringBlock,
      workletBeatJsDuringBlock,
    ]
  );

  useEffect(() => {
    if (!e2eMode) {
      return;
    }

    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const suppressExpoDevMenu = async () => {
      try {
        await devMenuPreferences?.setPreferencesAsync({
          motionGestureEnabled: false,
          touchGestureEnabled: false,
          keyCommandsEnabled: false,
          showsAtLaunch: false,
          showFloatingActionButton: false,
        });
        await devMenuInternal?.setOnboardingFinished(true);
        await devMenuInternal?.closeMenu();
      } catch (error) {
        console.warn(
          "[viewport-metrics-action]",
          "expo-dev-menu-suppression-error",
          error
        );
      }
    };

    void suppressExpoDevMenu();

    for (const delayMs of [250, 1000, 2000]) {
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          void suppressExpoDevMenu();
        }
      }, delayMs);
      timeoutIds.push(timeoutId);
    }

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active" && !cancelled) {
          void suppressExpoDevMenu();
        }
      }
    );

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      timeoutIds.forEach(clearTimeout);
    };
  }, [e2eMode]);

  const refreshNavigationBarVisibility = useCallback(async () => {
    if (Platform.OS !== "android") {
      setNavigationBarApiVisibility("unsupported");
      return;
    }

    try {
      const visibility = await NavigationBar.getVisibilityAsync();
      setNavigationBarApiVisibility(visibility);
    } catch (error) {
      console.warn(
        "[viewport-metrics-action]",
        "navigation-bar-visibility-error",
        error
      );
      setNavigationBarApiVisibility("error");
    }
  }, []);

  const setStatusBarVisibility = useCallback(async (visible: boolean) => {
    console.log(
      "[viewport-metrics-action]",
      "status-bar",
      visible ? "show" : "hide"
    );
    setStatusBarVisible(visible);
    setStatusBarHidden(!visible, "fade");
  }, []);

  const requestHomeIndicatorAutoHide = useCallback(() => {
    console.log("[viewport-metrics-action]", "home-indicator-auto-hide");
    setHomeIndicatorAutoHidden(Platform.OS === "ios");
  }, []);

  const applySystemBarsMode = useCallback(
    async (mode: SystemBarsMode) => {
      if (Platform.OS !== "android" || !exampleSystemUi) {
        return;
      }

      console.log("[viewport-metrics-action]", "system-bars-mode", mode);
      await exampleSystemUi.setSystemBarsMode(mode);
      const hidden = mode !== "visible";
      setSystemBarsMode(mode);
      setSystemBarsTarget(hidden ? "hidden" : "visible");
      setSystemBarsHidden(hidden);
      await refreshNavigationBarVisibility();
    },
    [refreshNavigationBarVisibility]
  );

  const toggleSystemBars = useCallback(
    async (hidden: boolean) => {
      if (Platform.OS !== "android" || !exampleSystemUi) {
        return;
      }

      console.log(
        "[viewport-metrics-action]",
        "system-bars",
        hidden ? "hide" : "show"
      );
      if (hidden) {
        await applySystemBarsMode("hidden-transient");
        return;
      }

      if (systemBarsMode === "locked-hidden") {
        await exampleSystemUi.requestShowSystemBars();
        await refreshNavigationBarVisibility();
        return;
      }

      await applySystemBarsMode("visible");
    },
    [applySystemBarsMode, refreshNavigationBarVisibility, systemBarsMode]
  );

  const applyOrientationLock = useCallback(
    async (nextLock: OrientationLockName) => {
      console.log("[viewport-metrics-action]", "orientation-lock", nextLock);

      switch (nextLock) {
        case "portrait-up":
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
          break;
        case "landscape-left":
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
          );
          break;
        case "landscape-right":
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
          );
          break;
        default:
          await ScreenOrientation.unlockAsync();
          break;
      }

      setOrientationLockLabel(nextLock);
    },
    []
  );

  const captureSyncSnapshot = useCallback(() => {
    const nextSnapshot = getViewportSnapshot();
    console.log(
      "[viewport-metrics-action]",
      "sync-read",
      nextSnapshot.revision
    );
    setSyncSnapshot(nextSnapshot);
    setSyncReadCount((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!autoSyncReadOnSnapshot) {
      return;
    }

    captureSyncSnapshot();
  }, [autoSyncReadOnSnapshot, captureSyncSnapshot, snapshot.revision]);

  const runAutomationCommand = useCallback(
    async (rawCommand: string) => {
      const command = rawCommand.split(":")[0]?.trim();

      if (!command) {
        return;
      }

      console.log("[viewport-metrics-action]", "command", command);

      switch (command) {
        case "syncRead":
          captureSyncSnapshot();
          break;
        case "blockJs":
          blockJsThread(4000);
          break;
        case "clearOrientationLock":
          await applyOrientationLock("default");
          break;
        case "lockPortraitUp":
          await applyOrientationLock("portrait-up");
          break;
        case "lockLandscapeLeft":
          await applyOrientationLock("landscape-left");
          break;
        case "lockLandscapeRight":
          await applyOrientationLock("landscape-right");
          break;
        case "hideStatusBar":
          await setStatusBarVisibility(false);
          break;
        case "showStatusBar":
          await setStatusBarVisibility(true);
          break;
        case "requestHomeIndicatorAutoHide":
          requestHomeIndicatorAutoHide();
          break;
        case "hideSystemBars":
          await toggleSystemBars(true);
          break;
        case "showSystemBars":
          await toggleSystemBars(false);
          break;
        case "requestShowSystemBars":
          if (Platform.OS === "android" && exampleSystemUi) {
            await exampleSystemUi.requestShowSystemBars();
            await refreshNavigationBarVisibility();
          }
          break;
        case "setSystemBarsVisible":
          await applySystemBarsMode("visible");
          break;
        case "setSystemBarsHiddenDefault":
          await applySystemBarsMode("hidden-default");
          break;
        case "setSystemBarsHiddenTransient":
          await applySystemBarsMode("hidden-transient");
          break;
        case "setSystemBarsLockedHidden":
          await applySystemBarsMode("locked-hidden");
          break;
        case "refreshNavigationBarVisibility":
          await refreshNavigationBarVisibility();
          break;
        default:
          console.warn("[viewport-metrics-action]", "unknown-command", command);
          break;
      }
    },
    [
      applyOrientationLock,
      applySystemBarsMode,
      blockJsThread,
      captureSyncSnapshot,
      requestHomeIndicatorAutoHide,
      refreshNavigationBarVisibility,
      setStatusBarVisibility,
      toggleSystemBars,
    ]
  );

  const handleAutomationCommandChange = useCallback(
    (nextValue: string) => {
      setAutomationCommand(nextValue);

      if (!nextValue.trim()) {
        return;
      }

      runAutomationCommand(nextValue).finally(() => {
        setAutomationCommand("");
      });
    },
    [runAutomationCommand]
  );

  useEffect(() => {
    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const scheduleTimeout = (callback: () => void, delayMs: number) => {
      const timeoutId = setTimeout(callback, delayMs);
      timeoutIds.push(timeoutId);
    };

    const initialize = async () => {
      const initialOrientationLock = readOrientationLock(
        launchArgs.initialOrientationLock
      );
      const hideHomeIndicatorOnMount = readBoolean(
        launchArgs.hideHomeIndicatorOnMount,
        Platform.OS === "ios" && homeIndicatorAutoHidden
      );
      const hideStatusBarOnMount = readBoolean(launchArgs.hideStatusBarOnMount);
      const hideSystemBarsOnMount = readBoolean(
        launchArgs.hideSystemBarsOnMount
      );
      const launchSystemBarsMode = readSystemBarsMode(
        launchArgs.systemBarsModeOnMount
      );
      const blockJsOnMountMs = readNumber(launchArgs.blockJsOnMountMs, 0);
      const blockJsOnMountDelayMs = readNumber(
        launchArgs.blockJsOnMountDelayMs,
        1000
      );
      const systemBarsShowAfterMountMs = readNumber(
        launchArgs.systemBarsShowAfterMountMs,
        -1
      );
      const systemBarsRehideAfterShowMs = readNumber(
        launchArgs.systemBarsRehideAfterShowMs,
        -1
      );

      if (initialOrientationLock !== "default") {
        await applyOrientationLock(initialOrientationLock);
      }

      await setStatusBarVisibility(!hideStatusBarOnMount);

      if (hideHomeIndicatorOnMount) {
        requestHomeIndicatorAutoHide();
      }

      if (hideSystemBarsOnMount) {
        await applySystemBarsMode("hidden-transient");
      } else if (launchArgs.systemBarsModeOnMount != null) {
        await applySystemBarsMode(launchSystemBarsMode);
      } else {
        await refreshNavigationBarVisibility();
      }

      if (blockJsOnMountMs > 0) {
        scheduleTimeout(() => {
          if (!cancelled) {
            blockJsThread(blockJsOnMountMs);
          }
        }, Math.max(blockJsOnMountDelayMs, 0));
      }

      if (
        Platform.OS === "android" &&
        exampleSystemUi &&
        systemBarsShowAfterMountMs >= 0
      ) {
        scheduleTimeout(() => {
          if (cancelled) {
            return;
          }

          exampleSystemUi
            .requestShowSystemBars()
            .then(refreshNavigationBarVisibility)
            .then(() => {
              if (cancelled || systemBarsRehideAfterShowMs < 0) {
                return;
              }

              scheduleTimeout(() => {
                if (!cancelled) {
                  applySystemBarsMode("hidden-transient");
                }
              }, systemBarsRehideAfterShowMs);
            })
            .catch((error) => {
              console.warn(
                "[viewport-metrics-action]",
                "scheduled-system-bars-show-error",
                error
              );
            });
        }, systemBarsShowAfterMountMs);
      }

      if (!cancelled) {
        setE2eReady(true);
      }
    };

    initialize();

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [
    applyOrientationLock,
    applySystemBarsMode,
    blockJsThread,
    launchArgs,
    homeIndicatorAutoHidden,
    refreshNavigationBarVisibility,
    requestHomeIndicatorAutoHide,
    setStatusBarVisibility,
  ]);

  return (
    <>
      <ExpoStatusBar hidden={!statusBarVisible} animated />
      <ScrollView
        testID="screen.viewportMetrics"
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <Text testID="screen.title" style={styles.title}>
          Viewport snapshot
        </Text>

        <Section title="Lifecycle">
          <MachineMetric
            label="Ready"
            testID="e2e.ready"
            value={String(e2eReady)}
          />
          <MachineMetric
            label="Orientation lock"
            testID="metric.orientationLock"
            value={orientationLockLabel}
          />
          <MachineMetric
            label="Live navigation visibility"
            testID="metric.liveNavigationBarVisibility"
            value={snapshot.systemAreas.navigationBar.visibility}
          />
          <MachineMetric
            label="Launch e2e mode"
            testID="metric.e2eMode"
            value={String(e2eMode)}
          />
        </Section>

        <Section title="Actions">
          <View style={styles.actions}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={handleAutomationCommandChange}
              placeholder="automation command"
              style={styles.commandInput}
              testID="action.commandInput"
              value={automationCommand}
            />
            <ActionButton
              testID="action.syncRead"
              title="Sync read"
              onPress={captureSyncSnapshot}
            />
            <ActionButton
              testID="action.blockJs"
              title="Block JS 4s"
              onPress={() => blockJsThread(4000)}
            />
            <ActionButton
              testID="action.clearOrientationLock"
              title="Unlock orientation"
              onPress={() => applyOrientationLock("default")}
            />
            <ActionButton
              testID="action.lockPortraitUp"
              title="Lock portrait"
              onPress={() => applyOrientationLock("portrait-up")}
            />
            <ActionButton
              testID="action.lockLandscapeLeft"
              title="Lock left"
              onPress={() => applyOrientationLock("landscape-left")}
            />
            <ActionButton
              testID="action.lockLandscapeRight"
              title="Lock right"
              onPress={() => applyOrientationLock("landscape-right")}
            />
            <ActionButton
              testID="action.hideStatusBar"
              title="Hide status"
              onPress={() => setStatusBarVisibility(false)}
            />
            <ActionButton
              testID="action.showStatusBar"
              title="Show status"
              onPress={() => setStatusBarVisibility(true)}
            />
            {Platform.OS === "ios" ? (
              <ActionButton
                testID="action.requestHomeIndicatorAutoHide"
                title="Hide home indicator"
                onPress={requestHomeIndicatorAutoHide}
              />
            ) : null}
            {Platform.OS === "android" ? (
              <>
                <ActionButton
                  testID="action.hideSystemBars"
                  title="Hide bars"
                  onPress={() => toggleSystemBars(true)}
                />
                <ActionButton
                  testID="action.showSystemBars"
                  title="Show bars"
                  onPress={() => toggleSystemBars(false)}
                />
                <ActionButton
                  testID="action.setSystemBarsHiddenDefault"
                  title="Hide default"
                  onPress={() => applySystemBarsMode("hidden-default")}
                />
                <ActionButton
                  testID="action.setSystemBarsHiddenTransient"
                  title="Hide transient"
                  onPress={() => applySystemBarsMode("hidden-transient")}
                />
                <ActionButton
                  testID="action.setSystemBarsLockedHidden"
                  title="Lock hidden"
                  onPress={() => applySystemBarsMode("locked-hidden")}
                />
                <ActionButton
                  testID="action.refreshNavigationBarVisibility"
                  title="Refresh nav API"
                  onPress={() => refreshNavigationBarVisibility()}
                />
              </>
            ) : null}
          </View>
        </Section>

        <Section title="Automation metrics">
          <MachineMetric
            label="Revision"
            testID="metric.revision"
            value={snapshot.revision}
          />
          <MachineMetric
            label="Sync revision"
            testID="metric.syncRevision"
            value={syncSnapshot.revision}
          />
          <MachineMetric
            label="Sync read count"
            testID="metric.syncReadCount"
            value={syncReadCount}
          />
          <MachineMetric
            label="JS listener count"
            testID="metric.jsListenerCount"
            value={jsListenerCount}
          />
          <MachineMetric
            label="JS block runs"
            testID="metric.jsBlockCount"
            value={jsBlockCount}
          />
          <MachineMetric
            label="JS block start"
            testID="metric.jsBlockStartEpochMs"
            value={jsBlockStartEpochMs}
          />
          <MachineMetric
            label="JS block end"
            testID="metric.jsBlockEndEpochMs"
            value={jsBlockEndEpochMs}
          />
          <MachineMetric
            label="Physical orientation"
            testID="metric.physicalOrientation"
            value={snapshot.physicalOrientation}
          />
          <MachineMetric
            label="Sync physical orientation"
            testID="metric.syncPhysicalOrientation"
            value={syncSnapshot.physicalOrientation}
          />
          <MachineMetric
            label="Logical orientation"
            testID="metric.logicalOrientation"
            value={snapshot.logicalOrientation}
          />
          <MachineMetric
            label="Sync logical orientation"
            testID="metric.syncLogicalOrientation"
            value={syncSnapshot.logicalOrientation}
          />
          <MachineMetric
            label="Window width"
            testID="metric.windowWidth"
            value={round(snapshot.window.width)}
          />
          <MachineMetric
            label="Sync window width"
            testID="metric.syncWindowWidth"
            value={round(syncSnapshot.window.width)}
          />
          <MachineMetric
            label="Window height"
            testID="metric.windowHeight"
            value={round(snapshot.window.height)}
          />
          <MachineMetric
            label="Sync window height"
            testID="metric.syncWindowHeight"
            value={round(syncSnapshot.window.height)}
          />
          <MachineMetric
            label="Root width"
            testID="metric.rootViewWidth"
            value={round(snapshot.rootView.width)}
          />
          <MachineMetric
            label="Root height"
            testID="metric.rootViewHeight"
            value={round(snapshot.rootView.height)}
          />
          <MachineMetric
            label="Safe top"
            testID="metric.safeAreaTop"
            value={round(snapshot.safeAreaInsets.top)}
          />
          <MachineMetric
            label="Sync safe top"
            testID="metric.syncSafeAreaTop"
            value={round(syncSnapshot.safeAreaInsets.top)}
          />
          <MachineMetric
            label="Safe right"
            testID="metric.safeAreaRight"
            value={round(snapshot.safeAreaInsets.right)}
          />
          <MachineMetric
            label="Safe bottom"
            testID="metric.safeAreaBottom"
            value={round(snapshot.safeAreaInsets.bottom)}
          />
          <MachineMetric
            label="Sync safe bottom"
            testID="metric.syncSafeAreaBottom"
            value={round(syncSnapshot.safeAreaInsets.bottom)}
          />
          <MachineMetric
            label="Safe left"
            testID="metric.safeAreaLeft"
            value={round(snapshot.safeAreaInsets.left)}
          />
          <MachineMetric
            label="Stable top"
            testID="metric.stableTop"
            value={round(snapshot.stableSystemInsets.top)}
          />
          <MachineMetric
            label="Sync stable top"
            testID="metric.syncStableTop"
            value={round(syncSnapshot.stableSystemInsets.top)}
          />
          <MachineMetric
            label="Stable right"
            testID="metric.stableRight"
            value={round(snapshot.stableSystemInsets.right)}
          />
          <MachineMetric
            label="Stable bottom"
            testID="metric.stableBottom"
            value={round(snapshot.stableSystemInsets.bottom)}
          />
          <MachineMetric
            label="Sync stable bottom"
            testID="metric.syncStableBottom"
            value={round(syncSnapshot.stableSystemInsets.bottom)}
          />
          <MachineMetric
            label="Stable left"
            testID="metric.stableLeft"
            value={round(snapshot.stableSystemInsets.left)}
          />
          <MachineMetric
            label="Status present"
            testID="metric.statusBarPresent"
            value={String(snapshot.systemAreas.statusBar.present)}
          />
          <MachineMetric
            label="Status visibility"
            testID="metric.statusBarVisibility"
            value={snapshot.systemAreas.statusBar.visibility}
          />
          <MachineMetric
            label="Sync status visibility"
            testID="metric.syncStatusBarVisibility"
            value={syncSnapshot.systemAreas.statusBar.visibility}
          />
          <MachineMetric
            label="Status height"
            testID="metric.statusBarHeight"
            value={round(snapshot.systemAreas.statusBar.height)}
          />
          <MachineMetric
            label="Sync status height"
            testID="metric.syncStatusBarHeight"
            value={round(syncSnapshot.systemAreas.statusBar.height)}
          />
          <MachineMetric
            label="Navigation present"
            testID="metric.navigationBarPresent"
            value={String(snapshot.systemAreas.navigationBar.present)}
          />
          <MachineMetric
            label="Navigation visibility"
            testID="metric.navigationBarVisibility"
            value={snapshot.systemAreas.navigationBar.visibility}
          />
          <MachineMetric
            label="Sync navigation visibility"
            testID="metric.syncNavigationBarVisibility"
            value={syncSnapshot.systemAreas.navigationBar.visibility}
          />
          <MachineMetric
            label="Navigation height"
            testID="metric.navigationBarHeight"
            value={round(snapshot.systemAreas.navigationBar.height)}
          />
          <MachineMetric
            label="Sync navigation height"
            testID="metric.syncNavigationBarHeight"
            value={round(syncSnapshot.systemAreas.navigationBar.height)}
          />
          <MachineMetric
            label="Navigation inset left"
            testID="metric.navigationBarInsetLeft"
            value={round(snapshot.systemAreas.navigationBar.insets.left)}
          />
          <MachineMetric
            label="Navigation inset right"
            testID="metric.navigationBarInsetRight"
            value={round(snapshot.systemAreas.navigationBar.insets.right)}
          />
          <MachineMetric
            label="Navigation stable left"
            testID="metric.navigationBarStableLeft"
            value={round(snapshot.systemAreas.navigationBar.stableInsets.left)}
          />
          <MachineMetric
            label="Navigation stable right"
            testID="metric.navigationBarStableRight"
            value={round(snapshot.systemAreas.navigationBar.stableInsets.right)}
          />
          <MachineMetric
            label="Navigation API visibility"
            testID="metric.navigationBarApiVisibility"
            value={navigationBarApiVisibility}
          />
          <MachineMetric
            label="Home indicator present"
            testID="metric.homeIndicatorPresent"
            value={String(snapshot.systemAreas.homeIndicator.present)}
          />
          <MachineMetric
            label="Home indicator auto hidden"
            testID="metric.homeIndicatorAutoHidden"
            value={String(homeIndicatorAutoHidden)}
          />
          <MachineMetric
            label="Home indicator height"
            testID="metric.homeIndicatorHeight"
            value={round(snapshot.systemAreas.homeIndicator.height)}
          />
          <MachineMetric
            label="Bottom gesture present"
            testID="metric.bottomGestureAreaPresent"
            value={String(snapshot.systemAreas.bottomGestureArea.present)}
          />
          <MachineMetric
            label="Bottom gesture height"
            testID="metric.bottomGestureAreaHeight"
            value={round(snapshot.systemAreas.bottomGestureArea.height)}
          />
          <MachineMetric
            label="System bars hidden"
            testID="metric.systemBarsHidden"
            value={String(systemBarsHidden)}
          />
          <MachineMetric
            label="System bars mode"
            testID="metric.systemBarsMode"
            value={systemBarsMode}
          />
          <MachineMetric
            label="System bars target"
            testID="metric.systemBarsTarget"
            value={systemBarsTarget}
          />
          <AnimatedMachineMetric
            label="Shared revision"
            testID="metric.sharedRevision"
            animatedProps={sharedRevisionProps}
          />
          <AnimatedMachineMetric
            label="Worklet listener count"
            testID="metric.workletListenerCount"
            animatedProps={workletCountProps}
          />
          <AnimatedMachineMetric
            label="Worklet beat JS during block"
            testID="metric.workletBeatJsDuringBlock"
            animatedProps={workletBeatProps}
          />
          <AnimatedMachineMetric
            label="JS block active"
            testID="metric.jsBlockActive"
            animatedProps={jsBlockActiveProps}
          />
          <AnimatedMachineMetric
            label="Shared snapshot beat JS during block"
            testID="metric.sharedSnapshotBeatJsDuringBlock"
            animatedProps={sharedSnapshotBeatProps}
          />
          <AnimatedMachineMetric
            label="Shared logical orientation"
            testID="metric.sharedLogicalOrientation"
            animatedProps={sharedLogicalOrientationProps}
          />
          <AnimatedMachineMetric
            label="Shared window width"
            testID="metric.sharedWindowWidth"
            animatedProps={sharedWindowWidthProps}
          />
          <AnimatedMachineMetric
            label="Shared navigation visibility"
            testID="metric.sharedNavigationBarVisibility"
            animatedProps={sharedNavigationVisibilityProps}
          />
          <AnimatedMachineMetric
            label="Bank portrait-up revision"
            testID="metric.bankPortraitUpRevision"
            animatedProps={bankPortraitUpRevisionProps}
          />
          <AnimatedMachineMetric
            label="Bank portrait-down revision"
            testID="metric.bankPortraitDownRevision"
            animatedProps={bankPortraitDownRevisionProps}
          />
          <AnimatedMachineMetric
            label="Bank landscape-left revision"
            testID="metric.bankLandscapeLeftRevision"
            animatedProps={bankLandscapeLeftRevisionProps}
          />
          <AnimatedMachineMetric
            label="Bank landscape-right revision"
            testID="metric.bankLandscapeRightRevision"
            animatedProps={bankLandscapeRightRevisionProps}
          />
          <AnimatedMachineMetric
            label="Bank left nav inset right"
            testID="metric.bankLandscapeLeftNavigationInsetRight"
            animatedProps={bankLandscapeLeftNavigationRightProps}
          />
          <AnimatedMachineMetric
            label="Bank right nav inset left"
            testID="metric.bankLandscapeRightNavigationInsetLeft"
            animatedProps={bankLandscapeRightNavigationLeftProps}
          />
          <AnimatedMachineMetric
            label="Bank left nav stable right"
            testID="metric.bankLandscapeLeftNavigationStableRight"
            animatedProps={bankLandscapeLeftStableRightProps}
          />
          <AnimatedMachineMetric
            label="Bank right nav stable left"
            testID="metric.bankLandscapeRightNavigationStableLeft"
            animatedProps={bankLandscapeRightStableLeftProps}
          />
        </Section>

        <Section title="Formatted snapshot">
          <Metric label="window" value={formatSize(snapshot.window)} />
          <Metric label="screen" value={formatSize(snapshot.screen)} />
          <Metric label="root view" value={formatRect(snapshot.rootView)} />
          <Metric
            label="safe area"
            value={formatInsets(snapshot.safeAreaInsets)}
          />
          <Metric
            label="stable system"
            value={formatInsets(snapshot.stableSystemInsets)}
          />
          <Metric
            label="status bar"
            value={formatSystemArea(snapshot.systemAreas.statusBar)}
          />
          <Metric
            label="navigation bar"
            value={formatSystemArea(snapshot.systemAreas.navigationBar)}
          />
          <Metric
            label="home indicator"
            value={formatSystemArea(snapshot.systemAreas.homeIndicator)}
          />
          <Metric
            label="bottom gesture area"
            value={formatSystemArea(snapshot.systemAreas.bottomGestureArea)}
          />
        </Section>

        <View style={styles.workletCard}>
          <Text style={styles.sectionTitle}>Worklet pulse</Text>
          <View style={styles.workletBarTrack}>
            <Animated.View style={[styles.workletBarFill, workletPulseStyle]} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function ActionButton({
  onPress,
  testID,
  title,
}: {
  onPress: () => void;
  testID: string;
  title: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessible
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.actionButton}
      testID={testID}
    >
      <Text style={styles.actionButtonLabel}>{title}</Text>
    </TouchableOpacity>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MachineMetric({
  label,
  testID,
  value,
}: {
  label: string;
  testID: string;
  value: React.ReactNode;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text testID={testID} style={styles.metricValue}>
        {String(value)}
      </Text>
    </View>
  );
}

function AnimatedMachineMetric({
  animatedProps,
  label,
  testID,
}: {
  animatedProps: object;
  label: string;
  testID: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <AnimatedTextInput
        testID={testID}
        editable={false}
        underlineColorAndroid="transparent"
        style={styles.animatedValue}
        animatedProps={animatedProps}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function safeReadLaunchArgs(): ExampleLaunchArgs {
  try {
    return LaunchArguments.value<ExampleLaunchArgs>();
  } catch (error) {
    console.warn(
      "[viewport-metrics-action]",
      "launch-arguments-unavailable",
      error
    );
    return {};
  }
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOrientationLock(value: unknown): OrientationLockName {
  switch (value) {
    case "portrait-up":
    case "landscape-left":
    case "landscape-right":
      return value;
    default:
      return "default";
  }
}

function readSystemBarsMode(value: unknown): SystemBarsMode {
  switch (value) {
    case "hidden-default":
    case "hidden-transient":
    case "locked-hidden":
    case "visible":
      return value;
    default:
      return "visible";
  }
}

function formatSize(size: { width: number; height: number; scale: number }) {
  return `${round(size.width)} x ${round(size.height)} @${round(size.scale)}`;
}

function formatRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return `${round(rect.x)}, ${round(rect.y)}, ${round(rect.width)} x ${round(
    rect.height
  )}`;
}

function formatInsets(insets: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}) {
  return `t:${round(insets.top)} r:${round(insets.right)} b:${round(
    insets.bottom
  )} l:${round(insets.left)}`;
}

function formatSystemArea(area: {
  kind: string;
  present: boolean;
  visibility: string;
  height: number;
  source: string;
}) {
  return `${area.kind} present:${String(area.present)} visibility:${
    area.visibility
  } height:${round(area.height)} source:${area.source}`;
}

function round(value: number) {
  "worklet";
  return Math.round(value * 100) / 100;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#10141b",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#17212e",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  commandInput: {
    borderColor: "#405169",
    borderRadius: 12,
    borderWidth: 1,
    color: "#f8fafc",
    minWidth: 180,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#273449",
    borderRadius: 12,
    justifyContent: "center",
    minWidth: 150,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonLabel: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metricLabel: {
    color: "#94a3b8",
    flex: 1,
    fontSize: 14,
  },
  metricValue: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 14,
    textAlign: "right",
  },
  animatedValue: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    textAlign: "right",
  },
  workletCard: {
    backgroundColor: "#17212e",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  workletBarTrack: {
    backgroundColor: "#273449",
    borderRadius: 999,
    height: 16,
    overflow: "hidden",
  },
  workletBarFill: {
    borderRadius: 999,
    height: "100%",
  },
});
