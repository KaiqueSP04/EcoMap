import { API_BASE_URL } from '@/config/api';
import { File as LocalFile } from 'expo-file-system';
import { requestJson } from '@/services/http';
import type { SelectedPhoto } from '@/types/evidence';

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function createPhotoFormData(photo: SelectedPhoto): FormData {
  const body = new FormData();
  let file: Blob;
  if (photo.file) {
    file = photo.file;
  } else {
    const localFile = new LocalFile(photo.uri);
    if (!localFile.exists) {
      throw new Error('A foto não está mais disponível. Selecione a imagem novamente.');
    }
    file = localFile;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('A foto deve ter no máximo 8 MB.');
  }
  // Expo's multipart encoder reads File.bytes(); URI descriptors are unsupported.
  body.append('file', file, photo.name);
  return body;
}

export async function uploadPhoto(photo: SelectedPhoto): Promise<string> {
  const body = createPhotoFormData(photo);
  const data = await requestJson('/uploads', {
    method: 'POST',
    body,
  }, 60000);
  if (!data || typeof data !== 'object' || !('photo_path' in data)
    || typeof data.photo_path !== 'string'
    || !/^\/uploads\/[0-9a-f]{32}\.jpg$/.test(data.photo_path)) {
    throw new Error('A API retornou uma referência de foto inválida.');
  }
  return data.photo_path;
}

export function getPhotoUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
