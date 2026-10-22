import { API_BASE_URL } from '@/config/api';
import type { Occurrence, OccurrenceCreate } from '@/types/occurrence';

export async function getOccurrences(): Promise<Occurrence[]> {
  const response = await fetch(`${API_BASE_URL}/occurrences`);

  if (!response.ok) {
    throw new Error('Erro ao buscar ocorrências.');
  }

  return response.json();
}

export async function createOccurrence(
  occurrence: OccurrenceCreate
): Promise<Occurrence> {
  const response = await fetch(`${API_BASE_URL}/occurrences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(occurrence),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
}
