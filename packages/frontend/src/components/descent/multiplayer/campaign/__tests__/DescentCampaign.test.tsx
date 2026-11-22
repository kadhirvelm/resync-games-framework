/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import {
  createInitialDescentRoomState,
  type DescentCampaignState,
  type DescentMapId,
  type DescentRoomPlayer,
} from "@resync-game-framework/api";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DescentLobby } from "../../DescentLobby";
import {
  DescentCampaignBriefing,
  DescentCampaignDebrief,
} from "../DescentCampaign";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roster: DescentRoomPlayer[] = [
  { color: "#fff", colorIndex: 0, id: "host", name: "Host", slotIndex: 0 },
  { color: "#abc", colorIndex: 1, id: "ally", name: "Ally", slotIndex: 1 },
];

/** Creates server-owned campaign test progress for one terminal state.
 * @param status - Requested campaign lifecycle status
 * @returns Mission progress with one outstanding peer report
 */
function campaign(
  status: DescentCampaignState["status"],
): DescentCampaignState {
  return {
    completedMissionIds: [],
    missionIndex: 0,
    outcomes: { host: "victory" },
    status,
  };
}

/** Renders a terminal state without starting a simulation.
 * @param status - Campaign status
 * @param isHost - Whether actions should be available
 * @returns Static debrief markup
 */
function debrief(
  status: DescentCampaignState["status"],
  isHost = true,
): string {
  return renderToStaticMarkup(
    <DescentCampaignDebrief
      campaign={campaign(status)}
      isHost={isHost}
      onAction={async () => {}}
      onExit={async () => {}}
      roster={roster}
    />,
  );
}

describe("Descent campaign presentation", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("briefs all three existing-content missions and explains save/reset boundaries", () => {
    const html = renderToStaticMarkup(<DescentCampaignBriefing />);
    expect((html.match(/<li /g) ?? []).length).toBe(3);
    expect(html).toContain("fresh forces");
    expect(html).toContain("final player leaving deletes");
    expect(html).toContain('aria-current="step"');
  });

  test("waits for all locked players rather than offering an early advance", () => {
    const html = debrief("active");
    expect(html).toContain("Disconnected commanders must reconnect");
    expect(html).toContain("Awaiting result");
    expect(html).not.toContain("Next mission</button>");
    expect(html).not.toContain("Retry mission</button>");
  });

  test("only the host gets next/retry actions", () => {
    expect(debrief("victory")).toContain("Next mission</button>");
    expect(debrief("defeat")).toContain("Retry mission</button>");
    expect(debrief("victory", false)).not.toContain("Next mission</button>");
    expect(debrief("defeat", false)).toContain("Waiting for the host to retry");
  });

  test("completion has an exit and no more mission/retry actions", () => {
    const html = debrief("completed");
    expect(html).toContain("Campaign complete");
    expect(html).toContain("Exit campaign</button>");
    expect(html).not.toContain("Next mission</button>");
    expect(html).not.toContain("Retry mission</button>");
  });

  test("campaign lobby defaults to mission one and launches the selected campaign", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let launched: DescentMapId | undefined;
    await act(async () =>
      root?.render(
        <DescentLobby
          defaultMapId="ashen_campaign_1"
          error={null}
          isHost={true}
          onBack={() => {}}
          onCreateRoom={async () => {}}
          onJoinRoom={async () => {}}
          onLeaveRoom={async () => true}
          onPlayerNameChange={() => {}}
          onStartMatch={async (mapId) => {
            launched = mapId;
          }}
          player={{ id: "host", name: "Host" }}
          room={{
            createdAt: "now",
            gameId: "descent",
            gameState: createInitialDescentRoomState(),
            hostPlayerId: "host",
            id: "ROOM01",
            maxPlayers: 4,
            players: [{ id: "host", joinedAt: "now", name: "Host" }],
            revision: 1,
            updatedAt: "now",
          }}
          status="connected"
        />,
      ),
    );
    expect(
      container
        .querySelector('[data-testid="descent-mode-ashen_campaign_1"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.textContent).toContain("fresh forces");
    const launch = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Start Co-op Campaign",
    );
    await act(async () => launch?.click());
    expect(launched).toBe("ashen_campaign_1");
  });

  test("keeps actions busy and surfaces a failed retry", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let rejectAction: ((error: Error) => void) | undefined;
    let calls = 0;
    await act(async () =>
      root?.render(
        <DescentCampaignDebrief
          campaign={campaign("defeat")}
          isHost={true}
          onAction={() => {
            calls += 1;
            return new Promise<void>((_resolve, reject) => {
              rejectAction = reject;
            });
          }}
          onExit={async () => {}}
          roster={roster}
        />,
      ),
    );
    const retry = container.querySelector("button");
    await act(async () => retry?.click());
    expect(calls).toBe(1);
    expect(retry?.disabled).toBe(true);
    await act(async () => rejectAction?.(new Error("Room disconnected")));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Room disconnected",
    );
    expect(retry?.disabled).toBe(false);
  });
});
