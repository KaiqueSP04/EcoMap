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
