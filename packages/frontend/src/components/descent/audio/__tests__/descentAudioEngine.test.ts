import { afterEach, describe, expect, test } from "bun:test";
import {
  isDescentAudioRunning,
  setDescentAudioBackgrounded,
  setDescentAudioEnabled,
  setDescentAudioScene,
  stopDescentAudio,
  subscribeDescentAudioStateChange,
  unlockDescentAudio,
} from "../descentAudioEngine";

interface FakeAudioContextInstance {
  destination: object;
  gainNode: { connect: () => void; gain: { value: number } };
  resumeCalls: number;
  state: AudioContextState;
  suspendCalls: number;
  triggerStateChange: (next: AudioContextState) => void;
}

const originalAudioContext = (
  window as Window & { AudioContext?: typeof AudioContext }
).AudioContext;

let fakeInstance: FakeAudioContextInstance | undefined;

/**
 * Installs a controllable fake AudioContext on `window`.
 * @param options - Initial state and whether `resume()` rejects
 * @returns Accessor for the created fake context instance
 */
function installFakeAudioContext(options: {
  initialState?: AudioContextState;
  rejectResume?: boolean;
}) {
  let rejectResume = options.rejectResume ?? false;
  const instances: FakeAudioContextInstance[] = [];

  class FakeAudioContext {
    destination = {};
    state: AudioContextState = options.initialState ?? "suspended";
    resumeCalls = 0;
    suspendCalls = 0;
    gainNode = {
      connect: () => {},
      gain: { value: 1 },
    };
    private listeners = new Set<() => void>();

    constructor() {
      const record: FakeAudioContextInstance = {
        destination: this.destination,
        gainNode: this.gainNode,
        get resumeCalls() {
          return self.resumeCalls;
        },
        get state() {
          return self.state;
        },
        set state(value: AudioContextState) {
          self.state = value;
        },
        get suspendCalls() {
          return self.suspendCalls;
        },
        triggerStateChange: (next: AudioContextState) => {
          this.state = next;
          for (const listener of this.listeners) listener();
        },
      };
      const self = this;
      instances.push(record);
      fakeInstance = record;
    }

    addEventListener(type: string, listener: () => void) {
      if (type === "statechange") this.listeners.add(listener);
    }

    createGain() {
      return this.gainNode;
    }

    async resume() {
      this.resumeCalls += 1;
      if (rejectResume) {
        throw new Error("NotAllowedError");
      }
      this.state = "running";
      for (const listener of this.listeners) listener();
    }

    async suspend() {
      this.suspendCalls += 1;
      this.state = "suspended";
      for (const listener of this.listeners) listener();
    }
  }

  (
    window as unknown as { AudioContext: typeof FakeAudioContext }
  ).AudioContext = FakeAudioContext;

  return {
    getInstance: () => instances[0] ?? fakeInstance,
    setRejectResume: (next: boolean) => {
      rejectResume = next;
    },
  };
}

afterEach(() => {
  stopDescentAudio();
  setDescentAudioBackgrounded(false);
  if (originalAudioContext === undefined) {
    delete (window as { AudioContext?: typeof AudioContext }).AudioContext;
  } else {
    (window as { AudioContext?: typeof AudioContext }).AudioContext =
      originalAudioContext;
  }
});

describe("descentAudioEngine lifecycle", () => {
  test("unlocks and resumes audio cleanly on setDescentAudioEnabled(true), catching resume rejections", async () => {
    const fake = installFakeAudioContext({
      initialState: "suspended",
      rejectResume: true,
    });
    const observedStates: AudioContextState[] = [];
    const unsubscribe = subscribeDescentAudioStateChange((state) => {
      observedStates.push(state);
    });

    // First attempt outside a gesture rejects resume cleanly without throwing.
    setDescentAudioEnabled(true);
    await Promise.resolve();
    await Promise.resolve();
    const instance = fake.getInstance();
    expect(instance).toBeDefined();
    expect(instance?.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(isDescentAudioRunning()).toBe(false);

    // Subsequent attempt inside a gesture resolves and transitions to running.
    fake.setRejectResume(false);
    unlockDescentAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(isDescentAudioRunning()).toBe(true);
    expect(observedStates).toContain("running");

    unsubscribe();
  });

  test("mutes and suspends when backgrounded and resumes when visible again if active and enabled", async () => {
    const fake = installFakeAudioContext({
      initialState: "suspended",
      rejectResume: false,
    });
    setDescentAudioScene({
      active: true,
      ambience: "volcanic-ambience",
      music: "hold-music",
    });
    setDescentAudioEnabled(true);
    await Promise.resolve();
    await Promise.resolve();

    const instance = fake.getInstance();
    expect(instance).toBeDefined();
    expect(isDescentAudioRunning()).toBe(true);
    expect(instance?.gainNode.gain.value).toBe(1);

    const suspendBefore = instance?.suspendCalls ?? 0;
    setDescentAudioBackgrounded(true);
    await Promise.resolve();
    expect(instance?.gainNode.gain.value).toBe(0);
    expect(instance?.suspendCalls).toBe(suspendBefore + 1);
    expect(isDescentAudioRunning()).toBe(false);

    const resumeBefore = instance?.resumeCalls ?? 0;
    setDescentAudioBackgrounded(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(instance?.gainNode.gain.value).toBe(1);
    expect(instance?.resumeCalls).toBe(resumeBefore + 1);
    expect(isDescentAudioRunning()).toBe(true);
  });
});
