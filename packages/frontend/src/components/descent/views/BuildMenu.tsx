/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  ArrowLeft,
  type LucideIcon,
  Shield,
  Sparkles,
  Swords,
  Warehouse,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HoldTier } from "../logic/economy/model";
import hudStyles from "./bottomHud.module.scss";
import { buildingIconSrc } from "./buildingIcons";
import { buildMenuKeyAction, buildMenuKeyFor } from "./buildMenuHotkeys";
import { CostRow } from "./CostRow";
import { type CostStock, costLineFrom, costLineText } from "./costLine";
import styles from "./descentView.module.scss";
import type { BuildReadout } from "./presentation";
import { HOLD_TIER_ORDER, holdTierRank } from "./tierUnlocks";
import { isTypingTarget } from "./useHotkeys";

type BuildingTone = "defense" | "economy" | "mystic" | "war";
type BuildCategory = "cultivation" | "defense" | "economy" | "military";

interface BuildingGuide {
  category: BuildCategory;
  description: string;
  tone: BuildingTone;
}

interface BuildCategoryGuide {
  description: string;
  icon: LucideIcon;
  label: string;
  tone: BuildingTone;
}

/** Category order and copy for the first level of the traditional build menu. */
const BUILD_CATEGORIES: readonly BuildCategory[] = [
  "economy",
  "military",
  "defense",
  "cultivation",
];

/** Visual identity and purpose of each villager build category. */
const BUILD_CATEGORY_GUIDES: Record<BuildCategory, BuildCategoryGuide> = {
  cultivation: {
    description: "Breakthroughs, crafting, omens, and late-game power.",
    icon: Sparkles,
    label: "Cultivation",
    tone: "mystic",
  },
  defense: {
    description: "Shape the battlefield and hold back the horde.",
    icon: Shield,
    label: "Defense",
    tone: "defense",
  },
  economy: {
    description: "Grow population and keep resources flowing.",
    icon: Warehouse,
    label: "Economy",
    tone: "economy",
  },
  military: {
    description: "Train and support the Hold's combat units.",
    icon: Swords,
    label: "Military",
    tone: "war",
  },
};

/** Villager-facing purpose and visual identity for every Ashen Gate building. */
const BUILDING_GUIDES: Record<string, BuildingGuide> = {
  alchemy_furnace: {
    category: "cultivation",
    description: "Brews cultivation pills from Spirit Herbs and Essence.",
    tone: "mystic",
  },
  artifact_forge: {
    category: "cultivation",
    description: "Forges treasures that your strongest units can equip.",
    tone: "mystic",
  },
  barracks: {
    category: "military",
    description:
      "Trains the Hold's soldiers; upgrading the Hold unlocks more classes.",
    tone: "war",
  },
  calamity_altar: {
    category: "cultivation",
    description: "Summons one powerful Calamity after reaching the Citadel.",
    tone: "mystic",
  },
  cultivation_hall: {
    category: "cultivation",
    description: "Lets trained units attempt cultivation breakthroughs.",
    tone: "mystic",
  },
  cultivator_sanctum: {
    category: "cultivation",
    description:
      "Trains Sword, Flying-Sword, and Formation Cultivators to wield Qi Arts and ascend.",
    tone: "mystic",
  },
  ember_forge: {
    category: "cultivation",
    description: "Unlocks Ember equipment forged for the Ashen Gate.",
    tone: "mystic",
  },
  farm: {
    category: "economy",
    description: "Consumes Water over time to harvest a steady Food crop.",
    tone: "economy",
  },
  fire_ward_wall: {
    category: "defense",
    description: "Funnels enemies and protects nearby units from vent burns.",
    tone: "defense",
  },
  forest: {
    category: "economy",
    description: "Consumes Water to regrow a managed source of Wood.",
    tone: "economy",
  },
  gate: {
    category: "defense",
    description: "Blocks the horde while allowing your own units through.",
    tone: "defense",
  },
  hell_market: {
    category: "economy",
    description: "Sells surplus Food, Water, or Wood for Coin.",
    tone: "economy",
  },
  hero_hall: {
    category: "military",
    description: "Trains heroes and brings fallen heroes back to the fight.",
    tone: "war",
  },
  housing: {
    category: "economy",
    description: "Raises the population cap for more workers and soldiers.",
    tone: "economy",
  },
  meditation_pavilion: {
    category: "cultivation",
    description:
      "Seclusion chamber that feeds nearby Cultivators steady Essence, Merit, and faster recovery.",
    tone: "mystic",
  },
  mess_hall: {
    category: "economy",
    description: "Turns Food and Water into rations that strengthen a squad.",
    tone: "economy",
  },
  omen_tower: {
    category: "cultivation",
    description: "Reveals which enemy classes are in the next wave.",
    tone: "mystic",
  },
  root_cellar: {
    category: "economy",
    description: "Produces a raid-proof trickle of Food and Water.",
    tone: "economy",
  },
  spirit_array: {
    category: "cultivation",
    description:
      "Expands sect territory, passively gathers Essence, and doubles nearby Cultivator Qi regen.",
    tone: "mystic",
  },
  spirit_herb_garden: {
    category: "economy",
    description: "Consumes Water, then slowly grows Spirit Herbs.",
    tone: "economy",
  },
  storehouse: {
    category: "economy",
    description: "A closer drop-off point that shortens villager haul trips.",
    tone: "economy",
  },
  wall: {
    category: "defense",
    description: "A tough barrier that blocks movement and funnels enemies.",
    tone: "defense",
  },
  ward_tower: {
    category: "defense",
    description: "Automatically shoots nearby enemies and extends vision.",
    tone: "defense",
  },
  well: {
    category: "economy",
    description: "Continually draws Water without consuming resources.",
    tone: "economy",
  },
};

