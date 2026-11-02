import {
  ASSET_MEDIUM_LABELS,
  ASSET_MEDIUMS,
  type AssetMedium,
} from "./assetClassDefinition";

/** Fields the sidebar needs in order to section and filter a generator. */
export interface GroupableAssetClass {
  category: string;
  medium: AssetMedium;
  subtitle: string;
  tabLabel: string;
}

/** One category's generators, in the order they were registered. */
export interface AssetClassCategoryGroup<T extends GroupableAssetClass> {
  category: string;
  classes: T[];
}

/** One workshop section: 2D, 3D, or Both, with its categories inside. */
export interface AssetClassMediumSection<T extends GroupableAssetClass> {
  categories: AssetClassCategoryGroup<T>[];
  label: string;
  medium: AssetMedium;
}

/**
 * Groups generators into 2D, 3D, and Both, then by category inside each
 * section. Empty sections are left out. Category order follows the first
 * time each category appears in `classes`.
 * @param classes - Generators to show, already filtered
 * @returns Sections in 2D, 3D, Both order
 */
export function groupAssetClassesByMedium<T extends GroupableAssetClass>(
  classes: readonly T[],
): AssetClassMediumSection<T>[] {
  return ASSET_MEDIUMS.flatMap((medium) => {
    const inMedium = classes.filter(
      (assetClass) => assetClass.medium === medium,
    );
    if (inMedium.length === 0) {
      return [];
    }
    return [
      {
        categories: groupByCategory(inMedium),
        label: ASSET_MEDIUM_LABELS[medium],
        medium,
      },
    ];
  });
}

/**
 * @param query - Lowercased, trimmed search text
 * @param assetClass - Candidate generator
 * @returns Whether the label, category, subtitle, or section name matches
 */
export function assetClassMatchesQuery(
  query: string,
  assetClass: GroupableAssetClass,
): boolean {
  const haystack = [
    assetClass.tabLabel,
    assetClass.category,
    assetClass.subtitle,
    ASSET_MEDIUM_LABELS[assetClass.medium],
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * Eyebrow above a generator's title. Skips repeating the section name when
 * the category already starts with it, so "3D models" stays "3D models".
 * @param assetClass - Generator on screen
 * @returns Section and category, such as "2D · Characters"
 */
export function assetClassEyebrow(assetClass: GroupableAssetClass): string {
  const mediumLabel = ASSET_MEDIUM_LABELS[assetClass.medium];
  if (assetClass.category.toLowerCase().startsWith(mediumLabel.toLowerCase())) {
    return assetClass.category;
  }
  return `${mediumLabel} · ${assetClass.category}`;
}

/**
 * Groups classes by category, preserving each category's first-seen order.
 * @param classes - Classes that already share one medium
 * @returns Category groups in first-seen order
 */
function groupByCategory<T extends GroupableAssetClass>(
  classes: readonly T[],
): AssetClassCategoryGroup<T>[] {
  const order: string[] = [];
  const byCategory = new Map<string, T[]>();
  for (const assetClass of classes) {
    const existing = byCategory.get(assetClass.category);
    if (existing === undefined) {
      byCategory.set(assetClass.category, [assetClass]);
      order.push(assetClass.category);
      continue;
    }
    existing.push(assetClass);
  }
  return order.map((category) => ({
    category,
    classes: byCategory.get(category) ?? [],
  }));
}
