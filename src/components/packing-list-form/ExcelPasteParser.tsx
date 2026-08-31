import React, { useState } from 'react';
import { Provider } from '../../types';
import { ClipboardPaste } from 'lucide-react';

// Helper to sanitize and parse numeric values from Excel cells
// Handles non-breaking spaces (\u00A0), thousand separators (1,250.50 or 1.250,50), unit suffixes (m, mts, kg), etc.
export const parseSanitizedNumeric = (val: string | number | null | undefined): number | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  
  let str = String(val).trim();
  if (!str) return null;

  // Replace non-breaking spaces and regular spaces around units
  str = str.replace(/[\u00A0\u200B\u202F]/g, ' ').trim();

  // Strip known metric/measurement units and currency/other symbols
  str = str.replace(/(metros|metro|metraje|mts|mtrs|mtr|mt|m|kilos|kilo|kgs|kg|pso|yds|yd|yardas|yarda|cm|mm|[\$€£])/gi, '').trim();

  // If there are still alphabetic characters left, it's not a purely numeric measurement
  if (/[a-zA-Z]/g.test(str)) {
    return null;
  }

  // Handle thousand separators vs decimal separators:
  // Case A: 1,250.50 (comma is thousands, dot is decimal)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  }
  // Case B: 1.250,50 (dot is thousands, comma is decimal)
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  // Case C: Standard comma decimal (e.g. "120,50" -> "120.50")
  else if (str.includes(',') && !str.includes('.')) {
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) || !isFinite(num) ? null : num;
};

