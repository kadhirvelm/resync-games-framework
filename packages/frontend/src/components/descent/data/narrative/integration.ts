/** ProductNow lore-space references available to future Descent asset agents. */
export const DESCENT_LORE_REFERENCES = {
  documents: {
    gdd: {
      access: "read-only",
      documentId: "fed6df06-5cfe-48d3-a51b-0dd84ec8c281",
    },
    loreBible: {
      access: "read-only",
      documentId: "9f244fed-c00f-45a6-b5eb-dc5ec4cc7f4d",
    },
  },
  gameId: "descent",
} as const;

/** Flag keys leave Ilya timing and shipped conclusions to release configuration. */
export const NARRATIVE_FLAG_KEYS = {
  endingShips: {
    compact: "descent.ending.compact.ships",
    quota: "descent.ending.quota.ships",
    shutdown: "descent.ending.shutdown.ships",
  },
  ilyaUnlock: {
    enabled: "descent.ilya_unlock.enabled",
    timing: "descent.ilya_unlock.timing",
  },
} as const;