/**
 * Resolves a building's menu guide, retaining published copy for new types.
 * @param option - Build option published by the simulation
 * @returns Tone and player-facing purpose
 */
function buildingGuide(option: BuildReadout): BuildingGuide {
  return (
    BUILDING_GUIDES[option.buildingType] ?? {
      category: "economy",
      description: option.job,
      tone: "economy",
    }
  );
}

/**
 * Checks whether a string matches a known Hold tier.
 * @param value - Candidate tier name
 * @returns True when `value` is a valid HoldTier
 */
function isHoldTier(value: string): value is HoldTier {
  return HOLD_TIER_ORDER.includes(value as HoldTier);
}

/**
 * Infers the current Hold tier from the highest unlocked build option when
 * the caller does not pass `holdTier` explicitly.
 * @param options - Build options published by the simulation
 * @returns Inferred Hold tier (defaults to `"Camp"`)
 */
function inferCurrentTier(options: readonly BuildReadout[]): HoldTier {
  let highest: HoldTier = "Camp";
  for (const option of options) {
    if (!option.unlocked || !isHoldTier(option.tier)) continue;
    if (holdTierRank(option.tier) > holdTierRank(highest)) {
      highest = option.tier;
    }
  }
  return highest;
}

/**
 * Returns the Hold tier immediately following `tier`, or `null` at Citadel.
 * @param tier - Current Hold tier
 * @returns Next Hold tier, or null
 */
function nextTierAfter(tier: HoldTier): HoldTier | null {
  const index = holdTierRank(tier);
  if (index < 0) return null;
  return HOLD_TIER_ORDER[index + 1] ?? null;
}

interface PartitionedBuildOptions {
  laterTierLocked: readonly BuildReadout[];
  nextTierLocked: readonly BuildReadout[];
  unlocked: readonly BuildReadout[];
}

/**
 * Splits build options into unlocked buildings, locked buildings from the
 * immediate next Hold tier, and locked buildings from tiers beyond that.
 * @param options - Candidate build options
 * @param nextTier - The immediate next Hold tier, or null at max tier
 * @returns Partitioned build lists
 */
function partitionBuildOptions(
  options: readonly BuildReadout[],
  nextTier: HoldTier | null,
): PartitionedBuildOptions {
  const unlocked: BuildReadout[] = [];
  const nextTierLocked: BuildReadout[] = [];
  const laterTierLocked: BuildReadout[] = [];
  for (const option of options) {
    if (option.unlocked) {
      unlocked.push(option);
      continue;
    }
    if (nextTier !== null && option.tier === nextTier) {
      nextTierLocked.push(option);
      continue;
    }
    laterTierLocked.push(option);
  }
  return { laterTierLocked, nextTierLocked, unlocked };
}

