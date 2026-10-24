import { requestJson } from '@/services/http';
import { OCCURRENCE_CATEGORIES, type CategorySuggestion } from '@/types/occurrence';

export async function suggestCategory(description: string): Promise<CategorySuggestion> {
  const data = await requestJson('/occurrences/suggest-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  }, 35000);
  if (!data || typeof data !== 'object' || !('category' in data) || !('reason' in data)
    || !('message' in data) || typeof data.message !== 'string'
    || (data.category !== null && !OCCURRENCE_CATEGORIES.some(category => category === data.category))
    || !['suggested', 'not_classified', 'unavailable', 'timeout', 'rate_limited', 'invalid_response'].includes(String(data.reason))
    || (data.reason === 'suggested') !== (data.category !== null)) {
    throw new Error('A IA retornou uma sugestão inválida. Escolha a categoria manualmente.');
  }
  // Construct a validated value rather than casting the untrusted response.
  const category = OCCURRENCE_CATEGORIES.find(category => category === data.category) ?? null;
  return { category, message: data.message };
}
