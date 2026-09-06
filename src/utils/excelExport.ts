import type ExcelJS from 'exceljs';
import { Client, Seller, Provider, Article, RollItem, PackingList } from '../types';

/**
 * Loads the company logo from /logo-juditex.png and converts it to base64 for ExcelJS.
 */
async function getLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch('/logo-juditex.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        resolve(base64Data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Logo could not be loaded for Excel export:', err);
    return null;
  }
}

/**
 * Adds the Juditex branded header to any worksheet
 */
async function addBrandedHeader(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  title: string,
  subtitle?: string,
  colCount: number = 7
) {
  const logoBase64 = await getLogoBase64();

  // Set generous row heights for title area
  worksheet.getRow(1).height = 28;
  worksheet.getRow(2).height = 32;
  worksheet.getRow(3).height = 26;
  worksheet.getRow(4).height = 12;

  if (logoBase64) {
    try {
      // Merge cells A1:B3 for a dedicated logo container
      worksheet.mergeCells('A1:B3');

      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });

      worksheet.addImage(imageId, {
        tl: { col: 0.05, row: 0.08 },
        ext: { width: 230, height: 82 },
        editAs: 'oneCell'
      });
    } catch (e) {
      console.warn('Failed to embed logo image:', e);
    }
  }

  // Text starts in Column 3 (C) if logo exists in A1:B3, or Column 1 (A) if no logo
  const startCol = logoBase64 ? 3 : 1;
  const endCol = Math.max(startCol + 3, colCount);

  // Safely merge title cells across header columns for clean typography
  const mergeTitleRow = (rowNumber: number) => {
    if (endCol > startCol) {
      try {
        worksheet.mergeCells(rowNumber, startCol, rowNumber, endCol);
      } catch (e) {
        // Fallback if already merged
      }
    }
  };

  // Company Name Header (Row 1)
  mergeTitleRow(1);
  const brandCell = worksheet.getCell(1, startCol);
  brandCell.value = 'JUDITEX - SUITE DE NEGOCIOS TEXTIL';
  brandCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF475569' } };
  brandCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Document Title Banner (Row 2)
  mergeTitleRow(2);
  const titleCell = worksheet.getCell(2, startCol);
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F766E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Subtitle / Date Info (Row 3)
  mergeTitleRow(3);
  const nowStr = new Date().toLocaleString('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short'
  });
  const subCell = worksheet.getCell(3, startCol);
  subCell.value = `${subtitle || 'Reporte Oficial del Sistema'}  |  Fecha de emisión: ${nowStr}`;
  subCell.font = { name: 'Segoe UI', size: 8.5, italic: true, color: { argb: 'FF64748B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Row 4 is a blank separator
}

/**
 * Apply clean, elegant table header and data styling
 */
function styleTableHeaders(worksheet: ExcelJS.Worksheet, headerRowNumber: number, headers: string[]) {
  const row = worksheet.getRow(headerRowNumber);
  row.height = 24;

  headers.forEach((headerText, colIdx) => {
    const cell = row.getCell(colIdx + 1);
    cell.value = headerText;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });
}

/**
 * Helper to style data rows with zebra striping and borders
 */
function styleDataRow(
  row: ExcelJS.Row,
  isEven: boolean,
  colAlignments: ('left' | 'center' | 'right')[]
) {
  row.height = 20;
  const bgArgb = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1E293B' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colAlignments[colNumber - 1] || 'left'
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });
}

/**
 * Auto-fit column widths dynamically
 */
function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidths: number[] = []) {
  worksheet.columns.forEach((col, idx) => {
    let maxLen = minWidths[idx] || 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      // Ignore header title, metadata rows (1-10) and merged cells so merged text doesn't distort column widths
      if (Number(cell.row) <= 10 || cell.isMerged) return;
      const valStr = cell.value ? String(cell.value) : '';
      if (valStr.length > maxLen && valStr.length < 80) {
        maxLen = valStr.length;
      }
    });

    if (idx === 0) {
      // Column A: N° column
      col.width = Math.max(maxLen + 4, 10);
    } else if (idx === 1) {
      // Column B: Article / Main description column
      col.width = Math.max(maxLen + 4, 30);
    } else {
      col.width = Math.max(maxLen + 4, 15);
    }
  });
}

