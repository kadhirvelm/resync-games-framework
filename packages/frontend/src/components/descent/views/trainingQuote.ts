import { MAX_QUEUE, SHIFT_TRAIN_COUNT } from "../logic/slice/sliceTraining";
import { type CostLine, costLineFrom } from "./costLine";
import type { TrainReadout } from "./presentation";

/** The batch a shift-click can actually buy. */
export interface TrainBatchQuote {
  /** Price of the whole batch, for the icon cost row. */
  cost: CostLine;
  count: number;
  detail: string;
}

/** Stock and queue room used to price a shift-click. */
export interface TrainBatchStock {
  food: number;
  /** Free population, or null when the snapshot did not publish a cap. */
  popFree: number | null;
  queueLength: number;
  water: number;
}

/**
 * Prices a shift-click. The count is the most of five that still fit in the
 * queue, under the population cap, and in the stockpile.
 * @param stock - Resources, free population, and how full the queue is
 * @param option - Published training choice
 * @returns The batch, or null when a shift-click cannot add more than one
 */
export function shiftTrainQuote(
  stock: TrainBatchStock,
  option: Pick<TrainReadout, "food" | "pop" | "seconds" | "water">,
): TrainBatchQuote | null {
  if (option.food === undefined && option.water === undefined) return null;
  const foodCost = option.food ?? 0;
  const waterCost = option.water ?? 0;
  const room = MAX_QUEUE - stock.queueLength;
  let count = Math.min(SHIFT_TRAIN_COUNT, Math.max(0, room));
  if (foodCost > 0) {
    count = Math.min(count, Math.floor(stock.food / foodCost));
  }
  if (waterCost > 0) {
    count = Math.min(count, Math.floor(stock.water / waterCost));
  }
  const popCost = option.pop ?? 1;
  if (stock.popFree !== null && popCost > 0) {
    count = Math.min(count, Math.floor(stock.popFree / popCost));
  }
  if (count <= 1) return null;
  const parts = [`×${count}`];
  if (foodCost > 0) parts.push(`Food ${foodCost * count}`);
  if (waterCost > 0) parts.push(`Water ${waterCost * count}`);
  const seconds = Math.round(option.seconds ?? 0);
  if (seconds > 0) parts.push(`${seconds}s each`);
  const cost = costLineFrom(
    { food: foodCost * count, water: waterCost * count },
    { count, pop: popCost * count, seconds, secondsEach: true },
  );
  return { cost, count, detail: parts.join(" · ") };
}
