"use client";

import { Compass, PanelLeft } from "lucide-react";
import { useState } from "react";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import { Dialog, Flex } from "@/lib/radix";
import { type AssetClassJobCounts, AssetClassNav } from "./AssetClassNav";
import styles from "./Assets.module.scss";
import type { AssetClassDefinition } from "./assetClasses/assetClassDefinition";
import { ASSET_CLASSES } from "./assetClasses/assetClassRegistry";
import { assetClassEyebrow } from "./assetClasses/groupAssetClasses";
import { GenerateAssetForm } from "./GenerateAssetForm";
import { useAssetGenerationJobs } from "./useAssetGenerationJobs";

/**
 * Blueprint workshop. A sidebar splits every registered asset class into 2D,
 * 3D, and Both, then by category, and can be filtered by name. The active
 * class gets a content header, its own
 * generate dialog (unless it manages its own generation controls), and its
 * gallery.
 */
export function Assets() {
  const [activeClassId, setActiveClassId] = useState(ASSET_CLASSES[0]?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const handleSelectClass = (assetClassId: string) => {
    setActiveClassId(assetClassId);
    setIsDialogOpen(false);
    setIsNavDialogOpen(false);
  };

  const handleGenerate = (prompt: string) => {
    startJob(activeClass, prompt);
    setIsDialogOpen(false);
  };

  return (
    <Flex className={styles.pageWrapper} direction="column">
      <Flex className={styles.brandRow}>
        <Flex align="center" className={styles.brandLockup} gap="3">
          <span aria-hidden="true" className={styles.brandMark}>
            <Compass size={18} />
          </span>
          <Flex className={styles.titleGroup} direction="column">
            <span className={styles.pageTitle}>Blueprint Workshop</span>
            <span className={styles.pageSubtitle}>
              Pick a generator, describe what you want, and keep the result.
            </span>
          </Flex>
        </Flex>
        <button
          className={styles.mobileNavTrigger}
          onClick={() => setIsNavDialogOpen(true)}
          type="button"
        >
          <PanelLeft size={15} />
          {activeClass.tabLabel}
        </button>
      </Flex>

      <div className={styles.workshopLayout}>
        <aside className={styles.sidebar}>
          <AssetClassNav
            activeClassId={activeClass.id}
            jobCounts={jobCounts}
            onSelect={handleSelectClass}
          />
          <div className={styles.sidebarFooter}>
            <ProductNowConnection placement="inline" />
          </div>
        </aside>

        <section className={styles.mainColumn}>
          <header className={styles.contentHeader}>
            <div
              className={styles.contentIdentity}
              data-category={activeClass.category}
            >
              <span aria-hidden="true" className={styles.contentIcon}>
                <Icon size={20} />
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
              <Dialog
                content={
                  <GenerateAssetForm
                    copy={activeClass.form}
                    onSubmit={handleGenerate}
                  />
                }
                description={activeClass.dialogDescription}
                isOpen={isDialogOpen}
                onToggleOpen={setIsDialogOpen}
                title={activeClass.dialogTitle}
                trigger={
                  <button className={styles.generateButton} type="button">
                    {getGenerateButtonLabel(activeClass, runningCount)}
                  </button>
                }
                width="480px"
              />
            )}
          </header>

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
        </section>
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
    </Flex>
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

/**
 * @param assetClass - Active asset class
 * @param runningCount - Jobs still running for that class
 * @returns Label for the generate button
 */
function getGenerateButtonLabel(
  assetClass: AssetClassDefinition,
  runningCount: number,
): string {
  if (runningCount > 0) {
    return `+ Generate (${runningCount} running)`;
  }
  return assetClass.generateButtonLabel;
}