/**
 * Save workbook to browser download
 */
async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

/**
 * 1. Export Catalogs (Clients, Articles, Providers, Sellers)
 */
export async function exportCatalogToExcel(
  type: 'clients' | 'articles' | 'providers' | 'sellers',
  items: any[],
  extraContext?: { providers?: Provider[]; articles?: Article[]; sellers?: Seller[] }
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JUDITEX';

  let sheetName = 'Catálogo';
  let title = 'Catálogo General';
  let headers: string[] = [];
  let alignments: ('left' | 'center' | 'right')[] = [];

  if (type === 'clients') {
    sheetName = 'Clientes';
    title = 'Catálogo Oficial de Clientes';
    headers = ['N°', 'Cliente / Razón Social', 'DNI / RUC', 'Vendedor Asignado', 'Correo Electrónico', 'Teléfono', 'Dirección Fiscal', 'Dirección de Despacho'];
    alignments = ['center', 'left', 'center', 'left', 'left', 'center', 'left', 'left'];
  } else if (type === 'articles') {
    sheetName = 'Artículos';
    title = 'Catálogo de Artículos y Telas';
    headers = ['N°', 'Código', 'Nombre Tela / Artículo', 'Descripción / Gramaje', 'Proveedor Asociado', 'Unidad Medida'];
    alignments = ['center', 'center', 'left', 'left', 'left', 'center'];
  } else if (type === 'providers') {
    sheetName = 'Proveedores';
    title = 'Catálogo de Proveedores Dinámicos';
    headers = ['N°', 'Nombre Proveedor', 'Lote', 'Partida', 'Tono', 'Nº Rollo', 'Ancho', 'Peso'];
    alignments = ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center'];
  } else if (type === 'sellers') {
    sheetName = 'Vendedores';
    title = 'Catálogo de Vendedores';
    headers = ['N°', 'Nombre Vendedor', 'Correo Electrónico', 'Teléfono Móvil'];
    alignments = ['center', 'left', 'left', 'center'];
  }

  const worksheet = workbook.addWorksheet(sheetName);
  await addBrandedHeader(workbook, worksheet, title, `Total de registros: ${items.length}`, headers.length);

  const startRow = 5;
  styleTableHeaders(worksheet, startRow, headers);

  items.forEach((item, index) => {
    const rowNum = startRow + 1 + index;
    const row = worksheet.getRow(rowNum);

    if (type === 'clients') {
      const sellerName = extraContext?.sellers?.find(s => s.id === item.defaultSellerId)?.name || 'Auto (Por Historial)';
      row.values = [
        index + 1,
        item.name || '',
        item.dni || '-',
        sellerName,
        item.email || '-',
        item.phone || '-',
        item.fiscalAddress || '-',
        item.address || '-'
      ];
    } else if (type === 'articles') {
      const provName = extraContext?.providers?.find(p => p.id === item.providerId)?.name || 'N/A';
      row.values = [index + 1, item.code || '-', item.name || '', item.description || '-', provName, item.unit || 'metros'];
    } else if (type === 'providers') {
      row.values = [
        index + 1,
        item.name || '',
        item.hasLot ? 'SÍ' : 'NO',
        item.hasPartida ? 'SÍ' : 'NO',
        item.hasTono ? 'SÍ' : 'NO',
        (item.hasRollNo ?? true) ? 'SÍ' : 'NO',
        item.hasWidth ? 'SÍ' : 'NO',
        item.hasWeight ? 'SÍ' : 'NO'
      ];
    } else if (type === 'sellers') {
      row.values = [index + 1, item.name || '', item.email || '-', item.phone || '-'];
    }

    styleDataRow(row, index % 2 === 1, alignments);
  });

  autoFitColumns(worksheet);
  const dateStr = new Date().toISOString().split('T')[0];
  await downloadWorkbook(workbook, `Catalogo_${sheetName}_Juditex_${dateStr}`);
}

/**
 * 2. Export Inventory of Fabric Rolls
 */
