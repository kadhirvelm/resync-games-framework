import { describe, expect, test } from "bun:test";
import { buildCardButtons, type CardButton, commandIconSrc } from "../card";
import { createAshenGatePreview } from "../preview";
import { buildShellModel } from "../shellModel";

/**
 * @param intent - Command intent
 * @returns A minimal button for icon lookup
 */
function button(intent: CardButton["intent"]): CardButton {
  return { id: intent.type, intent, label: intent.type };
}

describe("commandIconSrc", () => {
  test("uses a painted icon for breakthrough, stop, and schools", () => {
    expect(
      commandIconSrc(button({ type: "breakthrough", unitId: "warden-1" })),
    ).toBe("/descent/command-icons/breakthrough.png");
    expect(commandIconSrc(button({ type: "stop", unitIds: ["v1"] }))).toBe(
      "/descent/command-icons/stop.png",
    );
    expect(
      commandIconSrc(
        button({ school: "rime", type: "school", unitId: "warden-1" }),
      ),
    ).toBe("/descent/command-icons/school-rime.png");
  });

  test("leaves formation buttons to their tactical diagram", () => {
    expect(
      commandIconSrc(button({ formation: "wedge", type: "formation" })),
    ).toBe("");
  });
});

describe("formation command buttons", () => {
  test("offers every preset for a military group and marks the active one", () => {
    const model = buildShellModel(createAshenGatePreview());
    const buttons = buildCardButtons(
      model,
      { buildingId: null, unitIds: ["warden-1", "adept-1"] },
      null,
      "wedge",
    ).filter((entry) => entry.intent.type === "formation");
    expect(
      buttons.map((entry) =>
        entry.intent.type === "formation" ? entry.intent.formation : null,
      ),
    ).toEqual(["ranks", "line", "wedge", "column"]);
    expect(buttons.find((entry) => entry.pressed)?.label).toBe("Wedge");
  });
});
