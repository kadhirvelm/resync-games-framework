import { readFile } from "node:fs/promises";
import type {
  ThreeDAsset,
  ThreeDAssetKind,
  ThreeDAssetList,
  ThreeDDesign,
  ThreeDJob,
  ThreeDPart,
  ThreeDProvider,
} from "../packages/api/src/services/assetClasses/threeD";
import {
  ASHEN_GATE_3D_ASSETS,
  type AshenGateAssetRole,
} from "../packages/frontend/src/components/descent/data/layers/ashen_gate/threeDAssets";

interface DescentAssetSpec {
  design: ThreeDDesign;
  kind: ThreeDAssetKind;
  meshyPolish?: boolean;
  prompt: string;
  role: AshenGateAssetRole;
}

/** Returns the canonical runtime name for one generated role. */
function nameFor(role: AshenGateAssetRole): string {
  const definition = ASHEN_GATE_3D_ASSETS.find(
    (candidate) => candidate.role === role,
  );
  if (definition === undefined) throw new Error(`Unknown asset role: ${role}`);
  return definition.name;
}

/** Creates one bounded compiler primitive with a default body joint. */
function part(
  name: string,
  shape: ThreeDPart["shape"],
  position: ThreeDPart["position"],
  scale: ThreeDPart["scale"],
  color: string,
  joint: ThreeDPart["joint"] = "body",
): ThreeDPart {
  return { color, joint, name, position, scale, shape };
}

type WeaponStyle = "bow" | "dualBlades" | "hammer" | "spear" | "staff";

/**
 * Builds a bold class-readable weapon silhouette for the six-joint rig.
 * @param palette - Character colors used by the weapon parts
 * @param style - Combat class weapon language
 * @returns Structured parts attached to the animated arms or body
 */
function weaponParts(
  palette: { armor: string; weapon: string },
  style: WeaponStyle,
): ThreeDPart[] {
  if (style === "bow") {
    return [
      part(
        "tall bow",
        "cylinder",
        [-0.78, 1.25, 0],
        [0.12, 2.25, 0.12],
        palette.weapon,
        "leftArm",
      ),
      part(
        "bow grip",
        "box",
        [-0.78, 1.25, 0.05],
        [0.34, 0.22, 0.16],
        palette.armor,
        "leftArm",
      ),
      part(
        "drawn arrow",
        "cylinder",
        [0.72, 1.25, 0],
        [0.08, 1.65, 0.08],
        palette.armor,
        "rightArm",
      ),
      part(
        "quiver",
        "box",
        [0.45, 1.35, -0.42],
        [0.42, 1.15, 0.28],
        palette.weapon,
      ),
    ];
  }
  if (style === "dualBlades") {
    return [
      part(
        "left blade",
        "box",
        [-0.72, 0.92, 0],
        [0.18, 1.25, 0.12],
        palette.armor,
        "leftArm",
      ),
      part(
        "right blade",
        "box",
        [0.72, 0.92, 0],
        [0.18, 1.25, 0.12],
        palette.armor,
        "rightArm",
      ),
    ];
  }
  if (style === "hammer") {
    return [
      part(
        "maul shaft",
        "cylinder",
        [0.75, 1.08, 0],
        [0.14, 2.1, 0.14],
        palette.weapon,
        "rightArm",
      ),
      part(
        "maul head",
        "box",
        [0.75, 2.05, 0],
        [1.05, 0.48, 0.58],
        palette.armor,
        "rightArm",
      ),
    ];
  }
  if (style === "staff") {
    return [
      part(
        "focus staff",
        "cylinder",
        [0.76, 1.08, 0],
        [0.12, 2.35, 0.12],
        palette.weapon,
        "rightArm",
      ),
      part(
        "staff focus",
        "cylinder",
        [0.76, 2.28, 0],
        [0.58, 0.34, 0.58],
        palette.armor,
        "rightArm",
      ),
      part(
        "focus crossbar",
        "box",
        [0.76, 2.28, 0],
        [0.95, 0.14, 0.14],
        palette.weapon,
        "rightArm",
      ),
    ];
  }
  return [
    part(
      "weapon shaft",
      "cylinder",
      [0.76, 1.05, 0],
      [0.1, 1.85, 0.1],
      palette.weapon,
      "rightArm",
    ),
    part(
      "weapon blade",
      "box",
      [0.76, 2.02, 0],
      [0.22, 0.65, 0.12],
      palette.armor,
      "rightArm",
    ),
  ];
}

