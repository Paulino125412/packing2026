export function computeNextPackingNumber(currentVal: number, maxExistingNum: number, counterExists: boolean): number {
  const safeCurrent = counterExists && Number.isFinite(currentVal) ? currentVal : 0;
  const safeMax = Number.isFinite(maxExistingNum) ? maxExistingNum : 0;
  return Math.max(safeCurrent, safeMax) + 1;
}

