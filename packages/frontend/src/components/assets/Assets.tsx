"use client";

import { ArrowLeft, Compass, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import { Dialog } from "@/lib/radix";
import { type AssetClassJobCounts, AssetClassNav } from "./AssetClassNav";
import styles from "./Assets.module.scss";
import { ASSET_CLASSES } from "./assetClasses/assetClassRegistry";
import { assetClassEyebrow } from "./assetClasses/groupAssetClasses";
import { PromptComposer } from "./PromptComposer";
import { useAssetGenerationJobs } from "./useAssetGenerationJobs";
import { hrefWithGenerator, readGeneratorFromSearch } from "./workshopLocation";

const ASSET_CLASS_IDS = ASSET_CLASSES.map((assetClass) => assetClass.id);

/**
 * Blueprint Workshop. A sidebar lists every generator under 2D art, 3D
 * models, and sound for any game. The chosen generator shows a prompt box
 * (unless it brings its own controls) above its library of saved results.
 * The choice is kept in the address, so a refresh or a shared link opens
 * the same generator.
 * @returns The workshop page
 */
export function Assets() {
  const [activeClassId, setActiveClassId] = useState(
    () =>
      readGeneratorFromSearch(window.location.search, ASSET_CLASS_IDS) ??
      ASSET_CLASS_IDS[0],
  );
  const [isNavDialogOpen, setIsNavDialogOpen] = useState(false);
  const {
    associateDungeonSlot,
    dismissJob,
    getDungeonSlotJobs,
    getJobsForClass,
    getRefreshKey,
    getResultsForClass,
    startDungeonSlot,
    startJob,
    stopDungeonSlot,
    stopJob,
  } = useAssetGenerationJobs();

  const activeClass =
    ASSET_CLASSES.find((assetClass) => assetClass.id === activeClassId) ??
    ASSET_CLASSES[0];
  if (activeClass === undefined) {
    return null;
  }

  const activeJobs = getJobsForClass(activeClass.id);
  const runningCount = activeJobs.filter((job) => job.error === null).length;
  const { Gallery, Icon } = activeClass;
  const jobCounts = buildJobCounts(getJobsForClass);

  /**
   * Shows a generator and records it in the address.
   * @param assetClassId - Generator to show
   */
  const handleSelectClass = (assetClassId: string) => {
    setActiveClassId(assetClassId);
    setIsNavDialogOpen(false);
    window.history.replaceState(
      null,
      "",
      hrefWithGenerator(window.location.href, assetClassId),
    );
    window.scrollTo({ top: 0 });
  };

  return (
    <div className={styles.pageWrapper}>
      <header className={styles.topBar}>
        <div className={styles.topBarStart}>
          <Link className={styles.backLink} href="/">
            <ArrowLeft aria-hidden="true" size={15} />
            All games
          </Link>
          <span aria-hidden="true" className={styles.topBarDivider} />
          <span aria-hidden="true" className={styles.brandMark}>
            <Compass size={17} />
          </span>
          <div className={styles.titleGroup}>
            <span className={styles.pageTitle}>Blueprint Workshop</span>
            <span className={styles.pageSubtitle}>
              Generate art, models, and sound for your games
            </span>
          </div>
        </div>
        <div className={styles.topBarActions}>
          <button
            className={styles.mobileNavTrigger}
            onClick={() => setIsNavDialogOpen(true)}
            type="button"
          >
            <PanelLeft aria-hidden="true" size={15} />
            {activeClass.tabLabel}
          </button>
          <ProductNowConnection placement="inline" />
        </div>
      </header>

      <div className={styles.workshopLayout}>
        <aside aria-label="Generators" className={styles.sidebar}>
          <AssetClassNav
            activeClassId={activeClass.id}
            jobCounts={jobCounts}
            onSelect={handleSelectClass}
          />
        </aside>

        <main className={styles.mainColumn}>
          <section
            className={styles.contentHeader}
            data-category={activeClass.category}
          >
            <div className={styles.contentIdentity}>
              <span aria-hidden="true" className={styles.contentIcon}>
                <Icon size={22} />
              </span>
              <div className={styles.contentHeading}>
                <span className={styles.contentEyebrow}>
                  {assetClassEyebrow(activeClass)}
                </span>
                <h1 className={styles.contentTitle}>{activeClass.tabLabel}</h1>
                <p className={styles.contentDescription}>
                  {activeClass.dialogDescription}
                </p>
              </div>
            </div>
            {activeClass.customGeneration ? null : (
              <PromptComposer
                copy={activeClass.form}
                id={`prompt-${activeClass.id}`}
                key={activeClass.id}
                onSubmit={(prompt) => startJob(activeClass, prompt)}
                runningCount={runningCount}
              />
            )}
          </section>

          <Gallery
            key={activeClass.id}
            onAssociateDungeonSlot={associateDungeonSlot}
            onDismissJob={dismissJob}
            onGenerateDungeonSlot={startDungeonSlot}
            onStopDungeonSlot={stopDungeonSlot}
            onStopJob={(jobId) => stopJob(activeClass, jobId)}
            pendingJobs={activeJobs}
            refreshKey={getRefreshKey(activeClass.id)}
            results={getResultsForClass(activeClass.id)}
            slotJobs={getDungeonSlotJobs()}
          />
        </main>
      </div>

      <Dialog
        content={
          <AssetClassNav
            activeClassId={activeClass.id}
            jobCounts={jobCounts}
            onSelect={handleSelectClass}
          />
        }
        isOpen={isNavDialogOpen}
        onToggleOpen={setIsNavDialogOpen}
        title="Choose a generator"
        width="340px"
      />
    </div>
  );
}

/**
 * Computes running/failed job counts for every registered class, so the
 * sidebar can show a status badge without each item re-filtering the job list.
 * @param getJobsForClass - Looks up pending jobs for one class id
 * @returns Counts keyed by class id
 */
function buildJobCounts(
  getJobsForClass: (assetClassId: string) => { error: string | null }[],
): Record<string, AssetClassJobCounts> {
  const counts: Record<string, AssetClassJobCounts> = {};
  for (const assetClass of ASSET_CLASSES) {
    const jobs = getJobsForClass(assetClass.id);
    counts[assetClass.id] = {
      failed: jobs.filter((job) => job.error !== null).length,
      running: jobs.filter((job) => job.error === null).length,
    };
  }
  return counts;
}