/** Builds a readable six-joint low-poly fighter for the built-in rig. */
function humanoid(
  name: string,
  palette: { armor: string; cloth: string; skin: string; weapon: string },
  options: {
    heavy?: boolean;
    horns?: boolean;
    shield?: boolean;
    weapon?: WeaponStyle;
    worker?: boolean;
  } = {},
): ThreeDDesign {
  const parts: ThreeDPart[] = [
    part("torso", "box", [0, 1.2, 0], [0.78, 0.85, 0.42], palette.cloth),
    part(
      "chest armor",
      "box",
      [0, 1.35, 0.03],
      [0.88, 0.5, 0.48],
      palette.armor,
    ),
    part("belt", "box", [0, 0.83, 0], [0.82, 0.14, 0.45], palette.weapon),
    part(
      "head",
      "cylinder",
      [0, 1.95, 0],
      [0.52, 0.52, 0.52],
      palette.skin,
      "head",
    ),
    part(
      "helm",
      "cylinder",
      [0, 2.22, 0],
      [0.62, 0.3, 0.62],
      palette.armor,
      "head",
    ),
    part(
      "left arm",
      "cylinder",
      [-0.58, 1.2, 0],
      [0.25, 0.82, 0.25],
      palette.armor,
      "leftArm",
    ),
    part(
      "right arm",
      "cylinder",
      [0.58, 1.2, 0],
      [0.25, 0.82, 0.25],
      palette.armor,
      "rightArm",
    ),
    part(
      "left hand",
      "cylinder",
      [-0.58, 0.75, 0],
      [0.26, 0.24, 0.26],
      palette.skin,
      "leftArm",
    ),
    part(
      "right hand",
      "cylinder",
      [0.58, 0.75, 0],
      [0.26, 0.24, 0.26],
      palette.skin,
      "rightArm",
    ),
    part(
      "left leg",
      "cylinder",
      [-0.24, 0.36, 0],
      [0.3, 0.75, 0.3],
      palette.cloth,
      "leftLeg",
    ),
    part(
      "right leg",
      "cylinder",
      [0.24, 0.36, 0],
      [0.3, 0.75, 0.3],
      palette.cloth,
      "rightLeg",
    ),
    part(
      "left boot",
      "box",
      [-0.24, 0.04, 0.13],
      [0.34, 0.2, 0.58],
      palette.weapon,
      "leftLeg",
    ),
    part(
      "right boot",
      "box",
      [0.24, 0.04, 0.13],
      [0.34, 0.2, 0.58],
      palette.weapon,
      "rightLeg",
    ),
  ];
  if (options.worker) {
    parts.push(
      part(
        "tool shaft",
        "cylinder",
        [0.72, 0.95, 0],
        [0.1, 1.5, 0.1],
        palette.weapon,
        "rightArm",
      ),
      part(
        "tool head",
        "box",
        [0.72, 1.65, 0],
        [0.62, 0.15, 0.16],
        palette.armor,
        "rightArm",
      ),
      part(
        "gathering pack",
        "box",
        [0, 1.2, -0.4],
        [0.65, 0.7, 0.3],
        palette.weapon,
      ),
    );
  } else {
    parts.push(...weaponParts(palette, options.weapon ?? "spear"));
  }
  if (options.heavy) {
    parts.push(
      part(
        "left pauldron",
        "cylinder",
        [-0.62, 1.62, 0],
        [0.58, 0.34, 0.58],
        palette.armor,
        "leftArm",
      ),
      part(
        "right pauldron",
        "cylinder",
        [0.62, 1.62, 0],
        [0.58, 0.34, 0.58],
        palette.armor,
        "rightArm",
      ),
    );
  }
  if (options.shield) {
    parts.push(
      part(
        "shield",
        "cylinder",
        [-0.78, 1.15, 0.08],
        [0.82, 0.18, 0.82],
        palette.armor,
        "leftArm",
      ),
      part(
        "shield boss",
        "cylinder",
        [-0.8, 1.15, 0.2],
        [0.25, 0.25, 0.25],
        palette.weapon,
        "leftArm",
      ),
    );
  }
  if (options.horns) {
    parts.push(
      part(
        "left horn",
        "cylinder",
        [-0.35, 2.58, 0],
        [0.2, 0.65, 0.2],
        palette.weapon,
        "head",
      ),
      part(
        "right horn",
        "cylinder",
        [0.35, 2.58, 0],
        [0.2, 0.65, 0.2],
        palette.weapon,
        "head",
      ),
    );
  }
  return { name, parts };
}

