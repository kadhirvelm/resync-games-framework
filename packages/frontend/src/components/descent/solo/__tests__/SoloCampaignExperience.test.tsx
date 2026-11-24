/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SoloCampaignExperience } from "../SoloCampaignExperience";

describe("solo campaign selection", () => {
  test("offers the first mission and locks later missions on a new campaign", () => {
    const html = renderToStaticMarkup(
      <SoloCampaignExperience
        fullscreen={false}
        onBack={() => {}}
        onSetSoundEnabled={() => {}}
        soundEnabled={true}
      />,
    );
    expect(html).toContain("Solo Campaign");
    expect(html).toContain("Launch mission");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    expect(html).toContain("only campaign progress carries over");
  });
});
