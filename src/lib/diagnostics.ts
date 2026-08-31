/**
 * Centralized Diagnostic and Root-Cause Analyzer for TexFlow WMS
 * Analyzes raw errors and operational events into clean, user-friendly
 * diagnostic cards with Causa Raíz and Solución Sugerida.
 */

export interface DiagnosticResult {
  title: string;
  message: string;
  rootCause: string;
  solution: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  technicalDetails?: string;
  actionLabel?: string;
}

export function analyzeSystemError(
  rawError: unknown,
  context?: {
    action?: string;
    entity?: string;
    additionalInfo?: string;
  }
): DiagnosticResult {
  const errStr = rawError instanceof Error ? rawError.message : String(rawError || '');
  const errCode = (rawError as any)?.code || '';
  const errLower = errStr.toLowerCase();

  const actionText = context?.action || 'la operación';
  const entityText = context?.entity ? ` en ${context.entity}` : '';

  // 1. Connection / Offline / Unavailable errors
  if (
    errCode === 'unavailable' ||
    errCode === 'failed-precondition' ||
    errLower.includes('offline') ||
    errLower.includes('network') ||
    errLower.includes('failed to fetch') ||
    errLower.includes('connection refused') ||
    errLower.includes('the network connection was lost')
  ) {
    return {
      title: `Error de Conexión al procesar ${actionText}`,
      message: `No se pudo sincronizar la información con el servidor en la nube.`,
      rootCause: `El navegador no tiene conexión a internet o el servicio de base de datos está temporalmente inaccesible.`,
      solution: `Verifique su conexión a internet o active el 'Modo Local' en la barra superior. Sus datos no se perderán.`,
      severity: 'error',
      technicalDetails: `Code: ${errCode || 'NETWORK_OFFLINE'} | Error: ${errStr}`
    };
  }

  // 2. Permission Denied / Firestore Rules
  if (
    errCode === 'permission-denied' ||
    errLower.includes('permission-denied') ||
    errLower.includes('missing or insufficient permissions')
  ) {
    return {
      title: `Permisos Insuficientes para ${actionText}`,
      message: `No se tienen permisos de lectura/escritura${entityText}.`,
      rootCause: `Las reglas de seguridad de Firestore bloquearon la petición o la sesión no cuenta con los privilegios requeridos.`,
      solution: `Verifique que su usuario esté autenticado y que las reglas de Firestore permitan la colección requerida.`,
      severity: 'error',
      technicalDetails: `Code: permission-denied | Target: ${context?.entity || 'unknown'}`
    };
  }

  // 3. SUNAT / RENIEC Query Errors
  if (
    errLower.includes('sunat') ||
    errLower.includes('reniec') ||
    errLower.includes('ruc') ||
    errLower.includes('dni')
  ) {
    if (errLower.includes('11') || errLower.includes('8') || errLower.includes('longitud') || errLower.includes('formato')) {
      return {
        title: `Documento Inválido (RUC/DNI)`,
        message: `El número ingresado no cumple con el formato estándar de SUNAT o RENIEC.`,
        rootCause: `Un RUC debe contener exactamente 11 dígitos numéricos (iniciando con 10 o 20) y un DNI 8 dígitos.`,
        solution: `Revise que no haya espacios ni letras en el campo y verifique la longitud exacta.`,
        severity: 'warning',
        technicalDetails: `Input query: ${context?.additionalInfo || errStr}`
      };
    }

    if (errLower.includes('not found') || errLower.includes('no encontrado') || errLower.includes('404')) {
      return {
        title: `Contribuyente / Persona No Encontrada`,
        message: `El número consultado no arrojó resultados en la base de datos de SUNAT/RENIEC.`,
        rootCause: `El RUC/DNI ingresado no está activo, fue dado de baja o es incorrecto.`,
        solution: `Compruebe el número en la Ficha RUC oficial de SUNAT o ingrese la Razón Social y Dirección manualmente.`,
        severity: 'warning',
        technicalDetails: `SUNAT Query 404: ${errStr}`
      };
    }

    return {
      title: `Fallo en Consulta SUNAT / RENIEC`,
      message: `No se pudo consultar el RUC/DNI automáticamente.`,
      rootCause: `El servicio de consulta web de SUNAT se encuentra saturado o temporalmente no responde.`,
      solution: `Puede ingresar la Razón Social y Dirección Fiscal manualmente para continuar con la venta sin demoras.`,
      severity: 'warning',
      technicalDetails: errStr
    };
  }

  // 4. Duplicate ID or Duplicate Roll / Code Errors
  if (
    errLower.includes('already exists') ||
    errLower.includes('ya existe') ||
    errLower.includes('duplicado') ||
    errLower.includes('duplicate')
  ) {
    return {
      title: `Registro Duplicado${entityText}`,
      message: `Ya existe un elemento registrado con este mismo código o identificador.`,
      rootCause: `El sistema detectó un código o número correlativo repetido para evitar inconsistencias de inventario.`,
      solution: `Utilice un identificador único (por ejemplo otro número de rollo o correlativo) o edite el registro existente.`,
      severity: 'warning',
      technicalDetails: errStr
    };
  }

  // 5. Stock / Inventory Insufficiency
  if (
    errLower.includes('stock') ||
    errLower.includes('insuficiente') ||
    errLower.includes('metros') ||
    errLower.includes('agotado') ||
    errLower.includes('dispatched')
  ) {
    return {
      title: `Stock Insuficiente o Rollo Despachado`,
      message: `No se puede completar el despacho con los rollos seleccionados.`,
      rootCause: `Uno o más rollos no cuentan con el metraje disponible necesario o ya fueron marcados como 'despachados'.`,
      solution: `Revise la disponibilidad en el módulo de Inventario y seleccione otro rollo disponible del mismo artículo.`,
      severity: 'error',
      technicalDetails: errStr
    };
  }

  // 6. Validation Required Fields
  if (
    errLower.includes('requerido') ||
    errLower.includes('obligatorio') ||
    errLower.includes('vacio') ||
    errLower.includes('vacío') ||
    errLower.includes('complete')
  ) {
    return {
      title: `Campos Obligatorios Incompletos`,
      message: `Faltan datos indispensables para guardar ${actionText}.`,
      rootCause: `El formulario no puede procesarse porque requiere información clave (como Cliente, Artículos o Fecha).`,
      solution: `Revise los campos marcados o señalados en el formulario y complete los datos faltantes antes de continuar.`,
      severity: 'warning',
      technicalDetails: errStr
    };
  }

  // 7. General Fallback
  return {
    title: `Error al procesar ${actionText}`,
    message: errStr || `Ocurrió un imprevisto al realizar la acción solicitada.`,
    rootCause: `Se generó una excepción durante el procesamiento de datos${entityText}.`,
    solution: `Verifique los datos ingresados e intente nuevamente. Si el error persiste, consulte el reporte técnico.`,
    severity: 'error',
    technicalDetails: `Stack/Message: ${errStr}`
  };
}
