/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  Anvil,
  ArrowLeft,
  BrickWall,
  Crown,
  DoorOpen,
  Eye,
  Flame,
  FlaskConical,
  Hammer,
  House,
  type LucideIcon,
  PackageOpen,
  Shield,
  Skull,
  Sparkles,
  Swords,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import styles from "./descentView.module.scss";
import type { BuildReadout } from "./presentation";

type BuildingTone = "defense" | "economy" | "mystic" | "war";
type BuildCategory = "cultivation" | "defense" | "economy" | "military";

interface BuildingGuide {
  category: BuildCategory;
  description: string;
  icon: LucideIcon;
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
    icon: FlaskConical,
    tone: "mystic",
  },
  artifact_forge: {
    category: "cultivation",
    description: "Forges treasures that your strongest units can equip.",
    icon: Hammer,
    tone: "mystic",
  },
  barracks: {
    category: "military",
    description: "Trains Wardens, Hunters, Raiders, Breakers, and Adepts.",
    icon: Swords,
    tone: "war",
  },
  calamity_altar: {
    category: "cultivation",
    description: "Summons one powerful Calamity after reaching the Citadel.",
    icon: Skull,
    tone: "mystic",
  },
  cultivation_hall: {
    category: "cultivation",
    description: "Lets trained units attempt cultivation breakthroughs.",
    icon: Sparkles,
    tone: "mystic",
  },
  ember_forge: {
    category: "cultivation",
    description: "Unlocks Ember equipment forged for the Ashen Gate.",
    icon: Anvil,
    tone: "mystic",
  },
  fire_ward_wall: {
    category: "defense",
    description: "Funnels enemies and protects nearby units from vent burns.",
    icon: Flame,
    tone: "defense",
  },
  gate: {
    category: "defense",
    description: "Blocks the horde while allowing your own units through.",
    icon: DoorOpen,
    tone: "defense",
  },
  hero_hall: {
    category: "military",
    description: "Trains heroes and brings fallen heroes back to the fight.",
    icon: Crown,
    tone: "war",
  },
  housing: {
    category: "economy",
    description: "Raises the population cap for more workers and soldiers.",
    icon: House,
    tone: "economy",
  },
  mess_hall: {
    category: "economy",
    description: "Turns Food and Water into rations that strengthen a squad.",
    icon: UtensilsCrossed,
    tone: "economy",
  },
  omen_tower: {
    category: "cultivation",
    description: "Reveals which enemy classes are in the next wave.",
    icon: Eye,
    tone: "mystic",
  },
  root_cellar: {
    category: "economy",
    description: "Produces a raid-proof trickle of Food and Water.",
    icon: PackageOpen,
    tone: "economy",
  },
  storehouse: {
    category: "economy",
    description: "A closer drop-off point that shortens villager haul trips.",
    icon: Warehouse,
    tone: "economy",
  },
  wall: {
    category: "defense",
    description: "A tough barrier that blocks movement and funnels enemies.",
    icon: BrickWall,
    tone: "defense",
  },
  ward_tower: {
    category: "defense",
    description: "Automatically shoots nearby enemies and extends vision.",
    icon: Shield,
    tone: "defense",
  },
};

/**
 * Resolves a building's menu guide, retaining published copy for new types.
 * @param option - Build option published by the simulation
 * @returns Icon, tone, and player-facing purpose
 */
function buildingGuide(option: BuildReadout): BuildingGuide {
  return (
    BUILDING_GUIDES[option.buildingType] ?? {
      category: "economy",
      description: option.job,
      icon: Hammer,
      tone: "economy",
    }
  );
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
      {categories.map((category) => {
        const guide = BUILD_CATEGORY_GUIDES[category];
        const CategoryIcon = guide.icon;
        const count = options.filter(
          (option) => buildingGuide(option).category === category,
        ).length;
        return (
          <li key={category}>
            <button
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Individual structures inside one selected category.
 * @param props - Visible build options and placement callback
 * @returns The second level of the build menu
 */
function BuildOptionGrid({
  onChoose,
  options,
}: {
  onChoose: (option: BuildReadout) => void;
  options: readonly BuildReadout[];
}) {
  return (
    <ul className={styles.buildGrid}>
      {options.map((option) => {
        const guide = buildingGuide(option);
        const BuildingIcon = guide.icon;
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
              aria-label={`${option.name}. ${guide.description} Cost: ${option.costLabel}.`}
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
                <BuildingIcon size={30} strokeWidth={1.65} />
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
                <span className={styles.buildCost}>{option.costLabel}</span>
              </span>
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
 * Tier-gated build list. Hints are the strings the snapshot published.
 * @param props - Options and actions
 * @returns The build menu
 */
export function BuildMenu({
  onChoose,
  onClose,
  onGlossary,
  options,
}: {
  onChoose: (option: BuildReadout) => void;
  onClose: () => void;
  onGlossary: () => void;
  options: readonly BuildReadout[];
}) {
  const [selectedCategory, setSelectedCategory] =
    useState<BuildCategory | null>(null);
  const availableCategories = BUILD_CATEGORIES.filter((category) =>
    options.some((option) => buildingGuide(option).category === category),
  );
  const activeCategory = availableCategories.includes(
    selectedCategory ?? "economy",
  )
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
      {activeCategory === null ? null : (
        <BuildOptionGrid onChoose={onChoose} options={visibleOptions} />
      )}
    </section>
  );
}
