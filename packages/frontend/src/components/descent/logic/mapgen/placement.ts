/**
 * Mitchell-style best-candidate pick: scores every candidate and keeps the
 * highest. Ties keep the earlier candidate, so results stay deterministic.
 * @param candidates - Options to choose from
 * @param score - Higher is better; return `null` to reject a candidate
 * @returns The best-scoring candidate, or null when every one is rejected
 */
export function pickBest<TCandidate>(
  candidates: readonly TCandidate[],
  score: (candidate: TCandidate) => number | null,
): TCandidate | null {
  let best: TCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const value = score(candidate);
    if (value === null || value <= bestScore) continue;
    best = candidate;
    bestScore = value;
  }
  return best;
}
