/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DescentView } from "../../views/DescentView";
import { createAshenGatePreview } from "../../views/preview";
import {
  type DescentUnitAcknowledgement,
  subscribeDescentUnitAcknowledgement,
} from "../descentCommandAck";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** Unmounts the shell after each interaction test. */
afterEach(async () => {
  if (root !== undefined) {
    const current = root;
    root = undefined;
    await act(async () => current.unmount());
  }
  container?.remove();
  container = undefined;
});

describe("viewport unit acknowledgements", () => {
  test("publishes selection and command events through the unchanged shell", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DescentView snapshot={createAshenGatePreview()} />);
    });
    const received: DescentUnitAcknowledgement[] = [];
    const unsubscribe = subscribeDescentUnitAcknowledgement((event) => {
      received.push(event);
    });
    const unit = container.querySelector('[data-unit-id="warden-1"]');
    if (!(unit instanceof HTMLButtonElement)) throw new Error("Missing warden");
    await act(async () => unit.click());
    const map = container.querySelector("[data-testid=descent-map]");
    if (!(map instanceof HTMLElement)) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        toJSON: () => ({}),
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 40,
        }),
      );
    });
    unsubscribe();
    expect(received).toEqual([
      { classId: "warden", kind: "select" },
      { classId: "warden", kind: "command" },
    ]);
  });
});
