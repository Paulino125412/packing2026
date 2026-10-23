export function computeNextPackingNumber(currentVal: number, maxExistingNum: number, counterExists: boolean): number {
  if (!counterExists) {
    if (maxExistingNum > 0) {
      throw new Error(`Error de contador desfasado: existen packing lists (máximo ${maxExistingNum}) pero no existe registro de contador.`);
    }
    return 1;
  }

  if (maxExistingNum > currentVal) {
    throw new Error(`Error de contador desfasado: el número máximo existente (${maxExistingNum}) es mayor que el contador actual (${currentVal}).`);
  }

  return currentVal + 1;
}