/**
 * Category choices shown before individual structures.
 * @param props - Available categories, build options, and selection callback
 * @returns The first level of the build menu
 */
function BuildCategoryPicker({
  categories,
  onChoose,
  options,
}: {
  categories: readonly BuildCategory[];
  onChoose: (category: BuildCategory) => void;
  options: readonly BuildReadout[];
}) {
  return (
    <ul aria-label="Build categories" className={styles.buildCategoryGrid}>
      {categories.map((category, index) => {
        const hotkey = buildMenuKeyFor("categories", index);
        const guide = BUILD_CATEGORY_GUIDES[category];
        const CategoryIcon = guide.icon;
        const categoryOptions = options.filter(
          (option) => buildingGuide(option).category === category,
        );
        const unlockedCount = categoryOptions.filter(
          (option) => option.unlocked,
        ).length;
        const count =
          unlockedCount > 0 ? unlockedCount : categoryOptions.length;
        return (
          <li key={category}>
            <button
              aria-keyshortcuts={hotkey}
              aria-label={`${guide.label}. ${guide.description} ${count} ${count === 1 ? "building" : "buildings"}.`}
              className={styles.buildCategoryChoice}
              data-build-category={category}
              onClick={() => onChoose(category)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.buildCategoryIcon}
                data-tone={guide.tone}
              >
                <CategoryIcon size={36} strokeWidth={1.55} />
              </span>
              <span className={styles.buildCategoryCopy}>
                <strong>{guide.label}</strong>
                <span>{guide.description}</span>
                <small>
                  {count} {count === 1 ? "building" : "buildings"}
                </small>
              </span>
              {hotkey === undefined ? null : (
                <kbd className={styles.buildHotkey}>{hotkey}</kbd>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Individual structures inside one selected category or preview group.
 * @param props - Visible build options, hotkey flag, placement callback, and stock
 * @returns The building option grid
 */
function BuildOptionGrid({
  allowHotkeys = true,
  onChoose,
  options,
  stock,
}: {
  /** Whether to attach keyboard grid hotkeys to these cards. */
  allowHotkeys?: boolean;
  onChoose: (option: BuildReadout) => void;
  options: readonly BuildReadout[];
  stock: CostStock;
}) {
  return (
    <ul className={styles.buildGrid}>
      {options.map((option, index) => {
        const hotkey = allowHotkeys
          ? buildMenuKeyFor("buildings", index)
          : undefined;
        const cost =
          option.cost === undefined ? undefined : costLineFrom(option.cost);
        const costText =
          cost === undefined ? option.costLabel : costLineText(cost);
        const guide = buildingGuide(option);
        const iconSrc = buildingIconSrc(option.buildingType);
        return (
          <li
            className={`${styles.buildOption} ${option.unlocked ? "" : styles.locked}`}
            data-building-type={option.buildingType}
            key={option.buildingType}
            title={[option.tier, guide.description, ...option.hints].join(
              " · ",
            )}
          >
            <button
              aria-keyshortcuts={hotkey}
              aria-label={`${option.name}. ${guide.description} Cost: ${costText}.`}
              className={styles.buildChoice}
              disabled={!option.unlocked}
              onClick={() => onChoose(option)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.buildIcon}
                data-tone={guide.tone}
              >
                {iconSrc === null ? (
                  <span className={styles.buildIconGlyph}>
                    {option.name.slice(0, 1)}
                  </span>
                ) : (
                  // biome-ignore lint/performance/noImgElement: bundled game HUD icon
                  <img alt="" className={styles.buildIconImage} src={iconSrc} />
                )}
              </span>
              <span className={styles.buildChoiceCopy}>
                <span className={styles.buildChoiceHeader}>
                  <strong>{option.name}</strong>
                  <span className={styles.buildTier}>{option.tier}</span>
                </span>
                <span className={styles.buildDescription}>
                  {guide.description}
                </span>
                {option.hints.length === 0 ? null : (
                  <span className={styles.buildHints}>
                    {option.hints.map((hint) => (
                      <span className={styles.buildHint} key={hint}>
                        {hint}
                      </span>
                    ))}
                  </span>
                )}
                <span className={styles.buildCost}>
                  {cost === undefined ? (
                    option.costLabel
                  ) : (
                    <CostRow line={cost} size="full" stock={stock} />
                  )}
                </span>
              </span>
              {hotkey === undefined ? null : (
                <kbd className={styles.buildHotkey}>{hotkey}</kbd>
              )}
            </button>
            {option.lockedReason === undefined ? null : (
              <p className={styles.lockReason}>{option.lockedReason}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Compact footer showing a one-line teaser for the next Hold tier's unlocks
 * (with an expandable preview) and a subtle toggle for tiers beyond that.
 * @param props - Next-tier and later-tier locked lists, toggle states, and stock
 * @returns The teaser footer, or null when no locked buildings exist
 */
function LockedTierFooter({
  laterTierLocked,
  nextTier,
  nextTierLocked,
  onChoose,
  onTogglePreview,
  onToggleShowAllTiers,
  previewNextTier,
  showAllTiers,
  stock,
}: {
  laterTierLocked: readonly BuildReadout[];
  nextTier: HoldTier | null;
  nextTierLocked: readonly BuildReadout[];
  onChoose: (option: BuildReadout) => void;
  onTogglePreview: () => void;
  onToggleShowAllTiers: () => void;
  previewNextTier: boolean;
  showAllTiers: boolean;
  stock: CostStock;
}) {
  const hasNextTier = nextTier !== null && nextTierLocked.length > 0;
  const hasLaterTiers = laterTierLocked.length > 0;
  if (!hasNextTier && !hasLaterTiers) return null;

  const nextTierNames = nextTierLocked.map((option) => option.name).join(", ");
  return (
    <div className={hudStyles.buildTierFooter}>
      {hasNextTier ? (
        <div
          className={hudStyles.buildTierTeaser}
          data-testid="build-next-tier-teaser"
        >
          <p className={hudStyles.buildTierTeaserText}>
            <strong>{`Next tier · ${nextTier}`}</strong>
            {` unlocks: ${nextTierNames}`}
          </p>
          <button
            aria-expanded={previewNextTier}
            className={hudStyles.buildTierToggle}
            onClick={onTogglePreview}
            type="button"
          >
            {previewNextTier ? "Hide preview" : "Preview"}
          </button>
        </div>
      ) : null}
      {hasNextTier && previewNextTier ? (
        <div className={hudStyles.buildPreviewSection}>
          <BuildOptionGrid
            allowHotkeys={false}
            onChoose={onChoose}
            options={nextTierLocked}
            stock={stock}
          />
        </div>
      ) : null}
      {hasLaterTiers ? (
        <div className={hudStyles.buildLaterRow}>
          <button
            aria-expanded={showAllTiers}
            className={hudStyles.buildLaterToggle}
            data-testid="build-show-all-tiers"
            onClick={onToggleShowAllTiers}
            type="button"
          >
            {showAllTiers ? "Hide later tiers" : "Show all tiers"}
          </button>
        </div>
      ) : null}
      {hasLaterTiers && showAllTiers ? (
        <div className={hudStyles.buildPreviewSection}>
          <p className={hudStyles.buildPreviewHeading}>Later tiers</p>
          <BuildOptionGrid
            allowHotkeys={false}
            onChoose={onChoose}
            options={laterTierLocked}
            stock={stock}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tier-gated build list. Shows unlocked buildings as clickable options,
 * summarizes the next Hold tier's unlocks in one compact teaser row with an
 * optional preview, and hides tiers beyond that behind a subtle toggle.
 * Grid hotkeys pick a category and then an unlocked building; Backspace goes back.
 * @param props - Options, optional Hold tier, actions, and what the player can spend
 * @returns The build menu
 */
export function BuildMenu({
  holdTier,
  onChoose,
  onClose,
  onGlossary,
  options,
  stock,
}: {
  /** Current Hold tier override; inferred from unlocked options when omitted. */
  holdTier?: HoldTier;
  onChoose: (option: BuildReadout) => void;
  onClose: () => void;
  onGlossary: () => void;
  options: readonly BuildReadout[];
  /** What the player can spend, so short amounts draw in red. */
  stock: CostStock;
}) {
  const [selectedCategory, setSelectedCategory] =
    useState<BuildCategory | null>(null);
  const [previewNextTier, setPreviewNextTier] = useState(false);
  const [showAllTiers, setShowAllTiers] = useState(false);

  const currentTier = holdTier ?? inferCurrentTier(options);
  const nextTier = nextTierAfter(currentTier);

  const unlockedCategories = BUILD_CATEGORIES.filter((category) =>
    options.some(
      (option) =>
        option.unlocked && buildingGuide(option).category === category,
    ),
  );
  const allCategories = BUILD_CATEGORIES.filter((category) =>
    options.some((option) => buildingGuide(option).category === category),
  );
  const availableCategories =
    showAllTiers || unlockedCategories.length === 0
      ? allCategories
      : unlockedCategories;

  const activeCategory =
    selectedCategory !== null && availableCategories.includes(selectedCategory)
      ? selectedCategory
      : null;
  const activeGuide =
    activeCategory === null ? null : BUILD_CATEGORY_GUIDES[activeCategory];

  const scopedOptions =
    activeCategory === null
      ? options
      : options.filter(
          (option) => buildingGuide(option).category === activeCategory,
        );
  const partitioned = partitionBuildOptions(scopedOptions, nextTier);

  const keyState = useRef({
    activeCategory,
    availableCategories,
    onChoose,
    unlockedOptions: partitioned.unlocked,
  });
  keyState.current = {
    activeCategory,
    availableCategories,
    onChoose,
    unlockedOptions: partitioned.unlocked,
  };
  useEffect(() => {
    /**
     * Runs before the shell and camera listeners, so a grid key picks from
     * the menu instead of panning or turning the camera.
     * @param event - Keydown on the window, capture phase
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const state = keyState.current;
      const level = state.activeCategory === null ? "categories" : "buildings";
      const count =
        level === "categories"
          ? state.availableCategories.length
          : state.unlockedOptions.length;
      const action = buildMenuKeyAction(event, level, count);
      if (action === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action.type === "back") {
        setSelectedCategory(null);
        return;
      }
      if (action.type !== "choose") return;
      if (level === "categories") {
        const category = state.availableCategories[action.index];
        if (category !== undefined) setSelectedCategory(category);
        return;
      }
      const option = state.unlockedOptions[action.index];
      if (option !== undefined) state.onChoose(option);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
  let title = "Build";
  let subtitle = "Choose a category for the selected villagers.";
  if (activeGuide !== null) {
    title = activeGuide.label;
    subtitle = activeGuide.description;
  }
  return (
    <section aria-label="Build menu" className={styles.menu}>
      <header className={styles.buildMenuHeader}>
        <div>
          <h3 className={styles.panelTitle}>{title}</h3>
          <p className={styles.buildMenuSubtitle}>{subtitle}</p>
        </div>
        <div className={styles.buildMenuActions}>
          {activeCategory === null ? null : (
            <button
              aria-label="Back to build categories"
              className={styles.buildBackButton}
              onClick={() => setSelectedCategory(null)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={13} strokeWidth={2} />
              Categories
              <kbd className={styles.buildBackHotkey}>⌫</kbd>
            </button>
          )}
          <button
            aria-label="Open glossary from the build menu"
            className={styles.intelButton}
            onClick={onGlossary}
            type="button"
          >
            ?
          </button>
          <button
            aria-label="Close build menu"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </header>
      {options.length === 0 ? <p>No options</p> : null}
      {options.length === 0 || activeCategory !== null ? null : (
        <BuildCategoryPicker
          categories={availableCategories}
          onChoose={setSelectedCategory}
          options={options}
        />
      )}
      {activeCategory === null || partitioned.unlocked.length === 0 ? null : (
        <BuildOptionGrid
          allowHotkeys={true}
          onChoose={onChoose}
          options={partitioned.unlocked}
          stock={stock}
        />
      )}
      {options.length === 0 ? null : (
        <LockedTierFooter
          laterTierLocked={partitioned.laterTierLocked}
          nextTier={nextTier}
          nextTierLocked={partitioned.nextTierLocked}
          onChoose={onChoose}
          onTogglePreview={() => setPreviewNextTier((open) => !open)}
          onToggleShowAllTiers={() => setShowAllTiers((open) => !open)}
          previewNextTier={previewNextTier}
          showAllTiers={showAllTiers}
          stock={stock}
        />
      )}
    </section>
  );
}