// Helper to parse and classify Excel columns based on content heuristics and provider configuration
export const resolveColumnsForText = (
  text: string, 
  pConfig: Provider | null | undefined,
  manualMapping?: { [colIdx: number]: string }
) => {
  const rawLines = text.split(/[\r\n]+/);
  const lines = rawLines.map(l => l.trim()).filter(Boolean);
  
  let rollColIdx = -1;
  let metersColIdx = -1;
  let lotColIdx = -1;
  let partidaColIdx = -1;
  let tonoColIdx = -1;
  let widthColIdx = -1;
  let weightColIdx = -1;
  let startLineIndex = 0;

  if (lines.length === 0) {
    return {
      metersColIdx,
      rollColIdx,
      lotColIdx,
      partidaColIdx,
      tonoColIdx,
      widthColIdx,
      weightColIdx,
      startLineIndex,
      lines,
      colHeaders: [] as string[],
      splitIntoColumns: (lineStr: string) => [] as string[]
    };
  }

  const splitIntoColumns = (lineStr: string): string[] => {
    if (lineStr.includes('\t')) {
      return lineStr.split('\t').map(c => c.trim());
    } else if (lineStr.includes(';')) {
      return lineStr.split(';').map(c => c.trim());
    } else if (lineStr.includes('|')) {
      return lineStr.split('|').map(c => c.trim()).filter(Boolean);
    } else if (/\s{2,}/.test(lineStr)) {
      return lineStr.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
    } else {
      return lineStr.split(/\s+/).map(c => c.trim()).filter(Boolean);
    }
  };

  // 1. Check if first line is a header row
  let firstLineCols = splitIntoColumns(lines[0]).map(c => c.toLowerCase().trim());
  const isHeader = firstLineCols.some(word => 
    /^(rollo|rollos|roll|rolls|nro|nro\.|n°|nº|n°\.|nº\.|no\.|no|num|num\.|núm|núm\.|numero|número|item|id|piez|pieza|piezas|pza|pzas|bulto|bultos|bult|cod|codigo|código|etiqueta|tag|serial|barcode|barra|ticket|#|n[o°º]?\.?\s*rollo|roll\s*n[o°º]?\.?)$/i.test(word) ||
    /^(metraje|metraje\s*\(?m\)?|metros|metro|metr|metr\.|cant|cant\.|cantidad|qty|size|long|longitud|largo|medida|mts|mts\.|mtr|mtr\.|mtrs|mtrs\.|yds|yardas|yarda|mt|m)$/i.test(word) ||
    /^(lote|lot|batch|lote\.|lot\.|n[o°º]?\.?\s*lote)$/i.test(word) ||
    /^(partida|part|part\.|partida\s*[\/\-]\s*tintoreria|despacho|tintoreria|tintorería|op|ot|n[o°º]?\.?\s*partida)$/i.test(word) ||
    /^(tono|tono\.|color|col|col\.|tono\s*[\/\-]\s*color|color\s*[\/\-]\s*tono|shad|shade|matiz|variante)$/i.test(word) ||
    /^(ancho|ancho\s*\(?m\)?|width|anchura|anc|anc\.)$/i.test(word) ||
    /^(peso|peso\s*\(?kg\)?|peso\s*bruto|peso\s*neto|weight|kg|kgs|kilos|kilo|pso|gross|net|bruto|neto|p\.bruto|p\.neto)$/i.test(word)
  );

  if (isHeader) {
    startLineIndex = 1;
    firstLineCols.forEach((col, idx) => {
      if (/peso|weight|kg|kilo|pso|bruto|neto/i.test(col)) {
        weightColIdx = idx;
      } else if (/metr|cant|qty|size|long|mts|mtr|yds|yard|^mt$|^m$|medida/i.test(col)) {
        metersColIdx = idx;
      } else if (/anch|width/i.test(col)) {
        widthColIdx = idx;
      } else if (/^(#|no|no\.)$/i.test(col) || /roll|nro|n°|nº|num|núm|item|id|piez|pza|bult|cod|etiquet|tag|serial|ticket/i.test(col)) {
        rollColIdx = idx;
      } else if (/lote|lot|batch/i.test(col)) {
        lotColIdx = idx;
      } else if (/part|tintor|despacho|op|ot/i.test(col)) {
        partidaColIdx = idx;
      } else if (/tono|color|col|shad|matiz|variante/i.test(col)) {
        tonoColIdx = idx;
      }
    });
  }

  // 2. If manual mapping is provided, apply it and override auto-detected headers
  if (manualMapping) {
    Object.entries(manualMapping).forEach(([colStr, role]) => {
      const idx = parseInt(colStr, 10);
      if (role === 'meters') metersColIdx = idx;
      else if (role === 'rollNo') rollColIdx = idx;
      else if (role === 'lot') lotColIdx = idx;
      else if (role === 'partida') partidaColIdx = idx;
      else if (role === 'tono') tonoColIdx = idx;
      else if (role === 'width') widthColIdx = idx;
      else if (role === 'weight') weightColIdx = idx;
      else if (role === 'ignore') {
        if (metersColIdx === idx) metersColIdx = -1;
        if (rollColIdx === idx) rollColIdx = -1;
        if (lotColIdx === idx) lotColIdx = -1;
        if (partidaColIdx === idx) partidaColIdx = -1;
        if (tonoColIdx === idx) tonoColIdx = -1;
        if (widthColIdx === idx) widthColIdx = -1;
        if (weightColIdx === idx) weightColIdx = -1;
      }
    });
  } else {
    // 3. Intelligent Heuristic Column Profiling for unassigned active columns
    const dataLines = lines.slice(startLineIndex);
    if (dataLines.length > 0) {
      const sampleRows: string[][] = [];
      for (let i = 0; i < Math.min(dataLines.length, 30); i++) {
        const cols = splitIntoColumns(dataLines[i]);
        if (cols.length > 0) {
          sampleRows.push(cols);
        }
      }

      if (sampleRows.length > 0) {
        const maxColsCount = Math.max(...sampleRows.map(r => r.length));
        
        interface ColStat {
          index: number;
          isNumeric: boolean;
          allNumeric: boolean;
          numericCount: number;
          avgVal: number;
          minVal: number;
          maxVal: number;
          avgLength: number;
          avgDigits: number;
          avgLetters: number;
          hasLetters: boolean;
          hasDecimals: boolean;
          wholeOrHalfCount: number;
          twoDecimalsCount: number;
          hasUnitsMeters: boolean;
          hasUnitsKg: boolean;
          isSequential: boolean;
        }

        const colAnalysis: ColStat[] = [];

        for (let colIdx = 0; colIdx < maxColsCount; colIdx++) {
          const vals = sampleRows
            .map(r => r[colIdx])
            .filter(v => v !== undefined && v !== '');

          let numericCount = 0;
          let sum = 0;
          let min = Infinity;
          let max = -Infinity;
          let totalLength = 0;
          let totalDigits = 0;
          let totalLetters = 0;
          let decimalCount = 0;
          let wholeOrHalfCount = 0;
          let twoDecimalsCount = 0;
          let unitsMetersCount = 0;
          let unitsKgCount = 0;
          const numericSeries: number[] = [];

          vals.forEach(v => {
            const cleanedVal = v.trim();
            totalLength += cleanedVal.length;
            const digits = cleanedVal.replace(/[^0-9]/g, '').length;
            totalDigits += digits;
            const letters = cleanedVal.replace(/[^a-zA-Z]/g, '').length;
            totalLetters += letters;

            if (/m|mts|mt|yd|yds/i.test(cleanedVal)) unitsMetersCount++;
            if (/kg|kgs|kilos/i.test(cleanedVal)) unitsKgCount++;

            const numericCleaned = cleanedVal.replace(/m|mts|mt|kg|kgs|kilos|yd|yds/i, '').replace(',', '.').trim();
            const n = parseFloat(numericCleaned);
            if (!isNaN(n)) {
              numericCount++;
              sum += n;
              numericSeries.push(n);
              if (n < min) min = n;
              if (n > max) max = n;
              
              if (n !== Math.floor(n)) {
                decimalCount++;
              }

              // Check if whole integer (90, 100, 115), half-integer (90.5, 102.5), or tenth (140.2)
              const remainderHalf = Math.abs(n % 0.5);
              const remainderTenth = Math.abs(Math.round(n * 10) - n * 10);
              if (remainderHalf < 0.001 || remainderTenth < 0.001) {
                wholeOrHalfCount++;
              } else {
                twoDecimalsCount++;
              }
            }
          });

          // Check if sequence is consecutive (1, 2, 3, 4... or 101, 102, 103...)
          let isSequential = false;
          if (numericSeries.length >= 3) {
            isSequential = true;
            for (let sIdx = 1; sIdx < numericSeries.length; sIdx++) {
              if (numericSeries[sIdx] - numericSeries[sIdx - 1] !== 1) {
                isSequential = false;
                break;
              }
            }
          }

          colAnalysis.push({
            index: colIdx,
            isNumeric: numericCount > vals.length * 0.4,
            allNumeric: numericCount === vals.length,
            numericCount,
            avgVal: numericCount > 0 ? sum / numericCount : 0,
            minVal: min === Infinity ? 0 : min,
            maxVal: max === -Infinity ? 0 : max,
            avgLength: vals.length > 0 ? totalLength / vals.length : 0,
            avgDigits: vals.length > 0 ? totalDigits / vals.length : 0,
            avgLetters: vals.length > 0 ? totalLetters / vals.length : 0,
            hasLetters: totalLetters > 0,
            hasDecimals: decimalCount > 0,
            wholeOrHalfCount,
            twoDecimalsCount,
            hasUnitsMeters: unitsMetersCount > 0,
            hasUnitsKg: unitsKgCount > 0,
            isSequential
          });
        }

        const assignedCols = new Set<number>();
        if (metersColIdx !== -1) assignedCols.add(metersColIdx);
        if (rollColIdx !== -1) assignedCols.add(rollColIdx);
        if (lotColIdx !== -1) assignedCols.add(lotColIdx);
        if (partidaColIdx !== -1) assignedCols.add(partidaColIdx);
        if (tonoColIdx !== -1) assignedCols.add(tonoColIdx);
        if (widthColIdx !== -1) assignedCols.add(widthColIdx);
        if (weightColIdx !== -1) assignedCols.add(weightColIdx);

        // Step A: Assign Width (ancho) if unassigned and matches 0.8m - 3.0m range with low variance
        if (widthColIdx === -1) {
          const widthCandidate = colAnalysis.find(col => 
            !assignedCols.has(col.index) && 
            col.isNumeric && 
            col.avgVal >= 0.8 && 
            col.avgVal <= 3.2 && 
            (col.maxVal - col.minVal) <= 0.9 &&
            (pConfig?.hasWidth || maxColsCount >= 3)
          );
          if (widthCandidate) {
            widthColIdx = widthCandidate.index;
            assignedCols.add(widthCandidate.index);
          }
        }

        // Step B: Assign Roll Number (Nº Rollo) if unassigned
        if (rollColIdx === -1 && (pConfig?.hasRollNo || maxColsCount >= 2)) {
          // Look for sequential integers (1,2,3,4...) or large roll IDs (>350 or >= 5 digits)
          const rollCandidate = colAnalysis.find(col => 
            !assignedCols.has(col.index) && 
            col.isNumeric && 
            (
              (col.isSequential && col.minVal <= 1000) || 
              col.avgDigits >= 5 || 
              col.avgVal > 350 ||
              (col.index === 0 && colAnalysis.some(c => c.index !== 0 && c.isNumeric && c.avgVal >= 15))
            )
          );
          if (rollCandidate) {
            rollColIdx = rollCandidate.index;
            assignedCols.add(rollCandidate.index);
          }
        }

        // Step C: Discriminate Metraje (Meters) vs Peso (Weight)
        // Textile Physics Rule: Metraje is ALWAYS significantly greater than Peso (Metraje > Peso).
        // Standard rolls: Meters ~ 40m - 200m (whole numbers 90, 100, 115 or decimals 56.54, 54.84), Weight ~ 12kg - 45kg.
        const unassignedNumericCols = colAnalysis.filter(col => 
          !assignedCols.has(col.index) && 
          col.isNumeric && 
          col.avgVal > 0 && 
          col.avgVal <= 350
        );

        if (unassignedNumericCols.length > 0) {
          if (metersColIdx === -1 && weightColIdx === -1 && unassignedNumericCols.length >= 2) {
            // We have at least two numeric columns to classify into Metraje and Weight
            // Sort by average value descending (Higher avg = Meters, Lower avg = Weight)
            const sortedByAvg = [...unassignedNumericCols].sort((a, b) => b.avgVal - a.avgVal);
            
            const colHigher = sortedByAvg[0];
            const colLower = sortedByAvg[1];

            // If one has explicit units, respect units
            if (colHigher.hasUnitsKg && !colLower.hasUnitsKg) {
              weightColIdx = colHigher.index;
              metersColIdx = colLower.index;
            } else if (colLower.hasUnitsMeters && !colHigher.hasUnitsMeters) {
              metersColIdx = colLower.index;
              weightColIdx = colHigher.index;
            } else {
              // Higher value is Metraje, lower value is Peso
              metersColIdx = colHigher.index;
              weightColIdx = colLower.index;
            }

            assignedCols.add(metersColIdx);
            assignedCols.add(weightColIdx);
          } else if (metersColIdx === -1) {
            // Pick the best column for meters
            // If any has units meters or typical meters magnitude (20m - 250m)
            const sortedForMeters = [...unassignedNumericCols].sort((a, b) => {
              if (a.hasUnitsMeters && !b.hasUnitsMeters) return -1;
              if (!a.hasUnitsMeters && b.hasUnitsMeters) return 1;
              if (a.hasUnitsKg && !b.hasUnitsKg) return 1;
              if (!a.hasUnitsKg && b.hasUnitsKg) return -1;
              // Higher average in 25-250 range preferred over small < 20 values
              const scoreA = (a.avgVal >= 25 && a.avgVal <= 250 ? 200 : 0) + (a.avgVal > b.avgVal ? 50 : 0);
              const scoreB = (b.avgVal >= 25 && b.avgVal <= 250 ? 200 : 0) + (b.avgVal > a.avgVal ? 50 : 0);
              return scoreB - scoreA;
            });

            metersColIdx = sortedForMeters[0].index;
            assignedCols.add(metersColIdx);
          } else if (weightColIdx === -1 && (pConfig?.hasWeight || unassignedNumericCols.length >= 1)) {
            const weightCand = unassignedNumericCols.find(c => !assignedCols.has(c.index));
            if (weightCand) {
              weightColIdx = weightCand.index;
              assignedCols.add(weightCand.index);
            }
          }
        }

        // Step D: Assign remaining columns to Tono, Partida, Lote
        const remainingCols = colAnalysis.filter(c => !assignedCols.has(c.index));

        remainingCols.forEach(col => {
          // Tono / Color candidate (letters like "LTC", "AZUL", "NEGRO", "A", "B")
          if (tonoColIdx === -1 && (pConfig?.hasTono || (!pConfig?.hasLot && !pConfig?.hasPartida))) {
            if (col.hasLetters || col.avgLength <= 6) {
              tonoColIdx = col.index;
              assignedCols.add(col.index);
              return;
            }
          }

          // Partida candidate (4 to 8 digits numeric/alphanumeric)
          if (partidaColIdx === -1 && pConfig?.hasPartida) {
            if (col.avgDigits >= 4 && col.avgDigits <= 8) {
              partidaColIdx = col.index;
              assignedCols.add(col.index);
              return;
            }
          }

          // Lot candidate (short code <= 7 chars)
          if (lotColIdx === -1 && pConfig?.hasLot) {
            if (col.avgLength <= 7) {
              lotColIdx = col.index;
              assignedCols.add(col.index);
              return;
            }
          }

          // Default fallback assignment
          if (tonoColIdx === -1 && pConfig?.hasTono) {
            tonoColIdx = col.index;
            assignedCols.add(col.index);
          } else if (lotColIdx === -1 && pConfig?.hasLot) {
            lotColIdx = col.index;
            assignedCols.add(col.index);
          } else if (partidaColIdx === -1 && pConfig?.hasPartida) {
            partidaColIdx = col.index;
            assignedCols.add(col.index);
          } else if (rollColIdx === -1) {
            rollColIdx = col.index;
            assignedCols.add(col.index);
          }
        });
      }
    }
  }

  // Build column headers mapping for UI table preview
  const colHeaders: string[] = [];
  const linesToScan = lines.slice(startLineIndex);
  const maxCols = Math.max(
    rollColIdx, metersColIdx, lotColIdx, partidaColIdx, tonoColIdx, widthColIdx, weightColIdx,
    linesToScan[0] ? splitIntoColumns(linesToScan[0]).length - 1 : 0
  ) + 1;

  for (let i = 0; i < maxCols; i++) {
    const roles: string[] = [];
    if (i === rollColIdx) roles.push('Nº ROLLO');
    if (i === metersColIdx) roles.push('METRAJE');
    if (i === lotColIdx) roles.push('LOTE');
    if (i === partidaColIdx) roles.push('PARTIDA');
    if (i === tonoColIdx) roles.push('TONO/COLOR');
    if (i === widthColIdx) roles.push('ANCHO');
    if (i === weightColIdx) roles.push('PESO');

    if (roles.length > 0) {
      colHeaders[i] = roles.join(' / ');
    } else {
      colHeaders[i] = 'IGNORADO';
    }
  }

  return {
    metersColIdx,
    rollColIdx,
    lotColIdx,
    partidaColIdx,
    tonoColIdx,
    widthColIdx,
    weightColIdx,
    startLineIndex,
    lines,
    colHeaders,
    splitIntoColumns
  };
};

interface ExcelPasteParserProps {
  groupId: string;
  pConfig: Provider | null | undefined;
  isExcelOnly: boolean;
  packingType: 'nuevo' | 'antiguo' | 'corte' | 'rollo';
  onProcess: (text: string, manualMapping?: { [colIdx: number]: string }) => void;
}

export default function ExcelPasteParser({
  groupId,
  pConfig,
  isExcelOnly,
  packingType,
  onProcess
}: ExcelPasteParserProps) {
  const [text, setText] = useState('');
  const [manualColRoles, setManualColRoles] = useState<{ [colIdx: number]: string }>({});
  const [reassignedNotice, setReassignedNotice] = useState<string | null>(null);

  const handleProcess = () => {
    if (!text.trim()) return;
    const hasManual = Object.keys(manualColRoles).length > 0;
    onProcess(text, hasManual ? manualColRoles : undefined);
    setText('');
    setManualColRoles({});
    setReassignedNotice(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      handleProcess();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const clip = await navigator.clipboard.readText();
        if (clip) {
          setText(clip);
          setManualColRoles({});
          setReassignedNotice(null);
        }
      }
    } catch (e) {
      console.log('Clipboard paste not allowed', e);
    }
  };

  const bulkVal = text.trim();
  const showPreview = (() => {
    if (!bulkVal) return false;
    const res = resolveColumnsForText(bulkVal, pConfig);
    return res.lines.length > 1 || bulkVal.includes('\t') || bulkVal.includes(';') || /\s{2,}/.test(bulkVal);
  })();

  const hasManual = Object.keys(manualColRoles).length > 0;
  const previewRes = showPreview ? resolveColumnsForText(bulkVal, pConfig, hasManual ? manualColRoles : undefined) : null;
  const dataLines = previewRes ? previewRes.lines.slice(previewRes.startLineIndex) : [];

  // Determine effective role of each column
  const getColCurrentRole = (colIdx: number) => {
    if (manualColRoles[colIdx]) return manualColRoles[colIdx];
    if (!previewRes) return 'ignore';
    if (colIdx === previewRes.metersColIdx) return 'meters';
    if (colIdx === previewRes.rollColIdx) return 'rollNo';
    if (colIdx === previewRes.lotColIdx) return 'lot';
    if (colIdx === previewRes.partidaColIdx) return 'partida';
    if (colIdx === previewRes.tonoColIdx) return 'tono';
    if (colIdx === previewRes.widthColIdx) return 'width';
    if (colIdx === previewRes.weightColIdx) return 'weight';
    return 'ignore';
  };

  const ROLE_LABELS: { [key: string]: string } = {
    meters: 'Metraje',
    rollNo: 'Nº Rollo',
    tono: 'Tono / Color',
    lot: 'Lote',
    partida: 'Partida',
    width: 'Ancho',
    weight: 'Peso',
    ignore: 'Ignorar'
  };

  const handleColRoleChange = (colIdx: number, newRole: string) => {
    setManualColRoles(prev => {
      const next = { ...prev, [colIdx]: newRole };
      let warningMsg: string | null = null;

      if (newRole !== 'ignore' && previewRes) {
        const totalCols = previewRes.colHeaders.length;
        const reassignedCols: number[] = [];

        for (let c = 0; c < totalCols; c++) {
          if (c !== colIdx) {
            const currentEffectiveRole = prev[c] !== undefined ? prev[c] : getColCurrentRole(c);
            if (currentEffectiveRole === newRole) {
              next[c] = 'ignore';
              reassignedCols.push(c + 1);
            }
          }
        }

        if (reassignedCols.length > 0) {
          const colsStr = reassignedCols.length === 1 
            ? `Columna ${reassignedCols[0]}` 
            : `Columnas ${reassignedCols.join(', ')}`;
          const roleName = ROLE_LABELS[newRole] || newRole;
          warningMsg = `${colsStr} reasignada a 'Ignorar' porque el rol "${roleName}" ya estaba en uso en otra columna.`;
        }
      }

      setReassignedNotice(warningMsg);
      return next;
    });
  };

  // Compute live summary statistics and duplicate roll detection across all valid data lines
  const previewStats = (() => {
    if (!previewRes) return null;
    const { metersColIdx, rollColIdx, lines, startLineIndex, splitIntoColumns } = previewRes;
    const dataLinesToAnalyze = lines.slice(startLineIndex);
    
    let validRollsCount = 0;
    let totalMeters = 0;
    const rollNumbersSeen: { [rollNum: string]: number } = {};
    const duplicateRolls: string[] = [];

    dataLinesToAnalyze.forEach(line => {
      const cols = splitIntoColumns(line);
      if (cols.length === 0) return;

      let metersVal: number | null = null;
      if (metersColIdx !== -1 && cols[metersColIdx] !== undefined) {
        metersVal = parseSanitizedNumeric(cols[metersColIdx]);
      }

      if (metersVal !== null && metersVal > 0) {
        validRollsCount++;
        totalMeters += metersVal;

        if (rollColIdx !== -1 && cols[rollColIdx]) {
          const rawRoll = cols[rollColIdx].trim();
          if (rawRoll && rawRoll !== '-') {
            rollNumbersSeen[rawRoll] = (rollNumbersSeen[rawRoll] || 0) + 1;
            if (rollNumbersSeen[rawRoll] === 2) {
              duplicateRolls.push(rawRoll);
            }
          }
        }
      }
    });

    const avgMeters = validRollsCount > 0 ? totalMeters / validRollsCount : 0;

    return {
      validRollsCount,
      totalMeters: Number(totalMeters.toFixed(2)),
      avgMeters: Number(avgMeters.toFixed(2)),
      duplicateRolls
    };
  })();

  return (
    <div className="bg-app-bg border border-app-border p-3 sm:p-3.5 rounded-lg space-y-2 text-app-text">
      <div className="flex justify-between items-center">
        <label className="block text-[10px] font-black text-app-text uppercase tracking-wider flex items-center gap-1">
          {isExcelOnly ? 'Pegar desde Excel' : 'Ingreso de Metrajes (Individual o Excel)'}
        </label>
        
        {typeof navigator !== 'undefined' && navigator?.clipboard?.readText && (
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="text-[10px] text-app-secondary hover:text-app-secondary/80 font-bold flex items-center gap-1 px-1.5 py-0.5 rounded bg-app-secondary/10 hover:bg-app-secondary/20 transition cursor-pointer"
            title="Pegar del portapapeles del teléfono o PC"
          >
            <ClipboardPaste size={12} />
            <span>Pegar</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
        <div className="relative flex-1">
          <textarea
            rows={1}
            inputMode={isExcelOnly ? 'text' : 'decimal'}
            placeholder={isExcelOnly 
              ? "Pegue aquí las columnas copiadas de Excel (Nº Rollo, Metraje, Ancho, Peso)..."
              : packingType === 'corte' 
                ? "Ej: 12.50 [ENTER] o pegue tabla de Excel..." 
                : "Ej: 45.80 [ENTER] o pegue tabla de Excel..."}
            value={text}
            onChange={e => {
              setText(e.target.value);
              setManualColRoles({});
              setReassignedNotice(null);
            }}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-app-border rounded-lg text-xs font-mono font-bold text-app-text bg-app-surface focus:ring-1 focus:ring-app-primary placeholder:font-sans placeholder:font-normal placeholder:text-app-text/45 min-h-[44px]"
          />
        </div>
        
        <button
          type="button"
          onClick={handleProcess}
          className="px-4 py-2.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center justify-center whitespace-nowrap min-h-[44px]"
        >
          {isExcelOnly 
            ? 'Pegar desde Excel'
            : text.includes('\n') || text.includes('\t') 
              ? 'Procesar Excel' 
              : 'Agregar'}
        </button>
      </div>

      {previewRes && (
        <div className="mt-3 bg-app-surface border border-app-border rounded-lg p-3.5 shadow-xs space-y-2.5">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2 border-app-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-app-secondary animate-pulse"></span>
              <span className="text-[10px] font-black text-app-text uppercase tracking-wider">
                Vista Preliminar de Columnas Detectadas
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasManual && (
                <button
                  type="button"
                  onClick={() => {
                    setManualColRoles({});
                    setReassignedNotice(null);
                  }}
                  className="text-[9px] text-amber-500 hover:text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded transition cursor-pointer"
                >
                  Restaurar Auto-detección
                </button>
              )}
              <span className="text-[9px] font-mono font-extrabold text-app-text/60 bg-app-bg px-1.5 py-0.5 rounded">
                {dataLines.length} fila(s) de datos detectada(s)
              </span>
            </div>
          </div>

          {reassignedNotice && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded flex items-center gap-1.5">
              <span>ℹ️</span>
              <span>{reassignedNotice}</span>
            </div>
          )}

          {/* Quick Pre-Processing Live Summary */}
          {previewStats && previewStats.validRollsCount > 0 && (
            <div className="grid grid-cols-3 gap-2 bg-app-bg border border-app-border rounded-md p-2">
              <div className="text-center">
                <span className="text-[9px] text-app-text/50 font-bold block uppercase tracking-wider">Total Rollos</span>
                <span className="text-xs sm:text-sm font-black font-mono text-app-primary">
                  {previewStats.validRollsCount} <span className="text-[9px] font-sans font-normal text-app-text/60">uds</span>
                </span>
              </div>
              <div className="text-center border-x border-app-border">
                <span className="text-[9px] text-app-text/50 font-bold block uppercase tracking-wider">Metraje Total</span>
                <span className="text-xs sm:text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {previewStats.totalMeters.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-sans font-normal text-app-text/60">m</span>
                </span>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-app-text/50 font-bold block uppercase tracking-wider">Promedio / Rollo</span>
                <span className="text-xs sm:text-sm font-black font-mono text-app-secondary">
                  {previewStats.avgMeters.toFixed(2)} <span className="text-[9px] font-sans font-normal text-app-text/60">m</span>
                </span>
              </div>
            </div>
          )}

          {/* Duplicate Roll Warning Banner */}
          {previewStats && previewStats.duplicateRolls.length > 0 && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded flex items-start gap-1.5">
              <span className="text-xs">⚠️</span>
              <div>
                <span className="font-bold">Rollos repetidos detectados: </span>
                <span>
                  Se encontró el mismo Nº de rollo duplicado ({previewStats.duplicateRolls.slice(0, 5).join(', ')}
                  {previewStats.duplicateRolls.length > 5 ? ` y ${previewStats.duplicateRolls.length - 5} más` : ''}).
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-app-border rounded-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-app-bg border-b border-app-border">
                  {previewRes.colHeaders.map((header, hIdx) => {
                    const currentRole = getColCurrentRole(hIdx);
                    let bgClass = 'bg-app-bg text-app-text/70 border-app-border';
                    if (currentRole === 'rollNo') bgClass = 'bg-app-bg text-app-text border-app-border font-bold';
                    else if (currentRole === 'meters') bgClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold';
                    else if (currentRole === 'tono') bgClass = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-bold';
                    else if (currentRole === 'lot') bgClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 font-bold';
                    else if (currentRole === 'partida') bgClass = 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-bold';
                    else if (currentRole === 'width') bgClass = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30 font-bold';
                    else if (currentRole === 'weight') bgClass = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 font-bold';

                    return (
                      <th key={hIdx} className={`p-1.5 border-r border-app-border last:border-r-0 text-[10px] text-center font-extrabold tracking-wide uppercase ${bgClass}`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[8px] text-app-text/50 font-mono font-medium block">Col {hIdx + 1}</span>
                          <select
                            value={currentRole}
                            onChange={e => handleColRoleChange(hIdx, e.target.value)}
                            className="text-[9px] font-bold bg-app-surface text-app-text border border-app-border rounded px-1 py-0.5 focus:outline-none focus:border-app-primary cursor-pointer max-w-[110px]"
                            title="Cambiar tipo de dato para esta columna"
                          >
                            <option value="meters">⚡ METRAJE (m)</option>
                            <option value="rollNo">🔢 Nº ROLLO</option>
                            <option value="tono">🎨 TONO / COLOR</option>
                            <option value="lot">🏷️ LOTE</option>
                            <option value="partida">📦 PARTIDA</option>
                            <option value="width">📏 ANCHO (m)</option>
                            <option value="weight">⚖️ PESO (kg)</option>
                            <option value="ignore">❌ IGNORAR</option>
                          </select>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRes.lines.slice(previewRes.startLineIndex, previewRes.startLineIndex + 5).map((line, rIdx) => {
                  const cols = previewRes.splitIntoColumns(line);
                  return (
                    <tr key={rIdx} className="border-b last:border-b-0 border-app-border hover:bg-app-bg/40">
                      {previewRes.colHeaders.map((_, cIdx) => {
                        const val = cols[cIdx] || '';
                        return (
                          <td key={cIdx} className="px-2 py-1.5 border-r border-app-border last:border-r-0 text-[10px] text-center font-mono font-bold text-app-text">
                            {val ? val : <span className="text-app-text/30 italic">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {previewRes.lines.length > previewRes.startLineIndex + 5 && (
            <p className="text-[9px] text-center italic text-app-text/50">
              Mostrando las primeras 5 filas de vista previa. Haga clic en <strong>"Procesar Excel"</strong> para cargarlas todas.
            </p>
          )}
        </div>
      )}

      <p className="text-[9px] text-app-text/65 leading-relaxed">
        {isExcelOnly ? (
          <span>
            <strong>Requisito obligatorio:</strong> Copie y pegue directamente las columnas desde su hoja de Excel (Nº Rollo, Metraje, Ancho, Peso). El sistema identificará y asignará cada parámetro en su celda respectiva de inmediato.
          </span>
        ) : (
          <span>
            <strong>Consejo rápido:</strong> Escriba un número y presione ENTER, o pegue directamente una tabla copiada desde Excel (que incluya Nº Rollo, Metraje, Lote, Partida, Tono). El sistema reconocerá automáticamente los campos y rellenará la sección de inmediato.
          </span>
        )}
      </p>
    </div>
  );
}

