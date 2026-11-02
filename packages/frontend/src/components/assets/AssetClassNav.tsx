"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import type { AssetClassDefinition } from "./assetClasses/assetClassDefinition";
import { ASSET_CLASSES } from "./assetClasses/assetClassRegistry";

/** Running and failed job counts for one asset class, shown as a sidebar badge. */
export interface AssetClassJobCounts {
  failed: number;
  running: number;
}

interface AssetClassNavProps {
  activeClassId: string;
  /** Running/failed counts keyed by class id. A class with no entry shows no badge. */
  jobCounts: Record<string, AssetClassJobCounts>;
  onSelect: (assetClassId: string) => void;
}

/** One category's asset classes, in registry order. */
interface AssetClassGroup {
  category: string;
  classes: AssetClassDefinition[];
}

/**
 * Groups asset classes by {@link AssetClassDefinition.category}, preserving
 * each category's first-seen order from the input list.
 * @param classes - Asset classes to group, already filtered
 * @returns Groups in first-seen order
 */
function groupByCategory(
  classes: readonly AssetClassDefinition[],
): AssetClassGroup[] {
  const order: string[] = [];
  const byCategory = new Map<string, AssetClassDefinition[]>();
  for (const assetClass of classes) {
    if (!byCategory.has(assetClass.category)) {
      byCategory.set(assetClass.category, []);
      order.push(assetClass.category);
    }
    byCategory.get(assetClass.category)?.push(assetClass);
  }
  return order.map((category) => ({
    category,
    classes: byCategory.get(category) ?? [],
  }));
}

/**
 * @param query - Lowercased, trimmed search text
 * @param assetClass - Candidate asset class
 * @returns Whether the class's label, category, or subtitle matches
 */
function matchesQuery(
  query: string,
  assetClass: AssetClassDefinition,
): boolean {
  const haystack =
    `${assetClass.tabLabel} ${assetClass.category} ${assetClass.subtitle}`.toLowerCase();
  return haystack.includes(query);
}

/**
 * Sidebar (and mobile-dialog) navigation across every registered asset class.
 * Groups classes by category, and switches to a flat filtered list while
 * searching, so the nav stays usable as more generators are registered.
 * @param activeClassId - Highlighted class
 * @param jobCounts - Running/failed job counts keyed by class id, shown as status badges
 * @param onSelect - Called with the clicked class id
 */
export function AssetClassNav({
  activeClassId,
  jobCounts,
  onSelect,
}: AssetClassNavProps) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      trimmedQuery === ""
        ? ASSET_CLASSES
        : ASSET_CLASSES.filter((assetClass) =>
            matchesQuery(trimmedQuery, assetClass),
          ),
    [trimmedQuery],
  );
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  return (
    <Flex className={styles.navPanel} direction="column">
      <div className={styles.navSearchField}>
        <Search aria-hidden="true" size={14} />
        <input
          aria-label="Filter asset generators"
          className={styles.navSearchInput}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter generators…"
          type="text"
          value={query}
        />
      </div>
      <nav className={styles.navGroups}>
        {groups.length === 0 ? (
          <span className={styles.navEmpty}>
            No generators match “{query.trim()}”.
          </span>
        ) : (
          groups.map((group) => (
            <div className={styles.navGroup} key={group.category}>
              <span className={styles.navGroupLabel}>{group.category}</span>
              {group.classes.map((assetClass) => (
                <AssetClassNavItem
                  assetClass={assetClass}
                  isActive={assetClass.id === activeClassId}
                  jobCounts={jobCounts[assetClass.id]}
                  key={assetClass.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))
        )}
      </nav>
    </Flex>
  );
}

interface AssetClassNavItemProps {
  assetClass: AssetClassDefinition;
  isActive: boolean;
  jobCounts?: AssetClassJobCounts;
  onSelect: (assetClassId: string) => void;
}

/**
 * One sidebar row: icon, label, and a running/failed status badge when this
 * class has jobs in flight.
 * @param assetClass - Class this row represents
 * @param isActive - Whether this class is on screen
 * @param jobCounts - This class's running/failed job counts, if any
 * @param onSelect - Called with this class's id when clicked
 */
function AssetClassNavItem({
  assetClass,
  isActive,
  jobCounts,
  onSelect,
}: AssetClassNavItemProps) {
  const { Icon } = assetClass;
  return (
    <button
      className={clsx(styles.navItem, isActive && styles.navItemActive)}
      data-category={assetClass.category}
      onClick={() => onSelect(assetClass.id)}
      type="button"
    >
      <span aria-hidden="true" className={styles.navItemIcon}>
        <Icon size={15} />
      </span>
      <span className={styles.navItemLabel}>{assetClass.tabLabel}</span>
      {jobCounts !== undefined && jobCounts.running > 0 && (
        <span className={styles.navBadgeRunning}>{jobCounts.running}</span>
      )}
      {jobCounts !== undefined &&
        jobCounts.running === 0 &&
        jobCounts.failed > 0 && (
          <span className={styles.navBadgeFailed}>{jobCounts.failed}</span>
        )}
    </button>
  );
}
