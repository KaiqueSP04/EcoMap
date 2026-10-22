import { fetch } from 'expo/fetch';

import { API_BASE_URL } from '@/config/api';

export async function requestJson(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`A API retornou HTTP ${response.status}.`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('A API retornou uma resposta inválida. Tente novamente.');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('A API demorou para responder. Confira a conexão e tente novamente.');
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível conectar à API. Confira o Wi-Fi e se o backend está iniciado.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