export async function exportInventoryToExcel(
  inventory: RollItem[],
  articles: Article[],
  providers: Provider[]
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JUDITEX';

  const worksheet = workbook.addWorksheet('Inventario de Telas');

  const hasWidth = inventory.some(item => item.width && item.width.trim() !== '');
  const hasWeight = inventory.some(item => item.weight && item.weight.trim() !== '');

  const totalMetersAvailable = inventory.reduce((acc, item) => acc + item.currentMeters, 0);
  const totalMetersInitial = inventory.reduce((acc, item) => acc + item.initialMeters, 0);

  await addBrandedHeader(
    workbook,
    worksheet,
    'Reporte General de Inventario de Telas',
    `Rollos en consulta: ${inventory.length} | Stock Disponible Total: ${totalMetersAvailable.toFixed(2)} m`,
    12
  );

  const headers = ['N°', 'Nº Rollo', 'Artículo / Tela', 'Proveedor', 'Lote', 'Partida', 'Tono'];
  const alignments: ('left' | 'center' | 'right')[] = ['center', 'center', 'left', 'left', 'center', 'center', 'center'];

  if (hasWidth) {
    headers.push('Ancho');
    alignments.push('center');
  }
  if (hasWeight) {
    headers.push('Peso');
    alignments.push('center');
  }

  headers.push('Mts. Iniciales', 'Mts. Disponibles', 'Estado', 'Fecha Ingreso');
  alignments.push('right', 'right', 'center', 'center');

  const startRow = 5;
  styleTableHeaders(worksheet, startRow, headers);

  inventory.forEach((item, index) => {
    const rowNum = startRow + 1 + index;
    const row = worksheet.getRow(rowNum);

    const art = articles.find(a => a.id === item.articleId)?.name || 'Desconocido';
    const prov = providers.find(p => p.id === item.providerId)?.name || 'Desconocido';
    const statusLabel = item.currentMeters > 0 ? 'DISPONIBLE' : 'AGOTADO';
    const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-PE') : '-';

    const values: any[] = [
      index + 1,
      item.rollNumber,
      art,
      prov,
      item.lot || '-',
      item.partida || '-',
      item.tono || '-'
    ];

    if (hasWidth) values.push(item.width || '-');
    if (hasWeight) values.push(item.weight || '-');

    values.push(
      Number(item.initialMeters.toFixed(2)),
      Number(item.currentMeters.toFixed(2)),
      statusLabel,
      formattedDate
    );

    row.values = values;
    styleDataRow(row, index % 2 === 1, alignments);

    // Number format for meter columns
    const initialCell = row.getCell(values.length - 3);
    const availableCell = row.getCell(values.length - 2);
    initialCell.numFmt = '#,##0.00 "m"';
    availableCell.numFmt = '#,##0.00 "m"';

    // Status color
    const statusCell = row.getCell(values.length - 1);
    if (item.currentMeters > 0) {
      statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } }; // Green
    } else {
      statusCell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF94A3B8' } }; // Gray
    }
  });

  // Footer Totals Row
  const lastDataRow = startRow + inventory.length;
  const summaryRow = worksheet.getRow(lastDataRow + 1);
  summaryRow.height = 24;

  const totalColCount = headers.length;
  summaryRow.getCell(2).value = 'TOTALES GENERALES';
  summaryRow.getCell(2).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };

  // Set totals in correct columns
  const initMtsColIdx = totalColCount - 3;
  const availMtsColIdx = totalColCount - 2;

  const initMtsCell = summaryRow.getCell(initMtsColIdx);
  initMtsCell.value = Number(totalMetersInitial.toFixed(2));
  initMtsCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  initMtsCell.numFmt = '#,##0.00 "m"';
  initMtsCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const availMtsCell = summaryRow.getCell(availMtsColIdx);
  availMtsCell.value = Number(totalMetersAvailable.toFixed(2));
  availMtsCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
  availMtsCell.numFmt = '#,##0.00 "m"';
  availMtsCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // Top thick border for footer
  summaryRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  });

  autoFitColumns(worksheet);
  const dateStr = new Date().toISOString().split('T')[0];
  await downloadWorkbook(workbook, `Inventario_Telas_Juditex_${dateStr}`);
}

