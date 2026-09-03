import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Printer, Tag, QrCode, Barcode, CheckSquare, Square, 
  Settings2, Copy, Eye, ZoomIn, ZoomOut, RotateCcw, AlertCircle, 
  Layers, Check
} from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export interface PrintableRollLabel {
  id: string;
  rollNumber: string;
  articleId?: string;
  articleName?: string;
  articleCode?: string;
  providerId?: string;
  providerName?: string;
  meters: number;
  initialMeters?: number;
  unit?: string;
  lot?: string;
  partida?: string;
  tono?: string;
  width?: string;
  weight?: string;
  createdAt?: string;
}

export type LabelFormat = 
  | 'thermal-100x50' 
  | 'thermal-80x50' 
  | 'thermal-50x30' 
  | 'thermal-100x150' 
  | 'a4-stickers-2x4' 
  | 'a4-stickers-3x7';

export type CodeDisplayMode = 'both' | 'qr-only' | 'barcode-only';

export interface PrintRollLabelsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  rolls: PrintableRollLabel[];
  title?: string;
  defaultFormat?: LabelFormat;
}

export default function PrintRollLabelsModal({
  isOpen = true,
  onClose,
  rolls,
  title = 'Imprimir Etiquetas de Rollos',
  defaultFormat = 'thermal-100x50'
}: PrintRollLabelsModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<LabelFormat>(defaultFormat);
  const [codeMode, setCodeMode] = useState<CodeDisplayMode>('both');
  const [copiesPerRoll, setCopiesPerRoll] = useState<number>(1);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set(rolls.map(r => r.id)));
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [includeJuditexLogo, setIncludeJuditexLogo] = useState<boolean>(true);
  const [includeWarningNote, setIncludeWarningNote] = useState<boolean>(true);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const barcodeRefs = useRef<Record<string, SVGSVGElement | null>>({});

  // Sync selectedRollIds whenever rolls change
  useEffect(() => {
    if (rolls.length > 0) {
      setSelectedRollIds(new Set(rolls.map(r => r.id)));
    }
  }, [rolls]);

  // Generate QR Codes data URLs
  useEffect(() => {
    if (!isOpen || rolls.length === 0) return;

    const generateQRs = async () => {
      const qrs: Record<string, string> = {};
      for (const roll of rolls) {
        // Build a structured, high-density JSON payload compatible with our scanner
        const payload = JSON.stringify({
          rollNumber: roll.rollNumber,
          meters: roll.meters,
          lot: roll.lot || undefined,
          partida: roll.partida || undefined,
          tono: roll.tono || undefined,
          article: roll.articleName || undefined
        });

        try {
          const dataUrl = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 160,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          qrs[roll.id] = dataUrl;
        } catch (err) {
          console.error(`Error generating QR for roll ${roll.rollNumber}:`, err);
        }
      }
      setQrCodes(qrs);
    };

    generateQRs();
  }, [isOpen, rolls]);

  // Render Barcodes after DOM updates
  useEffect(() => {
    if (!isOpen || codeMode === 'qr-only') return;

    // Small delay to ensure SVGs are mounted in DOM
    const timeout = setTimeout(() => {
      rolls.forEach((roll) => {
        // Render for each copy
        for (let copyIdx = 0; copyIdx < copiesPerRoll; copyIdx++) {
          const key = `${roll.id}_copy_${copyIdx}`;
          const svgEl = barcodeRefs.current[key];
          if (svgEl && roll.rollNumber) {
            try {
              JsBarcode(svgEl, roll.rollNumber.trim().toUpperCase(), {
                format: 'CODE128',
                width: selectedFormat === 'thermal-50x30' ? 1.2 : 1.6,
                height: selectedFormat === 'thermal-50x30' ? 24 : 32,
                displayValue: false, // Text is displayed cleanly in HTML
                margin: 0,
                lineColor: '#000000'
              });
            } catch (err) {
              console.warn(`JsBarcode rendering failed for ${roll.rollNumber}:`, err);
            }
          }
        }
      });
    }, 100);

    return () => clearTimeout(timeout);
  }, [isOpen, rolls, codeMode, copiesPerRoll, selectedFormat, selectedRollIds, qrCodes]);

  if (!isOpen) return null;

  const filteredRolls = rolls.filter(r => selectedRollIds.has(r.id));
  const totalLabelsToPrint = filteredRolls.length * copiesPerRoll;

  const handleToggleRoll = (id: string) => {
    setSelectedRollIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedRollIds.size === rolls.length) {
      setSelectedRollIds(new Set());
    } else {
      setSelectedRollIds(new Set(rolls.map(r => r.id)));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div 
      id="print-roll-labels-root"
      className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible print:static"
    >
      {/* Print Specific CSS according to selected format */}
      <style>{`
        @media print {
          @page {
            ${
              selectedFormat === 'thermal-100x50'
                ? 'size: 100mm 50mm; margin: 0;'
                : selectedFormat === 'thermal-80x50'
                ? 'size: 80mm 50mm; margin: 0;'
                : selectedFormat === 'thermal-50x30'
                ? 'size: 50mm 30mm; margin: 0;'
                : selectedFormat === 'thermal-100x150'
                ? 'size: 100mm 150mm; margin: 0;'
                : 'size: A4 portrait; margin: 5mm;'
            }
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #print-roll-labels-root,
          #print-roll-labels-root * {
            visibility: visible;
          }
          #print-roll-labels-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print,
          .print\\:hidden {
            display: none !important;
          }
          .roll-label-thermal-item {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .roll-label-thermal-item:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .roll-labels-a4-grid {
            display: grid !important;
            ${
              selectedFormat === 'a4-stickers-2x4'
                ? 'grid-template-columns: repeat(2, 1fr) !important; gap: 4mm !important;'
                : 'grid-template-columns: repeat(3, 1fr) !important; gap: 2.5mm !important;'
            }
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* Screen Controls Header (Hidden on Print) */}
      <div className="w-full max-w-5xl bg-app-surface text-app-text border border-app-border rounded-t-xl p-3 sm:p-4 shadow-xl no-print print:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 border-b border-app-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary shrink-0">
              <Tag size={19} />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-app-text tracking-tight flex items-center gap-2">
                <span>{title}</span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-app-primary/10 text-app-primary border border-app-primary/20">
                  {totalLabelsToPrint} {totalLabelsToPrint === 1 ? 'etiqueta' : 'etiquetas'}
                </span>
              </h2>
              <p className="text-xs text-app-text/60">
                Generador de etiquetas adhesivas térmicas y QR para rollos de tela
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredRolls.length === 0}
              className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
              id="btn-print-labels"
            >
              <Printer size={15} />
              <span>Imprimir Etiquetas</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-app-bg text-app-text/60 hover:text-app-text rounded-lg transition cursor-pointer border border-app-border"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs bg-app-bg p-2.5 rounded-lg border border-app-border">
          {/* Format Selector */}
          <div className="flex flex-col gap-1">
            <label className="font-bold text-[10px] uppercase tracking-wider text-app-text/60 flex items-center gap-1">
              <Settings2 size={12} />
              <span>Formato de Papel</span>
            </label>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value as LabelFormat)}
              className="bg-app-surface border border-app-border rounded-md px-2.5 py-1.5 font-medium text-app-text cursor-pointer focus:ring-1 focus:ring-app-primary"
            >
              <option value="thermal-100x50">Térmica 100 x 50 mm (Estándar)</option>
              <option value="thermal-80x50">Térmica 80 x 50 mm</option>
              <option value="thermal-50x30">Térmica 50 x 30 mm (Compacta)</option>
              <option value="thermal-100x150">Térmica 100 x 150 mm (4x6" Bulto)</option>
              <option value="a4-stickers-2x4">Hoja A4 (8 etiquetas - 2x4)</option>
              <option value="a4-stickers-3x7">Hoja A4 (21 etiquetas - 3x7)</option>
            </select>
          </div>

          {/* Code Mode Selector */}
          <div className="flex flex-col gap-1">
            <label className="font-bold text-[10px] uppercase tracking-wider text-app-text/60 flex items-center gap-1">
              <QrCode size={12} />
              <span>Códigos a Incluir</span>
            </label>
            <select
              value={codeMode}
              onChange={(e) => setCodeMode(e.target.value as CodeDisplayMode)}
              className="bg-app-surface border border-app-border rounded-md px-2.5 py-1.5 font-medium text-app-text cursor-pointer focus:ring-1 focus:ring-app-primary"
            >
              <option value="both">QR + Código de Barras (128)</option>
              <option value="qr-only">Solo Código QR (con datos)</option>
              <option value="barcode-only">Solo Código de Barras</option>
            </select>
          </div>

          {/* Copies Per Roll */}
          <div className="flex flex-col gap-1">
            <label className="font-bold text-[10px] uppercase tracking-wider text-app-text/60 flex items-center gap-1">
              <Copy size={12} />
              <span>Copias por Rollo</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCopiesPerRoll(num)}
                  className={`flex-1 py-1.5 rounded-md font-bold text-xs transition cursor-pointer border ${
                    copiesPerRoll === num
                      ? 'bg-app-primary text-white border-app-primary shadow-2xs'
                      : 'bg-app-surface text-app-text/70 border-app-border hover:bg-app-border/40'
                  }`}
                >
                  {num}x
                </button>
              ))}
            </div>
          </div>

          {/* Additional Options */}
          <div className="flex flex-col justify-center gap-1.5 px-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-app-text/80 font-medium">
              <input
                type="checkbox"
                checked={includeJuditexLogo}
                onChange={(e) => setIncludeJuditexLogo(e.target.checked)}
                className="rounded border-app-border text-app-primary focus:ring-app-primary"
              />
              <span>Incluir Logo JUDITEX</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-app-text/80 font-medium">
              <input
                type="checkbox"
                checked={includeWarningNote}
                onChange={(e) => setIncludeWarningNote(e.target.checked)}
                className="rounded border-app-border text-app-primary focus:ring-app-primary"
              />
              <span>Nota de advertencia</span>
            </label>
          </div>
        </div>

        {/* Roll Selection Bar (Collapsible / Multi-select) */}
        {rolls.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-app-border/50 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 bg-app-bg hover:bg-app-border/50 border border-app-border rounded text-[11px] font-bold text-app-text transition cursor-pointer flex items-center gap-1.5"
              >
                {selectedRollIds.size === rolls.length ? <CheckSquare size={13} /> : <Square size={13} />}
                <span>{selectedRollIds.size === rolls.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}</span>
              </button>
              <span className="text-app-text/60 text-[11px]">
                {selectedRollIds.size} de {rolls.length} rollos seleccionados
              </span>
            </div>

            {/* Quick Roll Pill Toggles */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1">
              {rolls.slice(0, 15).map(r => {
                const isSelected = selectedRollIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleToggleRoll(r.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer border whitespace-nowrap ${
                      isSelected
                        ? 'bg-app-primary/15 text-app-primary border-app-primary/30'
                        : 'bg-app-bg text-app-text/40 border-app-border line-through'
                    }`}
                  >
                    {r.rollNumber}
                  </button>
                );
              })}
              {rolls.length > 15 && (
                <span className="text-[10px] text-app-text/50 font-mono">+{rolls.length - 15} más</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Printable Sheet Viewport / Preview */}
      <div className="w-full max-w-5xl bg-slate-900/40 p-4 sm:p-6 flex justify-center rounded-b-xl no-print:shadow-2xl print:p-0 print:bg-transparent print:w-full overflow-x-auto">
        {filteredRolls.length === 0 ? (
          <div className="bg-white p-8 rounded-xl text-center text-gray-500 shadow-md flex flex-col items-center gap-2">
            <AlertCircle size={28} className="text-amber-500" />
            <p className="font-bold text-sm text-gray-800">No hay rollos seleccionados para imprimir</p>
            <p className="text-xs">Selecciona al menos un rollo en los controles superiores.</p>
          </div>
        ) : (
          <div 
            id="roll-labels-printable-container"
            className={`w-full flex flex-col items-center gap-4 print:gap-0 print:w-full ${
              selectedFormat.startsWith('a4') ? 'roll-labels-a4-grid print:roll-labels-a4-grid max-w-[210mm]' : ''
            }`}
          >
            {filteredRolls.flatMap((roll) => {
              const copies = [];
              for (let copyIdx = 0; copyIdx < copiesPerRoll; copyIdx++) {
                const key = `${roll.id}_copy_${copyIdx}`;
                copies.push(
                  <div
                    key={key}
                    className={`roll-label-thermal-item bg-white text-black border-2 border-black font-sans shadow-md print:shadow-none print:border-2 print:border-black flex flex-col justify-between ${
                      selectedFormat === 'thermal-100x50'
                        ? 'w-[100mm] h-[50mm] min-w-[100mm] min-h-[50mm] max-w-[100mm] max-h-[50mm] p-2.5'
                        : selectedFormat === 'thermal-80x50'
                        ? 'w-[80mm] h-[50mm] min-w-[80mm] min-h-[50mm] max-w-[80mm] max-h-[50mm] p-2'
                        : selectedFormat === 'thermal-50x30'
                        ? 'w-[50mm] h-[30mm] min-w-[50mm] min-h-[30mm] max-w-[50mm] max-h-[30mm] p-1.5'
                        : selectedFormat === 'thermal-100x150'
                        ? 'w-[100mm] h-[150mm] min-w-[100mm] min-h-[150mm] max-w-[100mm] max-h-[150mm] p-4'
                        : selectedFormat === 'a4-stickers-2x4'
                        ? 'w-full h-[68mm] min-h-[68mm] max-h-[68mm] p-2.5'
                        : 'w-full h-[38mm] min-h-[38mm] max-h-[38mm] p-1.5'
                    }`}
                    style={{ backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                  >
                    {/* Header: Brand & Article Name */}
                    <div className="flex items-center justify-between gap-1 border-b border-black/80 pb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {includeJuditexLogo && (
                          <img 
                            src="/logo-juditex.png" 
                            alt="JUDITEX" 
                            className={`${selectedFormat === 'thermal-50x30' ? 'h-3.5 max-h-[14px]' : 'h-5 max-h-[20px]'} w-auto object-contain shrink-0`}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <span className="font-extrabold text-[10px] sm:text-[11px] uppercase tracking-tight text-black truncate leading-tight">
                          {roll.articleName || 'TEXTIL / ROLLO'}
                        </span>
                      </div>
                      {roll.articleCode && (
                        <span className="text-[9px] font-mono font-bold bg-black text-white px-1.5 py-0.2 rounded-xs shrink-0">
                          {roll.articleCode}
                        </span>
                      )}
                    </div>

                    {/* Middle Section: Big Roll Number + Meters + Specs + Codes */}
                    <div className="flex items-center justify-between gap-2 flex-1 my-1">
                      {/* Left Block: Roll Number & Specs */}
                      <div className="flex flex-col justify-between flex-1 min-w-0 h-full">
                        {/* Big Highlighted Roll Number */}
                        <div className="bg-black text-white px-2 py-0.5 rounded-none flex items-center justify-between">
                          <span className="text-[9px] uppercase font-black tracking-wider text-gray-200">
                            ROLLO Nº:
                          </span>
                          <span className="text-sm sm:text-base font-black font-mono tracking-tight text-white">
                            {roll.rollNumber}
                          </span>
                        </div>

                        {/* Metraje Display */}
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-[10px] uppercase font-black text-gray-700">CANTIDAD:</span>
                          <span className="text-base sm:text-lg font-black font-mono tracking-tight text-black">
                            {roll.meters.toFixed(2)}
                          </span>
                          <span className="text-xs font-bold text-gray-800 uppercase">
                            {roll.unit || 'METROS'}
                          </span>
                        </div>

                        {/* Attributes Grid (Lote, Partida, Color/Tono, Ancho, Peso) */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] leading-tight font-medium text-black">
                          {roll.lot && (
                            <div className="truncate">
                              <strong className="font-black text-gray-700">LOTE:</strong> <span className="font-mono font-bold">{roll.lot}</span>
                            </div>
                          )}
                          {roll.partida && (
                            <div className="truncate">
                              <strong className="font-black text-gray-700">PARTIDA:</strong> <span className="font-mono font-bold">{roll.partida}</span>
                            </div>
                          )}
                          {roll.tono && (
                            <div className="truncate col-span-2">
                              <strong className="font-black text-gray-700">COLOR/TONO:</strong> <span className="font-bold">{roll.tono}</span>
                            </div>
                          )}
                          {roll.width && (
                            <div className="truncate">
                              <strong className="font-black text-gray-700">ANCHO:</strong> <span>{roll.width}</span>
                            </div>
                          )}
                          {roll.weight && (
                            <div className="truncate">
                              <strong className="font-black text-gray-700">PESO:</strong> <span>{roll.weight}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Block: QR Code and / or Barcode */}
                      <div className="flex flex-col items-center justify-center shrink-0 gap-1 pl-1">
                        {(codeMode === 'both' || codeMode === 'qr-only') && qrCodes[roll.id] && (
                          <div className="border border-black p-0.5 bg-white flex flex-col items-center">
                            <img
                              src={qrCodes[roll.id]}
                              alt={`QR ${roll.rollNumber}`}
                              className={`${
                                selectedFormat === 'thermal-50x30'
                                  ? 'w-10 h-10'
                                  : selectedFormat === 'thermal-100x150'
                                  ? 'w-24 h-24'
                                  : 'w-14 h-14'
                              } object-contain`}
                            />
                            <span className="text-[7px] font-mono font-bold uppercase tracking-tighter text-black">
                              SCAN JUDITEX
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Bar: Barcode (Code 128) + Footer warning */}
                    <div className="border-t border-black/80 pt-0.5 flex flex-col items-center">
                      {(codeMode === 'both' || codeMode === 'barcode-only') && (
                        <div className="w-full flex flex-col items-center justify-center my-0.5 overflow-hidden">
                          <svg
                            ref={(el) => {
                              barcodeRefs.current[key] = el;
                            }}
                            className="max-h-[26px] w-full max-w-[200px]"
                          />
                          <span className="text-[8px] font-mono font-bold tracking-widest text-black uppercase -mt-0.5">
                            *{roll.rollNumber}*
                          </span>
                        </div>
                      )}

                      {includeWarningNote && selectedFormat !== 'thermal-50x30' && (
                        <p className="text-[7.5px] font-bold text-center text-gray-800 uppercase tracking-tighter leading-none mt-0.5">
                          Revisar el rollo antes de cortar y conservar esta etiqueta
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              return copies;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
