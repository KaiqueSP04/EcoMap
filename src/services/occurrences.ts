import { requestJson } from '@/services/http';
import type { Occurrence, OccurrenceCreate, OccurrenceStatus, OccurrenceSummary } from '@/types/occurrence';

export function summarizeOccurrences(occurrences: readonly Occurrence[]): OccurrenceSummary {
  // Registered is the total submitted, including occurrences whose status has changed.
  const summary = { registered: occurrences.length, inAnalysis: 0, resolved: 0 };
  for (const occurrence of occurrences) {
    if (occurrence.status === 'Em análise') summary.inAnalysis++;
    if (occurrence.status === 'Resolvida') summary.resolved++;
  }
  return summary;
}

function isOccurrence(value: unknown): value is Occurrence {
  if (!value || typeof value !== 'object') return false;
  return 'id' in value && typeof value.id === 'number' && Number.isInteger(value.id)
    && 'category' in value && typeof value.category === 'string'
    && 'description' in value && typeof value.description === 'string'
    && 'status' in value && typeof value.status === 'string'
    && (!('latitude' in value) || value.latitude == null || (typeof value.latitude === 'number' && Number.isFinite(value.latitude)))
    && (!('longitude' in value) || value.longitude == null || (typeof value.longitude === 'number' && Number.isFinite(value.longitude)))
    && (!('photo_path' in value) || value.photo_path == null || (typeof value.photo_path === 'string' && /^\/uploads\/[0-9a-f]{32}\.jpg$/.test(value.photo_path)));
}

export async function getOccurrences(): Promise<Occurrence[]> {
  const data = await requestJson('/occurrences');
  if (!Array.isArray(data) || !data.every(isOccurrence)) {
    throw new Error('A API retornou uma lista de ocorrências inválida.');
  }
  return data;
}

export async function createOccurrence(
  occurrence: OccurrenceCreate
): Promise<Occurrence> {
  const data = await requestJson('/occurrences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(occurrence),
  }, 30000);
  if (!isOccurrence(data)) {
    throw new Error('A API retornou uma ocorrência inválida.');
  }
  return data;
}

export async function updateOccurrenceStatus(
  id: number,
  status: OccurrenceStatus
): Promise<Occurrence> {
  const data = await requestJson(`/occurrences/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!isOccurrence(data) || data.id !== id || data.status !== status) {
    throw new Error('A API retornou uma atualização de status inválida. Recarregue os detalhes.');
  }
  return data;
}