/**
 * 3. Export Packing Lists Summary
 */
export async function exportPackingListSummaryToExcel(
  filteredLists: PackingList[],
  clients: Client[],
  sellers: Seller[]
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JUDITEX';

  const worksheet = workbook.addWorksheet('Resumen de Despachos');

  const totalMeters = filteredLists.reduce((sum, pl) => {
    return sum + pl.items.reduce((acc, item) => acc + item.meters, 0);
  }, 0);

  const totalRolls = filteredLists.reduce((sum, pl) => sum + pl.items.length, 0);

  await addBrandedHeader(
    workbook,
    worksheet,
    'Resumen General de Despachos y Packing Lists',
    `Despachos listados: ${filteredLists.length} | Total Metros: ${totalMeters.toFixed(2)} m | Total Rollos: ${totalRolls}`,
    8
  );

  const headers = [
    'N°',
    'Nº Packing List',
    'Fecha Despacho',
    'Cliente / Razón Social',
    'Vendedor',
    'Cant. Ítems / Rollos',
    'Metraje Despachado (m)',
    'Observaciones'
  ];

  const alignments: ('left' | 'center' | 'right')[] = [
    'center', 'center', 'center', 'left', 'left', 'center', 'right', 'left'
  ];

  const startRow = 5;
  styleTableHeaders(worksheet, startRow, headers);

  filteredLists.forEach((pl, index) => {
    const rowNum = startRow + 1 + index;
    const row = worksheet.getRow(rowNum);

    const clientName = clients.find(c => c.id === pl.clientId)?.name || 'Cliente Eliminado';
    const sellerName = sellers.find(s => s.id === pl.sellerId)?.name || 'Vendedor Eliminado';
    const plMeters = pl.items.reduce((acc, item) => acc + item.meters, 0);

    row.values = [
      index + 1,
      pl.packingListNo,
      pl.date,
      clientName,
      sellerName,
      pl.items.length,
      Number(plMeters.toFixed(2)),
      pl.notes || ''
    ];

    styleDataRow(row, index % 2 === 1, alignments);

    // Number format for meters
    const mtsCell = row.getCell(7);
    mtsCell.numFmt = '#,##0.00 "m"';
  });

  // Footer Totals Row
  const lastRow = startRow + filteredLists.length;
  const summaryRow = worksheet.getRow(lastRow + 1);
  summaryRow.height = 24;

  summaryRow.getCell(4).value = 'TOTALES DESPACHADOS:';
  summaryRow.getCell(4).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };

  const rollsCell = summaryRow.getCell(6);
  rollsCell.value = totalRolls;
  rollsCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  rollsCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const metersCell = summaryRow.getCell(7);
  metersCell.value = Number(totalMeters.toFixed(2));
  metersCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
  metersCell.numFmt = '#,##0.00 "m"';
  metersCell.alignment = { horizontal: 'right', vertical: 'middle' };

  summaryRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  });

  autoFitColumns(worksheet);
  const dateStr = new Date().toISOString().split('T')[0];
  await downloadWorkbook(workbook, `Resumen_Despachos_Juditex_${dateStr}`);
}

/**
 * 4. Export Detailed Roll-by-Roll List of filtered Packing Lists
 */
