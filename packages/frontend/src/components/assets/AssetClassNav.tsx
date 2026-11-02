"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import type { AssetClassDefinition } from "./assetClasses/assetClassDefinition";
import { ASSET_CLASSES } from "./assetClasses/assetClassRegistry";
import {
  assetClassMatchesQuery,
  groupAssetClassesByMedium,
} from "./assetClasses/groupAssetClasses";

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

/**
 * Sidebar (and mobile-dialog) navigation across every registered asset class.
 * Splits generators into 2D, 3D, and Both, then by category. A search keeps
 * that split and hides sections with no matches.
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
            assetClassMatchesQuery(trimmedQuery, assetClass),
          ),
    [trimmedQuery],
  );
  const sections = useMemo(
    () => groupAssetClassesByMedium(filtered),
    [filtered],
  );

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
        {sections.length === 0 ? (
          <span className={styles.navEmpty}>
            No generators match “{query.trim()}”.
          </span>
        ) : (
          sections.map((section) => (
            <div
              className={styles.navSection}
              data-medium={section.medium}
              key={section.medium}
            >
              <span className={styles.navSectionLabel}>{section.label}</span>
              {section.categories.map((group) => (
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
