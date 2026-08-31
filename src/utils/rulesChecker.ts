import { RollItem, PackingList, Article, Provider, Client, Seller, SalesOrder } from '../types';
import { parseNumericWeight } from '../components/PrintPackingList';

export interface RuleCheckResult {
  id: string;
  category: 'CORTES' | 'PACKING_LIST' | 'INVENTARIO' | 'ORDENES_VENTA' | 'INTEGRIDAD_DATOS';
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
  affectedCount?: number;
  timestamp: string;
}

/**
 * Validador estricto para metrajes de cortes.
 * Regla de negocio: Un corte textil debe ser >= 0.10 m y no puede ser negativo ni cero.
 */
export function validateCutMeters(meters: number): { isValid: boolean; reason?: string } {
  if (isNaN(meters) || meters === null || meters === undefined) {
    return { isValid: false, reason: 'El metraje no es un número válido.' };
  }
  if (meters <= 0) {
    return { isValid: false, reason: 'El metraje debe ser mayor a 0 m.' };
  }
  if (meters < 0.10) {
    return { isValid: false, reason: 'El metraje mínimo permitido para un corte es 0.10 m.' };
  }
  return { isValid: true };
}

/**
 * Validador estricto para metrajes de rollos completos (Nuevo / Antiguo).
 * Regla de negocio: Un rollo no puede ser menor a 10.00 m. Si es menor, corresponde a la modalidad de CORTES.
 */
export function validateRollMeters(meters: number): { isValid: boolean; reason?: string } {
  if (isNaN(meters) || meters === null || meters === undefined) {
    return { isValid: false, reason: 'El metraje no es un número válido.' };
  }
  if (meters <= 0) {
    return { isValid: false, reason: 'El metraje debe ser mayor a 0 m.' };
  }
  if (meters < 10.00) {
    return { isValid: false, reason: 'El metraje de un rollo nuevo o antiguo debe ser de mínimo 10.00 m. Cantidades menores corresponden a Cortes.' };
  }
  return { isValid: true };
}

/**
 * Validador matemático de Packing Lists.
 * Regla de negocio: El total de metros declarado debe coincidir exactamente con la suma de sus rollos/cortes.
 */
export function validatePackingListMath(list: PackingList): { isValid: boolean; diff: number; expectedSum: number } {
  const sum = (list.items || []).reduce((acc, item) => acc + (Number(item.meters) || 0), 0);
  const total = Number(list.totalMeters) || 0;
  const diff = Math.abs(sum - total);
  const isValid = diff < 0.001; // Tolerancia de coma flotante
  return { isValid, diff, expectedSum: Number(sum.toFixed(2)) };
}

/**
 * Validador de consistencia de estado de rollos en inventario.
 * Regla: 
 * - available: currentMeters === initialMeters
 * - partially_sold: 0 < currentMeters < initialMeters
 * - sold: currentMeters === 0
 */
export function validateRollStatus(roll: RollItem): { isValid: boolean; expectedStatus: string } {
  const current = Number(roll.currentMeters) || 0;
  const initial = Number(roll.initialMeters) || 0;

  let expectedStatus: 'available' | 'partially_sold' | 'sold' = 'available';
  if (current <= 0) {
    expectedStatus = 'sold';
  } else if (current < initial) {
    expectedStatus = 'partially_sold';
  } else {
    expectedStatus = 'available';
  }

  return {
    isValid: roll.status === expectedStatus,
    expectedStatus
  };
}

export interface SystemDataPayload {
  inventory?: RollItem[];
  packingLists?: PackingList[];
  articles?: Article[];
  providers?: Provider[];
  clients?: Client[];
  sellers?: Seller[];
  salesOrders?: SalesOrder[];
}

/**
 * Ejecuta la verificación completa de reglas de negocio y de integridad en tiempo de ejecución.
 */
