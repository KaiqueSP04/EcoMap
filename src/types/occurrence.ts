export type Occurrence = {
  id: number;
  category: string;
  description: string;
  status: string;
};

export type OccurrenceCreate = {
  category: string;
  description: string;
};
