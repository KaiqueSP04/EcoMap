import { requestJson } from '@/services/http';
import { createPhotoFormData } from '@/services/photos';
import type { DescriptionSuggestion } from '@/types/description-suggestion';
import type { SelectedPhoto } from '@/types/evidence';

function parseSuggestion(data: unknown): DescriptionSuggestion {
  if (!data || typeof data !== 'object' || !('description' in data) || !('message' in data)
    || !('reason' in data) || typeof data.message !== 'string'
    || !['suggested', 'not_identified', 'unavailable', 'timeout', 'rate_limited', 'invalid_response'].includes(String(data.reason))
    || (data.description !== null && (typeof data.description !== 'string'
      || !data.description.trim() || data.description.length > 600))
    || (data.reason === 'suggested') !== (data.description !== null)) {
    throw new Error('A IA retornou uma descrição inválida. Continue escrevendo manualmente.');
  }
  return { description: data.description, message: data.message };
}

export async function describePhoto(photo: SelectedPhoto): Promise<DescriptionSuggestion> {
  return parseSuggestion(await requestJson('/occurrences/describe-image', {
    method: 'POST', body: createPhotoFormData(photo),
  }, 60000));
}

export async function improveDescription(description: string): Promise<DescriptionSuggestion> {
  return parseSuggestion(await requestJson('/occurrences/improve-description', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  }, 35000));
}
