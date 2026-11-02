import type { CultivationView } from "../logic/cultivation/types";
import type { ResourceStockpile, SimSnapshot } from "../logic/types";
import type { DescentPresentation } from "./presentation";

/**
 * Ashborn cultivation with a published 62% breakthrough.
 * @param missing - Checklist lines already decided by cultivation
 * @param merit - Current merit
 * @returns A cultivation view
 */
function ashborn(missing: string[], merit: number): CultivationView {
  return {
    essence: 50,
    essenceToNext: 50,
    merit,
    meritToNext: 100,
    missingRequirements: missing,
    passives: ["Body Tempering"],
    rank: "Ashborn",
    successChance: 0.62,
    toxicity: merit === 0 ? 0 : 1,
    toxicityCap: 3,
  };
}

/**
 * Builds a readable Ashen Gate snapshot for the shell and its tests.
 * The numbers are published display data, not a simulation.
 * @returns A sim snapshot whose `meta.ui` fills every panel
 */
export function createAshenGatePreview(): SimSnapshot {
  const resources: ResourceStockpile = {
    coin: 8,
    essence: 40,
    food: 120,
    iron: 15,
    spirit_herbs: 6,
    stone: 40,
    water: 90,
    wood: 70,
  };
  const ui: DescentPresentation = {
    bossGateCleared: false,
    brewOptions: [
      {
        allowed: true,
        detail: "Permanent. Counts toward toxicity.",
        furnaceId: "furnace-1",
        name: "Body Pill",
        pillId: "body_pill",
        reason: undefined,
      },
    ],
    buildings: {
      "altar-1": { hitPoints: 400, maxHitPoints: 400, tier: "Citadel" },
      "barracks-1": {
        activity: "Training 5 Wardens",
        hitPoints: 200,
        maxHitPoints: 200,
        progress: 0.4,
        queue: 2,
        rallyPoint: { x: 26, y: 34 },
        tier: "Camp",
        trainingQueue: [
          {
            classId: "warden",
            count: 1,
            id: "training-1",
            label: "Warden",
            progress: 0.4,
          },
          {
            classId: "hunter",
            count: 1,
            id: "training-2",
            label: "Hunter",
            progress: 0,
          },
        ],
      },
      "furnace-1": { hitPoints: 160, maxHitPoints: 160, tier: "Camp" },
      "hall-1": { hitPoints: 180, maxHitPoints: 180, tier: "Camp" },
      "hero-1": { hitPoints: 220, maxHitPoints: 220, tier: "Stronghold" },
      "mess-1": { hitPoints: 150, maxHitPoints: 150, tier: "Camp" },
      "omen-1": { hitPoints: 140, maxHitPoints: 140, tier: "Camp" },
    },
    buildOptions: [
      {
        buildingType: "barracks",
        costLabel: "Wood 40, stone 20",
        hints: ["Adjacency: Barracks beside a training yard drill faster."],
        job: "Train units",
        name: "Barracks",
        tier: "Camp",
        unlocked: true,
      },
      {
        buildingType: "cultivation_hall",
        costLabel: "Stone 30, wood 20",
        hints: ["Spirit Vein: a hall on a vein receives that vein's bonus."],
        job: "Breakthroughs",
        name: "Cultivation Hall",
        tier: "Camp",
        unlocked: true,
      },
      {
        buildingType: "calamity_altar",
        costLabel: "Citadel",
        hints: [],
        job: "Summon one Calamity",
        lockedReason: "Citadel tier",
        name: "Calamity Altar",
        tier: "Citadel",
        unlocked: false,
      },
    ],
    calamities: [
      {
        allowed: false,
        altarId: "altar-1",
        calamityId: "infernal_colossus",
        costLabel: "10 pop, high essence, one boss core",
        name: "Infernal Colossus",
        reasons: ["Need spare population"],
        school: "ember",
      },
    ],
    hellPressure: 0.35,
    marketRates: [
      {
        buy: "coin",
        label: "Sell wood for coin at the Ashen Gate tithe.",
        sell: "wood",
      },
    ],
    nodes: [
      {
        id: "food-1",
        label: "Food node",
        resource: "food",
        x: 50,
        y: 20,
      },
    ],
    notices: [],
    omen: {
      composition: { raider: 12, warden: 2 },
      etaSeconds: 47,
    },
    onboarding: { pill: true, realmGate: true, school: true },
    pillFeeds: [
      {
        pillName: "Body Pill",
        preview: {
          canFeed: true,
          effectivenessMultiplier: 1,
          pillId: "body_pill",
          projectedAmount: 0.1,
          toxicity: 1,
          toxicityAfter: 2,
          toxicityCap: 3,
        },
        schoolMatchLabel: "No school match on this pill.",
        unitId: "warden-1",
      },
      {
        pillName: "Ember Dao Pill",
        preview: {
          canFeed: false,
          effectivenessMultiplier: 0.5,
          pillId: "ember_dao_pill",
          projectedAmount: 0.1,
          reason: "Toxicity cap reached for Sworn.",
          schoolMatch: false,
          toxicity: 3,
          toxicityAfter: 3,
          toxicityCap: 3,
        },
        schoolMatchLabel:
          "School mismatch: Ember Dao Pill on a Rime cultivator. Effect would be halved.",
        unitId: "adept-1",
      },
    ],
    pop: { cap: 24, used: 23 },
    rations: {
      allowed: true,
      detail: "Fed buff for the next wave. Food and water become rations.",
      messHallId: "mess-1",
      unitIds: ["warden-1"],
    },
    revives: [
      {
        allowed: true,
        costLabel: "Essence 40",
        hallId: "hero-1",
        heroId: "edda-kesh",
        name: "Edda Kesh",
        reasons: [],
      },
    ],
    telegraphs: [
      {
        id: "cinderjaw-windup",
        kind: "boss_windup",
        label: "Cinderjaw wind-up",
        radius: 6,
        x: 90,
        y: 30,
      },
    ],
    trainOptions: [
      {
        allowed: true,
        buildingId: "barracks-1",
        classId: "warden",
        detail: "Pop 1",
        label: "Warden",
      },
      {
        allowed: false,
        buildingId: "barracks-1",
        classId: "breaker",
        detail: "Pop 1",
        label: "Breaker",
        reason: "Need spare population",
      },
    ],
    units: {
      "adept-1": {
        cultivation: {
          essence: 80,
          essenceToNext: 150,
          merit: 300,
          meritToNext: 300,
          missingRequirements: [],
          passives: ["Body Tempering", "Spirit Sense", "School Root"],
          rank: "Sworn",
          school: "rime",
          successChance: 0.41,
          toxicity: 3,
          toxicityCap: 3,
        },
        factionId: "hold",
        hitPoints: 90,
        maxHitPoints: 90,
        name: "Rime Adept",
      },
      "imp-1": {
        factionId: "horde",
        hitPoints: 40,
        maxHitPoints: 40,
        name: "Imp Raider",
      },
      "merit-1": {
        cultivation: ashborn(["Battle merit 0/100"], 0),
        factionId: "hold",
        hitPoints: 140,
        maxHitPoints: 140,
        name: "Green Warden",
      },
      "sworn-1": {
        cultivation: {
          essence: 10,
          essenceToNext: 150,
          merit: 10,
          meritToNext: 300,
          missingRequirements: ["School choice is required before advancing."],
          passives: ["Body Tempering", "Spirit Sense", "School Root"],
          rank: "Sworn",
          successChance: 0.5,
          toxicity: 0,
          toxicityCap: 3,
        },
        factionId: "hold",
        hitPoints: 120,
        maxHitPoints: 120,
        name: "Unsworn Guard",
      },
      "villager-1": {
        carrying: "wood",
        carryingAmount: 10,
        factionId: "hold",
        hitPoints: 40,
        maxHitPoints: 40,
        name: "Ash Cutter",
      },
      "warden-1": {
        cultivation: ashborn([], 100),
        factionId: "hold",
        hitPoints: 140,
        maxHitPoints: 140,
        name: "Sable Warden",
      },
    },
    veins: [{ id: "vein-1", radius: 4, x: 24, y: 22 }],
  };
  return {
    buildings: [
      { buildingType: "barracks", id: "barracks-1", x: 20, y: 30 },
      { buildingType: "alchemy_furnace", id: "furnace-1", x: 28, y: 30 },
      { buildingType: "cultivation_hall", id: "hall-1", x: 24, y: 22 },
      { buildingType: "omen_tower", id: "omen-1", x: 14, y: 24 },
      { buildingType: "hero_hall", id: "hero-1", x: 34, y: 30 },
      { buildingType: "mess_hall", id: "mess-1", x: 26, y: 38 },
      { buildingType: "calamity_altar", id: "altar-1", x: 36, y: 44 },
    ],
    layerId: "ashen_gate",
    map: { height: 96, width: 128 },
    meta: { ui },
    paused: false,
    resources,
    speed: 1,
    tick: 900,
    units: [
      { classId: "warden", id: "warden-1", x: 16, y: 40 },
      { classId: "adept", id: "adept-1", x: 22, y: 48 },
      { classId: "warden", id: "sworn-1", x: 30, y: 36 },
      { classId: "villager", id: "villager-1", x: 18, y: 55 },
      { classId: "raider", id: "imp-1", x: 90, y: 30 },
      { classId: "warden", id: "merit-1", x: 40, y: 60 },
    ],
  };
}
