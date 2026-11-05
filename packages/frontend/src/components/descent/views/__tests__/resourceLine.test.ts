import { describe, expect, test } from "bun:test";
import { resourceLineParts } from "../resourceLine";

describe("resourceLineParts", () => {
  test("replaces stockpile names with their icons and keeps amounts", () => {
    expect(resourceLineParts("Food 30 · Water 15 · 4s")).toEqual([
      {
        iconSrc: "/descent/resource-icons/food.png",
        key: "resource-0",
        kind: "resource",
        name: "Food",
      },
      { key: "text-4", kind: "text", text: " 30 · " },
      {
        iconSrc: "/descent/resource-icons/water.png",
        key: "resource-10",
        kind: "resource",
        name: "Water",
      },
      { key: "text-15", kind: "text", text: " 15 · 4s" },
    ]);
  });

  test("uses the herbs icon for both cost names", () => {
    const herbs = resourceLineParts("Spirit Herbs 2 · Herbs 4");
    expect(herbs.filter((part) => part.kind === "resource")).toEqual([
      {
        iconSrc: "/descent/resource-icons/spirit_herbs.png",
        key: "resource-0",
        kind: "resource",
        name: "Spirit Herbs",
      },
      {
        iconSrc: "/descent/resource-icons/spirit_herbs.png",
        key: "resource-17",
        kind: "resource",
        name: "Herbs",
      },
    ]);
  });

  test("leaves lines without a resource name unchanged", () => {
    expect(resourceLineParts("No idle villagers")).toEqual([
      { key: "text-0", kind: "text", text: "No idle villagers" },
    ]);
  });
});
