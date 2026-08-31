import React, { useState, useEffect } from 'react';
import { Provider, Article, RollItem } from '../../types';
import { resolveColumnsForText, parseSanitizedNumeric } from '../packing-list-form/ExcelPasteParser';
import { Clipboard, AlertTriangle, CheckCircle, Trash2, Plus, Info } from 'lucide-react';

interface ParsedRoll {
  rollNumber: string;
  meters: number;
  lot: string;
  partida: string;
  tono: string;
  width: string;
  weight: string;
  isValid: boolean;
  error?: string;
}

interface InventoryExcelPasteParserProps {
  provider: Provider | null;
  article: Article | null;
  existingInventory: RollItem[];
  onImportComplete: (newRolls: Omit<RollItem, 'id'>[]) => Promise<void>;
  onCancel: () => void;
}

export default function InventoryExcelPasteParser({
  provider,
  article,
  existingInventory,
  onImportComplete,
  onCancel,
}: InventoryExcelPasteParserProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRoll[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Parse pasted text and extract columns
  const handleParse = () => {
    setGlobalError(null);
    setSuccessCount(null);
    const trimmedText = pasteText.trim();
    if (!trimmedText) {
      setGlobalError('Por favor pega contenido copiado de Excel primero.');
      return;
    }

    try {
      const res = resolveColumnsForText(trimmedText, provider);
      const dataLines = res.lines.slice(res.startLineIndex);
      
      if (dataLines.length === 0) {
        setGlobalError('No se detectaron filas de datos en el texto pegado.');
        return;
      }

      const tempRows: ParsedRoll[] = [];

      dataLines.forEach((line) => {
        const cols = res.splitIntoColumns(line);
        if (cols.length === 0) return;

        // Extract roll number
        let rollNumber = '';
        if (res.rollColIdx !== -1 && cols[res.rollColIdx]) {
          rollNumber = cols[res.rollColIdx].trim();
        }

        // Extract meters
        let metersVal = 0;
        if (res.metersColIdx !== -1 && cols[res.metersColIdx]) {
          const parsedM = parseSanitizedNumeric(cols[res.metersColIdx]);
          if (parsedM !== null && parsedM > 0) {
            metersVal = parsedM;
          }
        }

        // Extract lote
        let lotVal = '';
        if (res.lotColIdx !== -1 && cols[res.lotColIdx]) {
          lotVal = cols[res.lotColIdx].trim();
        }

        // Extract partida
        let partidaVal = '';
        if (res.partidaColIdx !== -1 && cols[res.partidaColIdx]) {
          partidaVal = cols[res.partidaColIdx].trim();
        }

        // Extract tono
        let tonoVal = '';
        if (res.tonoColIdx !== -1 && cols[res.tonoColIdx]) {
          tonoVal = cols[res.tonoColIdx].trim();
        }

        // Extract width
        let widthVal = '';
        if (res.widthColIdx !== -1 && cols[res.widthColIdx]) {
          const parsedW = parseSanitizedNumeric(cols[res.widthColIdx]);
          widthVal = parsedW !== null ? String(parsedW) : cols[res.widthColIdx].replace(/m|mts|mt|cm/i, '').trim();
        }

        // Extract weight
        let weightVal = '';
        if (res.weightColIdx !== -1 && cols[res.weightColIdx]) {
          const parsedKg = parseSanitizedNumeric(cols[res.weightColIdx]);
          weightVal = parsedKg !== null ? String(parsedKg) : cols[res.weightColIdx].replace(/kg|kgs|kilos|kilo/i, '').trim();
        }

        tempRows.push({
          rollNumber,
          meters: metersVal,
          lot: lotVal,
          partida: partidaVal,
          tono: tonoVal,
          width: widthVal,
          weight: weightVal,
          isValid: true,
        });
      });

      // Perform validation and update rows state
      validateRows(tempRows);
      setPasteText(''); // Clear paste input once parsed successfully
    } catch (err: any) {
      setGlobalError(`Error al procesar el pegado: ${err.message || err}`);
    }
  };

  // Validate all rows for duplicates and empty values
  const validateRows = (rowsToValidate: ParsedRoll[]) => {
    const checkedRows = rowsToValidate.map((row, idx) => {
      let isValid = true;
      let error = '';

      // Meters check
      if (row.meters < 10.00) {
        isValid = false;
        error = 'Metraje debe ser de al menos 10.00 m.';
      }

      // Roll Number check (required unless auto-generated)
      const rollNoRequired = provider?.hasRollNo ?? true;
      if (rollNoRequired && !row.rollNumber.trim()) {
        isValid = false;
        error = 'Nº de rollo es obligatorio.';
      }

      if (rollNoRequired && row.rollNumber.trim()) {
        const normalizedRollNo = row.rollNumber.trim().toLowerCase();

        // 1. Check duplicate against existing inventory
        const existsInDb = existingInventory.some(
          (item) => item.rollNumber.toLowerCase() === normalizedRollNo
        );
        if (existsInDb) {
          isValid = false;
          error = `Nº de rollo ya existe en el inventario.`;
        }

        // 2. Check duplicate against other parsed rows in the list
        const dupIndex = rowsToValidate.findIndex(
          (r, rIdx) =>
            rIdx !== idx &&
            r.rollNumber.trim().toLowerCase() === normalizedRollNo
        );
        if (dupIndex !== -1) {
          isValid = false;
          error = `Nº de rollo repetido en fila ${dupIndex + 1}.`;
        }
      }

      return {
        ...row,
        isValid,
        error,
      };
    });

    setParsedRows(checkedRows);
  };

  // Trigger validate whenever parsed rows change
  const handleFieldChange = (index: number, field: keyof ParsedRoll, value: any) => {
    const updated = [...parsedRows];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    validateRows(updated);
  };

  const handleRemoveRow = (index: number) => {
    const updated = parsedRows.filter((_, i) => i !== index);
    validateRows(updated);
  };

  const handleClear = () => {
    setParsedRows([]);
    setPasteText('');
    setGlobalError(null);
    setSuccessCount(null);
  };

  const handleConfirmImport = async () => {
    if (!provider || !article) {
      setGlobalError('Falta seleccionar Proveedor o Artículo.');
      return;
    }

    const hasInvalid = parsedRows.some((r) => !r.isValid);
    if (hasInvalid) {
      setGlobalError('Por favor corrija todos los errores antes de importar.');
      return;
    }

    if (parsedRows.length === 0) {
      setGlobalError('No hay filas para importar.');
      return;
    }

    setIsImporting(true);
    setGlobalError(null);

    try {
      const formattedRolls: Omit<RollItem, 'id'>[] = parsedRows.map((r) => {
        const finalRollNo = r.rollNumber.trim() || `R-AUTO-${Math.floor(1000 + Math.random() * 9000)}`;
        return {
          rollNumber: finalRollNo,
          articleId: article.id,
          providerId: provider.id,
          initialMeters: Number(r.meters),
          currentMeters: Number(r.meters),
          lot: provider.hasLot ? r.lot.trim() : '',
          partida: provider.hasPartida ? r.partida.trim() : '',
          tono: provider.hasTono ? r.tono.trim() : '',
          width: provider.hasWidth ? r.width.trim() : '',
          weight: provider.hasWeight ? r.weight.trim() : '',
          status: 'available',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          appVersion: '2.6r',
        };
      });

      await onImportComplete(formattedRolls);
      setSuccessCount(formattedRolls.length);
      setParsedRows([]);
    } catch (err: any) {
      setGlobalError(`Error al guardar en el servidor: ${err.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  const hasAnyErrors = parsedRows.some((r) => !r.isValid);

  return (
    <div className="space-y-4">
      {/* Instructions header */}
      <div className="bg-app-bg border border-app-border rounded-lg p-3.5 text-xs text-app-text/75 space-y-1.5 leading-relaxed">
        <p className="font-bold text-app-text flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
          <Info size={14} className="text-app-primary" />
          Instrucciones para Carga Masiva
        </p>
        <p>
          Copie las columnas desde Excel y péguelas en el cuadro inferior. El sistema intentará detectar automáticamente:{' '}
          <span className="font-bold text-app-text">Nº de Rollo</span>,{' '}
          <span className="font-bold text-app-text">Metraje</span> y el resto de los campos habilitados por el proveedor ({' '}
          {provider?.hasLot && 'Lote, '}{' '}
          {provider?.hasPartida && 'Partida, '}{' '}
          {provider?.hasTono && 'Tono, '}{' '}
          {provider?.hasWidth && 'Ancho, '}{' '}
          {provider?.hasWeight && 'Peso'}{' '}
          ).
        </p>
        <p className="text-[10px] text-app-text/50">
          Nota: Puede revisar y editar cada valor en la tabla de vista previa antes de guardar.
        </p>
      </div>

      {globalError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-400 rounded text-xs font-medium flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-600" />
          <span>{globalError}</span>
        </div>
      )}

      {successCount !== null && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-400 rounded text-xs font-medium flex items-start gap-2 animate-fadeIn">
          <CheckCircle size={15} className="shrink-0 mt-0.5 text-emerald-600" />
          <span>¡Se importaron con éxito <strong>{successCount}</strong> rollos al inventario!</span>
        </div>
      )}

      {/* Excel input textarea if list is empty */}
      {parsedRows.length === 0 ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">
              Pegar Bloque de Datos de Excel *
            </label>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Pegue aquí las columnas copiadas de Excel (Ej. Rollo | Metraje | Lote | Tono...)"
              className="w-full px-3 py-2 border border-app-border rounded-lg text-xs font-mono font-bold text-app-text bg-app-surface focus:ring-1 focus:ring-app-primary placeholder:font-sans placeholder:font-normal placeholder:text-app-text/40"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-app-border hover:bg-app-bg rounded text-xs font-bold text-app-text transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleParse}
              className="px-5 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5 uppercase tracking-wider"
            >
              <Clipboard size={14} />
              Procesar y Previsualizar
            </button>
          </div>
        </div>
      ) : (
        /* Editable Preview List */
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-app-surface border border-app-border p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-app-secondary animate-pulse" />
              <span className="text-xs font-bold text-app-text uppercase tracking-wide">
                Vista Previa Editable ({parsedRows.length} fila(s) detectadas)
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 border border-app-border hover:bg-app-bg text-app-text rounded text-[11px] font-bold transition cursor-pointer"
              >
                Limpiar todo / Volver a pegar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-app-border rounded-lg shadow-2xs max-h-[400px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-app-bg text-app-text/60 border-b border-app-border text-[10px] font-extrabold uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3 w-12 text-center">Fila</th>
                  {provider?.hasRollNo !== false && <th className="p-3 min-w-[120px]">Nº Rollo *</th>}
                  <th className="p-3 min-w-[100px]">Metraje *</th>
                  {provider?.hasLot && <th className="p-3 min-w-[100px]">Lote</th>}
                  {provider?.hasPartida && <th className="p-3 min-w-[100px]">Partida</th>}
                  {provider?.hasTono && <th className="p-3 min-w-[100px]">Tono</th>}
                  {provider?.hasWidth && <th className="p-3 min-w-[80px]">Ancho (m)</th>}
                  {provider?.hasWeight && <th className="p-3 min-w-[80px]">Peso (kg)</th>}
                  <th className="p-3 w-16 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border/40 text-xs">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-app-bg/10 transition ${
                      !row.isValid ? 'bg-red-500/5 dark:bg-red-500/10' : ''
                    }`}
                  >
                    <td className="p-3 text-center font-mono text-app-text/50 font-bold">
                      {idx + 1}
                    </td>

                    {/* Roll Number Input */}
                    {provider?.hasRollNo !== false && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.rollNumber}
                          onChange={(e) =>
                            handleFieldChange(idx, 'rollNumber', e.target.value)
                          }
                          className={`w-full px-2 py-1 border rounded text-xs font-mono font-bold bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary ${
                            !row.isValid && row.error?.includes('rollo')
                              ? 'border-red-500 ring-1 ring-red-500'
                              : 'border-app-border'
                          }`}
                        />
                      </td>
                    )}

                    {/* Meters Input */}
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.meters || ''}
                        onChange={(e) =>
                          handleFieldChange(idx, 'meters', parseFloat(e.target.value) || 0)
                        }
                        className={`w-full px-2 py-1 border rounded text-xs font-mono font-bold bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary ${
                          !row.isValid && row.error?.includes('Metraje')
                            ? 'border-red-500 ring-1 ring-red-500'
                            : 'border-app-border'
                        }`}
                      />
                    </td>

                    {/* Lot Input */}
                    {provider?.hasLot && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.lot}
                          onChange={(e) =>
                            handleFieldChange(idx, 'lot', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-app-border rounded text-xs font-mono bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                        />
                      </td>
                    )}

                    {/* Partida Input */}
                    {provider?.hasPartida && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.partida}
                          onChange={(e) =>
                            handleFieldChange(idx, 'partida', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-app-border rounded text-xs font-mono bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                        />
                      </td>
                    )}

                    {/* Tono Input */}
                    {provider?.hasTono && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.tono}
                          onChange={(e) =>
                            handleFieldChange(idx, 'tono', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-app-border rounded text-xs font-mono bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                        />
                      </td>
                    )}

                    {/* Width Input */}
                    {provider?.hasWidth && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.width}
                          onChange={(e) =>
                            handleFieldChange(idx, 'width', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-app-border rounded text-xs font-mono bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                        />
                      </td>
                    )}

                    {/* Weight Input */}
                    {provider?.hasWeight && (
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.weight}
                          onChange={(e) =>
                            handleFieldChange(idx, 'weight', e.target.value)
                          }
                          className="w-full px-2 py-1 border border-app-border rounded text-xs font-mono bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                        />
                      </td>
                    )}

                    {/* Delete action / Error validation summary */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {!row.isValid && (
                          <div
                            className="text-red-500 hover:text-red-600 transition cursor-help relative group"
                            title={row.error}
                          >
                            <AlertTriangle size={15} />
                            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 hidden group-hover:block bg-red-600 dark:bg-red-950/90 text-white dark:text-red-300 text-[10px] font-bold p-2 rounded shadow-lg whitespace-nowrap z-50">
                              {row.error}
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="text-app-text/40 hover:text-red-500 transition p-1 hover:bg-app-bg rounded cursor-pointer"
                          title="Eliminar fila"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center gap-4">
            <span className="text-[11px] text-app-text/50">
              {hasAnyErrors ? (
                <span className="text-red-500 font-bold flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Corrija los errores marcados para habilitar el guardado.
                </span>
              ) : (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle size={12} />
                  Todos los datos están validados y listos para importar.
                </span>
              )}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 border border-app-border hover:bg-app-bg text-app-text rounded text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={hasAnyErrors || isImporting}
                onClick={handleConfirmImport}
                className="px-5 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs transition cursor-pointer shadow-xs disabled:opacity-50 uppercase tracking-wider flex items-center gap-1.5"
              >
                {isImporting ? 'Guardando...' : 'Confirmar e Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
