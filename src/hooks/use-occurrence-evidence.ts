import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { MAX_PHOTO_BYTES } from '@/services/photos';
import type { Coordinates, SelectedPhoto } from '@/types/evidence';

function permissionDenied(message: string, canAskAgain: boolean) {
  Alert.alert('Permissão necessária', message, [
    { text: 'OK' },
    ...(!canAskAgain && Platform.OS !== 'web'
      ? [{ text: 'Abrir configurações', onPress: () => { void Linking.openSettings(); } }]
      : []),
  ]);
}

export function useOccurrenceEvidence() {
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [selectingPhoto, setSelectingPhoto] = useState(false);
  const [locating, setLocating] = useState(false);

  async function selectPhoto(camera: boolean) {
    if (selectingPhoto) return;
    setSelectingPhoto(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          permissionDenied('Permita o uso da câmera para tirar uma foto.', permission.canAskAgain);
          return;
        }
      }
      // The system gallery picker does not require broad library access on current OS versions.
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        Alert.alert('Foto muito grande', 'Selecione uma foto de até 8 MB.');
        return;
      }
      setPhoto({
        uri: asset.uri,
        name: asset.fileName || 'foto.jpg',
        mimeType: asset.mimeType || 'image/jpeg',
        file: asset.file,
      });
    } catch {
      Alert.alert('Erro ao selecionar foto', 'Não foi possível abrir a câmera ou galeria. Verifique as permissões e tente novamente.');
    } finally {
      setSelectingPhoto(false);
    }
  }

  async function locate() {
    if (locating) return;
    setLocating(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        permissionDenied('Permita a localização durante o uso do aplicativo.', permission.canAskAgain);
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('Localização desativada', 'Ative a localização do aparelho e tente novamente.');
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 20000);
        }),
      ]);
      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      Alert.alert('Localização indisponível', 'Não foi possível obter a posição. Tente novamente em um local aberto ou continue sem localização.');
    } finally {
      if (timer) clearTimeout(timer);
      setLocating(false);
    }
  }

  return {
    photo, coordinates, selectingPhoto, locating,
    selectPhoto, locate,
    removePhoto: () => setPhoto(null),
    removeLocation: () => setCoordinates(null),
  };
}
