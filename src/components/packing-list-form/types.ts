export interface FormRollEntry {
  id: string;
  rollId?: string; // Selected warehouse roll ID (if source === 'inventory')
  rollNumber: string; // Roll or item tag identifier
  meters: number | string;
  maxMeters?: number; // Helper limit from stock
  lot?: string;
  partida?: string;
  tono?: string;
  width?: string;
  weight?: string;
}

export interface FormArticleGroup {
  id: string;
  providerId: string;
  articleId: string;
  lot: string;
  partida: string;
  tono: string;
  source: 'inventory' | 'custom';
  rolls: FormRollEntry[];
  hasProcessedExcel?: boolean;
}
