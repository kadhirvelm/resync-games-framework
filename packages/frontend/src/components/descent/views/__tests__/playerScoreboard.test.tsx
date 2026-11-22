/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PlayerScoreboard } from "../PlayerScoreboard";
import type { PlayerRosterReadout } from "../presentation";
import { createAshenGatePreview } from "../preview";
import { buildShellModel } from "../shellModel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Mounted scoreboard test fixture. */
interface MountedScoreboard {
  container: HTMLDivElement;
  root: Root;
}

let mounted: MountedScoreboard | undefined;

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => current.root.unmount());
  current.container.remove();
});

/**
 * Mounts or rerenders a two-player scoreboard fixture.
 * @param players - Scores to display
 * @returns Rendered container
 */
async function renderScores(
  players: readonly PlayerRosterReadout[],
): Promise<HTMLDivElement> {
  if (mounted === undefined) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted = { container, root: createRoot(container) };
  }
  const current = mounted;
  await act(async () => {
    current.root.render(
      <PlayerScoreboard localPlayerId="p1" players={players} />,
    );
  });
  return current.container;
}

/**
 * Creates one roster score row.
 * @param id - Player id
 * @param name - Display name
 * @param slotIndex - Original roster position
 * @param total - Total score; category values use fixed test proportions
 * @returns Scoreboard player
 */
function player(
  id: string,
  name: string,
  slotIndex: number,
  total: number,
): PlayerRosterReadout {
  return {
    color: id === "p1" ? "#f2c14e" : "#4db8ff",
    id,
    name,
    score: {
      cultivation: Math.floor(total / 4),
      economy: Math.floor(total / 2),
      military: total - Math.floor(total / 4) - Math.floor(total / 2),
      total,
    },
    slotIndex,
  };
}

describe("PlayerScoreboard", () => {
  it("ranks players, marks the viewer, and normalizes bars to the leader", async () => {
    const container = await renderScores([
      player("p1", "Aria", 0, 25),
      player("p2", "Bram", 1, 50),
    ]);
    const rows = container.querySelectorAll("[data-testid=player-score-row]");

    expect(rows[0]?.getAttribute("data-player-id")).toBe("p2");
    expect(rows[1]?.getAttribute("data-player-id")).toBe("p1");
    expect(rows[0]?.textContent).toContain("#1");
    expect(rows[0]?.textContent).toContain("50");
    expect(rows[1]?.textContent).toContain("(You)");
    expect(
      container.querySelector("[data-score-fill=p2]")?.getAttribute("style"),
    ).toContain("width: 100%");
    expect(
      container.querySelector("[data-score-fill=p1]")?.getAttribute("style"),
    ).toContain("width: 50%");
  });

  it("normalizes a pre-scoring serialized roster before rendering", async () => {
    const preview = createAshenGatePreview();
    const snapshot = {
      ...preview,
      meta: {
        ...preview.meta,
        ui: {
          players: [
            { color: "#f2c14e", id: "legacy", name: "Legacy", slotIndex: 0 },
          ],
        },
      },
    };
    const model = buildShellModel(snapshot);
    const container = await renderScores(model.players);

    expect(model.players[0]?.score).toEqual({
      cultivation: 0,
      economy: 0,
      military: 0,
      total: 0,
    });
    expect(
      container.querySelector("[data-player-id=legacy]")?.textContent,
    ).toContain("0");
  });

  it("exposes the complete scoring formula to keyboard and touch users", async () => {
    const container = await renderScores([player("p1", "Aria", 0, 25)]);
    const summary = container.querySelector("summary");
    if (!(summary instanceof HTMLElement))
      throw new Error("Missing score help");

    await act(async () => {
      summary.click();
    });

    const details = container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(true);
    expect(details?.textContent).toContain("surviving units");
    expect(details?.textContent).toContain("survives unit deaths");
  });

  it("reranks and updates category values as scores progress", async () => {
    await renderScores([
      player("p1", "Aria", 0, 25),
      player("p2", "Bram", 1, 50),
    ]);
    const container = await renderScores([
      player("p1", "Aria", 0, 75),
      player("p2", "Bram", 1, 50),
    ]);
    const rows = container.querySelectorAll("[data-testid=player-score-row]");

    expect(rows[0]?.getAttribute("data-player-id")).toBe("p1");
    expect(rows[0]?.textContent).toContain("75");
    expect(rows[0]?.textContent).toContain("Military");
    expect(rows[0]?.textContent).toContain("Economy");
    expect(rows[0]?.textContent).toContain("Cultivation");
    expect(
      container.querySelector("[data-score-fill=p2]")?.getAttribute("style"),
    ).toContain("width: 66.666");
  });
});
