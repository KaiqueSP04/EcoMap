export const OCCURRENCE_STATUSES = ['Registrada', 'Em análise', 'Resolvida'] as const;

export type OccurrenceStatus = typeof OCCURRENCE_STATUSES[number];

export const OCCURRENCE_CATEGORIES = ['Calçada', 'Árvore', 'Área verde'] as const;
export type OccurrenceCategory = typeof OCCURRENCE_CATEGORIES[number];
export type CategorySuggestion = { category: OccurrenceCategory | null; message: string };

export type Occurrence = {
  id: number;
  category: string;
  description: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_path?: string | null;
};

export type OccurrenceCreate = {
  category: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_path?: string | null;
};

export type OccurrenceSummary = {
  registered: number;
  inAnalysis: number;
  resolved: number;
};