export async function exportPackingListFullDetailsToExcel(
  filteredLists: PackingList[],
  articles: Article[],
  clients: Client[],
  sellers: Seller[]
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JUDITEX';

  const worksheet = workbook.addWorksheet('Detalle de Rollos Despachados');

  let hasLote = false;
  let hasPartida = false;
  let hasTono = false;
  let hasWidth = false;
  let hasWeight = false;

  filteredLists.forEach(pl => {
    pl.items.forEach(item => {
      if (item.lot && item.lot.trim() !== '') hasLote = true;
      if (item.partida && item.partida.trim() !== '') hasPartida = true;
      if (item.tono && item.tono.trim() !== '') hasTono = true;
      if (item.width && item.width.trim() !== '') hasWidth = true;
      if (item.weight && item.weight.trim() !== '') hasWeight = true;
    });
  });

  let totalMeters = 0;
  let totalRolls = 0;

  filteredLists.forEach(pl => {
    pl.items.forEach(item => {
      totalMeters += item.meters;
      totalRolls++;
    });
  });

  await addBrandedHeader(
    workbook,
    worksheet,
    'Detalle General de Rollos Despachados',
    `Total Rollos: ${totalRolls} | Metraje Acumulado: ${totalMeters.toFixed(2)} m`,
    15
  );

  const headers = [
    'N°',
    'Nº Packing List',
    'Fecha Despacho',
    'Cliente / Razón Social',
    'Vendedor',
    'Artículo / Tela',
    'Rollo / Corte Nº'
  ];

  const alignments: ('left' | 'center' | 'right')[] = [
    'center', 'center', 'center', 'left', 'left', 'left', 'center'
  ];

  if (hasLote) { headers.push('Lote'); alignments.push('center'); }
  if (hasPartida) { headers.push('Partida'); alignments.push('center'); }
  if (hasTono) { headers.push('Tono'); alignments.push('center'); }
  if (hasWidth) { headers.push('Ancho'); alignments.push('center'); }
  if (hasWeight) { headers.push('Peso'); alignments.push('center'); }

  headers.push('Metraje Despachado (m)', 'Notas / Observaciones');
  alignments.push('right', 'left');

  const startRow = 5;
  styleTableHeaders(worksheet, startRow, headers);

  let itemCounter = 0;

  filteredLists.forEach(pl => {
    const clientName = clients.find(c => c.id === pl.clientId)?.name || 'Cliente Eliminado';
    const sellerName = sellers.find(s => s.id === pl.sellerId)?.name || 'Vendedor Eliminado';

    pl.items.forEach(item => {
      itemCounter++;
      const rowNum = startRow + itemCounter;
      const row = worksheet.getRow(rowNum);

      const articleObj = articles.find(a => a.id === item.articleId);

      const rowValues: any[] = [
        itemCounter,
        pl.packingListNo,
        pl.date,
        clientName,
        sellerName,
        articleObj?.name || item.articleId || 'Desconocido',
        item.rollNumber
      ];

      if (hasLote) rowValues.push(item.lot || '-');
      if (hasPartida) rowValues.push(item.partida || '-');
      if (hasTono) rowValues.push(item.tono || '-');
      if (hasWidth) rowValues.push(item.width || '-');
      if (hasWeight) rowValues.push(item.weight || '-');

      rowValues.push(
        Number(item.meters.toFixed(2)),
        pl.notes || ''
      );

      row.values = rowValues;
      styleDataRow(row, itemCounter % 2 === 0, alignments);

      // Meter format
      const meterColIdx = headers.length - 1;
      const meterCell = row.getCell(meterColIdx);
      meterCell.numFmt = '#,##0.00 "m"';
    });
  });

  // Summary Row
  const lastRow = startRow + itemCounter;
  const summaryRow = worksheet.getRow(lastRow + 1);
  summaryRow.height = 24;

  summaryRow.getCell(4).value = 'TOTALES DESPACHADOS:';
  summaryRow.getCell(4).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };

  const meterColIdx = headers.length - 1;
  const meterCell = summaryRow.getCell(meterColIdx);
  meterCell.value = Number(totalMeters.toFixed(2));
  meterCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
  meterCell.numFmt = '#,##0.00 "m"';
  meterCell.alignment = { horizontal: 'right', vertical: 'middle' };

  summaryRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  });

  autoFitColumns(worksheet);
  const dateStr = new Date().toISOString().split('T')[0];
  await downloadWorkbook(workbook, `Detalle_Rollos_Despachados_Juditex_${dateStr}`);
}

/**
 * 5. Export Single Packing List document to Excel
 */
