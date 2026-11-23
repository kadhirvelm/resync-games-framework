/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  ArrowLeft,
  CircleHelp,
  type LucideIcon,
  Shield,
  Sparkles,
  Swords,
  Warehouse,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import hudStyles from "./bottomHud.module.scss";
import { buildingIconSrc } from "./buildingIcons";
import { buildMenuKeyAction, buildMenuKeyFor } from "./buildMenuHotkeys";
import { CostRow } from "./CostRow";
import { type CostStock, costLineFrom, costLineText } from "./costLine";
import type { BuildReadout } from "./presentation";
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
    description: "Breakthroughs, crafting, omens, and growing power.",
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
    description:
      "Lets trained units attempt breakthroughs. The first needs no pill; Spirit Veins improve success.",
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
    description:
      "Free to build; one villager tends the grove and hauls Wood to a drop-off.",
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
  stone_quarry: {
    category: "economy",
    description: "Mines a renewable supply of Stone.",
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
 * Explains why a building cannot be placed without conflating tier and cost.
 * @param option - Building to inspect
 * @returns The current blocker, or null when placement is available
 */
function buildOptionBlockReason(option: BuildReadout): string | null {
  if (option.unlocked && option.affordable !== false) return null;
  if (option.lockedReason !== undefined) return option.lockedReason;
  if (!option.unlocked) return `Requires ${option.tier}`;
  return "Not enough resources";
}

type BuildHint =
  | {
      available: number;
      category: BuildCategory;
      count: number;
      kind: "category";
    }
  | { kind: "option"; option: BuildReadout }
  | { description: string; kind: "control"; title: string };

/**
 * Rebinds a remembered hint to the latest simulation readout. Resource and
 * tier changes therefore update an open tooltip without clearing its focus.
 * @param hint - Remembered hover or focus target
 * @param options - Latest published build options
 * @returns Fresh hint data, or null when the target no longer exists
 */
function resolveBuildHint(
  hint: BuildHint,
  options: readonly BuildReadout[],
): BuildHint | null {
  if (hint.kind === "control") return hint;
  if (hint.kind === "option") {
    const option = options.find(
      (candidate) => candidate.buildingType === hint.option.buildingType,
    );
    return option === undefined ? null : { kind: "option", option };
  }
  const categoryOptions = options.filter(
    (option) => buildingGuide(option).category === hint.category,
  );
  if (categoryOptions.length === 0) return null;
  const available = categoryOptions.filter(
    (option) => buildOptionBlockReason(option) === null,
  ).length;
  return { ...hint, available, count: categoryOptions.length };
}

interface TileInteraction {
  onFocusHint: (hint: BuildHint | null) => void;
  onHoverHint: (hint: BuildHint | null) => void;
  tooltipId: string;
}

/**
 * One square command-grid tile. Unavailable tiles use `aria-disabled` rather
 * than a native disabled button so they remain hoverable, focusable, and able
 * to explain themselves.
 * @param props - Content, activation, accessibility, and tooltip callbacks
 * @returns A build category, building, or utility tile
 */
function BuildTile({
  blocked = false,
  buildingType,
  children,
  hint,
  hotkey,
  label,
  onActivate,
  onFocusHint,
  onHoverHint,
  tone,
  tooltipId,
}: {
  blocked?: boolean;
  buildingType?: string;
  children: ReactNode;
  hint: BuildHint;
  hotkey?: string;
  label: string;
  onActivate: () => void;
  tone?: BuildingTone;
} & TileInteraction) {
  return (
    <li className={hudStyles.buildTile} data-building-type={buildingType}>
      <button
        aria-describedby={tooltipId}
        aria-disabled={blocked ? true : undefined}
        aria-keyshortcuts={hotkey}
        aria-label={label}
        className={hudStyles.action}
        data-blocked={blocked}
        data-tone={tone}
        onBlur={() => onFocusHint(null)}
        onClick={onActivate}
        onFocus={() => onFocusHint(hint)}
        onPointerEnter={() => onHoverHint(hint)}
        onPointerLeave={() => onHoverHint(null)}
        type="button"
      >
        {children}
        {hotkey === undefined ? null : (
          <kbd className={hudStyles.actionHotkey}>{hotkey}</kbd>
        )}
        {blocked ? (
          <span aria-hidden="true" className={hudStyles.actionLock}>
            !
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * Utility tile for navigation, help, and closing the build command card.
 * @param props - Icon, copy, action, and tooltip callbacks
 * @returns A square utility action
 */
function BuildControl({
  description,
  icon: Icon,
  label,
  onActivate,
  onFocusHint,
  onHoverHint,
  tooltipId,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  onActivate: () => void;
} & TileInteraction) {
  return (
    <BuildTile
      hint={{ description, kind: "control", title: label }}
      label={label}
      onActivate={onActivate}
      onFocusHint={onFocusHint}
      onHoverHint={onHoverHint}
      tooltipId={tooltipId}
    >
      <Icon aria-hidden="true" className={hudStyles.buildUtilityIcon} />
      <span className={hudStyles.srOnly}>{label}</span>
    </BuildTile>
  );
}

/**
 * Category choices shown before individual structures.
 * @param props - Categories, options, controls, and tooltip callbacks
 * @returns The first level of the build command card
 */
function BuildCategoryPicker({
  categories,
  controls,
  onChoose,
  onFocusHint,
  onHoverHint,
  options,
  tooltipId,
}: {
  categories: readonly BuildCategory[];
  controls: ReactNode;
  onChoose: (category: BuildCategory) => void;
  options: readonly BuildReadout[];
} & TileInteraction) {
  return (
    <ul
      aria-label="Build categories"
      className={`${hudStyles.actionGrid} ${hudStyles.buildGrid}`}
    >
      {options.length === 0 ? (
        <li className={hudStyles.buildEmpty}>No options</li>
      ) : null}
      {categories.map((category, index) => {
        const hotkey = buildMenuKeyFor("categories", index);
        const guide = BUILD_CATEGORY_GUIDES[category];
        const CategoryIcon = guide.icon;
        const categoryOptions = options.filter(
          (option) => buildingGuide(option).category === category,
        );
        const available = categoryOptions.filter(
          (option) => buildOptionBlockReason(option) === null,
        ).length;
        const count = categoryOptions.length;
        const buildingLabel = count === 1 ? "building" : "buildings";
        return (
          <BuildTile
            hint={{ available, category, count, kind: "category" }}
            hotkey={hotkey}
            key={category}
            label={`${guide.label}. ${guide.description} ${count} ${buildingLabel}; ${available} available.`}
            onActivate={() => onChoose(category)}
            onFocusHint={onFocusHint}
            onHoverHint={onHoverHint}
            tone={guide.tone}
            tooltipId={tooltipId}
          >
            <CategoryIcon
              aria-hidden="true"
              className={hudStyles.buildCategoryIcon}
            />
            <span className={hudStyles.srOnly}>{guide.label}</span>
          </BuildTile>
        );
      })}
      {controls}
    </ul>
  );
}

/**
 * Individual structures inside one selected category. Locked and unaffordable
 * options stay in the grid and report their blocker through the shared tooltip.
 * @param props - Options, controls, placement callback, and tooltip callbacks
 * @returns The building option grid
 */
function BuildOptionGrid({
  controls,
  onChoose,
  onFocusHint,
  onHoverHint,
  options,
  tooltipId,
}: {
  controls: ReactNode;
  onChoose: (option: BuildReadout) => void;
  options: readonly BuildReadout[];
} & TileInteraction) {
  return (
    <ul
      aria-label="Buildings"
      className={`${hudStyles.actionGrid} ${hudStyles.buildGrid}`}
    >
      {options.map((option, index) => {
        const hotkey = buildMenuKeyFor("buildings", index);
        const cost =
          option.cost === undefined ? undefined : costLineFrom(option.cost);
        const costText =
          cost === undefined ? option.costLabel : costLineText(cost);
        const guide = buildingGuide(option);
        const iconSrc = buildingIconSrc(option.buildingType);
        const reason = buildOptionBlockReason(option);
        const labelParts = [
          option.name,
          guide.description,
          `Cost: ${costText}`,
          reason === null ? undefined : `Unavailable: ${reason}`,
        ].filter((part): part is string => part !== undefined);
        return (
          <BuildTile
            blocked={reason !== null}
            buildingType={option.buildingType}
            hint={{ kind: "option", option }}
            hotkey={hotkey}
            key={option.buildingType}
            label={labelParts.join(". ")}
            onActivate={() => onChoose(option)}
            onFocusHint={onFocusHint}
            onHoverHint={onHoverHint}
            tone={guide.tone}
            tooltipId={tooltipId}
          >
            {iconSrc === null ? (
              <span aria-hidden="true" className={hudStyles.buildIconGlyph}>
                {option.name.slice(0, 1)}
              </span>
            ) : (
              // biome-ignore lint/performance/noImgElement: bundled game HUD icon
              <img
                alt=""
                aria-hidden="true"
                className={hudStyles.actionIcon}
                src={iconSrc}
              />
            )}
            <span className={hudStyles.srOnly}>{option.name}</span>
          </BuildTile>
        );
      })}
      {controls}
    </ul>
  );
}

/**
 * Detailed tooltip for one building, including its price and placement hints.
 * @param props - Published option and current stockpile
 * @returns Building details and its current blocker, when present
 */
function BuildOptionTooltip({
  option,
  stock,
}: {
  option: BuildReadout;
  stock: CostStock;
}) {
  const guide = buildingGuide(option);
  const cost =
    option.cost === undefined ? undefined : costLineFrom(option.cost);
  const reason = buildOptionBlockReason(option);
  return (
    <div
      className={hudStyles.tooltip}
      data-blocked={reason !== null}
      data-testid="build-tooltip"
      role="tooltip"
    >
      <div className={hudStyles.tooltipHead}>
        <strong>{option.name}</strong>
        <span className={hudStyles.hintRole}>{option.tier}</span>
      </div>
      {cost === undefined ? (
        <p className={hudStyles.hintCost}>{option.costLabel}</p>
      ) : (
        <CostRow line={cost} size="full" stock={stock} />
      )}
      <p className={hudStyles.tooltipText}>{guide.description}</p>
      {option.hints.length === 0 ? null : (
        <ul className={hudStyles.buildTooltipHints}>
          {option.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      {reason === null ? null : (
        <section aria-label="Requirements" className={hudStyles.requirements}>
          <h4 className={hudStyles.requirementsHeading}>Can't build yet</h4>
          <span className={hudStyles.requirementProblem}>{reason}</span>
        </section>
      )}
    </div>
  );
}

/**
 * Tooltip for the currently hovered or focused build command tile.
 * @param props - Hint target and current stockpile
 * @returns Category, building, or utility details
 */
function BuildTooltip({ hint, stock }: { hint: BuildHint; stock: CostStock }) {
  if (hint.kind === "option") {
    return <BuildOptionTooltip option={hint.option} stock={stock} />;
  }
  if (hint.kind === "control") {
    return (
      <div
        className={hudStyles.tooltip}
        data-testid="build-tooltip"
        role="tooltip"
      >
        <div className={hudStyles.tooltipHead}>
          <strong>{hint.title}</strong>
        </div>
        <p className={hudStyles.tooltipText}>{hint.description}</p>
      </div>
    );
  }
  const guide = BUILD_CATEGORY_GUIDES[hint.category];
  const buildingLabel = hint.count === 1 ? "building" : "buildings";
  return (
    <div
      className={hudStyles.tooltip}
      data-testid="build-tooltip"
      role="tooltip"
    >
      <div className={hudStyles.tooltipHead}>
        <strong>{guide.label}</strong>
        <span className={hudStyles.hintRole}>
          {hint.available}/{hint.count} available
        </span>
      </div>
      <p className={hudStyles.tooltipText}>{guide.description}</p>
      <p className={hudStyles.hintCost}>
        {hint.count} {buildingLabel}
      </p>
    </div>
  );
}

/**
 * AoE-style build command card. It occupies the same bottom-left slot as the
 * ordinary command card and keeps every published building visible; blocked
 * choices remain focusable so their tooltip can explain the requirement.
 * @param props - Options, actions, and what the player can spend
 * @returns The build menu
 */
export function BuildMenu({
  onChoose,
  onClose,
  onGlossary,
  options,
  shortcutsSuspended = false,
  stock,
}: {
  onChoose: (option: BuildReadout) => void;
  onClose: () => void;
  onGlossary: () => void;
  options: readonly BuildReadout[];
  /** Whether a dialog above the command card should receive the keyboard. */
  shortcutsSuspended?: boolean;
  /** What the player can spend, so short amounts draw in red. */
  stock: CostStock;
}) {
  const [selectedCategory, setSelectedCategory] =
    useState<BuildCategory | null>(null);
  const [focusedHint, setFocusedHint] = useState<BuildHint | null>(null);
  const [hoveredHint, setHoveredHint] = useState<BuildHint | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const tooltipId = useId();

  const availableCategories = BUILD_CATEGORIES.filter((category) =>
    options.some((option) => buildingGuide(option).category === category),
  );
  const activeCategory =
    selectedCategory !== null && availableCategories.includes(selectedCategory)
      ? selectedCategory
      : null;
  const activeGuide =
    activeCategory === null ? null : BUILD_CATEGORY_GUIDES[activeCategory];
  const visibleOptions =
    activeCategory === null
      ? []
      : options.filter(
          (option) => buildingGuide(option).category === activeCategory,
        );
  const activeHint = hoveredHint ?? focusedHint;
  const liveHint =
    activeHint === null ? null : resolveBuildHint(activeHint, options);

  useEffect(() => {
    const gridLabel =
      activeCategory === null ? "Build categories" : "Buildings";
    const firstTile = menuRef.current?.querySelector(
      `[aria-label="${gridLabel}"] button`,
    );
    if (firstTile instanceof HTMLButtonElement) firstTile.focus();
  }, [activeCategory]);

  const keyState = useRef({
    activeCategory,
    availableCategories,
    onChoose,
    shortcutsSuspended,
    visibleOptions,
  });
  keyState.current = {
    activeCategory,
    availableCategories,
    onChoose,
    shortcutsSuspended,
    visibleOptions,
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
      if (state.shortcutsSuspended) return;
      const level = state.activeCategory === null ? "categories" : "buildings";
      const count =
        level === "categories"
          ? state.availableCategories.length
          : state.visibleOptions.length;
      const action = buildMenuKeyAction(event, level, count);
      if (action === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setHoveredHint(null);
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
      const option = state.visibleOptions[action.index];
      if (option !== undefined) state.onChoose(option);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const glossaryControl = (
    <BuildControl
      description="Look up building and cultivation terms."
      icon={CircleHelp}
      label="Open glossary from the build menu"
      onActivate={onGlossary}
      onFocusHint={setFocusedHint}
      onHoverHint={setHoveredHint}
      tooltipId={tooltipId}
    />
  );
  const closeControl = (
    <BuildControl
      description="Return to the selected villagers' commands."
      icon={X}
      label="Close build menu"
      onActivate={onClose}
      onFocusHint={setFocusedHint}
      onHoverHint={setHoveredHint}
      tooltipId={tooltipId}
    />
  );
  const title = activeGuide === null ? "Build" : activeGuide.label;

  return (
    <section
      aria-label="Build menu"
      className={`${hudStyles.actions} ${hudStyles.buildMenu}`}
      ref={menuRef}
    >
      <h3 className={hudStyles.srOnly}>{title}</h3>
      <div className={hudStyles.tooltipDock} id={tooltipId}>
        {liveHint === null ? null : (
          <BuildTooltip hint={liveHint} stock={stock} />
        )}
      </div>
      {activeCategory === null ? (
        <BuildCategoryPicker
          categories={availableCategories}
          controls={
            <>
              {glossaryControl}
              {closeControl}
            </>
          }
          onChoose={setSelectedCategory}
          onFocusHint={setFocusedHint}
          onHoverHint={setHoveredHint}
          options={options}
          tooltipId={tooltipId}
        />
      ) : (
        <BuildOptionGrid
          controls={
            <>
              <BuildControl
                description="Back to build categories (Backspace)."
                icon={ArrowLeft}
                label="Back to build categories"
                onActivate={() => setSelectedCategory(null)}
                onFocusHint={setFocusedHint}
                onHoverHint={setHoveredHint}
                tooltipId={tooltipId}
              />
              {glossaryControl}
              {closeControl}
            </>
          }
          onChoose={onChoose}
          onFocusHint={setFocusedHint}
          onHoverHint={setHoveredHint}
          options={visibleOptions}
          tooltipId={tooltipId}
        />
      )}
    </section>
  );
}
