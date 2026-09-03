import React, { useMemo, useState, useLayoutEffect, useRef } from 'react';
import { PackingList, PackingListItem, Client, Seller, Provider, Article } from '../types';
import { FileText, Printer, X, AlertTriangle, MessageCircle, Edit2, Tag } from 'lucide-react';
import PrintRollLabelsModal, { PrintableRollLabel } from './PrintRollLabelsModal';

export interface PrintableRow {
  type: 'header' | 'roll' | 'footer';
  articleId: string;
  articleName?: string;
  item?: PackingListItem;
  index?: number;
  articleTotalMeters?: number;
  articleTotalWeight?: number;
  groupLength?: number;
}

export const parseNumericWeight = (w?: string | number): number => {
  if (w === undefined || w === null) return 0;
  const clean = w.toString().replace(/kg|kgs|kilos|kilo/i, '').replace(/,/g, '.').trim();
  if (clean === '-' || clean === '') return 0;
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// Fallback synchronous block calculation for initial render / SSR
export function getInitialFlatRows(groupedItems: Record<string, PackingListItem[]>, getArticleName: (id: string) => string): PrintableRow[] {
  const flatItems: PrintableRow[] = [];
  Object.keys(groupedItems).forEach(articleId => {
    const groupItems = groupedItems[articleId];
    const articleName = getArticleName(articleId);
    const articleTotalMeters = groupItems.reduce((acc, item) => acc + Number(item.meters || 0), 0);
    const articleTotalWeight = groupItems.reduce((acc, item) => acc + parseNumericWeight(item.weight), 0);
    
    flatItems.push({
      type: 'header',
      articleId,
      articleName
    });
    
    groupItems.forEach((item, idx) => {
      flatItems.push({
        type: 'roll',
        articleId,
        item,
        index: idx
      });
    });
    
    flatItems.push({
      type: 'footer',
      articleId,
      articleName,
      articleTotalMeters,
      articleTotalWeight,
      groupLength: groupItems.length
    });
  });
  return flatItems;
}

export function getPaginatedBlocks(
  groupedItems: Record<string, PackingListItem[]>, 
  getArticleName: (id: string) => string,
  isCompact: boolean = true
): PrintableRow[][] {
  const flatItems = getInitialFlatRows(groupedItems, getArticleName);
  const totalRolls = flatItems.filter(r => r.type === 'roll').length;

  // If rolls <= 33 or isCompact and rolls <= 34, fit 100% into 1 single page!
  if (totalRolls <= 33 || (isCompact && totalRolls <= 34)) {
    return [flatItems];
  }

  const ROWS_PER_PAGE = isCompact ? 28 : 24;
  const blocks: PrintableRow[][] = [];
  let currentBlock: PrintableRow[] = [];
  let currentRollsInBlock = 0;

  for (let i = 0; i < flatItems.length; i++) {
    const row = flatItems[i];
    if (row.type === 'roll') {
      if (currentRollsInBlock >= ROWS_PER_PAGE) {
        blocks.push(currentBlock);
        currentBlock = [];
        currentRollsInBlock = 0;
      }
      currentBlock.push(row);
      currentRollsInBlock++;
    } else if (row.type === 'header') {
      if (currentRollsInBlock >= ROWS_PER_PAGE) {
        blocks.push(currentBlock);
        currentBlock = [];
        currentRollsInBlock = 0;
      }
      currentBlock.push(row);
    } else if (row.type === 'footer') {
      currentBlock.push(row);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // Anti-orphan rule: Last page MUST have at least 3 rolls
  if (blocks.length > 1) {
    const lastBlock = blocks[blocks.length - 1];
    const lastRollCount = lastBlock.filter(r => r.type === 'roll').length;
    if (lastRollCount < 3) {
      if (totalRolls <= 35) {
        // Fits into 1 page!
        return [flatItems];
      }
      const prevBlock = blocks[blocks.length - 2];
      while (lastBlock.filter(r => r.type === 'roll').length < 3 && prevBlock.filter(r => r.type === 'roll').length > 3) {
        let lastIdx = -1;
        for (let j = prevBlock.length - 1; j >= 0; j--) {
          if (prevBlock[j].type === 'roll') { lastIdx = j; break; }
        }
        if (lastIdx !== -1) {
          const r = prevBlock.splice(lastIdx, 1)[0];
          lastBlock.unshift(r);
        } else {
          break;
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : [[]];
}

interface PrintPackingListProps {
  packingList: PackingList;
  clients: Client[];
  sellers: Seller[];
  providers: Provider[];
  articles: Article[];
  onClose: () => void;
  onEdit?: (pl: PackingList) => void;
}

export default function PrintPackingList({
  packingList,
  clients,
  sellers,
  providers,
  articles,
  onClose,
  onEdit
}: PrintPackingListProps) {
  
  const client = clients.find(c => c.id === packingList.clientId);
  const seller = sellers.find(s => s.id === packingList.sellerId);

  const getArticleName = (id: string) => articles.find(a => a.id === id)?.name || 'Artículo Eliminado';

  const totalMeters = packingList.items.reduce((acc, item) => acc + Number(item.meters || 0), 0);
  const totalRolls = packingList.items.length;
  const totalWeight = packingList.items.reduce((acc, item) => acc + parseNumericWeight(item.weight), 0);

  const firstItemProviderId = packingList.items[0]?.providerId;
  const activeProvider = providers.find(p => p.id === firstItemProviderId) || null;
  const omitted = packingList.omittedFields || [];

  const showLot = (activeProvider ? activeProvider.hasLot : true) && !omitted.includes('lot');
  const showPartida = (activeProvider ? activeProvider.hasPartida : true) && !omitted.includes('partida');
  const hasRollNo = (activeProvider ? activeProvider.hasRollNo : false) && !omitted.includes('rollNo');
  const hasTono = (activeProvider ? !!activeProvider.hasTono : false) && !omitted.includes('tono');
  const hasWidth = (activeProvider ? !!activeProvider.hasWidth : false) && !omitted.includes('width');
  const hasWeight = (activeProvider ? !!activeProvider.hasWeight : false) && !omitted.includes('weight');

  const colSpanHeader = 2 
    + (showLot ? 1 : 0) 
    + (showPartida ? 1 : 0) 
    + (hasTono ? 1 : 0)
    + (hasWidth ? 1 : 0)
    + (hasWeight ? 1 : 0);

  const colSpanSummary = 1 
    + (showLot ? 1 : 0) 
    + (showPartida ? 1 : 0) 
    + (hasTono ? 1 : 0)
    + (hasWidth ? 1 : 0)
    + (hasWeight ? 1 : 0);

  // Active View Tab: 'packing_list' or 'guia_remision'
  const [activeView, setActiveView] = React.useState<'packing_list' | 'guia_remision'>('packing_list');
  const [showRollLabels, setShowRollLabels] = React.useState(false);

  // Guía de Remisión Electronic Fields (with highly-intelligent defaults)
  const [guiaSeries, setGuiaSeries] = React.useState('T001');
  const [guiaNumber, setGuiaNumber] = React.useState(() => {
    const digits = packingList.packingListNo.replace(/\D/g, '');
    return digits ? digits.slice(-8).padStart(8, '0') : '00000829';
  });
  
  const [fechaTraslado, setFechaTraslado] = React.useState(() => {
    if (packingList.date) {
      // If date is in format DD/MM/YYYY, convert to YYYY-MM-DD for date input
      const parts = packingList.date.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return new Date().toISOString().split('T')[0];
  });

  const [puntoPartida, setPuntoPartida] = React.useState('JR. IGNACIO COSSIO NRO. 1363 URB. AVENIDA MÉXICO LA VICTORIA LIMA LIMA');
  const [puntoLlegada, setPuntoLlegada] = React.useState(() => {
    return packingList.dispatchAddress || client?.address || '';
  });

  const [clientRuc, setClientRuc] = React.useState(() => {
    return client?.dni || '20512174389';
  });

  const [clientName, setClientName] = React.useState(() => {
    return client?.name || 'CORPORACION SEVEHER E.I.R.L.';
  });

  const [motivo, setMotivo] = React.useState('VENTA');
  const [pesoBruto, setPesoBruto] = React.useState(() => {
    if (totalWeight > 0) {
      return totalWeight.toFixed(3);
    }
    // Estimating standard weight per meter for denim (e.g. 0.45 kg/m)
    return (totalMeters * 0.45).toFixed(3);
  });

  const [unidadMedida, setUnidadMedida] = React.useState('KGM');
  const [driverName, setDriverName] = React.useState('SAYAS BERROCAL VICTORIO');
  const [driverLicense, setDriverLicense] = React.useState('R41670178');
  const [vehiclePlate, setVehiclePlate] = React.useState('APK771');
  const [observaciones, setObservaciones] = React.useState(() => {
    return packingList.notes || '';
  });

  const [despachadorName, setDespachadorName] = React.useState(() => {
    return packingList.signedBy?.name || 'Paul Almacén';
  });

  const [despachadorDni, setDespachadorDni] = React.useState(() => {
    return packingList.signedBy?.dni || '42536471';
  });

  // Calculate dynamic emission date/time
  const fechaHoraEmision = React.useMemo(() => {
    const today = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const d = today.getDate();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();
    const h = today.getHours();
    const min = today.getMinutes();
    const s = today.getSeconds();
    return `${pad(d)}/${pad(m)}/${y} ${pad(h)}:${pad(min)}:${pad(s)}`;
  }, []);

  // Format traslado date for display
  const formattedFechaTraslado = React.useMemo(() => {
    if (!fechaTraslado) return '';
    const parts = fechaTraslado.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return fechaTraslado;
  }, [fechaTraslado]);

  React.useEffect(() => {
    const originalTitle = document.title;
    const handleBeforePrint = () => {
      document.title = " ";
    };
    const handleAfterPrint = () => {
      document.title = originalTitle;
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = activeView === 'guia_remision'
      ? `Guia_Remision_${guiaSeries}_${guiaNumber}`
      : `Packing_List_${packingList.packingListNo}`;
    window.focus();
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  };

  const handleShareWhatsApp = () => {
    if (activeView === 'guia_remision') {
      const text = `Guía de Remisión Electrónica N° ${guiaSeries}-${guiaNumber}
Destinatario: ${clientName}
RUC: ${clientRuc}
Fecha Traslado: ${formattedFechaTraslado}
Punto de Llegada: ${puntoLlegada}
Peso Bruto: ${pesoBruto} ${unidadMedida}
Transportista: ${driverName}
Placa: ${vehiclePlate}
Total Metros: ${totalMeters.toFixed(2)} m`;

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      return;
    }

    const guideLine = packingList.guideNumber && packingList.guideNumber.trim() !== ''
      ? `Packing List Guía N°: ${packingList.guideNumber.trim()}`
      : 'Packing List';

    const clientNameOriginal = client?.name || 'Cliente Eliminado';

    const text = `${guideLine}
Cliente: ${clientNameOriginal}
Fecha: ${packingList.date}
Total Rollos: ${packingList.totalRollsOrCuts}${totalWeight > 0 ? `\nTotal Peso: ${totalWeight.toFixed(2)} kg` : ''}
Total Metros: ${totalMeters.toFixed(2)} m`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Group packing list items by Article ID for professional grouped layout
  const groupedItems = useMemo(() => {
    const groups: Record<string, PackingListItem[]> = {};
    packingList.items.forEach(item => {
      if (!groups[item.articleId]) {
        groups[item.articleId] = [];
      }
      groups[item.articleId].push(item);
    });
    return groups;
  }, [packingList.items]);

  const flatRows = useMemo(() => {
    return getInitialFlatRows(groupedItems, getArticleName);
  }, [groupedItems, articles]);

  // Page density state: 'auto' (smart compact <= 33), 'compact' (always compact single page if possible), 'normal' (standard font size)
  const [pageDensity, setPageDensity] = useState<'auto' | 'compact' | 'normal'>('auto');

  const isCompact = useMemo(() => {
    if (pageDensity === 'compact') return true;
    if (pageDensity === 'normal') return false;
    // 'auto' mode: if total rolls <= 33, automatically use compact mode to fit everything on 1 single page!
    return totalRolls <= 33;
  }, [pageDensity, totalRolls]);

  // Initial fallback blocks
  const initialBlocks = useMemo(() => {
    return getPaginatedBlocks(groupedItems, getArticleName, isCompact);
  }, [groupedItems, articles, isCompact]);

  const [measuredBlocks, setMeasuredBlocks] = useState<PrintableRow[][]>(initialBlocks);

  // Hidden measurement refs
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const measureHeaderRef = useRef<HTMLDivElement>(null);
  const measureRowsContainerRef = useRef<HTMLTableSectionElement>(null);
  const measureFooterBlockRef = useRef<HTMLDivElement>(null);

  // Layout-based measurement and dynamic splitting
  useLayoutEffect(() => {
    if (!measureContainerRef.current || !measureHeaderRef.current || !measureRowsContainerRef.current) {
      return;
    }

    try {
      // If isCompact and totalRolls <= 33 (e.g. 26 rolls), force 1 single page!
      if (isCompact && totalRolls <= 33) {
        setMeasuredBlocks([flatRows]);
        return;
      }

      // 1. Measure header height
      const headerHeight = measureHeaderRef.current.getBoundingClientRect().height;
      
      // 2. Measure table thead height
      const theadEl = measureContainerRef.current.querySelector('thead');
      const theadHeight = theadEl ? theadEl.getBoundingClientRect().height : (isCompact ? 22 : 26);

      // 3. Measure bottom footer block height (Grand Totals + Aviso Importante)
      const footerBlockHeight = measureFooterBlockRef.current 
        ? measureFooterBlockRef.current.getBoundingClientRect().height 
        : (isCompact ? 95 : 130);

      // 4. Measure each individual row height
      const rowElements = Array.from(measureRowsContainerRef.current.querySelectorAll('[data-row-index]')) as HTMLElement[];
      const rowHeights = rowElements.map(el => Math.max(el.getBoundingClientRect().height, isCompact ? 16 : 20));

      if (rowHeights.length !== flatRows.length) {
        setMeasuredBlocks(totalRolls <= 33 ? [flatRows] : getPaginatedBlocks(groupedItems, getArticleName, isCompact));
        return;
      }

      // Height of available page content in px at 96 DPI:
      // A4 is 297mm height. Padding is 12mm top + 12mm bottom = 24mm.
      // Net printable height = (297 - 24) * 3.779527559 = ~1031.8px.
      const PAGE_USABLE_HEIGHT = 995;
      
      // Full page capacity (for page 1..N-1 that do NOT have the bottom Aviso):
      const fullPageContentHeight = PAGE_USABLE_HEIGHT - headerHeight - theadHeight;
      // Last page capacity (which MUST accommodate Totales + Aviso Importante at the bottom):
      const lastPageContentHeight = fullPageContentHeight - footerBlockHeight;

      // First check: does EVERYTHING fit in a SINGLE page including the Aviso Importante?
      let totalAllRowsHeight = 0;
      rowHeights.forEach(h => { totalAllRowsHeight += h; });

      if (totalAllRowsHeight <= lastPageContentHeight || (isCompact && totalRolls <= 34)) {
        // Fits entirely on 1 page!
        setMeasuredBlocks([flatRows]);
        return;
      }

      // Multi-page distribution:
      const dynamicPages: PrintableRow[][] = [];
      let currentPage: PrintableRow[] = [];
      let currentHeight = 0;

      for (let i = 0; i < flatRows.length; i++) {
        const row = flatRows[i];
        const rowH = rowHeights[i] || (isCompact ? 18 : 24);

        if (row.type === 'header') {
          let nextRollH = isCompact ? 18 : 24;
          for (let k = i + 1; k < flatRows.length; k++) {
            if (flatRows[k].articleId === row.articleId && flatRows[k].type === 'roll') {
              nextRollH = rowHeights[k] || (isCompact ? 18 : 24);
              break;
            }
          }

          if (currentHeight + rowH + nextRollH > fullPageContentHeight && currentPage.length > 0) {
            dynamicPages.push(currentPage);
            currentPage = [];
            currentHeight = 0;
          }
        } else {
          if (currentHeight + rowH > fullPageContentHeight && currentPage.length > 0) {
            dynamicPages.push(currentPage);
            currentPage = [];
            currentHeight = 0;
          }
        }

        currentPage.push(row);
        currentHeight += rowH;
      }

      if (currentPage.length > 0) {
        dynamicPages.push(currentPage);
      }

      if (dynamicPages.length === 0) {
        dynamicPages.push([]);
      }

      // Ensure the final page does not overflow its lastPageContentHeight
      while (true) {
        const lastPage = dynamicPages[dynamicPages.length - 1];
        if (!lastPage || lastPage.length === 0) break;

        let lastPageRowsHeight = 0;
        lastPage.forEach(r => {
          const originalIdx = flatRows.indexOf(r);
          lastPageRowsHeight += (originalIdx !== -1 ? rowHeights[originalIdx] : (isCompact ? 18 : 24));
        });

        const lastPageRollCount = lastPage.filter(r => r.type === 'roll').length;
        if (lastPageRowsHeight <= lastPageContentHeight || lastPageRollCount <= 1) {
          break;
        }

        const detachedFooters: PrintableRow[] = [];
        while (lastPage.length > 0 && lastPage[lastPage.length - 1].type === 'footer') {
          detachedFooters.unshift(lastPage.pop()!);
        }

        const overflowPage: PrintableRow[] = [];
        
        while (lastPage.filter(r => r.type === 'roll').length > 0) {
          let currentLastPageHeight = 0;
          lastPage.forEach(r => {
            const origIdx = flatRows.indexOf(r);
            currentLastPageHeight += (origIdx !== -1 ? rowHeights[origIdx] : (isCompact ? 18 : 24));
          });

          if (currentLastPageHeight <= lastPageContentHeight && lastPage.filter(r => r.type === 'roll').length > 0) {
            break;
          }

          let idx = -1;
          for (let j = lastPage.length - 1; j >= 0; j--) {
            if (lastPage[j].type === 'roll') { idx = j; break; }
          }
          if (idx === -1) break;

          const rollRow = lastPage[idx];
          lastPage.splice(idx, 1);
          overflowPage.unshift(rollRow);

          const articleId = rollRow.articleId;
          const remainingRollsOfArticle = lastPage.filter(
            r => r.type === 'roll' && r.articleId === articleId
          ).length;
          if (remainingRollsOfArticle === 0) {
            const headerIdx = lastPage.findIndex(r => r.type === 'header' && r.articleId === articleId);
            if (headerIdx !== -1) {
              const headerRow = lastPage[headerIdx];
              lastPage.splice(headerIdx, 1);
              overflowPage.unshift(headerRow);
            }
          }
        }

        detachedFooters.forEach(footerRow => {
          const articleId = footerRow.articleId;
          const movedToOverflow = overflowPage.some(r => r.type === 'roll' && r.articleId === articleId);
          if (movedToOverflow) {
            overflowPage.push(footerRow);
          } else {
            lastPage.push(footerRow);
          }
        });

        for (let j = lastPage.length - 1; j >= 0; j--) {
          if (lastPage[j].type === 'header') {
            const artId = lastPage[j].articleId;
            const hasRolls = lastPage.some(r => r.type === 'roll' && r.articleId === artId);
            if (!hasRolls) {
              const [hRow] = lastPage.splice(j, 1);
              overflowPage.unshift(hRow);
            }
          }
        }

        dynamicPages.push(overflowPage);
      }

      // CRITICAL USER RULE:
      // A new page MUST have AT LEAST 3 rows.
      // If last page has only 1 or 2 rows:
      // - If total rolls <= 35, adapt all in 1 single page!
      // - Else, move rolls from previous page(s) so last page has >= 3 rows!
      if (dynamicPages.length > 1) {
        const lastPage = dynamicPages[dynamicPages.length - 1];
        const lastPageRollCount = lastPage.filter(r => r.type === 'roll').length;
        
        if (lastPageRollCount < 3) {
          if (totalRolls <= 35) {
            // Adapt to single page
            setMeasuredBlocks([flatRows]);
            return;
          }

          // Pull rows from previous page to achieve at least 3 rows in lastPage
          const prevPage = dynamicPages[dynamicPages.length - 2];
          while (lastPage.filter(r => r.type === 'roll').length < 3 && prevPage.filter(r => r.type === 'roll').length > 3) {
            let lastRollIdx = -1;
            for (let j = prevPage.length - 1; j >= 0; j--) {
              if (prevPage[j].type === 'roll') { lastRollIdx = j; break; }
            }
            if (lastRollIdx !== -1) {
              const rollToMove = prevPage.splice(lastRollIdx, 1)[0];
              lastPage.unshift(rollToMove);

              const articleId = rollToMove.articleId;
              if (prevPage.filter(r => r.type === 'roll' && r.articleId === articleId).length === 0) {
                const hIdx = prevPage.findIndex(r => r.type === 'header' && r.articleId === articleId);
                if (hIdx !== -1) {
                  const hRow = prevPage.splice(hIdx, 1)[0];
                  lastPage.unshift(hRow);
                }
              }
            } else {
              break;
            }
          }
        }
      }

      setMeasuredBlocks(dynamicPages);
    } catch (e) {
      console.warn("Layout measurement fallback:", e);
      setMeasuredBlocks(totalRolls <= 33 ? [flatRows] : getPaginatedBlocks(groupedItems, getArticleName, isCompact));
    }
  }, [flatRows, articles, packingList, providers, isCompact, totalRolls]);

  return (
    <div id="print-section" className="fixed inset-0 bg-app-bg/75 backdrop-blur-xs z-50 overflow-y-auto p-4 md:p-6 flex justify-center items-start print-overlay-container">
      {/* CSS rules for pure A4 printing of two clean pages */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-overlay-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            z-index: auto !important;
            display: block !important;
          }
          .print-modal-reset {
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            overflow: visible !important;
          }
          .print-scroll-container {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            max-height: none !important;
            background: transparent !important;
          }
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
            border: none !important;
            box-shadow: none !important;
            padding: 12mm 15mm !important;
            margin: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
            background-color: white !important;
            color: black !important;
          }
          .print-page * {
            color: black !important;
            border-color: black !important;
          }
          .print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .aviso-importante {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .ticket-perforated::before,
          .ticket-perforated::after {
            display: none !important;
          }
          .warehouse-tag {
            border: 1px solid black !important;
            box-shadow: none !important;
            color: black !important;
            background-color: transparent !important;
          }
          @page {
            size: A4;
            margin: 0 !important;
          }
        }
      `}</style>

      <div translate="no" className={`notranslate bg-app-surface border border-app-border rounded-lg shadow-2xl w-full ${activeView === 'guia_remision' ? 'max-w-7xl' : 'max-w-4xl'} overflow-hidden print-modal-reset transition-all duration-300`}>
        {/* Header Modal Actions */}
        <div className="bg-app-surface px-6 py-4 border-b border-app-border flex flex-wrap justify-between items-center gap-4 no-print">
          <div className="flex items-center gap-3">
            <FileText className="text-app-primary" size={22} />
            <div>
              <h2 className="text-md font-bold text-app-text">
                {activeView === 'guia_remision' ? 'Guía de Remisión Electrónica' : 'Vista de Impresión Packing List'}: {packingList.packingListNo}
              </h2>
              <p className="text-[11px] text-app-text/60">
                {activeView === 'guia_remision' 
                  ? 'Guía de Remisión de formato oficial SUNAT para control de transporte terrestre y despacho de telas.'
                  : (packingList.type === 'corte' || packingList.type === 'antiguo')
                    ? 'Imprime un documento en una sola hoja A4 con dos mitades (Original con Cargo en parte superior y Copia para el receptor en parte inferior).'
                    : 'Imprime un documento de 2 hojas: Hoja 1 y Hoja 2, ambas con el Aviso Importante.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(packingList);
                }}
                className="px-4 py-1.5 bg-app-surface border border-app-border hover:bg-app-bg text-app-text hover:text-app-primary rounded font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs uppercase tracking-wider"
                id="btn-edit-from-print"
                title="Editar los datos y rollos de este packing list"
              >
                <Edit2 size={13} className="text-app-text/70" />
                Editar Packing
              </button>
            )}
            <button
              onClick={() => setShowRollLabels(true)}
              className="px-4 py-1.5 bg-app-surface border border-app-border hover:bg-app-bg text-app-text hover:text-app-primary rounded font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs uppercase tracking-wider"
              id="btn-print-labels-from-view"
              title="Imprimir etiquetas con Código de Barras y QR para todos los rollos de este packing"
            >
              <Tag size={13} className="text-app-primary" />
              Etiquetas (QR)
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-4 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs uppercase tracking-wider"
              id="btn-whatsapp-share-print"
            >
              <MessageCircle size={13} />
              WhatsApp
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-app-primary hover:bg-app-primary/95 text-white rounded font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-xs uppercase tracking-wider"
              id="btn-print-action"
            >
              <Printer size={13} />
              {activeView === 'guia_remision' ? 'Imprimir Guía de Remisión' : 'Imprimir Packing List'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-app-surface border border-app-border hover:bg-app-bg text-app-text rounded font-bold text-xs transition cursor-pointer uppercase tracking-wider"
              id="btn-close-print"
            >
              <X size={13} className="inline mr-1" />
              Cerrar Vista
            </button>
          </div>
        </div>

        {/* Tab Selection Row (no-print) */}
        <div className="flex flex-wrap items-center justify-between border-b border-app-border bg-app-bg/55 px-6 py-2.5 gap-3 no-print shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('packing_list')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer uppercase tracking-wider ${
                activeView === 'packing_list'
                  ? 'bg-app-primary text-white shadow-xs'
                  : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10 border border-transparent'
              }`}
              id="tab-view-packinglist"
            >
              F-01: Packing List (Almacén)
            </button>
            <button
              onClick={() => setActiveView('guia_remision')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer uppercase tracking-wider flex items-center gap-2 ${
                activeView === 'guia_remision'
                  ? 'bg-app-primary text-white shadow-xs'
                  : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10 border border-transparent'
              }`}
              id="tab-view-guia-remision"
            >
              F-02: Guía de Remisión / Despacho
              <span className="text-[8px] bg-red-500 text-white font-black px-1.5 py-0.5 rounded uppercase animate-pulse leading-none">NUEVO</span>
            </button>
          </div>

          {activeView === 'packing_list' && packingList.type !== 'corte' && packingList.type !== 'antiguo' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-app-text/70 uppercase">Ajuste de Hoja:</span>
              <div className="inline-flex rounded-md border border-app-border bg-app-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setPageDensity('auto')}
                  className={`px-2.5 py-1 text-[10.5px] font-bold rounded transition cursor-pointer uppercase ${
                    pageDensity === 'auto'
                      ? 'bg-app-primary text-white shadow-xs'
                      : 'text-app-text/70 hover:text-app-text'
                  }`}
                  title="Ajusta automáticamente a 1 hoja si tiene 33 rollos o menos"
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setPageDensity('compact')}
                  className={`px-2.5 py-1 text-[10.5px] font-bold rounded transition cursor-pointer uppercase ${
                    pageDensity === 'compact'
                      ? 'bg-app-primary text-white shadow-xs'
                      : 'text-app-text/70 hover:text-app-text'
                  }`}
                  title="Fuerza diseño compacto con letra optimizada para 1 hoja"
                >
                  Compacto (1 Hoja)
                </button>
                <button
                  type="button"
                  onClick={() => setPageDensity('normal')}
                  className={`px-2.5 py-1 text-[10.5px] font-bold rounded transition cursor-pointer uppercase ${
                    pageDensity === 'normal'
                      ? 'bg-app-primary text-white shadow-xs'
                      : 'text-app-text/70 hover:text-app-text'
                  }`}
                  title="Diseño estándar"
                >
                  Estándar
                </button>
              </div>

              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-app-primary/10 text-app-primary border border-app-primary/20">
                {measuredBlocks.length === 1 ? '📄 1 Hoja' : `📄 ${measuredBlocks.length} Hojas`}
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Container for On-Screen Visualizing */}
        <div className="p-4 overflow-y-auto max-h-[80vh] bg-app-bg/90 space-y-4 print-scroll-container">
          {activeView === 'guia_remision' ? (
            /* Guia de Remisión dual-column panel layout */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Sidebar Config Panel (no-print) */}
              <div className="lg:col-span-4 bg-app-surface border border-app-border rounded-xl p-5 space-y-4 no-print text-app-text shadow-sm">
                <div className="border-b border-app-border/40 pb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-app-primary animate-pulse"></div>
                  <div>
                    <h3 className="text-xs font-extrabold text-app-primary uppercase tracking-wider">Datos de Traslado</h3>
                    <p className="text-[10px] text-app-text/60 mt-0.5">Configure la guía antes de generar el impreso.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Serie</label>
                    <input 
                      type="text" 
                      value={guiaSeries} 
                      onChange={e => setGuiaSeries(e.target.value.toUpperCase())} 
                      className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-bold uppercase" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Correlativo</label>
                    <input 
                      type="text" 
                      value={guiaNumber} 
                      onChange={e => setGuiaNumber(e.target.value)} 
                      className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono font-bold" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Fecha de Traslado</label>
                  <input 
                    type="date" 
                    value={fechaTraslado} 
                    onChange={e => setFechaTraslado(e.target.value)} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-bold" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Punto de Partida</label>
                  <textarea 
                    value={puntoPartida} 
                    onChange={e => setPuntoPartida(e.target.value)} 
                    rows={2} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden resize-none leading-normal" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Punto de Llegada (Despacho)</label>
                  <textarea 
                    value={puntoLlegada} 
                    onChange={e => setPuntoLlegada(e.target.value)} 
                    rows={2} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden resize-none leading-normal font-bold" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">RUC Destinatario</label>
                    <input 
                      type="text" 
                      value={clientRuc} 
                      onChange={e => setClientRuc(e.target.value)} 
                      className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Peso Bruto (KGM)</label>
                    <input 
                      type="text" 
                      value={pesoBruto} 
                      onChange={e => setPesoBruto(e.target.value)} 
                      className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono font-bold" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Destinatario (Cliente)</label>
                  <input 
                    type="text" 
                    value={clientName} 
                    onChange={e => setClientName(e.target.value)} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-bold" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Motivo Traslado</label>
                  <select 
                    value={motivo} 
                    onChange={e => setMotivo(e.target.value)} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-bold"
                  >
                    <option value="VENTA">VENTA</option>
                    <option value="TRASLADO ENTRE ESTABLECIMIENTOS">TRASLADO ENTRE ESTABLECIMIENTOS</option>
                    <option value="COMPRA">COMPRA</option>
                    <option value="CONSIGNACION">CONSIGNACIÓN</option>
                    <option value="DEVOLUCION">DEVOLUCIÓN</option>
                    <option value="OTROS">OTROS</option>
                  </select>
                </div>

                <div className="border-t border-app-border/40 pt-3 space-y-3">
                  <h4 className="text-[10px] font-black text-app-primary uppercase tracking-wider">Chofer & Vehículo</h4>
                  <div>
                    <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Nombre Transportista</label>
                    <input 
                      type="text" 
                      value={driverName} 
                      onChange={e => setDriverName(e.target.value)} 
                      className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-semibold" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Licencia Conducir</label>
                      <input 
                        type="text" 
                        value={driverLicense} 
                        onChange={e => setDriverLicense(e.target.value)} 
                        className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Placa Vehicular</label>
                      <input 
                        type="text" 
                        value={vehiclePlate} 
                        onChange={e => setVehiclePlate(e.target.value.toUpperCase())} 
                        className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono font-bold uppercase" 
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-app-border/40 pt-3 space-y-3">
                  <h4 className="text-[10px] font-black text-app-primary uppercase tracking-wider">Firmas Autorizadas</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Despachador</label>
                      <input 
                        type="text" 
                        value={despachadorName} 
                        onChange={e => setDespachadorName(e.target.value)} 
                        className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">DNI Despachador</label>
                      <input 
                        type="text" 
                        value={despachadorDni} 
                        onChange={e => setDespachadorDni(e.target.value)} 
                        className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden font-mono" 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-app-text/50 uppercase tracking-wider mb-1">Observaciones / Notas</label>
                  <textarea 
                    value={observaciones} 
                    onChange={e => setObservaciones(e.target.value)} 
                    rows={2} 
                    className="w-full px-2.5 py-1.5 text-xs bg-app-bg border border-app-border rounded focus:border-app-primary focus:outline-hidden resize-none leading-normal font-mono" 
                  />
                </div>
              </div>

              {/* Printable Canvas Section */}
              <div className="lg:col-span-8 w-full flex justify-center">
                <GuiaRemisionPrintSheet
                  guiaSeries={guiaSeries}
                  guiaNumber={guiaNumber}
                  fechaHoraEmision={fechaHoraEmision}
                  formattedFechaTraslado={formattedFechaTraslado}
                  puntoPartida={puntoPartida}
                  puntoLlegada={puntoLlegada}
                  clientRuc={clientRuc}
                  clientName={clientName}
                  motivo={motivo}
                  pesoBruto={pesoBruto}
                  unidadMedida={unidadMedida}
                  driverName={driverName}
                  driverLicense={driverLicense}
                  vehiclePlate={vehiclePlate}
                  observaciones={observaciones}
                  despachadorName={despachadorName}
                  despachadorDni={despachadorDni}
                  packingList={packingList}
                  getArticleName={getArticleName}
                  groupedItems={groupedItems}
                />
              </div>

            </div>
          ) : (
            <>
              {window.self !== window.top && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4 text-xs text-red-800 dark:text-red-300 flex flex-col gap-2 no-print shadow-xs animate-pulse">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={18} />
                    <p className="font-bold text-sm">
                      ¡Atención! Bloqueo de impresión detectado (Vista Previa de AI Studio)
                    </p>
                  </div>
                  <p className="leading-relaxed">
                    Los navegadores modernos <strong>bloquean</strong> las ventanas de impresión (<code className="font-mono bg-red-100 dark:bg-red-950/40 px-1 rounded text-red-950 dark:text-red-300">window.print()</code>) cuando la aplicación se ejecuta dentro de un marco o <strong>iFrame</strong> por razones de seguridad.
                  </p>
                  <p className="font-medium">
                    👉 <strong>Solución:</strong> Haga clic en el botón con el icono de la flecha inclinada <strong>"Open in new tab"</strong> (Abrir en pestaña nueva) ubicado en la esquina superior derecha del panel de vista previa de AI Studio, o acceda directamente usando los enlaces de desarrollo compartidos. Una vez abierto en su propia pestaña, el botón de impresión funcionará a la perfección.
                  </p>
                </div>
              )}

              <div className="bg-app-primary/5 border border-app-primary/20 rounded-lg p-3 text-xs text-app-primary flex items-center gap-2 no-print">
                <AlertTriangle className="text-app-primary shrink-0" size={16} />
                <p>
                  <strong>Sugerencia de Impresión:</strong> Para un acabado perfecto, asegúrese de activar <strong>"Gráficos de fondo"</strong> en la configuración de su navegador.
                </p>
              </div>

              {(packingList.type === 'corte' || packingList.type === 'antiguo') ? (
                <CortePrintSheet
                  packingList={packingList}
                  client={client}
                  seller={seller}
                  groupedItems={groupedItems}
                  getArticleName={getArticleName}
                  totalRolls={totalRolls}
                  totalMeters={totalMeters}
                  totalWeight={totalWeight}
                  providers={providers}
                />
              ) : (
                <>
                  {/* Measured Print Pages with real layout geometry */}
                  {measuredBlocks.map((block, pageIdx) => (
                    <PaginatedSinglePrintPage
                      key={`cli-${pageIdx}`}
                      title="PACKING LIST"
                      packingList={packingList}
                      client={client}
                      seller={seller}
                      block={block}
                      getArticleName={getArticleName}
                      totalRolls={totalRolls}
                      totalMeters={totalMeters}
                      totalWeight={totalWeight}
                      providers={providers}
                      isLastPage={pageIdx === measuredBlocks.length - 1}
                      isCompact={isCompact}
                      bottomContent={
                        <div className={`aviso-importante ${isCompact ? 'mt-2 p-2' : 'mt-4 p-2.5'} border border-app-border rounded-lg bg-app-surface text-app-text print:text-black print:border-black print:bg-white`}>
                          <h3 className={`${isCompact ? 'text-[8.5px] mb-1' : 'text-[10px] mb-1.5'} font-black uppercase tracking-widest text-app-primary text-center border-b border-app-border pb-0.5 py-0.5 rounded print:text-black print:border-black`}>
                            AVISO IMPORTANTE
                          </h3>
                          <div className={`${isCompact ? 'text-[7px] leading-snug' : 'text-[8px] leading-normal'} font-medium uppercase`}>
                            <p className={isCompact ? "mb-0.5" : "mb-1"}>
                              1. EL CLIENTE DEBERÁ <strong className="font-extrabold">FOLIAR O NUMERAR</strong> LAS CAPAS TENDIDAS DE TELA, INDEPENDIENTEMENTE DE QUE SEA O NO DEL MISMO LOTE. ELLO, PARA CONSTATAR EL COLOR Y ENCOGIMIENTO DE LA MERCANCÍA.
                            </p>
                            <p className={isCompact ? "mb-0.5" : "mb-1"}>
                              2. <strong className="font-extrabold">NO CORTE</strong> EL ROLLO ANTES DE COMPROBAR: CALIDAD, CANTIDAD DE METRAJE, SOLIDEZ DE COLOR, ETC.
                            </p>
                            <p className="font-black text-center pt-0.5 border-t border-app-border print:border-black">
                              DE NO CUMPLIR EL CLIENTE CON LOS 2 PUNTOS SEÑALADOS ANTERIORMENTE, ABSTENERSE DE RECLAMOS. GRACIAS POR SU COOPERACIÓN.
                            </p>
                          </div>
                        </div>
                      }
                    />
                  ))}
                </>
              )}
            </>
          )}

        </div>
      </div>

      {/* OFF-SCREEN MEASUREMENT SANDBOX (hidden from user and print, strictly for DOM geometry matching exact A4 print size) */}
      <div 
        ref={measureContainerRef}
        aria-hidden="true"
        className="no-print pointer-events-none"
        style={{
          position: 'fixed',
          top: -99999,
          left: -99999,
          width: '793.7px', // 210mm * 3.779527559 px/mm (exact A4 sheet width)
          visibility: 'hidden',
          opacity: 0,
          zIndex: -100,
          boxSizing: 'border-box'
        }}
      >
        <div 
          className="font-sans"
          style={{
            padding: isCompact ? '30px 45px' : '45.35px 56.69px',
            boxSizing: 'border-box'
          }}
        >
          {/* Measure Header Section */}
          <div ref={measureHeaderRef}>
            <div className="flex justify-between items-center mb-1">
              <h1 className={`${isCompact ? 'text-lg' : 'text-xl md:text-2xl'} font-display text-app-primary`}>PACKING LIST</h1>
              <div className={isCompact ? "h-12 w-12" : "h-16 w-16"}></div>
            </div>
            <div className={`flex justify-between items-start ${isCompact ? 'text-[10px] pb-1 mb-2' : 'text-[11px] md:text-xs pb-2 mb-3'} border-b border-app-border`}>
              <div className="space-y-0.5">
                <p className="font-bold">CLIENTE: <span className="font-normal uppercase">{client?.name || 'Cliente'}</span></p>
                {packingList.dispatchAddress && (
                  <p className="font-bold">DESTINO: <span className="font-normal uppercase">{packingList.dispatchAddress}</span></p>
                )}
                <p className="font-bold">GUÍA N°: <span className="font-normal uppercase">{packingList.guideNumber || '___________'}</span></p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="font-bold">VENDEDOR: <span className="font-normal uppercase">{seller?.name || 'Vendedor'}</span></p>
                <p className="font-bold">FECHA: <span className="font-normal font-mono">{packingList.date}</span></p>
              </div>
            </div>
          </div>

          {/* Measure Table */}
          <table className={`w-full text-left border-collapse border-b border-app-border ${isCompact ? 'text-[9.5px] mb-2' : 'text-xs mb-4'}`}>
            <thead>
              <tr className={`border-b-2 border-app-border ${isCompact ? 'text-[9px]' : 'text-[10px]'} uppercase font-bold tracking-wider`}>
                <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} w-2/5`}>
                  {hasRollNo ? 'Nº ROLLO' : 'ITEM'}
                </th>
                {showLot && <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-24`}>LOTE</th>}
                {showPartida && <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-28`}>PARTIDA</th>}
                {hasTono && <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>TONO</th>}
                {hasWidth && <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>ANCHO</th>}
                {hasWeight && <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>PESO</th>}
                <th className={`${isCompact ? 'py-0.5 px-1' : 'py-1 px-1'} text-right w-32`}>METRAJE</th>
              </tr>
            </thead>
            <tbody ref={measureRowsContainerRef}>
              {flatRows.map((row, idx) => {
                if (row.type === 'header') {
                  return (
                    <tr key={`m-h-${idx}`} data-row-index={idx} className="border-b border-app-border font-bold">
                      <td colSpan={colSpanHeader} className={`${isCompact ? 'py-0.5 px-1 text-[10px]' : 'py-1 px-1 text-[11px]'} uppercase font-bold`}>
                        {row.articleName}
                      </td>
                    </tr>
                  );
                } else if (row.type === 'roll') {
                  const item = row.item!;
                  return (
                    <tr key={`m-r-${idx}`} data-row-index={idx} className="border-b border-app-border/40">
                      <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px] pl-2' : 'py-1 px-1 text-[10.5px] pl-3'} font-mono font-bold`}>
                        {hasRollNo ? (item.rollNumber || '-') : ((row.index ?? 0) + 1)}
                      </td>
                      {showLot && <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-center font-mono`}>{item.lot || '-'}</td>}
                      {showPartida && <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-center font-mono`}>{item.partida || '-'}</td>}
                      {hasTono && <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-center font-mono font-bold uppercase`}>{item.tono || '-'}</td>}
                      {hasWidth && <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-center font-mono`}>{item.width ? `${item.width} m` : '-'}</td>}
                      {hasWeight && <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-center font-mono`}>{item.weight ? `${item.weight} kg` : '-'}</td>}
                      <td className={`${isCompact ? 'py-[2px] px-1 text-[9.5px]' : 'py-1 px-1 text-[11px]'} text-right font-mono font-bold`}>{Number(item.meters).toFixed(2)} m</td>
                    </tr>
                  );
                } else if (row.type === 'footer') {
                  return (
                    <tr key={`m-f-${idx}`} data-row-index={idx} className={`border-b-2 border-app-border font-bold ${isCompact ? 'text-[9.5px]' : 'text-[11px]'}`}>
                      <td colSpan={colSpanSummary - (hasWeight ? 1 : 0)} className={`${isCompact ? 'py-1 px-1' : 'py-1.5 px-1'} uppercase text-right font-bold`}>
                        {row.articleName} -- Cantidad: {row.groupLength} | Total:
                      </td>
                      {hasWeight && (
                        <td className={`${isCompact ? 'py-1 px-1' : 'py-1.5 px-1'} text-center font-mono font-bold`}>
                          {(row.articleTotalWeight ?? 0) > 0 ? `${(row.articleTotalWeight ?? 0).toFixed(2)} kg` : '-'}
                        </td>
                      )}
                      <td className={`${isCompact ? 'py-1 px-1' : 'py-1.5 px-1'} text-right font-mono font-black`}>
                        {(row.articleTotalMeters ?? 0).toFixed(2)} m
                      </td>
                    </tr>
                  );
                }
                return null;
              })}
            </tbody>
          </table>

          {/* Measure Footer Block (Grand Totals + Aviso Importante) */}
          <div ref={measureFooterBlockRef} className="pt-1">
            <div className={`flex flex-col items-end justify-end ${isCompact ? 'mt-1 text-[10.5px]' : 'mt-2 text-xs'} font-bold space-y-0.5`}>
              <p className="uppercase tracking-tight">TOTAL ROLLOS: <span className={`font-mono font-black ${isCompact ? 'text-xs' : 'text-sm'}`}>{totalRolls}</span></p>
              {totalWeight > 0 && (
                <p className="uppercase tracking-tight">TOTAL PESO: <span className={`font-mono font-black ${isCompact ? 'text-xs' : 'text-sm'}`}>{totalWeight.toFixed(2)} kg</span></p>
              )}
              <p className="uppercase tracking-tight font-display">TOTAL METROS: <span className={`font-mono font-black ${isCompact ? 'text-sm' : 'text-md'}`}>{totalMeters.toFixed(2)} m</span></p>
            </div>
            <div className={`${isCompact ? 'mt-2 p-2' : 'mt-4 p-2.5'} border border-app-border rounded-lg`}>
              <h3 className={`${isCompact ? 'text-[8.5px] mb-1' : 'text-[10px] mb-1.5'} font-black uppercase tracking-widest text-center border-b pb-0.5 py-0.5`}>
                AVISO IMPORTANTE
              </h3>
              <div className={`${isCompact ? 'text-[7px]' : 'text-[8px]'} font-medium leading-normal uppercase`}>
                <p className={isCompact ? "mb-0.5" : "mb-1"}>
                  1. EL CLIENTE DEBERÁ <strong className="font-extrabold">FOLIAR O NUMERAR</strong> LAS CAPAS TENDIDAS DE TELA, INDEPENDIENTEMENTE DE QUE SEA O NO DEL MISMO LOTE. ELLO, PARA CONSTATAR EL COLOR Y ENCOGIMIENTO DE LA MERCANCÍA.
                </p>
                <p className={isCompact ? "mb-0.5" : "mb-1"}>
                  2. <strong className="font-extrabold">NO CORTE</strong> EL ROLLO ANTES DE COMPROBAR: CALIDAD, CANTIDAD DE METRAJE, SOLIDEZ DE COLOR, ETC.
                </p>
                <p className="font-black text-center pt-0.5 border-t">
                  DE NO CUMPLIR EL CLIENTE CON LOS 2 PUNTOS SEÑALADOS ANTERIORMENTE, ABSTENERSE DE RECLAMOS. GRACIAS POR SU COOPERACIÓN.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Roll Labels Modal */}
      {showRollLabels && (
        <PrintRollLabelsModal
          rolls={packingList.items.map((item, idx) => {
            const art = articles.find(a => a.id === item.articleId);
            const prov = providers.find(p => p.id === item.providerId);
            return {
              id: item.id || `pl-roll-${idx}`,
              rollNumber: item.rollNumber,
              articleId: item.articleId,
              articleName: art?.name || 'Tela Almacén',
              providerId: item.providerId || '',
              providerName: prov?.name || 'Proveedor',
              meters: item.meters,
              initialMeters: item.meters,
              lot: item.lot,
              partida: item.partida,
              tono: item.tono,
              width: item.width,
              weight: item.weight,
              createdAt: packingList.createdAt || packingList.date,
            };
          })}
          onClose={() => setShowRollLabels(false)}
        />
      )}
    </div>
  );
}

interface PaginatedSinglePrintPageProps {
  key?: string;
  title: string;
  packingList: PackingList;
  client: Client | undefined;
  seller: Seller | undefined;
  block: PrintableRow[];
  getArticleName: (id: string) => string;
  totalRolls: number;
  totalMeters: number;
  totalWeight: number;
  providers: Provider[];
  isLastPage: boolean;
  isCompact?: boolean;
  bottomContent?: React.ReactNode;
}

function PaginatedSinglePrintPage({
  title,
  packingList,
  client,
  seller,
  block,
  getArticleName,
  totalRolls,
  totalMeters,
  totalWeight,
  providers,
  isLastPage,
  isCompact = false,
  bottomContent
}: PaginatedSinglePrintPageProps) {
  const firstItemProviderId = packingList.items[0]?.providerId;
  const activeProvider = providers.find(p => p.id === firstItemProviderId) || null;
  const omitted = packingList.omittedFields || [];

  const showLot = (activeProvider ? activeProvider.hasLot : true) && !omitted.includes('lot');
  const showPartida = (activeProvider ? activeProvider.hasPartida : true) && !omitted.includes('partida');
  const hasRollNo = (activeProvider ? activeProvider.hasRollNo : false) && !omitted.includes('rollNo');
  const hasTono = (activeProvider ? !!activeProvider.hasTono : false) && !omitted.includes('tono');
  const hasWidth = (activeProvider ? !!activeProvider.hasWidth : false) && !omitted.includes('width');
  const hasWeight = (activeProvider ? !!activeProvider.hasWeight : false) && !omitted.includes('weight');

  const colSpanHeader = 2 
    + (showLot ? 1 : 0) 
    + (showPartida ? 1 : 0) 
    + (hasTono ? 1 : 0)
    + (hasWidth ? 1 : 0)
    + (hasWeight ? 1 : 0);

  const colSpanSummary = 1 
    + (showLot ? 1 : 0) 
    + (showPartida ? 1 : 0) 
    + (hasTono ? 1 : 0)
    + (hasWidth ? 1 : 0)
    + (hasWeight ? 1 : 0);

  return (
    <div translate="no" className={`notranslate ticket-perforated bg-app-surface text-app-text ${isCompact ? 'px-6 py-4 md:px-7 md:py-5' : 'px-6 py-4 md:px-8 md:py-6'} border border-app-border rounded-xl shadow-lg font-sans max-w-3xl mx-auto my-2 print-page print:border-none print:shadow-none print:p-0 print:my-0 print:bg-white`}>
      <div className="flex flex-col">
        {/* Document Header */}
        <div className="flex justify-between items-center mb-1">
          <div className="flex flex-col">
            <h1 className={`${isCompact ? 'text-xl' : 'text-xl md:text-2xl'} font-display text-app-primary`}>{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <img 
              src="/logo-juditex.png" 
              alt="Juditex" 
              className={`${isCompact ? 'h-14' : 'h-16'} w-auto object-contain print:opacity-100`} 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Client and Sales Representative at the same height */}
        <div className={`flex justify-between items-start ${isCompact ? 'text-[11px] pb-2 mb-2.5' : 'text-[11px] md:text-xs pb-2 mb-3'} border-b border-app-border`}>
          <div className="space-y-0.5">
            <p className="font-bold">
              CLIENTE: <span className="font-normal uppercase text-app-text/90">{client?.name || 'Cliente Eliminado'}</span>
            </p>
            {packingList.dispatchAddress && (
              <p className="font-bold">
                DESTINO: <span className="font-normal uppercase text-app-text/90">{packingList.dispatchAddress}</span>
              </p>
            )}
            <p className="font-bold">
              GUÍA N°: <span className="font-normal uppercase text-app-text/90">
                {packingList.guideNumber || '___________'}
              </span>
            </p>
          </div>
          <div className="text-right space-y-0.5">
            <p className="font-bold">
              VENDEDOR: <span className="font-normal uppercase text-app-text/90">{seller?.name || 'Vendedor Autorizado'}</span>
            </p>
            <p className="font-bold">
              FECHA: <span className="font-normal font-mono text-app-text/80">{packingList.date}</span>
            </p>
          </div>
        </div>

        {/* Elegant Grouped Articles Table */}
        <div className="mb-2">
          <table className={`w-full text-left border-collapse border-b border-app-border ${totalRolls > 28 ? 'text-[9.5px]' : 'text-[10.5px]'}`}>
            <thead>
              <tr className={`border-b-2 border-app-border ${totalRolls > 28 ? 'text-[9px]' : 'text-[10px]'} text-app-text uppercase font-bold tracking-wider`}>
                <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} w-2/5`}>
                  {hasRollNo ? 'Nº ROLLO' : 'ITEM'}
                </th>
                {showLot && <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-24`}>LOTE</th>}
                {showPartida && <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-28`}>PARTIDA</th>}
                {hasTono && <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>TONO</th>}
                {hasWidth && <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>ANCHO</th>}
                {hasWeight && <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-center w-20`}>PESO</th>}
                <th className={`${totalRolls > 28 ? 'py-0.5 px-1' : 'py-1 px-1'} text-right w-32`}>METRAJE</th>
              </tr>
            </thead>
            <tbody>
              {block.map((row, idx) => {
                const isDense = totalRolls > 28;
                const rowPaddingClass = isDense ? 'py-[2px] px-1' : totalRolls <= 18 ? 'py-1.5 px-1' : 'py-1 px-1';

                if (row.type === 'header') {
                  return (
                    <tr key={`h-${row.articleId}-${idx}`} className="border-b border-app-border font-bold bg-app-bg/25 print:bg-white">
                      <td colSpan={colSpanHeader} className={`${isDense ? 'py-0.5 px-1 text-[10px]' : 'py-1 px-1 text-[11px]'} text-app-primary uppercase tracking-tight font-bold`}>
                        {row.articleName}
                      </td>
                    </tr>
                  );
                } else if (row.type === 'roll') {
                  const item = row.item!;
                  return (
                    <tr key={`r-${item.id || idx}`} className="border-b border-app-border/40 hover:bg-app-bg/10">
                      <td className={`${rowPaddingClass} font-mono font-bold pl-2`}>
                        {hasRollNo ? (item.rollNumber || '-') : ((row.index ?? 0) + 1)}
                      </td>
                      {showLot && <td className={`${rowPaddingClass} text-center font-mono`}>{item.lot || '-'}</td>}
                      {showPartida && <td className={`${rowPaddingClass} text-center font-mono`}>{item.partida || '-'}</td>}
                      {hasTono && <td className={`${rowPaddingClass} text-center font-mono font-bold text-app-primary uppercase`}>{item.tono || '-'}</td>}
                      {hasWidth && <td className={`${rowPaddingClass} text-center font-mono`}>{item.width ? `${item.width} m` : '-'}</td>}
                      {hasWeight && <td className={`${rowPaddingClass} text-center font-mono`}>{item.weight ? `${item.weight} kg` : '-'}</td>}
                      <td className={`${rowPaddingClass} text-right font-mono font-bold`}>{Number(item.meters).toFixed(2)} m</td>
                    </tr>
                  );
                } else if (row.type === 'footer') {
                  return (
                    <tr key={`f-${row.articleId}-${idx}`} className={`border-b-2 border-app-border font-bold ${isDense ? 'text-[9.5px]' : 'text-[11px]'} bg-app-bg/10 print:bg-white`}>
                      <td colSpan={colSpanSummary - (hasWeight ? 1 : 0)} className={`${isDense ? 'py-1 px-1' : 'py-1.5 px-1'} uppercase text-right tracking-tight font-bold text-app-text/75`}>
                        {row.articleName} -- Cantidad: {row.groupLength} | Total:
                      </td>
                      {hasWeight && (
                        <td className={`${isDense ? 'py-1 px-1' : 'py-1.5 px-1'} text-center font-mono font-bold text-app-text`}>
                          {(row.articleTotalWeight ?? 0) > 0 ? `${(row.articleTotalWeight ?? 0).toFixed(2)} kg` : '-'}
                        </td>
                      )}
                      <td className={`${isDense ? 'py-1 px-1' : 'py-1.5 px-1'} text-right font-mono text-app-primary font-black`}>
                        {(row.articleTotalMeters ?? 0).toFixed(2)} m
                      </td>
                    </tr>
                  );
                }
                return null;
              })}
            </tbody>
          </table>

          {/* Grand Totals Section */}
          {isLastPage && (
            <div className={`flex flex-col items-end justify-end ${totalRolls > 28 ? 'mt-1.5 text-[11px]' : 'mt-2.5 text-xs'} font-bold space-y-0.5`}>
              <p className="uppercase tracking-tight">TOTAL ROLLOS: <span className="font-mono font-black text-sm text-app-secondary">{totalRolls}</span></p>
              {totalWeight > 0 && (
                <p className="uppercase tracking-tight">TOTAL PESO: <span className="font-mono font-black text-sm text-app-text">{totalWeight.toFixed(2)} kg</span></p>
              )}
              <p className="uppercase tracking-tight font-display text-app-primary">TOTAL METROS: <span className="font-mono font-black text-base">{totalMeters.toFixed(2)} m</span></p>
            </div>
          )}
        </div>

        {/* Aviso Importante directly following Totals with cohesive, balanced spacing */}
        {isLastPage && bottomContent}
      </div>
    </div>
  );
}

interface CortePrintSheetProps {
  packingList: PackingList;
  client: Client | undefined;
  seller: Seller | undefined;
  groupedItems: Record<string, PackingListItem[]>;
  getArticleName: (id: string) => string;
  totalRolls: number;
  totalMeters: number;
  totalWeight: number;
  providers: Provider[];
}

function CortePrintSheet({
  packingList,
  client,
  seller,
  groupedItems,
  getArticleName,
  totalRolls,
  totalMeters,
  totalWeight,
  providers
}: CortePrintSheetProps) {
  const firstItemProviderId = packingList.items[0]?.providerId;
  const activeProvider = providers.find(p => p.id === firstItemProviderId) || null;
  const omitted = packingList.omittedFields || [];

  const showLot = (activeProvider ? activeProvider.hasLot : true) && !omitted.includes('lot');
  const showPartida = (activeProvider ? activeProvider.hasPartida : true) && !omitted.includes('partida');
  const hasTono = (activeProvider ? !!activeProvider.hasTono : false) && !omitted.includes('tono');

  return (
    <div translate="no" className="notranslate ticket-perforated bg-app-surface text-app-text px-6 py-4 border border-app-border rounded-xl shadow-lg font-sans max-w-3xl mx-auto my-2 h-[296mm] max-h-[296mm] flex flex-col justify-between print-page print:border-none print:shadow-none print:p-0 print:my-0 print:bg-white box-border">
      
      {/* TOP HALF - EXACTLY 50% */}
      <div className="h-[50%] flex flex-col justify-between pb-4 border-b border-dashed border-app-border relative box-border overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-base font-display text-app-primary">PACKING LIST</h2>
          </div>

          {/* Client / Seller / Date details - Identical layout on both halves */}
          <div className="grid grid-cols-2 gap-4 text-[9.5px] py-1 mb-1.5 border-b border-app-border">
            <div>
              <p className="font-bold">
                CLIENTE: <span className="font-normal uppercase text-app-text/90">{client?.name || 'Cliente Eliminado'}</span>
              </p>
              {packingList.dispatchAddress && (
                <p className="font-bold mt-0.5">
                  DESTINO: <span className="font-normal uppercase text-app-text/90">{packingList.dispatchAddress}</span>
                </p>
              )}
              <p className="font-bold mt-0.5">
                GUÍA N°: <span className="font-normal uppercase text-app-text/90">
                  {packingList.guideNumber || '___________'}
                </span>
              </p>
              <p className="font-bold mt-0.5">
                FECHA: <span className="font-normal font-mono text-app-text/80">{packingList.date}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">
                VENDEDOR: <span className="font-normal uppercase text-app-text/90">{seller?.name || 'Vendedor Autorizado'}</span>
              </p>
            </div>
          </div>

          {/* Side-by-Side: Metrajes on the Left, CARGO on the Right */}
          <div className="grid grid-cols-12 gap-4 items-stretch">
            
            {/* LEFT COLUMN: Packing list details and metrajes grid (col-span-7) */}
            <div className="col-span-7 flex flex-col justify-between">
              <div className="space-y-2">
                {Object.keys(groupedItems).map(articleId => {
                  const groupItems = groupedItems[articleId];
                  const articleName = getArticleName(articleId);
                  const articleTotalMeters = groupItems.reduce((acc, item) => acc + Number(item.meters || 0), 0);
                  const articleTotalWeight = groupItems.reduce((acc, item) => acc + parseNumericWeight(item.weight), 0);
                  
                  const uniqueLots = Array.from(new Set(groupItems.map(item => item.lot).filter(Boolean)));
                  const uniquePartidas = Array.from(new Set(groupItems.map(item => item.partida).filter(Boolean)));
                  const lotText = showLot && uniqueLots.length > 0 ? `LOTE: ${uniqueLots.join(', ')}` : '';
                  const partidaText = showPartida && uniquePartidas.length > 0 ? `PARTIDA: ${uniquePartidas.join(', ')}` : '';
                  const attributesText = [lotText, partidaText].filter(Boolean).join(' | ');

                  return (
                    <div key={articleId} className="text-[9px]">
                      <div className="font-extrabold text-app-primary uppercase tracking-tight text-[9.5px] mb-0.5">
                        {articleName} {attributesText ? `(${attributesText})` : ''}
                      </div>
                      
                      {/* Grid of metrajes (clean, aligned columns) */}
                      <div className="grid grid-cols-6 gap-x-2 gap-y-0.5 py-0.5 font-mono text-[9px] text-left">
                        {groupItems.map((item, idx) => {
                          const hasTonoValue = hasTono && item.tono;
                          return (
                            <div key={item.id || idx} className="py-0.2">
                              <span className="font-bold">{Number(item.meters).toFixed(2)}</span>
                              {hasTonoValue && (
                                <span className="text-[7.5px] font-extrabold bg-app-primary text-white px-0.5 rounded ml-1">
                                  {item.tono}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-right font-bold text-app-secondary text-[9px] mt-0.5 pr-2">
                        Subtotal: {articleTotalMeters.toFixed(2)} m{articleTotalWeight > 0 ? ` | ${articleTotalWeight.toFixed(2)} kg` : ''}
                      </div>
                    </div>
                  );
                })}
                {packingList.type === 'corte' && packingList.notes && (
                  <div className="mt-2 border border-app-border rounded p-1.5 bg-app-bg/20 print:bg-white text-[8px] leading-snug">
                    <span className="font-bold text-app-primary">NOTA:</span> {packingList.notes}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: CARGO Box (col-span-5) - Larger size & matches original style perfectly, but in black and white */}
            <div className="col-span-5 self-stretch flex flex-col">
              <div className="border-2 border-app-primary rounded-xl p-3 text-app-text flex flex-col justify-between bg-app-bg/10 print:bg-white h-full min-h-[140px]">
                <h3 className="text-sm font-display text-center tracking-widest uppercase mb-3 text-app-primary">
                  CARGO DE RECEPCIÓN
                </h3>
                <div className="space-y-3 text-[9px] font-extrabold flex-1 flex flex-col justify-between">
                  <div className="space-y-0.5">
                    <span className="uppercase tracking-wider text-[8px] text-app-text/60">Nombre:</span>
                    <div className="border-b border-app-border h-4 w-full"></div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="uppercase tracking-wider text-[8px] text-app-text/60">DNI:</span>
                    <div className="border-b border-app-border h-4 w-full"></div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="uppercase tracking-wider text-[8px] text-app-text/60">Fecha de Recepción:</span>
                    <div className="border-b border-app-border h-4 w-full"></div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="uppercase tracking-wider text-[8px] text-app-text/60">Firma:</span>
                    <div className="border-b border-app-border h-5 w-full mt-1"></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Inline Summary for Top Half (Only Metrics to prevent Client/Seller repetition) */}
        <div>
          <div className="border-t border-app-border pt-1.5 mt-2 text-[10px] font-black uppercase">
            <div className="flex justify-between items-center px-2">
              <p className="font-display text-app-primary">TOTAL METROS: <span className="font-mono text-xs">{totalMeters.toFixed(2)} m</span></p>
              {totalWeight > 0 && (
                <p className="font-display text-app-text">TOTAL PESO: <span className="font-mono text-xs">{totalWeight.toFixed(2)} kg</span></p>
              )}
              <p className="font-display text-app-secondary">CANTIDAD DE ROLLOS: <span className="font-mono text-xs">{totalRolls}</span></p>
            </div>
          </div>

          {packingList.type === 'antiguo' && (
            <div className="aviso-importante mt-4 border border-app-border rounded-lg p-2.5 bg-app-surface text-app-text print:text-black print:border-black print:bg-white">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-app-primary mb-1.5 text-center border-b border-app-border pb-0.5 py-0.5 rounded print:text-black print:border-black">
                AVISO IMPORTANTE
              </h3>
              <div className="text-[8px] font-medium leading-normal uppercase">
                <p className="mb-1">
                  1. EL CLIENTE DEBERÁ <strong className="font-extrabold">FOLIAR O NUMERAR</strong> LAS CAPAS TENDIDAS DE TELA, INDEPENDIENTEMENTE DE QUE SEA O NO DEL MISMO LOTE. ELLO, PARA CONSTATAR EL COLOR Y ENCOGIMIENTO DE LA MERCANCÍA.
                </p>
                <p className="mb-1">
                  2. <strong className="font-extrabold">NO CORTE</strong> EL ROLLO ANTES DE COMPROBAR: CALIDAD, CANTIDAD DE METRAJE, SOLIDEZ DE COLOR, ETC.
                </p>
                <p className="font-black text-center pt-1 border-t border-app-border print:border-black">
                  DE NO CUMPLIR EL CLIENTE CON LOS 2 PUNTOS SEÑALADOS ANTERIORMENTE, ABSTENERSE DE RECLAMOS. GRACIAS POR SU COOPERACIÓN.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM HALF - EXACTLY 50% */}
      <div className="h-[50%] flex flex-col justify-between pt-4 box-border overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-base font-display text-app-primary">PACKING LIST</h2>
          </div>

          {/* Client / Seller / Date details - Identical layout on both halves */}
          <div className="grid grid-cols-2 gap-4 text-[9.5px] py-1 mb-1.5 border-b border-app-border">
            <div>
              <p className="font-bold">
                CLIENTE: <span className="font-normal uppercase text-app-text/90">{client?.name || 'Cliente Eliminado'}</span>
              </p>
              {packingList.dispatchAddress && (
                <p className="font-bold mt-0.5">
                  DESTINO: <span className="font-normal uppercase text-app-text/90">{packingList.dispatchAddress}</span>
                </p>
              )}
              <p className="font-bold mt-0.5">
                GUÍA N°: <span className="font-normal uppercase text-app-text/90">
                  {packingList.guideNumber || '___________'}
                </span>
              </p>
              <p className="font-bold mt-0.5">
                FECHA: <span className="font-normal font-mono text-app-text/80">{packingList.date}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">
                VENDEDOR: <span className="font-normal uppercase text-app-text/90">{seller?.name || 'Vendedor Autorizado'}</span>
              </p>
            </div>
          </div>

          {/* Detailed Metrajes Grid for Bottom Half (Full width representation) */}
          <div className="space-y-2">
            {Object.keys(groupedItems).map(articleId => {
              const groupItems = groupedItems[articleId];
              const articleName = getArticleName(articleId);
              const articleTotalMeters = groupItems.reduce((acc, item) => acc + Number(item.meters || 0), 0);
              const articleTotalWeight = groupItems.reduce((acc, item) => acc + parseNumericWeight(item.weight), 0);
              
              const uniqueLots = Array.from(new Set(groupItems.map(item => item.lot).filter(Boolean)));
              const uniquePartidas = Array.from(new Set(groupItems.map(item => item.partida).filter(Boolean)));
              const lotText = showLot && uniqueLots.length > 0 ? `LOTE: ${uniqueLots.join(', ')}` : '';
              const partidaText = showPartida && uniquePartidas.length > 0 ? `PARTIDA: ${uniquePartidas.join(', ')}` : '';
              const attributesText = [lotText, partidaText].filter(Boolean).join(' | ');

              return (
                <div key={articleId} className="text-[9px]">
                  <div className="font-extrabold text-app-primary uppercase tracking-tight text-[9.5px] mb-0.5">
                    {articleName} {attributesText ? `(${attributesText})` : ''}
                  </div>
                  
                  {/* Grid of metrajes (clean, aligned columns - full 8 columns wide for bottom part) */}
                  <div className="grid grid-cols-8 gap-x-2 gap-y-0.5 py-0.5 font-mono text-[9px] text-left">
                    {groupItems.map((item, idx) => {
                      const hasTonoValue = hasTono && item.tono;
                      return (
                        <div key={item.id || idx} className="py-0.2">
                          <span className="font-bold">{Number(item.meters).toFixed(2)}</span>
                          {hasTonoValue && (
                            <span className="text-[7.5px] font-extrabold bg-app-primary text-white px-0.5 rounded ml-1">
                              {item.tono}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-right font-bold text-app-secondary text-[9px] mt-0.5 pr-2">
                    Subtotal: {articleTotalMeters.toFixed(2)} m{articleTotalWeight > 0 ? ` | ${articleTotalWeight.toFixed(2)} kg` : ''}
                  </div>
                </div>
              );
            })}
            {packingList.type === 'corte' && packingList.notes && (
              <div className="mt-2 border border-app-border rounded p-1.5 bg-app-bg/20 print:bg-white text-[8px] leading-snug">
                <span className="font-bold text-app-primary">NOTA:</span> {packingList.notes}
              </div>
            )}
          </div>
        </div>

        <div>
          {/* Inline Summary for Bottom Half (Only Metrics to prevent Client/Seller repetition) */}
          <div className="border-t border-app-border pt-1.5 text-[10px] font-black uppercase">
            <div className="flex justify-between items-center px-2">
              <p className="font-display text-app-primary">TOTAL METROS: <span className="font-mono text-xs">{totalMeters.toFixed(2)} m</span></p>
              {totalWeight > 0 && (
                <p className="font-display text-app-text">TOTAL PESO: <span className="font-mono text-xs">{totalWeight.toFixed(2)} kg</span></p>
              )}
              <p className="font-display text-app-secondary">CANTIDAD DE ROLLOS: <span className="font-mono text-xs">{totalRolls}</span></p>
            </div>
          </div>

          {packingList.type === 'antiguo' && (
            <div className="aviso-importante mt-4 border border-app-border rounded-lg p-2.5 bg-app-surface text-app-text print:text-black print:border-black print:bg-white">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-app-primary mb-1.5 text-center border-b border-app-border pb-0.5 py-0.5 rounded print:text-black print:border-black">
                AVISO IMPORTANTE
              </h3>
              <div className="text-[8px] font-medium leading-normal uppercase">
                <p className="mb-1">
                  1. EL CLIENTE DEBERÁ <strong className="font-extrabold">FOLIAR O NUMERAR</strong> LAS CAPAS TENDIDAS DE TELA, INDEPENDIENTEMENTE DE QUE SEA O NO DEL MISMO LOTE. ELLO, PARA CONSTATAR EL COLOR Y ENCOGIMIENTO DE LA MERCANCÍA.
                </p>
                <p className="mb-1">
                  2. <strong className="font-extrabold">NO CORTE</strong> EL ROLLO ANTES DE COMPROBAR: CALIDAD, CANTIDAD DE METRAJE, SOLIDEZ DE COLOR, ETC.
                </p>
                <p className="font-black text-center pt-1 border-t border-app-border print:border-black">
                  DE NO CUMPLIR EL CLIENTE CON LOS 2 PUNTOS SEÑALADOS ANTERIORMENTE, ABSTENERSE DE RECLAMOS. GRACIAS POR SU COOPERACIÓN.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENT: HIGH-FIDELITY GUIA DE REMISIÓN ELECTRONICA (SUNAT)
// ============================================================================

interface GuiaRemisionPrintSheetProps {
  guiaSeries: string;
  guiaNumber: string;
  fechaHoraEmision: string;
  formattedFechaTraslado: string;
  puntoPartida: string;
  puntoLlegada: string;
  clientRuc: string;
  clientName: string;
  motivo: string;
  pesoBruto: string;
  unidadMedida: string;
  driverName: string;
  driverLicense: string;
  vehiclePlate: string;
  observaciones: string;
  despachadorName: string;
  despachadorDni: string;
  packingList: PackingList;
  getArticleName: (id: string) => string;
  groupedItems: Record<string, PackingListItem[]>;
}

function GuiaRemisionPrintSheet({
  guiaSeries,
  guiaNumber,
  fechaHoraEmision,
  formattedFechaTraslado,
  puntoPartida,
  puntoLlegada,
  clientRuc,
  clientName,
  motivo,
  pesoBruto,
  unidadMedida,
  driverName,
  driverLicense,
  vehiclePlate,
  observaciones,
  despachadorName,
  despachadorDni,
  getArticleName,
  groupedItems,
}: GuiaRemisionPrintSheetProps) {
  
  // Group packing list items by Article ID and calculate summaries
  const itemsList = React.useMemo(() => {
    return Object.keys(groupedItems).map((articleId, index) => {
      const items = groupedItems[articleId];
      const articleName = getArticleName(articleId);
      const totalArticleMeters = items.reduce((acc, item) => acc + Number(item.meters || 0), 0);
      const rollCount = items.length;
      return {
        itemNo: index + 1,
        code: articleId.substring(0, 9).toUpperCase(),
        description: articleName.toUpperCase(),
        pieces: rollCount,
        unit: 'METRO',
        quantity: totalArticleMeters.toFixed(2),
      };
    });
  }, [groupedItems, getArticleName]);

  return (
    <div translate="no" className="notranslate bg-white text-black p-8 border border-gray-300 rounded-xl shadow-lg font-sans max-w-3xl w-full my-2 min-h-[296mm] flex flex-col justify-between print-page print:border-none print:shadow-none print:p-0 print:my-0 print:bg-white box-border">
      
      <div>
        {/* Top Header: Issuer left, RUC Box right */}
        <div className="flex justify-between items-start gap-4 mb-1">
          
          {/* Issuer Details */}
          <div className="flex-1 flex gap-4 items-center">
            {/* Styled Circle with J Green Logo */}
            <img 
              src="/logo-juditex.png" 
              alt="Juditex" 
              className="h-32 sm:h-36 w-auto shrink-0 object-contain print:opacity-100 max-h-[140px]" 
              referrerPolicy="no-referrer"
            />
            <div className="space-y-1">
              <h1 className="text-[#1B5E20] text-lg font-black tracking-tight leading-none uppercase">DEALER TEXTIL SRL</h1>
              <p className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wide leading-tight">
                CALLE IGNACIO COSSIO NRO. 1363 (UBICADO FRENTE A UN PARQUE) LIMA - LIMA - LA VICTORIA
              </p>
              <p className="text-[8px] font-semibold text-gray-400 uppercase leading-none mt-1">
                Moda con estilo sostenible • Almacén Central de Distribución
              </p>
            </div>
          </div>

          {/* Official SUNAT RUC Box */}
          <div className="w-60 border border-black p-3.5 text-center bg-white space-y-1 rounded shrink-0">
            <p className="text-[11px] font-black tracking-wider text-gray-800">R.U.C. 20509615595</p>
            <h2 className="text-[9.5px] font-black tracking-wider text-gray-900 uppercase py-0.5 border-y border-gray-200">
              GUÍA DE REMISIÓN REMITENTE
            </h2>
            <p className="text-xs font-black text-red-600 tracking-widest font-mono pt-1">
              N° {guiaSeries}-{guiaNumber}
            </p>
          </div>
        </div>

        {/* Section 1: Dates & Places */}
        <div className="grid grid-cols-12 gap-x-4 gap-y-2 text-[9px] border-b border-gray-200 pb-3 mb-3">
          <div className="col-span-12 md:col-span-6 space-y-1.5">
            <div className="flex">
              <span className="w-32 font-black uppercase text-gray-500 shrink-0">Fecha de Emisión:</span>
              <span className="font-mono font-bold text-gray-800">{fechaHoraEmision}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-black uppercase text-gray-500 shrink-0">Inicio de traslado:</span>
              <span className="font-mono font-bold text-gray-800">{formattedFechaTraslado}</span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 space-y-1.5">
            <div className="flex items-start">
              <span className="w-28 font-black uppercase text-gray-500 shrink-0">RUC Destinatario:</span>
              <span className="font-mono font-bold text-gray-800 uppercase shrink-0">{clientRuc}</span>
            </div>
            <div className="flex items-start">
              <span className="w-28 font-black uppercase text-gray-500 shrink-0">Destinatario:</span>
              <span className="font-bold text-gray-900 uppercase leading-tight">{clientName}</span>
            </div>
          </div>

          <div className="col-span-12 space-y-1 pt-2 border-t border-gray-100">
            <div className="flex items-start">
              <span className="w-28 font-black uppercase text-gray-500 shrink-0">Punto de partida:</span>
              <span className="font-medium text-gray-800 uppercase leading-snug">{puntoPartida}</span>
            </div>
            <div className="flex items-start">
              <span className="w-28 font-black uppercase text-gray-500 shrink-0">Punto de llegada:</span>
              <span className="font-extrabold text-gray-950 uppercase leading-snug bg-gray-50 px-1 py-0.5 rounded border border-gray-100">{puntoLlegada}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Detalle de la guía */}
        <div className="mb-3">
          <div className="bg-gray-100 px-3 py-1 font-black text-[8.5px] uppercase tracking-wider text-gray-700 border-l-4 border-gray-500 mb-2">
            DETALLE DEL TRASLADO:
          </div>
          <div className="grid grid-cols-5 gap-2 text-[8.5px] text-gray-800 bg-gray-50 border border-gray-200 p-2 rounded">
            <div>
              <p className="font-black uppercase text-gray-400 text-[7.5px]">Modalidad</p>
              <p className="font-bold uppercase mt-0.5">PRIVADO</p>
            </div>
            <div>
              <p className="font-black uppercase text-gray-400 text-[7.5px]">Motivo Traslado</p>
              <p className="font-bold uppercase mt-0.5 text-app-primary">{motivo}</p>
            </div>
            <div>
              <p className="font-black uppercase text-gray-400 text-[7.5px]">Descripción</p>
              <p className="font-bold uppercase mt-0.5 text-gray-400">- - -</p>
            </div>
            <div>
              <p className="font-black uppercase text-gray-400 text-[7.5px]">U. M.</p>
              <p className="font-bold uppercase mt-0.5">{unidadMedida}</p>
            </div>
            <div>
              <p className="font-black uppercase text-gray-400 text-[7.5px]">Peso Bruto Total</p>
              <p className="font-mono font-black text-gray-900 mt-0.5">{Number(pesoBruto).toFixed(3)}</p>
            </div>
          </div>
        </div>

        {/* Section 3: Items table list */}
        <div className="mb-4">
          <table className="w-full text-left border-collapse border border-gray-200 text-[9px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700 uppercase font-black text-[8px] tracking-wider border-b border-gray-300">
                <th className="py-1.5 px-2 border-r border-gray-200 w-10 text-center">ITEM</th>
                <th className="py-1.5 px-2 border-r border-gray-200 w-20 text-center">CÓDIGO</th>
                <th className="py-1.5 px-3 border-r border-gray-200">DESCRIPCIÓN DEL PRODUCTO (DENIM)</th>
                <th className="py-1.5 px-2 border-r border-gray-200 w-16 text-center">PIEZAS</th>
                <th className="py-1.5 px-2 border-r border-gray-200 w-16 text-center">UNIDAD</th>
                <th className="py-1.5 px-3 w-24 text-right">CANTIDAD</th>
              </tr>
            </thead>
            <tbody>
              {itemsList.map((item) => (
                <tr key={item.itemNo} className="border-b border-gray-200">
                  <td className="py-1.5 px-2 border-r border-gray-200 text-center font-mono font-bold text-gray-700">{item.itemNo}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 text-center font-mono text-gray-500">{item.code}</td>
                  <td className="py-1.5 px-3 border-r border-gray-200 font-bold text-gray-900 uppercase">{item.description}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 text-center font-mono font-bold text-gray-700">{item.pieces}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 text-center uppercase text-gray-500">{item.unit}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-black text-gray-900">{Number(item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 4: Datos del contenedor / transportista / vehiculo */}
        <div className="space-y-3.5 mb-4">
          
          <div className="grid grid-cols-2 gap-3">
            {/* Driver */}
            <div className="border border-gray-200 rounded p-2 text-[8.5px] space-y-1">
              <p className="font-black text-gray-400 uppercase text-[7.5px]">DATOS DEL CHOFER / TRANSPORTISTA:</p>
              <p className="font-bold text-gray-800">
                Chofer: <span className="font-black uppercase text-gray-950">{driverName}</span>
              </p>
              <p className="font-bold text-gray-800">
                Licencia: <span className="font-mono font-black text-gray-900">{driverLicense}</span>
              </p>
            </div>

            {/* Vehicle */}
            <div className="border border-gray-200 rounded p-2 text-[8.5px] space-y-1">
              <p className="font-black text-gray-400 uppercase text-[7.5px]">DATOS DE UNIDAD DE TRANSPORTE:</p>
              <p className="font-bold text-gray-800">
                Placa Vehicular: <span className="font-mono font-black text-gray-950 uppercase bg-yellow-50 px-1 py-0.5 rounded border border-yellow-100">{vehiclePlate}</span>
              </p>
              <p className="font-bold text-gray-800">
                Tipo Modalidad: <span className="uppercase text-gray-600 font-bold">TRANSPORTE PRIVADO</span>
              </p>
            </div>
          </div>

          {/* Observaciones */}
          <div className="border border-gray-200 rounded p-2 text-[8.5px]">
            <p className="font-black text-gray-400 uppercase text-[7.5px]">OBSERVACIONES:</p>
            <p className="font-medium text-gray-700 mt-1 uppercase leading-relaxed font-mono">
              {observaciones || '- - -'}
            </p>
          </div>

        </div>
      </div>

      {/* Signature and Footer Section */}
      <div className="border-t border-gray-200 pt-3 mt-2">
        
        {/* Signatures Row */}
        <div className="grid grid-cols-2 gap-6 text-[8.5px] text-center mb-3">
          <div className="space-y-1">
            <div className="h-8 flex items-end justify-center">
              <div className="border border-green-200 text-green-700 text-[7px] px-2 py-0.5 rounded-xs font-black tracking-widest uppercase rotate-[-1deg] bg-green-50/45 no-print">
                SISTEMA EMISOR ELECTRÓNICO SUNAT
              </div>
            </div>
            <div className="border-t border-gray-300 pt-1 max-w-xs mx-auto space-y-0.5">
              <p className="font-black uppercase text-gray-800">DESPACHO / ALMACÉN</p>
              <p className="text-gray-500 font-bold uppercase text-[7.5px]">{despachadorName}</p>
              {despachadorDni && <p className="text-gray-400 font-mono text-[7px]">DNI: {despachadorDni}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-8"></div>
            <div className="border-t border-gray-300 pt-1 max-w-xs mx-auto space-y-0.5">
              <p className="font-black uppercase text-gray-800">CONFORMIDAD DEL CLIENTE</p>
              <p className="text-gray-400 font-medium">Firma:</p>
              <p className="text-gray-300 font-mono text-[7px]">DNI: _______________________</p>
            </div>
          </div>
        </div>

        {/* QR & Footer block */}
        <div className="flex items-center gap-4 border-t border-gray-100 pt-3">
          
          {/* Beautiful SVG QR code */}
          <div className="border border-gray-200 p-1 bg-white shrink-0 rounded">
            <svg className="w-14 h-14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="white" />
              <rect x="5" y="5" width="20" height="20" fill="black" />
              <rect x="9" y="9" width="12" height="12" fill="white" />
              <rect x="12" y="12" width="6" height="6" fill="black" />

              <rect x="75" y="5" width="20" height="20" fill="black" />
              <rect x="79" y="9" width="12" height="12" fill="white" />
              <rect x="82" y="12" width="6" height="6" fill="black" />

              <rect x="5" y="75" width="20" height="20" fill="black" />
              <rect x="9" y="79" width="12" height="12" fill="white" />
              <rect x="12" y="82" width="6" height="6" fill="black" />

              <rect x="75" y="75" width="20" height="20" fill="black" />
              <rect x="79" y="79" width="12" height="12" fill="white" />
              <rect x="82" y="82" width="6" height="6" fill="black" />

              <rect x="30" y="5" width="4" height="4" fill="black" />
              <rect x="40" y="5" width="8" height="4" fill="black" />
              <rect x="55" y="5" width="4" height="8" fill="black" />
              <rect x="65" y="10" width="6" height="6" fill="black" />
              <rect x="30" y="20" width="4" height="4" fill="black" />
              <rect x="45" y="15" width="4" height="4" fill="black" />
              <rect x="50" y="25" width="12" height="4" fill="black" />

              <rect x="30" y="30" width="8" height="8" fill="black" />
              <rect x="45" y="35" width="12" height="4" fill="black" />
              <rect x="60" y="30" width="4" height="12" fill="black" />
              <rect x="70" y="35" width="4" height="4" fill="black" />
              <rect x="35" y="45" width="4" height="12" fill="black" />
              <rect x="45" y="45" width="8" height="4" fill="black" />
              <rect x="55" y="45" width="4" height="8" fill="black" />

              <rect x="30" y="60" width="16" height="4" fill="black" />
              <rect x="50" y="55" width="4" height="12" fill="black" />
              <rect x="65" y="55" width="8" height="8" fill="black" />
              <rect x="60" y="65" width="4" height="4" fill="black" />

              <rect x="30" y="70" width="4" height="12" fill="black" />
              <rect x="40" y="75" width="12" height="4" fill="black" />
              <rect x="55" y="70" width="6" height="6" fill="black" />
              <rect x="65" y="70" width="4" height="4" fill="black" />
            </svg>
          </div>

          {/* Official disclaimer */}
          <div className="text-[7.5px] font-semibold text-gray-400 uppercase tracking-wide leading-normal">
            <p>Representación Impresa de la Guía de Remisión Remitente Electrónica. Autorizado mediante SUNAT.</p>
            <p className="font-black text-gray-500 font-mono mt-0.5">HASH: 2E9A3C2F1D8B4E7A9C5E3D2F1B0A5F2C8E7D1C3B</p>
          </div>
        </div>
      </div>
    </div>
  );
}