export async function exportSinglePackingListToExcel(
  pl: PackingList,
  client?: Client,
  seller?: Seller,
  articles?: Article[]
) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JUDITEX';

  const sheetName = `PL ${pl.packingListNo}`;
  const worksheet = workbook.addWorksheet(sheetName);

  let hasLote = false;
  let hasPartida = false;
  let hasTono = false;
  let hasWidth = false;
  let hasWeight = false;

  pl.items.forEach(item => {
    if (item.lot && item.lot.trim() !== '') hasLote = true;
    if (item.partida && item.partida.trim() !== '') hasPartida = true;
    if (item.tono && item.tono.trim() !== '') hasTono = true;
    if (item.width && item.width.trim() !== '') hasWidth = true;
    if (item.weight && item.weight.trim() !== '') hasWeight = true;
  });

  if (pl.omittedFields && pl.omittedFields.length > 0) {
    if (pl.omittedFields.includes('lot')) hasLote = false;
    if (pl.omittedFields.includes('partida')) hasPartida = false;
    if (pl.omittedFields.includes('tono')) hasTono = false;
    if (pl.omittedFields.includes('width')) hasWidth = false;
    if (pl.omittedFields.includes('weight')) hasWeight = false;
  }

  const totalMeters = pl.items.reduce((acc, item) => acc + item.meters, 0);
  const totalWeight = pl.items.reduce((acc, item) => {
    const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const parsedW = parseFloat(rawW);
    return acc + (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0 ? parsedW : 0);
  }, 0);

  // Table Headers definition
  const headers = ['N°', 'Artículo / Tela'];
  const alignments: ('left' | 'center' | 'right')[] = ['center', 'left'];

  if (hasLote) { headers.push('Lote'); alignments.push('center'); }
  if (hasPartida) { headers.push('Partida'); alignments.push('center'); }
  if (hasTono) { headers.push('Tono'); alignments.push('center'); }
  if (hasWidth) { headers.push('Ancho'); alignments.push('center'); }
  if (hasWeight) { headers.push('Peso'); alignments.push('center'); }

  headers.push('Rollo / Corte N°', 'Metraje (m)');
  alignments.push('center', 'right');

  const totalCols = Math.max(headers.length, 6);

  // 1. Setup Logo container in A1:B4
  worksheet.getRow(1).height = 20;
  worksheet.getRow(2).height = 30;
  worksheet.getRow(3).height = 20;
  worksheet.getRow(4).height = 14;

  const logoBase64 = await getLogoBase64();
  if (logoBase64) {
    try {
      worksheet.mergeCells('A1:B4');
      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0.05, row: 0.08 },
        ext: { width: 220, height: 80 },
        editAs: 'oneCell'
      });
    } catch (e) {
      console.warn('Failed to embed logo in packing list export:', e);
    }
  }

  // 2. Title Section in C2:TotalCols -> "PACKING LIST"
  const titleStartCol = logoBase64 ? 3 : 1;
  try {
    worksheet.mergeCells(2, titleStartCol, 2, totalCols);
  } catch (e) {}

  const titleCell = worksheet.getCell(2, titleStartCol);
  titleCell.value = 'PACKING LIST';
  titleCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: 'FF0F766E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Subtitle / Doc Info in C3:TotalCols
  try {
    worksheet.mergeCells(3, titleStartCol, 3, totalCols);
  } catch (e) {}

  const subCell = worksheet.getCell(3, titleStartCol);
  subCell.value = `N° DOCUMENTO: ${pl.packingListNo}  |  FECHA: ${pl.date}`;
  subCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF64748B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Row 5: Section Header "INFORMACIÓN GENERAL DEL DESPACHO"
  worksheet.getRow(5).height = 20;
  try {
    worksheet.mergeCells(5, 1, 5, totalCols);
  } catch (e) {}

  const sectionHeaderCell = worksheet.getCell(5, 1);
  sectionHeaderCell.value = 'INFORMACIÓN DEL CLIENTE Y DESPACHO';
  sectionHeaderCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F766E' } };
  sectionHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
  sectionHeaderCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sectionHeaderCell.border = {
    top: { style: 'thin', color: { argb: 'FFCCFBF1' } },
    bottom: { style: 'thin', color: { argb: 'FF99F6E4' } },
    left: { style: 'thin', color: { argb: 'FFCCFBF1' } },
    right: { style: 'thin', color: { argb: 'FFCCFBF1' } }
  };

  // Rows 6 to 9: Clean Metadata Card with merged cells
  const midColLabel = Math.max(Math.floor(totalCols / 2) + 1, 4);
  const midColVal = midColLabel + 1;

  const metaRows = [
    {
      l1: 'N° Packing List:', v1: pl.packingListNo,
      l2: 'Fecha Despacho:', v2: pl.date
    },
    {
      l1: 'Cliente / Razón Social:', v1: client?.name || '-',
      l2: 'DNI / RUC:', v2: client?.dni || '-'
    },
    {
      l1: 'Vendedor Responsable:', v1: seller?.name || '-',
      l2: 'Dirección Entrega:', v2: client?.address || pl.dispatchAddress || '-'
    },
    {
      l1: 'Observaciones:', v1: pl.notes || 'Sin observaciones',
      l2: 'Guía de Remisión:', v2: pl.guideNumber || '-'
    }
  ];

  metaRows.forEach((item, rIdx) => {
    const rowNum = 6 + rIdx;
    const row = worksheet.getRow(rowNum);
    row.height = 19;

    // Left Label: Col 1
    const cellL1 = row.getCell(1);
    cellL1.value = item.l1;
    cellL1.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF475569' } };
    cellL1.alignment = { vertical: 'middle', horizontal: 'left' };

    // Left Value: Merged across Col 2 to midColLabel-1
    const endCol1 = midColLabel - 1;
    if (endCol1 > 2) {
      try { worksheet.mergeCells(rowNum, 2, rowNum, endCol1); } catch (e) {}
    }
    const cellV1 = row.getCell(2);
    cellV1.value = item.v1;
    cellV1.font = { name: 'Segoe UI', size: 9.5, bold: rIdx === 0, color: { argb: 'FF1E293B' } };
    cellV1.alignment = { vertical: 'middle', horizontal: 'left' };

    // Right Label: midColLabel
    const cellL2 = row.getCell(midColLabel);
    cellL2.value = item.l2;
    cellL2.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF475569' } };
    cellL2.alignment = { vertical: 'middle', horizontal: 'left' };

    // Right Value: Merged across midColVal to totalCols
    if (totalCols > midColVal) {
      try { worksheet.mergeCells(rowNum, midColVal, rowNum, totalCols); } catch (e) {}
    }
    const cellV2 = row.getCell(midColVal);
    cellV2.value = item.v2;
    cellV2.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF1E293B' } };
    cellV2.alignment = { vertical: 'middle', horizontal: 'left' };

    // Card styling
    for (let c = 1; c <= totalCols; c++) {
      const cCell = row.getCell(c);
      if (!cCell.fill) {
        cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      }
      cCell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
  });

  // Row 10: Blank Separator
  worksheet.getRow(10).height = 12;

  // Table Headers at Row 11
  const startRow = 11;
  styleTableHeaders(worksheet, startRow, headers);

  // Group items by article to compute accurate per-article subtotals and summaries
  interface ArticleGroup {
    articleId: string;
    articleName: string;
    items: typeof pl.items;
    totalMeters: number;
    totalWeight: number;
    rollsCount: number;
  }

  const articleGroupsMap = new Map<string, ArticleGroup>();
  pl.items.forEach(item => {
    const artObj = articles?.find(a => a.id === item.articleId);
    const artName = artObj?.name || item.articleId || 'Tela / Artículo';
    const key = item.articleId || artName;

    if (!articleGroupsMap.has(key)) {
      articleGroupsMap.set(key, {
        articleId: item.articleId || '',
        articleName: artName,
        items: [],
        totalMeters: 0,
        totalWeight: 0,
        rollsCount: 0
      });
    }

    const group = articleGroupsMap.get(key)!;
    group.items.push(item);
    group.totalMeters += Number(item.meters || 0);
    const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const parsedW = parseFloat(rawW);
    if (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0) {
      group.totalWeight += parsedW;
    }
    group.rollsCount += 1;
  });

  const articleGroups = Array.from(articleGroupsMap.values());
  const hasMultipleArticles = articleGroups.length > 1;

  const weightColIdx = hasWeight ? headers.indexOf('Peso') + 1 : -1;
  const rollColIdx = headers.indexOf('Rollo / Corte N°') + 1;
  const metersColIdx = headers.length;
  const mergeEndCol = (hasWeight && weightColIdx > 0) ? weightColIdx - 1 : rollColIdx - 1;

  let currentRow = startRow + 1;
  let globalItemIndex = 1;

  articleGroups.forEach(group => {
    // 1. Output items belonging to this article
    group.items.forEach(item => {
      const row = worksheet.getRow(currentRow);
      row.height = 20;

      const rowValues: any[] = [
        globalItemIndex,
        group.articleName
      ];

      if (hasLote) rowValues.push(item.lot || '-');
      if (hasPartida) rowValues.push(item.partida || '-');
      if (hasTono) rowValues.push(item.tono || '-');
      if (hasWidth) rowValues.push(item.width || '-');
      if (hasWeight) rowValues.push(item.weight || '-');

      rowValues.push(item.rollNumber, Number(item.meters.toFixed(2)));

      row.values = rowValues;
      styleDataRow(row, globalItemIndex % 2 === 1, alignments);

      const metersCell = row.getCell(metersColIdx);
      metersCell.numFmt = '#,##0.00 "m"';

      currentRow++;
      globalItemIndex++;
    });

    // 2. Subtotal row for this specific article (when multiple articles exist)
    if (hasMultipleArticles) {
      const subtotalRow = worksheet.getRow(currentRow);
      subtotalRow.height = 22;

      if (mergeEndCol > 2) {
        try { worksheet.mergeCells(currentRow, 2, currentRow, mergeEndCol); } catch (e) {}
      }

      const labelCell = subtotalRow.getCell(2);
      labelCell.value = `SUBTOTAL ${group.articleName}:`;
      labelCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F766E' } };
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

      if (hasWeight && weightColIdx > 0) {
        const weightCell = subtotalRow.getCell(weightColIdx);
        weightCell.value = group.totalWeight > 0 ? `${group.totalWeight.toFixed(2)} kg` : '-';
        weightCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F766E' } };
        weightCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      const rollCell = subtotalRow.getCell(rollColIdx);
      rollCell.value = `${group.rollsCount} ${group.rollsCount === 1 ? 'rollo' : 'rollos'}`;
      rollCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F766E' } };
      rollCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const metersCell = subtotalRow.getCell(metersColIdx);
      metersCell.value = Number(group.totalMeters.toFixed(2));
      metersCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F766E' } };
      metersCell.numFmt = '#,##0.00 "m"';
      metersCell.alignment = { horizontal: 'right', vertical: 'middle' };

      for (let c = 1; c <= totalCols; c++) {
        const cell = subtotalRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF99F6E4' } },
          bottom: { style: 'thin', color: { argb: 'FF99F6E4' } }
        };
      }

      currentRow++;
    }
  });

  // Totals Footer Row (Grand Total)
  const summaryRow = worksheet.getRow(currentRow);
  summaryRow.height = 24;

  if (mergeEndCol > 2) {
    try { worksheet.mergeCells(currentRow, 2, currentRow, mergeEndCol); } catch (e) {}
  }

  summaryRow.getCell(2).value = hasMultipleArticles ? 'TOTAL GENERAL DESPACHADO' : 'TOTAL DESPACHADO';
  summaryRow.getCell(2).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  summaryRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };

  if (hasWeight && totalWeight > 0 && weightColIdx > 0) {
    const weightCell = summaryRow.getCell(weightColIdx);
    weightCell.value = `${totalWeight.toFixed(2)} kg`;
    weightCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    weightCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const grandRollCell = summaryRow.getCell(rollColIdx);
  grandRollCell.value = `${pl.items.length} rollos`;
  grandRollCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  grandRollCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const grandMetersCell = summaryRow.getCell(metersColIdx);
  grandMetersCell.value = Number(totalMeters.toFixed(2));
  grandMetersCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F766E' } };
  grandMetersCell.numFmt = '#,##0.00 "m"';
  grandMetersCell.alignment = { horizontal: 'right', vertical: 'middle' };

  for (let c = 1; c <= totalCols; c++) {
    const cell = summaryRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  }

  autoFitColumns(worksheet);
  await downloadWorkbook(workbook, `PackingList_${pl.packingListNo}_Juditex`);
}