const SPECS: readonly DescentAssetSpec[] = [
  {
    design: {
      name: nameFor("environment"),
      parts: [
        part("ash floor", "box", [0, -0.18, 0], [24, 0.22, 24], "#34241f"),
        part("ember road", "box", [0, -0.04, 0], [24, 0.08, 5], "#563226"),
        part("north basalt", "box", [0, 0.18, -11], [24, 0.45, 2], "#21191a"),
        part("south basalt", "box", [0, 0.18, 11], [24, 0.45, 2], "#21191a"),
        part("east ridge", "box", [11, 0.35, 0], [2, 0.8, 19], "#2b2020"),
        part("gate left", "box", [9.6, 1.7, -3.5], [1.4, 3.4, 1.4], "#4c3027"),
        part("gate right", "box", [9.6, 1.7, 3.5], [1.4, 3.4, 1.4], "#4c3027"),
        part("lava north", "box", [2, 0.02, -8], [12, 0.08, 1.1], "#d64a24"),
        part("lava south", "box", [5, 0.02, 8], [10, 0.08, 1], "#b83a22"),
      ],
    },
    kind: "environment",
    prompt:
      "An open ash-and-basalt RTS battlefield with an ember road and monumental eastern gate.",
    role: "environment",
  },
  {
    design: humanoid(
      nameFor("villager"),
      {
        armor: "#9d7951",
        cloth: "#5a4432",
        skin: "#c99468",
        weapon: "#453128",
      },
      { worker: true },
    ),
    kind: "character",
    prompt:
      "A hardy Ashen Gate villager carrying a mining tool and gathering pack.",
    role: "villager",
  },
  {
    design: humanoid(
      nameFor("warden"),
      {
        armor: "#d5a653",
        cloth: "#493633",
        skin: "#c58b63",
        weapon: "#342725",
      },
      { shield: true },
    ),
    kind: "character",
    prompt:
      "A disciplined bronze-armored Warden with spear and broad fire-ward shield.",
    role: "warden",
  },
  {
    design: humanoid(
      nameFor("hunter"),
      {
        armor: "#c8a75e",
        cloth: "#40523f",
        skin: "#c58b63",
        weapon: "#5b3e2a",
      },
      { weapon: "bow" },
    ),
    kind: "character",
    prompt:
      "A swift Hold Hunter in moss-green leathers with a tall bow, drawn arrow, and quiver.",
    role: "hunter",
  },
  {
    design: humanoid(
      nameFor("holdRaider"),
      {
        armor: "#d28a45",
        cloth: "#73372f",
        skin: "#c58b63",
        weapon: "#332725",
      },
      { weapon: "dualBlades" },
    ),
    kind: "character",
    prompt:
      "A fast Hold Raider in ember-red cloth carrying two unmistakable short blades.",
    role: "holdRaider",
  },
  {
    design: humanoid(
      nameFor("breaker"),
      {
        armor: "#7d8790",
        cloth: "#493a34",
        skin: "#b97955",
        weapon: "#2b2524",
      },
      { heavy: true, weapon: "hammer" },
    ),
    kind: "character",
    prompt:
      "A broad Hold Breaker in heavy iron pauldrons wielding an oversized two-handed siege maul.",
    role: "breaker",
  },
  {
    design: humanoid(
      nameFor("adept"),
      {
        armor: "#63c1c8",
        cloth: "#e2d8bc",
        skin: "#c58b63",
        weapon: "#31566a",
      },
      { weapon: "staff" },
    ),
    kind: "character",
    prompt:
      "A luminous cyan-and-ivory Hold Adept carrying a tall spirit-focus staff.",
    role: "adept",
  },
  {
    design: humanoid(
      nameFor("raider"),
      {
        armor: "#9f3326",
        cloth: "#3c2022",
        skin: "#bb5a3b",
        weapon: "#241719",
      },
      { horns: true },
    ),
    kind: "character",
    prompt:
      "A lean infernal imp raider with jagged iron armor, horns, and a brutal cleaver.",
    role: "raider",
  },
  {
    design: humanoid(
      nameFor("hordeWarden"),
      {
        armor: "#8d3528",
        cloth: "#28191a",
        skin: "#a64b36",
        weapon: "#171315",
      },
      { heavy: true, horns: true, shield: true, weapon: "spear" },
    ),
    kind: "character",
    prompt:
      "A heavy Imp Warden with a black shield, spear, horns, and dark red armor.",
    role: "hordeWarden",
  },
  {
    design: humanoid(
      nameFor("hordeHunter"),
      {
        armor: "#8ea944",
        cloth: "#2d2921",
        skin: "#9f4a34",
        weapon: "#242016",
      },
      { horns: true, weapon: "bow" },
    ),
    kind: "character",
    prompt:
      "A lean Imp Hunter with acid-green armor, a tall black bow, quiver, and horns.",
    role: "hordeHunter",
  },
  {
    design: humanoid(
      nameFor("hordeBreaker"),
      {
        armor: "#c74928",
        cloth: "#2d1918",
        skin: "#853225",
        weapon: "#1e1717",
      },
      { heavy: true, horns: true, weapon: "hammer" },
    ),
    kind: "character",
    prompt:
      "A massive Imp Breaker with furnace-red pauldrons, horns, and a colossal black maul.",
    role: "hordeBreaker",
  },
  {
    design: humanoid(
      nameFor("hordeAdept"),
      {
        armor: "#b76ae0",
        cloth: "#321f3d",
        skin: "#98423d",
        weapon: "#21162a",
      },
      { horns: true, weapon: "staff" },
    ),
    kind: "character",
    prompt:
      "A violet Imp Adept with swept horns and a tall infernal focus staff.",
    role: "hordeAdept",
  },
  {
    design: humanoid(
      nameFor("cinderjaw"),
      {
        armor: "#d44b24",
        cloth: "#351719",
        skin: "#7b2b22",
        weapon: "#1d1517",
      },
      { horns: true, shield: true },
    ),
    kind: "character",
    prompt:
      "Cinderjaw, a massive horned infernal siege champion with furnace armor and an execution blade.",
    role: "cinderjaw",
  },
  {
    design: {
      name: nameFor("resourceGrove"),
      parts: [
        part("root mat", "cylinder", [0, 0.12, 0], [2.4, 0.22, 2.4], "#403326"),
        part(
          "large cap",
          "cylinder",
          [-0.45, 0.75, 0],
          [0.9, 0.28, 0.9],
          "#b65a3b",
        ),
        part(
          "large stem",
          "cylinder",
          [-0.45, 0.4, 0],
          [0.3, 0.75, 0.3],
          "#d8c69b",
        ),
        part(
          "herb clump",
          "cylinder",
          [0.55, 0.35, 0.2],
          [0.75, 0.65, 0.75],
          "#708b49",
        ),
        part(
          "small cap",
          "cylinder",
          [0.25, 0.52, -0.45],
          [0.55, 0.2, 0.55],
          "#d17c4b",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact harvestable fungus and medicinal herb grove for a dark-fantasy isometric RTS, thick edible ember mushrooms, leafy spirit herbs, exposed roots, a few cut stems showing recent gathering, clustered on a small scorched-soil base, inviting and abundant resource silhouette, premium hand-painted stylized PBR, readable from above, centered at world origin, no characters, no tools, no text.",
    role: "resourceGrove",
  },
  {
    design: {
      name: nameFor("resourceOutcrop"),
      parts: [
        part("rock bed", "cylinder", [0, 0.15, 0], [2.6, 0.3, 2.2], "#4c4742"),
        part(
          "main boulder",
          "box",
          [-0.25, 0.65, 0],
          [1.35, 1.1, 1.1],
          "#625b52",
        ),
        part(
          "ore face",
          "box",
          [-0.15, 0.75, 0.58],
          [0.75, 0.28, 0.12],
          "#c2984d",
        ),
        part(
          "loose rock",
          "box",
          [0.8, 0.3, 0.35],
          [0.55, 0.45, 0.5],
          "#39383a",
        ),
        part(
          "loose ore",
          "box",
          [0.55, 0.25, -0.55],
          [0.4, 0.35, 0.42],
          "#9ca2a5",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact harvestable ore outcrop for a dark-fantasy isometric RTS, fractured basalt boulders with clearly exposed iron and warm metallic veins, chipped mining faces, several loose ore chunks at the base, abundant but grounded resource silhouette, premium hand-painted stylized PBR, readable from above, centered at world origin, no characters, no pickaxe, no text.",
    role: "resourceOutcrop",
  },
  {
    design: {
      name: nameFor("resourceTree"),
      parts: [
        part(
          "root base",
          "cylinder",
          [0, 0.12, 0],
          [2.2, 0.24, 2.2],
          "#403126",
        ),
        part("trunk", "cylinder", [0, 1.15, 0], [0.75, 2.2, 0.75], "#68432b"),
        part(
          "left branch",
          "cylinder",
          [-0.65, 1.65, 0],
          [0.3, 1.3, 0.3],
          "#765036",
        ),
        part(
          "right branch",
          "cylinder",
          [0.58, 1.45, 0.15],
          [0.28, 1.05, 0.28],
          "#765036",
        ),
        part(
          "cut log",
          "cylinder",
          [0.8, 0.28, 0.45],
          [0.48, 1.25, 0.48],
          "#8d613d",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact harvestable deadwood tree for a dark-fantasy isometric RTS, stout fire-scarred trunk with broad exposed roots, snapped branches, visible pale cut marks, one fallen log and a small stack of chopped timber at the base, clearly readable wood resource, premium hand-painted stylized PBR, readable from above, centered at world origin, no characters, no axe, no text.",
    role: "resourceTree",
  },
  {
    design: {
      name: nameFor("resourceWell"),
      parts: [
        part(
          "stone basin",
          "cylinder",
          [0, 0.28, 0],
          [2.5, 0.55, 2.5],
          "#57514b",
        ),
        part(
          "water pool",
          "cylinder",
          [0, 0.48, 0],
          [1.9, 0.08, 1.9],
          "#58a9c6",
        ),
        part(
          "rear stone",
          "box",
          [0, 0.75, -0.75],
          [1.3, 0.9, 0.55],
          "#4b4541",
        ),
        part(
          "spirit spring",
          "cylinder",
          [0, 1.15, -0.55],
          [0.32, 1.3, 0.32],
          "#92dcea",
        ),
        part(
          "offering bowl",
          "cylinder",
          [0.75, 0.55, 0.5],
          [0.45, 0.2, 0.45],
          "#b8904d",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact harvestable spirit spring for a dark-fantasy isometric RTS, low cracked basalt basin filled with luminous blue-violet water, a small natural spring pouring from a rune-cut stone, gathered water jars and an offering bowl at the edge, clearly usable replenishing resource, premium hand-painted stylized PBR, readable from above, centered at world origin, no characters, no text.",
    role: "resourceWell",
  },
  {
    design: {
      name: nameFor("emberVent"),
      parts: [
        part(
          "cracked basalt rim",
          "cylinder",
          [0, 0.18, 0],
          [2.7, 0.36, 2.7],
          "#332625",
        ),
        part(
          "molten fissure",
          "cylinder",
          [0, 0.34, 0],
          [1.7, 0.12, 1.7],
          "#f05a25",
        ),
        part(
          "central flame",
          "cylinder",
          [0, 1.05, 0],
          [0.7, 1.55, 0.7],
          "#ff9a38",
        ),
        part(
          "left flame",
          "cylinder",
          [-0.55, 0.72, 0.15],
          [0.35, 0.95, 0.35],
          "#e64524",
        ),
        part(
          "right flame",
          "cylinder",
          [0.5, 0.62, -0.18],
          [0.3, 0.78, 0.3],
          "#ffc34d",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact volcanic ember vent hazard for a dark-fantasy isometric RTS, jagged circular basalt crater with a blackened broken rim, bright molten orange fissures, red-hot coals, and several stylized flame tongues rising from the center, dangerous terrain-scale prop with a strong top-down silhouette, premium hand-painted stylized PBR, centered at world origin, no terrain plane, no characters, no text.",
    role: "emberVent",
  },
  {
    design: {
      name: nameFor("camp"),
      parts: [
        part(
          "stone foundation",
          "cylinder",
          [0, 0.25, 0],
          [3.6, 0.5, 3.6],
          "#51443b",
        ),
        part("main keep", "box", [0, 1.25, 0], [3.4, 2.2, 2.8], "#6a4935"),
        part("roof", "cylinder", [0, 2.65, 0], [3.9, 1.1, 3.9], "#9f482c"),
        part("door", "box", [0, 0.9, 1.45], [0.8, 1.4, 0.18], "#2a201d"),
        part(
          "banner pole",
          "cylinder",
          [1.45, 2.5, 0],
          [0.12, 3.2, 0.12],
          "#302521",
        ),
        part("banner", "box", [1.75, 3.3, 0], [0.75, 0.85, 0.08], "#d7a855"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact fortified command camp for a dark-fantasy isometric RTS, carved basalt foundation, layered timber-and-blackened-iron keep, bronze command banner, ember-red tiled roof, warm forge light in the windows, readable chunky silhouette, premium hand-painted stylized PBR, restrained ash and soot, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "camp",
  },
  {
    design: {
      name: nameFor("barracks"),
      parts: [
        part("foundation", "box", [0, 0.2, 0], [4.2, 0.4, 3.2], "#4a4038"),
        part("hall", "box", [0, 1.15, 0], [3.8, 1.8, 2.8], "#644634"),
        part("roof", "box", [0, 2.25, 0], [4.3, 0.45, 3.3], "#9a432b"),
        part(
          "training gate",
          "box",
          [0, 0.9, 1.5],
          [1.5, 1.5, 0.18],
          "#211b1a",
        ),
        part(
          "left spear rack",
          "cylinder",
          [-1.45, 1.5, 1.7],
          [0.1, 2.2, 0.1],
          "#d0a657",
        ),
        part(
          "right spear rack",
          "cylinder",
          [1.45, 1.5, 1.7],
          [0.1, 2.2, 0.1],
          "#d0a657",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single fireproof military barracks for a dark-fantasy isometric RTS, broad drill gate, basalt walls, layered ember-red roof, bronze braces, spear and shield racks, glowing forge vents, readable chunky silhouette, premium hand-painted stylized PBR, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "barracks",
  },
  {
    design: {
      name: nameFor("cultivationHall"),
      parts: [
        part("vein dais", "cylinder", [0, 0.2, 0], [4, 0.4, 4], "#467483"),
        part("hall", "cylinder", [0, 1.2, 0], [3.2, 2, 3.2], "#56443e"),
        part("roof", "cylinder", [0, 2.6, 0], [4, 0.9, 4], "#b95732"),
        part("spirit spire", "cylinder", [0, 4, 0], [0.5, 2.4, 0.5], "#7fd1df"),
        part("front arch", "box", [0, 1.25, 1.7], [1.4, 2, 0.25], "#d0a657"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single mystical cultivation hall for a dark-fantasy isometric RTS, circular basalt sanctuary, ember-red pagoda roof, bronze trim, luminous cyan Spirit Vein channels, tall breakthrough crystal spire, readable chunky silhouette, premium hand-painted stylized PBR, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "cultivationHall",
  },
  {
    design: {
      name: nameFor("fireWard"),
      parts: [
        part("wall", "box", [0, 1, 0], [4.5, 2, 0.8], "#58443a"),
        part("left pier", "box", [-2.2, 1.4, 0], [0.8, 2.8, 1.2], "#342a28"),
        part("right pier", "box", [2.2, 1.4, 0], [0.8, 2.8, 1.2], "#342a28"),
        part(
          "ward channel",
          "box",
          [0, 1.25, 0.45],
          [3.6, 0.22, 0.12],
          "#f07b35",
        ),
        part(
          "left brazier",
          "cylinder",
          [-2.2, 3, 0],
          [0.65, 0.7, 0.65],
          "#e65829",
        ),
        part(
          "right brazier",
          "cylinder",
          [2.2, 3, 0],
          [0.65, 0.7, 0.65],
          "#e65829",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single modular defensive fire-ward wall segment for a dark-fantasy isometric RTS, thick cracked basalt, blackened iron bands, central glowing orange rune channel, two massive end piers and blazing bronze braziers, readable chunky silhouette, premium hand-painted stylized PBR, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "fireWard",
  },
];

/**
 * Applies an optional comma-separated `--roles=` generation filter.
 * @param arguments_ - Script arguments after the executable and file
 * @returns Requested specs in their canonical order
 */
function specsForArguments(
  arguments_: readonly string[],
): readonly DescentAssetSpec[] {
  const option = arguments_.find((argument) => argument.startsWith("--roles="));
  if (option === undefined) return SPECS;
  const requested = new Set(
    option
      .slice("--roles=".length)
      .split(",")
      .map((role) => role.trim())
      .filter((role) => role.length > 0),
  );
  const known = new Set(SPECS.map((spec) => spec.role));
  const unknown = [...requested].filter(
    (role) => !known.has(role as AshenGateAssetRole),
  );
  if (requested.size === 0 || unknown.length > 0) {
    throw new Error(
      `Unknown or empty Descent asset roles: ${unknown.join(", ")}`,
    );
  }
  return SPECS.filter((spec) => requested.has(spec.role));
}

/** Returns the standard asset-class list route for one model kind. */
function listRoute(kind: ThreeDAssetKind): string {
  if (kind === "character") return "/three-d-characters/list";
  if (kind === "environment") return "/three-d-environments/list";
  return "/three-d-props/list";
}

/** Generates every missing Ashen Gate model through the local queue. */
async function generate(): Promise<void> {
  const useMeshy = Bun.argv.includes("--meshy");
  const specs = specsForArguments(Bun.argv.slice(2));
  const urlArgument = Bun.argv
    .slice(2)
    .find((argument) => !argument.startsWith("--"));
  const base = new URL(urlArgument ?? "https://localhost:8080");
  if (!["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new Error(
      "Descent asset generation is local-only. Set DESCENT_ASSET_API_URL to localhost.",
    );
  }
  const tls =
    base.protocol === "https:"
      ? {
          ca: await readFile(
            new URL("../.certs/localhost.pem", import.meta.url),
            "utf8",
          ),
        }
      : undefined;

  /** Calls one local 3D service endpoint with the repository development CA. */
  async function post<T>(path: string, payload: unknown): Promise<T> {
    const response = await fetch(new URL(path, base), {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      tls,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${path}: ${JSON.stringify(result)}`);
    return result as T;
  }

  const lists = await Promise.all(
    (["character", "environment", "prop"] as const).map((kind) =>
      post<ThreeDAssetList>(listRoute(kind), {}),
    ),
  );
  const existing = lists.flatMap((list) => list.assets);
  const completed: ThreeDAsset[] = [];
  for (const spec of specs) {
    const provider: ThreeDProvider =
      useMeshy && spec.meshyPolish === true ? "meshy" : "design";
    const saved = existing.find(
      (asset) =>
        asset.kind === spec.kind &&
        asset.name === spec.design.name &&
        asset.provenance.provider === provider &&
        JSON.stringify(asset.design) === JSON.stringify(spec.design),
    );
    if (saved !== undefined) {
      completed.push(saved);
      continue;
    }
    const job = await post<ThreeDJob>("/three-d-workshop/start", {
      design: spec.design,
      generationId: crypto.randomUUID(),
      kind: spec.kind,
      prompt: spec.prompt,
      provider,
      useLore: false,
    });
    const deadline = Date.now() + (provider === "meshy" ? 25 * 60_000 : 60_000);
    let asset: ThreeDAsset | undefined;
    while (Date.now() < deadline) {
      const state = await post<{ jobs: ThreeDJob[] }>(
        "/three-d-workshop/list",
        {},
      );
      const current = state.jobs.find(
        (candidate) => candidate.generationId === job.generationId,
      );
      if (current?.error !== undefined) throw new Error(current.error);
      if (current?.asset !== undefined) {
        asset = current.asset;
        break;
      }
      await Bun.sleep(provider === "meshy" ? 1_000 : 150);
    }
    if (asset === undefined) throw new Error(`Timed out: ${spec.design.name}`);
    completed.push(asset);
  }
  // biome-ignore lint/suspicious/noConsole: This developer script reports generated asset ids.
  console.log(
    JSON.stringify(
      {
        assets: completed.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          triangles: asset.validation.triangles,
        })),
        estimatedCredits: completed.reduce(
          (total, asset) => total + (asset.provenance.estimatedCredits ?? 0),
          0,
        ),
      },
      null,
      2,
    ),
  );
}

await generate();