export function runInternalRulesVerification(data: SystemDataPayload = {}): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];
  const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 1. REGLA: Validador de Metraje Mínimo de Cortes (0.10m) y Rollos (10.00m)
  try {
    const testCutUnderMin = validateCutMeters(0.05);
    const testCutZero = validateCutMeters(0);
    const testCutNegative = validateCutMeters(-2);
    const testCutValid = validateCutMeters(0.10);
    const testCutLarge = validateCutMeters(25.5);

    const testRollUnderTen = validateRollMeters(0.05);
    const testRollUnderTen2 = validateRollMeters(9.99);
    const testRollValidTen = validateRollMeters(10.00);
    const testRollValidFifty = validateRollMeters(50.00);

    const logicPassed = !testCutUnderMin.isValid && 
                        !testCutZero.isValid && 
                        !testCutNegative.isValid && 
                        testCutValid.isValid && 
                        testCutLarge.isValid &&
                        !testRollUnderTen.isValid &&
                        !testRollUnderTen2.isValid &&
                        testRollValidTen.isValid &&
                        testRollValidFifty.isValid;

    if (logicPassed) {
      results.push({
        id: 'rule-cut-and-roll-min-logic',
        category: 'CORTES',
        name: 'Reglas de Metraje Mínimo (Cortes ≥ 0.10m / Rollos ≥ 10.00m)',
        description: 'Verifica que cortes sean ≥ 0.10m y rollos completos (nuevo/antiguo) sean ≥ 10.00m.',
        status: 'pass',
        message: 'Lógicas de validación de corte (≥0.10m) y rollos (≥10.00m) verificadas al 100%.',
        timestamp: now
      });
    } else {
      results.push({
        id: 'rule-cut-and-roll-min-logic',
        category: 'CORTES',
        name: 'Reglas de Metraje Mínimo (Cortes ≥ 0.10m / Rollos ≥ 10.00m)',
        description: 'Verifica que cortes sean ≥ 0.10m y rollos completos (nuevo/antiguo) sean ≥ 10.00m.',
        status: 'fail',
        message: 'La función de validación de cortes o rollos aceptó valores fuera del rango permitido.',
        timestamp: now
      });
    }
  } catch (err: any) {
    results.push({
      id: 'rule-cut-and-roll-min-logic',
      category: 'CORTES',
      name: 'Reglas de Metraje Mínimo (Cortes ≥ 0.10m / Rollos ≥ 10.00m)',
      description: 'Verifica que cortes sean ≥ 0.10m y rollos completos (nuevo/antiguo) sean ≥ 10.00m.',
      status: 'fail',
      message: `Error al evaluar regla: ${err?.message || 'Fallo desconocido'}`,
      timestamp: now
    });
  }

  // 2. REGLA: Parser de Peso Numérico y Totales
  try {
    const p1 = parseNumericWeight('12.5 kg');
    const p2 = parseNumericWeight('15,8 kgs');
    const p3 = parseNumericWeight('-');
    const p4 = parseNumericWeight(20);

    const weightLogicOk = p1 === 12.5 && p2 === 15.8 && p3 === 0 && p4 === 20;
    if (weightLogicOk) {
      results.push({
        id: 'rule-weight-parser',
        category: 'PACKING_LIST',
        name: 'Parser Matemático de Peso Textil (kg/kgs)',
        description: 'Verifica la conversión exacta de cadenas de texto con comas/sufijos de peso a números.',
        status: 'pass',
        message: 'Conversor y sumador de pesos opera con normalidad.',
        timestamp: now
      });
    } else {
      results.push({
        id: 'rule-weight-parser',
        category: 'PACKING_LIST',
        name: 'Parser Matemático de Peso Textil (kg/kgs)',
        description: 'Verifica la conversión exacta de cadenas de texto con comas/sufijos de peso a números.',
        status: 'fail',
        message: 'El parser de peso falló en manejar comas o unidades de kilogramos.',
        timestamp: now
      });
    }
  } catch (err: any) {
    results.push({
      id: 'rule-weight-parser',
      category: 'PACKING_LIST',
      name: 'Parser Matemático de Peso Textil (kg/kgs)',
      description: 'Verifica la conversión exacta de cadenas de texto con comas/sufijos de peso a números.',
      status: 'fail',
      message: `Error en función de peso: ${err?.message || 'Fallo desconocido'}`,
      timestamp: now
    });
  }

  // 3. REGLA: Integridad de Packing Lists en la Base de Datos Real
  if (data.packingLists && data.packingLists.length > 0) {
    let mismatchedLists: { no: string; diff: number; expected: number; found: number }[] = [];
    let itemsCountMismatch = 0;

    data.packingLists.forEach(pl => {
      const math = validatePackingListMath(pl);
      if (!math.isValid) {
        mismatchedLists.push({
          no: pl.packingListNo || pl.id,
          diff: math.diff,
          expected: math.expectedSum,
          found: Number(pl.totalMeters) || 0
        });
      }
      if (pl.totalRollsOrCuts !== undefined && pl.items && pl.items.length !== pl.totalRollsOrCuts) {
        itemsCountMismatch++;
      }
    });

    if (mismatchedLists.length === 0 && itemsCountMismatch === 0) {
      results.push({
        id: 'rule-pl-data-math',
        category: 'PACKING_LIST',
        name: 'Balance Matemático de Despachos Registrados',
        description: 'Audita que la suma de metros de cada ítem coincida con el total de cada Packing List.',
        status: 'pass',
        message: `Los ${data.packingLists.length} Packing Lists evaluados tienen cuadre exacto de metros e ítems.`,
        timestamp: now
      });
    } else {
      results.push({
        id: 'rule-pl-data-math',
        category: 'PACKING_LIST',
        name: 'Balance Matemático de Despachos Registrados',
        description: 'Audita que la suma de metros de cada ítem coincida con el total de cada Packing List.',
        status: 'fail',
        message: `Se encontraron ${mismatchedLists.length} Packing Lists con descuadre de metraje y ${itemsCountMismatch} con conteo desigual.`,
        details: mismatchedLists.slice(0, 3).map(m => `N° ${m.no}: esperado ${m.expected}m, registrado ${m.found}m (dif: ${m.diff.toFixed(2)}m)`).join(' | '),
        affectedCount: mismatchedLists.length + itemsCountMismatch,
        timestamp: now
      });
    }
  }

  // 4. REGLA: Integridad de Inventario en Tiempo Real
  if (data.inventory && data.inventory.length > 0) {
    let negativeMetersCount = 0;
    let corruptedMetersCount = 0;
    let statusMismatchCount = 0;

    data.inventory.forEach(roll => {
      const current = Number(roll.currentMeters);
      const initial = Number(roll.initialMeters);

      if (isNaN(current) || isNaN(initial)) {
        corruptedMetersCount++;
      } else if (current < 0) {
        negativeMetersCount++;
      } else {
        const statusCheck = validateRollStatus(roll);
        if (!statusCheck.isValid) {
          statusMismatchCount++;
        }
      }
    });

    if (negativeMetersCount === 0 && corruptedMetersCount === 0 && statusMismatchCount === 0) {
      results.push({
        id: 'rule-inventory-integrity',
        category: 'INVENTARIO',
        name: 'Consistencia de Stock y Metraje en Rollos',
        description: 'Comprueba que no existan rollos con metrajes negativos, NaN o estados inconsistentes.',
        status: 'pass',
        message: `Los ${data.inventory.length} rollos en inventario tienen metrajes válidos y estados coherentes.`,
        timestamp: now
      });
    } else {
      const status = (negativeMetersCount > 0 || corruptedMetersCount > 0) ? 'fail' : 'warn';
      results.push({
        id: 'rule-inventory-integrity',
        category: 'INVENTARIO',
        name: 'Consistencia de Stock y Metraje en Rollos',
        description: 'Comprueba que no existan rollos con metrajes negativos, NaN o estados inconsistentes.',
        status,
        message: `Inconsistencias detectadas en stock: ${negativeMetersCount} rollos negativos, ${corruptedMetersCount} con formato corrupto, ${statusMismatchCount} con estado desincronizado.`,
        affectedCount: negativeMetersCount + corruptedMetersCount + statusMismatchCount,
        timestamp: now
      });
    }
  }

  // 5. REGLA: Trazabilidad Relacional (Artículos y Proveedores Huérfanos)
  if (data.articles && data.articles.length > 0 && data.providers && data.providers.length > 0) {
    const providerIds = new Set(data.providers.map(p => p.id));
    const orphanArticles = data.articles.filter(a => a.providerId && !providerIds.has(a.providerId));

    if (orphanArticles.length === 0) {
      results.push({
        id: 'rule-relational-articles',
        category: 'INTEGRIDAD_DATOS',
        name: 'Trazabilidad Artículos vs Proveedores',
        description: 'Verifica que cada artículo textil esté correctamente asociado a un proveedor válido.',
        status: 'pass',
        message: 'Todos los artículos tienen proveedor asignado válido.',
        timestamp: now
      });
    } else {
      results.push({
        id: 'rule-relational-articles',
        category: 'INTEGRIDAD_DATOS',
        name: 'Trazabilidad Artículos vs Proveedores',
        description: 'Verifica que cada artículo textil esté correctamente asociado a un proveedor válido.',
        status: 'warn',
        message: `Se encontraron ${orphanArticles.length} artículos asociados a proveedores inexistentes o eliminados.`,
        affectedCount: orphanArticles.length,
        timestamp: now
      });
    }
  }

  // 6. REGLA: Órdenes de Venta - Balance Contable
  if (data.salesOrders && data.salesOrders.length > 0) {
    let orderMathErrors = 0;

    data.salesOrders.forEach(order => {
      const billed = Number(order.billedAmount) || 0;
      const pending = Number(order.pendingAmount) || 0;
      const total = Number(order.totalAmount) || 0;
      
      const sum = billed + pending;
      if (Math.abs(sum - total) > 0.01) {
        orderMathErrors++;
      }
    });

    if (orderMathErrors === 0) {
      results.push({
        id: 'rule-sales-order-math',
        category: 'ORDENES_VENTA',
        name: 'Balance Contable de Órdenes de Venta',
        description: 'Verifica que Monto Facturado + Monto Pendiente = Total de la Orden de Venta.',
        status: 'pass',
        message: 'Todas las órdenes de venta cuadran contablemente.',
        timestamp: now
      });
    } else {
      results.push({
        id: 'rule-sales-order-math',
        category: 'ORDENES_VENTA',
        name: 'Balance Contable de Órdenes de Venta',
        description: 'Verifica que Monto Facturado + Monto Pendiente = Total de la Orden de Venta.',
        status: 'warn',
        message: `Se encontraron ${orderMathErrors} órdenes de venta con discrepancia entre montos facturados y pendientes.`,
        affectedCount: orderMathErrors,
        timestamp: now
      });
    }
  }

  return results;
}
