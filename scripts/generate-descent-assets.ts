import { readFile } from "node:fs/promises";
import type {
  ListStaticImagesResponse,
  StaticImageAsset,
} from "../packages/api/src/services/assetClasses/staticImage";
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
  ASHEN_GATE_TEXTURES,
  type AshenGateTextureRole,
  ashenGateTexturePrompt,
} from "../packages/frontend/src/components/descent/data/layers/ashen_gate/environmentArt";
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
    meshyPolish: true,
    prompt:
      "A single full-body Ashen Gate villager worker for a dark-fantasy isometric RTS, a sturdy practical human laborer with an uncovered friendly face, short dark hair, rolled sleeves, fitted charcoal work tunic, cropped rust-red leather apron, durable trousers and heavy boots, compact gathering backpack, belt pouches, and a pickaxe strapped securely across the back. Broad readable worker silhouette, premium hand-painted stylized PBR, clean separated limbs and animation-friendly anatomy, centered at world origin. No hood, no mask, no cape, no long robe, no handheld weapon, no terrain, no text.",
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
    meshyPolish: true,
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
    meshyPolish: true,
    prompt:
      "A swift Hold Hunter in moss-green leathers with a tall bow, drawn arrow, and quiver.",
    role: "hunter",
  },
  {
    design: humanoid(
      nameFor("rider"),
      {
        armor: "#d6ad61",
        cloth: "#35525b",
        skin: "#c58b63",
        weapon: "#6c4430",
      },
      { weapon: "spear" },
    ),
    kind: "character",
    meshyPolish: true,
    prompt:
      "A single cohesive full-body mounted Ashen Gate Rider scout for a dark-fantasy isometric RTS. A lean armored outrider sits firmly in a visible saddle on a compact two-legged ash-drake beast; the rider's bent legs grip the mount and both face forward as one animation-ready character. Light bronze lamellar, slate-teal riding leathers, rust-red sash, short cavalry spear, map satchel, and brass spyglass. The mount has powerful digitigrade legs, a low horned head, dark charcoal scales, bronze tack, and subtle cyan wind runes. Strong readable cavalry silhouette, premium hand-painted stylized PBR, centered at world origin. No standing or dismounted rider, no separate creatures, no wings, no cape, no terrain, no text.",
    role: "rider",
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
    meshyPolish: true,
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
      name: nameFor("well"),
      parts: [
        part(
          "foundation",
          "cylinder",
          [0, 0.15, 0],
          [2.8, 0.3, 2.8],
          "#403a38",
        ),
        part("stone rim", "cylinder", [0, 0.6, 0], [2.1, 0.9, 2.1], "#625b56"),
        part("water", "cylinder", [0, 0.78, 0], [1.5, 0.08, 1.5], "#58bdd1"),
        part("left post", "box", [-1.35, 1.65, 0], [0.3, 2.4, 0.3], "#6b4630"),
        part("right post", "box", [1.35, 1.65, 0], [0.3, 2.4, 0.3], "#6b4630"),
        part("crossbeam", "box", [0, 2.8, 0], [3.2, 0.28, 0.32], "#8b5d38"),
        part("crank", "cylinder", [0, 2.15, 0], [0.25, 2.3, 0.25], "#c28a43"),
        part("bucket", "cylinder", [0, 1.25, 0], [0.62, 0.72, 0.62], "#7b5538"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single working water well for an Ashen Gate dark-fantasy isometric RTS, sturdy circular cracked basalt wellhead, luminous clean cyan water deep inside, heavy timber posts, bronze hand crank, rope and wooden bucket, a few filled blue ceramic water jars beside the base, ember-red cloth charm tied to the crossbeam, readable utility-building silhouette from above, premium hand-painted stylized PBR, centered at world origin, complete on every side, no terrain plane, no characters, no text.",
    role: "well",
  },
  {
    design: {
      name: nameFor("farm"),
      parts: [
        part("terrace", "box", [0, 0.18, 0], [4.4, 0.36, 4.4], "#4b3729"),
        part(
          "left crop bed",
          "box",
          [-1.15, 0.42, 0],
          [1.55, 0.28, 3.5],
          "#9b7a32",
        ),
        part(
          "right crop bed",
          "box",
          [1.15, 0.42, 0],
          [1.55, 0.28, 3.5],
          "#b69038",
        ),
        part("water channel", "box", [0, 0.52, 0], [0.45, 0.12, 4], "#4eb2c8"),
        part(
          "cistern",
          "cylinder",
          [0, 0.78, -1.65],
          [0.8, 0.8, 0.8],
          "#605853",
        ),
        part(
          "scare ward",
          "box",
          [1.55, 1.35, 1.45],
          [0.2, 2.2, 0.2],
          "#7b4d2f",
        ),
        part(
          "ward banner",
          "box",
          [1.55, 1.9, 1.45],
          [1.2, 0.6, 0.08],
          "#a64731",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single compact irrigated farm for an Ashen Gate dark-fantasy isometric RTS, two raised volcanic-soil crop terraces dense with golden ember grain and red edible mushrooms, bright cyan water channels from a small cracked basalt cistern, low bronze edging, baskets of harvested food, and one simple ember-red ward banner, prosperous readable farm silhouette from above, premium hand-painted stylized PBR, centered at world origin, complete on every side, no broad terrain plane beyond the farm beds, no characters, no text.",
    role: "farm",
  },
  {
    design: {
      name: nameFor("forest"),
      parts: [
        part(
          "root terrace",
          "cylinder",
          [0, 0.12, 0],
          [3.7, 0.24, 3.7],
          "#3f342b",
        ),
        part(
          "tall trunk",
          "cylinder",
          [-0.8, 1.75, 0],
          [0.58, 3.4, 0.58],
          "#70472e",
        ),
        part(
          "tall crown",
          "cylinder",
          [-0.8, 3.45, 0],
          [1.35, 1.5, 1.35],
          "#425a43",
        ),
        part(
          "young trunk",
          "cylinder",
          [1.0, 1.2, -0.35],
          [0.42, 2.3, 0.42],
          "#805236",
        ),
        part(
          "young crown",
          "cylinder",
          [1.0, 2.45, -0.35],
          [1.05, 1.2, 1.05],
          "#56704b",
        ),
        part(
          "irrigation ring",
          "cylinder",
          [0, 0.35, 0],
          [3.1, 0.12, 3.1],
          "#4aaec1",
        ),
        part(
          "log stack",
          "cylinder",
          [1.35, 0.42, 1.35],
          [0.48, 2.0, 0.48],
          "#93633e",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single managed ash forest plot for an Ashen Gate dark-fantasy isometric RTS, compact ring of healthy fire-scarred trees and straight young saplings growing from a bounded volcanic-soil terrace, visible cyan irrigation channels and clay water pots, pruned branches, a tidy stack of cut timber, bronze tree tags, readable renewable-wood building silhouette from above, premium hand-painted stylized PBR, centered at world origin, complete on every side, no broad terrain plane, no characters, no tools, no text.",
    role: "forest",
  },
  {
    design: {
      name: nameFor("market"),
      parts: [
        part("market dais", "box", [0, 0.2, 0], [4.8, 0.4, 4.2], "#4a4038"),
        part("counter", "box", [0, 1.0, 0.7], [3.8, 1.4, 1.0], "#744b31"),
        part("left post", "box", [-1.9, 1.9, 0], [0.3, 3.4, 0.3], "#3b2c26"),
        part("right post", "box", [1.9, 1.9, 0], [0.3, 3.4, 0.3], "#3b2c26"),
        part("canopy", "box", [0, 3.4, 0], [4.6, 0.3, 3.4], "#9d3f2c"),
        part(
          "coin scale",
          "cylinder",
          [0, 1.95, 0.7],
          [0.55, 0.8, 0.55],
          "#d3a34f",
        ),
        part(
          "food crate",
          "box",
          [-1.35, 0.75, -1.2],
          [1.0, 1.1, 1.0],
          "#8c6938",
        ),
        part(
          "water jars",
          "cylinder",
          [0, 0.75, -1.25],
          [0.7, 1.15, 0.7],
          "#428da3",
        ),
        part(
          "wood bundle",
          "cylinder",
          [1.3, 0.65, -1.15],
          [0.55, 1.5, 0.55],
          "#765033",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single fortified Hell Market trading post for an Ashen Gate dark-fantasy isometric RTS, broad timber-and-basalt counter beneath an ember-red awning, oversized bronze balance scale and glowing coin lantern, clearly separated displays of grain sacks, blue water jars, and bundled cut timber ready for sale, blackened iron braces and a small locked coin chest, readable prosperous market silhouette from above, premium hand-painted stylized PBR, centered at world origin, complete on every side, no terrain plane, no characters, no written signs, no text.",
    role: "market",
  },
  {
    design: {
      name: nameFor("spiritHerbGarden"),
      parts: [
        part(
          "garden bed",
          "cylinder",
          [0, 0.18, 0],
          [3.2, 0.36, 3.2],
          "#3f352f",
        ),
        part(
          "water ring",
          "cylinder",
          [0, 0.42, 0],
          [2.7, 0.12, 2.7],
          "#54b8ca",
        ),
        part(
          "central herbs",
          "cylinder",
          [0, 0.82, 0],
          [1.0, 1.2, 1.0],
          "#64d6a2",
        ),
        part(
          "left herbs",
          "cylinder",
          [-1.15, 0.62, 0.25],
          [0.72, 0.85, 0.72],
          "#7ee4c0",
        ),
        part(
          "right herbs",
          "cylinder",
          [1.1, 0.58, -0.25],
          [0.68, 0.78, 0.68],
          "#58c3a9",
        ),
        part(
          "bronze trellis",
          "cylinder",
          [0, 1.75, 0],
          [2.1, 0.16, 2.1],
          "#bd8544",
        ),
        part(
          "spirit focus",
          "cylinder",
          [0, 2.35, 0],
          [0.3, 1.1, 0.3],
          "#8ce9ee",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single cultivated spirit-herb garden for an Ashen Gate dark-fantasy isometric RTS, circular raised basalt bed divided into neat irrigated plots, luminous teal and jade medicinal herbs at several stages of growth, bright cyan water channels, bronze trellis rings hung with tiny ember charms, one pale spirit crystal focus and covered clay water jars, delicate but readable long-growth garden silhouette from above, premium hand-painted stylized PBR, centered at world origin, complete on every side, no broad terrain plane, no characters, no text.",
    role: "spiritHerbGarden",
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
      name: nameFor("stronghold"),
      parts: [
        part(
          "wide basalt foundation",
          "box",
          [0, 0.3, 0],
          [4.4, 0.6, 4.4],
          "#4a3f37",
        ),
        part("curtain wall", "box", [0, 1.05, 0], [4.0, 1.1, 4.0], "#5b4334"),
        part("great keep", "box", [0, 2.2, 0], [2.4, 2.6, 2.4], "#6a4935"),
        part("keep roof", "cylinder", [0, 3.9, 0], [2.9, 0.9, 2.9], "#9f482c"),
        part(
          "front left tower",
          "cylinder",
          [-1.85, 1.6, 1.85],
          [0.9, 3.2, 0.9],
          "#5f4636",
        ),
        part(
          "front right tower",
          "cylinder",
          [1.85, 1.6, 1.85],
          [0.9, 3.2, 0.9],
          "#5f4636",
        ),
        part(
          "rear left tower",
          "cylinder",
          [-1.85, 1.6, -1.85],
          [0.9, 3.2, 0.9],
          "#5f4636",
        ),
        part(
          "rear right tower",
          "cylinder",
          [1.85, 1.6, -1.85],
          [0.9, 3.2, 0.9],
          "#5f4636",
        ),
        part("gatehouse", "box", [0, 1.0, 2.05], [1.2, 1.6, 0.4], "#2a201d"),
        part(
          "banner pole",
          "cylinder",
          [0, 4.9, 0],
          [0.12, 2.0, 0.12],
          "#302521",
        ),
        part("banner", "box", [0.4, 5.4, 0], [0.75, 0.85, 0.08], "#d7a855"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single imposing fortified stronghold keep for a dark-fantasy isometric RTS, the upgraded form of a humble command camp: a broad carved-basalt foundation, a square curtain wall with crenellated battlements, four round corner towers with ember-red conical roofs, a tall central timber-and-blackened-iron great keep rising above the walls, a heavy iron-banded gatehouse on the front, large bronze command banners, warm forge light glowing from arrow slits and windows, clearly larger, taller, and more fortified than a camp, readable chunky silhouette from above, premium hand-painted stylized PBR, restrained ash and soot, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "stronghold",
  },
  {
    design: {
      name: nameFor("citadel"),
      parts: [
        part(
          "terraced basalt foundation",
          "box",
          [0, 0.3, 0],
          [4.8, 0.6, 4.8],
          "#463b34",
        ),
        part("outer wall", "box", [0, 1.0, 0], [4.5, 1.0, 4.5], "#584132"),
        part("inner wall", "box", [0, 1.9, 0], [3.2, 1.0, 3.2], "#614534"),
        part("citadel keep", "box", [0, 3.1, 0], [2.0, 2.6, 2.0], "#6d4b36"),
        part("keep spire", "cylinder", [0, 5.1, 0], [1.2, 1.6, 1.2], "#9f482c"),
        part(
          "front left spire",
          "cylinder",
          [-2.05, 2.0, 2.05],
          [0.85, 4.0, 0.85],
          "#5f4636",
        ),
        part(
          "front right spire",
          "cylinder",
          [2.05, 2.0, 2.05],
          [0.85, 4.0, 0.85],
          "#5f4636",
        ),
        part(
          "rear left spire",
          "cylinder",
          [-2.05, 2.0, -2.05],
          [0.85, 4.0, 0.85],
          "#5f4636",
        ),
        part(
          "rear right spire",
          "cylinder",
          [2.05, 2.0, -2.05],
          [0.85, 4.0, 0.85],
          "#5f4636",
        ),
        part(
          "spirit crystal",
          "box",
          [0, 6.2, 0],
          [0.55, 0.8, 0.55],
          "#4fe0e6",
        ),
        part("great gate", "box", [0, 1.1, 2.3], [1.4, 1.8, 0.4], "#2a201d"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single grand fortified citadel for a dark-fantasy isometric RTS, the final upgraded form of a stronghold keep: a terraced carved-basalt foundation, a double ring of crenellated walls, four tall slender corner spires with ember-red conical roofs and bronze finials, a towering central keep crowned by a floating cyan spirit crystal that glows softly, cultivation runes etched in gold along the walls, a monumental iron-banded great gate, layered bronze command banners, warm forge light from many windows, clearly larger, taller, and grander than a stronghold, readable chunky silhouette from above, premium hand-painted stylized PBR, restrained ash and soot, centered at world origin, complete on every side, no terrain, no characters, no text.",
    role: "citadel",
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
  {
    design: {
      name: nameFor("hordeGate"),
      parts: [
        part("left tower", "box", [-2.4, 2.6, 0], [1.4, 5.2, 1.6], "#1f2026"),
        part("right tower", "box", [2.4, 2.6, 0], [1.4, 5.2, 1.6], "#1f2026"),
        part("lintel", "box", [0, 5.4, 0], [6.4, 1, 1.8], "#2a2a31"),
        part("portal", "box", [0, 2.4, 0], [3.4, 4.6, 0.3], "#ff6a24"),
        part(
          "left horn",
          "cylinder",
          [-2.6, 6.6, 0],
          [0.5, 2.2, 0.5],
          "#141418",
        ),
        part(
          "right horn",
          "cylinder",
          [2.6, 6.6, 0],
          [0.5, 2.2, 0.5],
          "#141418",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single monumental demonic hell gate for a dark-fantasy isometric RTS, a colossal standing arch of jagged black basalt and blackened iron with curved horn-like spikes rising from the top, a swirling molten orange-red portal glowing inside the arch, ember runes carved along the frame, heavy chains and flaming iron braziers flanking both pillars, dramatic readable silhouette from above, premium hand-painted stylized PBR, centered at world origin, the portal facing forward, no terrain plane, no characters, no text.",
    role: "hordeGate",
  },
  {
    design: {
      name: nameFor("abyssSpire"),
      parts: [
        part("base", "cylinder", [0, 1.5, 0], [3, 3, 3], "#1d1e24"),
        part("shaft", "cylinder", [0.3, 5, 0], [1.6, 5, 1.6], "#26272e"),
        part("tip", "cylinder", [0.6, 8.6, 0.2], [0.6, 2.4, 0.6], "#2f3038"),
        part("magma seam", "box", [0, 2.5, 1.3], [0.25, 4, 0.2], "#ff6a24"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single towering jagged volcanic basalt spire rising from a lava sea, for the backdrop of a dark-fantasy isometric RTS, tall narrow crooked silhouette of broken charcoal-blue columnar rock, bright molten orange cracks running up from the base and fading toward the tip, pale ash dusted on the ledges, a ruined bronze watch platform with a small brazier near the top, premium hand-painted stylized PBR, centered at world origin, no base plane, no characters, no text.",
    role: "abyssSpire",
  },
  {
    design: {
      name: nameFor("rimRuin"),
      parts: [
        part("rubble", "box", [0, 0.25, 0], [2.2, 0.5, 2], "#34363d"),
        part("pillar", "box", [0, 2, 0], [1, 3.6, 1], "#3d3f47"),
        part("bronze band", "box", [0, 2.8, 0], [1.1, 0.2, 1.1], "#c48a3a"),
        part("brazier", "cylinder", [0, 4, 0], [1, 0.4, 1], "#2a2420"),
        part("flame", "cylinder", [0, 4.6, 0], [0.6, 0.9, 0.6], "#ffa338"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single ruined watch pillar of the Ashen Hold for a dark-fantasy isometric RTS, a broken carved charcoal basalt column with weathered bronze bands, a tattered ember-red banner, and a lit iron brazier with a bright warm flame on top, chunky rubble around its foot, readable chunky silhouette from above, premium hand-painted stylized PBR, centered at world origin, no terrain plane, no characters, no text.",
    role: "rimRuin",
  },
  {
    design: {
      name: nameFor("spiritCrystals"),
      parts: [
        part("boulder", "box", [0, 0.4, 0], [2, 0.8, 1.6], "#2b2d34"),
        part(
          "tall crystal",
          "cylinder",
          [0, 1.6, 0],
          [0.5, 2.4, 0.5],
          "#5fe3e8",
        ),
        part(
          "left crystal",
          "cylinder",
          [-0.6, 1.1, 0.3],
          [0.35, 1.5, 0.35],
          "#3fc6d6",
        ),
        part(
          "right crystal",
          "cylinder",
          [0.6, 1, -0.2],
          [0.3, 1.3, 0.3],
          "#9ef4f2",
        ),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single cluster of luminous cyan-teal spirit crystals bursting from a cracked dark basalt boulder, for a dark-fantasy cultivation isometric RTS, five to seven faceted crystals of varied height with a soft glowing inner light and pale mist at their roots, premium hand-painted stylized PBR, centered at world origin, no terrain plane, no characters, no text.",
    role: "spiritCrystals",
  },
  {
    design: {
      name: nameFor("basaltBoulders"),
      parts: [
        part("large boulder", "box", [0, 0.7, 0], [2, 1.4, 1.7], "#2c2e35"),
        part(
          "side boulder",
          "box",
          [1.4, 0.45, 0.5],
          [1.2, 0.9, 1.1],
          "#34363e",
        ),
        part(
          "small boulder",
          "box",
          [-1.2, 0.3, 0.6],
          [0.8, 0.6, 0.8],
          "#3a3c44",
        ),
        part("ember seam", "box", [0, 0.7, 0.86], [1.2, 0.08, 0.05], "#ff7a2c"),
      ],
    },
    kind: "prop",
    meshyPolish: true,
    prompt:
      "A single cluster of four chunky cracked basalt boulders for a dark-fantasy isometric RTS, cool charcoal-blue volcanic stone with pale ash dust on top and thin glowing orange ember seams in the cracks, a few small cinders scattered at the base, premium hand-painted stylized PBR, centered at world origin, no terrain plane, no characters, no text.",
    role: "basaltBoulders",
  },
];

/** One painted surface generated through the static-image agent. */
interface DescentTextureSpec {
  direction: string;
  role: AshenGateTextureRole;
}

/** Art direction for the plateau, the abyss, and the cliffs between them. */
const TEXTURE_SPECS: readonly DescentTextureSpec[] = [
  {
    direction:
      "Seamless tileable square ground texture for a dark-fantasy RTS battlefield, viewed straight down with no perspective, no horizon, and no cast shadows. Weathered charcoal and cool blue-grey volcanic basalt: irregular cracked flagstone plates, fine pale ash drifted into the seams, scattered small pebbles and cinders, a few faint hairline ember cracks glowing dull orange, sparse dark teal lichen. Hand-painted stylized PBR look, soft even lighting, medium-low contrast and a uniform value across the whole tile so units stay readable on top of it, no focal point, and every edge continues seamlessly into the opposite edge. Palette: charcoal #23252b, slate #3a3f48, ash grey #6d6a68, ember orange #d9652b used sparingly. Not brown, not sandy, not dirt. Use a 1:1 aspect ratio at 2K. No text, no border, no vignette.",
    role: "ground",
  },
  {
    direction:
      "Seamless tileable square texture of a molten lava sea seen straight down from far above, orthographic, no horizon. Cooled black crust plates and drifting basalt rafts separated by bright glowing rivers of molten rock running from deep crimson through orange to yellow-white hot cores. Rich stylized hand-painted look, high contrast, glowing, detail spread evenly with no focal point so every edge continues seamlessly into the opposite edge. Use a 1:1 aspect ratio at 2K. No text, no border, no vignette.",
    role: "lava",
  },
  {
    direction:
      "Seamless horizontally tileable square texture of a sheer columnar basalt cliff face, straight-on orthographic view filling the whole frame. Tall dark charcoal-blue hexagonal basalt columns with chipped ledges, pale ash dust along the top edge, the lower third lit from below by warm orange lava glow that fades upward into cool shadow, a few glowing ember seams between columns. Stylized hand-painted PBR. The left and right edges continue seamlessly into each other. Use a 1:1 aspect ratio at 2K. No text, no border, no sky, no vignette.",
    role: "cliff",
  },
];

/** Model and texture specs selected for one script run. */
interface SelectedSpecs {
  models: readonly DescentAssetSpec[];
  textures: readonly DescentTextureSpec[];
}

/**
 * Applies an optional comma-separated `--roles=` generation filter. Model
 * roles and texture roles (`ground`, `lava`, `cliff`) can be mixed.
 * @param arguments_ - Script arguments after the executable and file
 * @returns Requested specs in their canonical order
 */
function specsForArguments(arguments_: readonly string[]): SelectedSpecs {
  const option = arguments_.find((argument) => argument.startsWith("--roles="));
  if (option === undefined) return { models: SPECS, textures: TEXTURE_SPECS };
  const requested = new Set(
    option
      .slice("--roles=".length)
      .split(",")
      .map((role) => role.trim())
      .filter((role) => role.length > 0),
  );
  const known = new Set<string>([
    ...SPECS.map((spec) => spec.role),
    ...TEXTURE_SPECS.map((spec) => spec.role),
  ]);
  const unknown = [...requested].filter((role) => !known.has(role));
  if (requested.size === 0 || unknown.length > 0) {
    throw new Error(
      `Unknown or empty Descent asset roles: ${unknown.join(", ")}`,
    );
  }
  return {
    models: SPECS.filter((spec) => requested.has(spec.role)),
    textures: TEXTURE_SPECS.filter((spec) => requested.has(spec.role)),
  };
}

/**
 * Reads `--concurrency=N` for model jobs, defaulting to one at a time.
 * @param arguments_ - Script arguments after the executable and file
 * @returns A positive whole number of parallel model jobs
 */
function concurrencyForArguments(arguments_: readonly string[]): number {
  const option = arguments_.find((argument) =>
    argument.startsWith("--concurrency="),
  );
  if (option === undefined) return 1;
  const value = Number.parseInt(option.slice("--concurrency=".length), 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid --concurrency value: ${option}`);
  }
  return value;
}

/**
 * Runs async work over items with at most `limit` in flight.
 * @param items - Inputs in order
 * @param limit - Maximum concurrent workers
 * @param work - Async step for one item
 * @returns Results in input order
 */
async function mapWithLimit<Input, Output>(
  items: readonly Input[],
  limit: number,
  work: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as Input);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Returns the standard asset-class list route for one model kind. */
function listRoute(kind: ThreeDAssetKind): string {
  if (kind === "character") return "/three-d-characters/list";
  if (kind === "environment") return "/three-d-environments/list";
  return "/three-d-props/list";
}

/** Returns the canonical runtime tag for one generated texture role. */
function textureTagFor(role: AshenGateTextureRole): string {
  const definition = ASHEN_GATE_TEXTURES.find(
    (candidate) => candidate.role === role,
  );
  if (definition === undefined) throw new Error(`Unknown texture: ${role}`);
  return definition.tag;
}

/** Generates every missing Ashen Gate model and texture through the local queue. */
async function generate(): Promise<void> {
  const arguments_ = Bun.argv.slice(2);
  const useMeshy = arguments_.includes("--meshy");
  const specs = specsForArguments(arguments_);
  const concurrency = concurrencyForArguments(arguments_);
  const urlArgument = arguments_.find((argument) => !argument.startsWith("--"));
  const configuredBase = process.env.BACKEND_API_URL?.trim();
  const base = new URL(
    urlArgument ?? configuredBase ?? "https://localhost:8080",
  );
  const isConfiguredBackend =
    configuredBase !== undefined &&
    base.origin === new URL(configuredBase).origin;
  if (
    !["localhost", "127.0.0.1"].includes(base.hostname) &&
    !isConfiguredBackend
  ) {
    throw new Error(
      "Descent asset generation must use localhost or the configured BACKEND_API_URL.",
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

  /** Calls one local asset service endpoint with the repository development CA. */
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

  /**
   * Generates one texture unless an image with the same prompt exists.
   * @param spec - Texture role and art direction
   * @param existing - Static images already stored
   * @returns The stored image
   */
  async function generateTexture(
    spec: DescentTextureSpec,
    existing: readonly StaticImageAsset[],
  ): Promise<StaticImageAsset> {
    const prompt = ashenGateTexturePrompt(
      textureTagFor(spec.role),
      spec.direction,
    );
    const saved = existing.find((image) => image.prompt === prompt);
    if (saved !== undefined) return saved;
    return post<StaticImageAsset>("/static-images/generate", {
      generationId: crypto.randomUUID(),
      prompt,
    });
  }

  /**
   * Generates one model unless a matching design and provider exists.
   * @param spec - Model role, design, and prompt
   * @param existing - Models already stored
   * @returns The stored model
   */
  async function generateModel(
    spec: DescentAssetSpec,
    existing: readonly ThreeDAsset[],
  ): Promise<ThreeDAsset> {
    const provider: ThreeDProvider =
      useMeshy && spec.meshyPolish === true ? "meshy" : "design";
    const saved = existing.find(
      (asset) =>
        asset.kind === spec.kind &&
        asset.name === spec.design.name &&
        asset.provenance.provider === provider &&
        asset.prompt === spec.prompt &&
        JSON.stringify(asset.design) === JSON.stringify(spec.design),
    );
    if (saved !== undefined) return saved;
    const job = await post<ThreeDJob>("/three-d-workshop/start", {
      design: spec.design,
      generationId: crypto.randomUUID(),
      kind: spec.kind,
      prompt: spec.prompt,
      provider,
      useLore: false,
    });
    const deadline = Date.now() + (provider === "meshy" ? 25 * 60_000 : 60_000);
    while (Date.now() < deadline) {
      const state = await post<{ jobs: ThreeDJob[] }>(
        "/three-d-workshop/list",
        {},
      );
      const current = state.jobs.find(
        (candidate) => candidate.generationId === job.generationId,
      );
      if (current?.error !== undefined) throw new Error(current.error);
      if (current?.asset !== undefined) return current.asset;
      await Bun.sleep(provider === "meshy" ? 1_000 : 150);
    }
    throw new Error(`Timed out: ${spec.design.name}`);
  }

  const [lists, images] = await Promise.all([
    Promise.all(
      (["character", "environment", "prop"] as const).map((kind) =>
        post<ThreeDAssetList>(listRoute(kind), {}),
      ),
    ),
    post<ListStaticImagesResponse>("/static-images/list", {}),
  ]);
  const existingModels = lists.flatMap((list) => list.assets);
  const [models, textures] = await Promise.all([
    mapWithLimit(specs.models, concurrency, (spec) =>
      generateModel(spec, existingModels),
    ),
    Promise.all(
      specs.textures.map((spec) => generateTexture(spec, images.staticImages)),
    ),
  ]);
  // biome-ignore lint/suspicious/noConsole: This developer script reports generated asset ids.
  console.log(
    JSON.stringify(
      {
        assets: models.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          triangles: asset.validation.triangles,
        })),
        estimatedCredits: models.reduce(
          (total, asset) => total + (asset.provenance.estimatedCredits ?? 0),
          0,
        ),
        textures: textures.map((image) => ({
          id: image.id,
          imageUrl: image.imageUrl,
          title: image.title,
        })),
      },
      null,
      2,
    ),
  );
}

await generate();
