import { createOccurrence } from '@/services/occurrences';
import { uploadPhoto } from '@/services/photos';
import { useOccurrenceEvidence } from '@/hooks/use-occurrence-evidence';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function RegisterScreen() {
  const [category, setCategory] = useState('Calçada');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState<{ uri: string; path: string } | null>(null);
  const evidence = useOccurrenceEvidence();
  const busy = loading || evidence.selectingPhoto || evidence.locating;

  async function handleRegister() {
    if (busy) return;
    if (!category.trim()) {
      Alert.alert('Categoria obrigatória', 'Selecione uma categoria.');
      return;
    }
    if (!description.trim()) {
      Alert.alert(
        'Descrição obrigatória',
        'Informe uma descrição para a ocorrência.'
      );
      return;
    }

    try {
      setLoading(true);

      let photoPath: string | undefined;
      if (evidence.photo) {
        photoPath = uploadedPhoto?.uri === evidence.photo.uri
          ? uploadedPhoto.path
          : await uploadPhoto(evidence.photo);
        setUploadedPhoto({ uri: evidence.photo.uri, path: photoPath });
      }
      const data = await createOccurrence({
        category,
        description,
        ...(evidence.coordinates ?? {}),
        ...(photoPath ? { photo_path: photoPath } : {}),
      });

      Alert.alert(
        'Ocorrência registrada',
        `ID: ${data.id}\nCategoria: ${data.category}\nDescrição: ${data.description}`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );

      setDescription('');
      evidence.removePhoto();
      evidence.removeLocation();
      setUploadedPhoto(null);
    } catch (error) {
      console.log('ERRO AO REGISTRAR:', error);

      Alert.alert(
        'Erro ao registrar',
        String(error)
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Registrar ocorrência</Text>

      <Text style={styles.subtitle}>
        Informe os dados da ocorrência encontrada.
      </Text>

      <Text style={styles.label}>Categoria</Text>

      <View style={styles.options}>
        <TouchableOpacity
          style={
            category === 'Calçada'
              ? styles.optionSelected
              : styles.option
          }
          onPress={() => setCategory('Calçada')}
          disabled={loading}
        >
          <Text
            style={
              category === 'Calçada'
                ? styles.optionTextSelected
                : styles.optionText
            }
          >
            Calçada
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            category === 'Árvore'
              ? styles.optionSelected
              : styles.option
          }
          onPress={() => setCategory('Árvore')}
          disabled={loading}
        >
          <Text
            style={
              category === 'Árvore'
                ? styles.optionTextSelected
                : styles.optionText
            }
          >
            Árvore
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            category === 'Área verde'
              ? styles.optionSelected
              : styles.option
          }
          onPress={() => setCategory('Área verde')}
          disabled={loading}
        >
          <Text
            style={
              category === 'Área verde'
                ? styles.optionTextSelected
                : styles.optionText
            }
          >
            Área verde
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Descrição</Text>

      <TextInput
        style={styles.input}
        placeholder="Descreva o problema encontrado..."
        placeholderTextColor="#64748B"
        multiline
        value={description}
        onChangeText={setDescription}
        editable={!loading}
      />

      <Text style={styles.label}>Evidências (opcionais)</Text>

      <TouchableOpacity style={styles.actionButton} disabled={busy} onPress={() => evidence.selectPhoto(false)}>
        <Text style={styles.actionIcon}>+</Text>

        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Adicionar foto</Text>

          <Text style={styles.actionSubtitle}>
            JPEG, PNG ou WebP de até 8 MB
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionButton} disabled={busy} onPress={() => evidence.selectPhoto(true)}>
        <Text style={styles.actionIcon}>+</Text>
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Tirar foto</Text>
          <Text style={styles.actionSubtitle}>Use a câmera do aparelho</Text>
        </View>
      </TouchableOpacity>
      {evidence.selectingPhoto && <ActivityIndicator color="#4ADE80" />}
      {evidence.photo && (
        <View>
          <Image source={{ uri: evidence.photo.uri }} style={styles.photoPreview} resizeMode="cover" />
          <TouchableOpacity disabled={loading} onPress={evidence.removePhoto} style={styles.removeButton}>
            <Text style={styles.backText}>Remover foto</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.actionButton} disabled={busy} onPress={evidence.locate}>
        <Text style={styles.actionIcon}>●</Text>

        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>
            {evidence.locating ? 'Obtendo localização...' : 'Adicionar localização'}
          </Text>

          <Text style={styles.actionSubtitle}>
            Informe onde a ocorrência foi encontrada
          </Text>
        </View>
      </TouchableOpacity>
      {evidence.locating && <ActivityIndicator color="#4ADE80" />}
      {evidence.coordinates && (
        <View>
          <Text style={styles.coordinates}>
            {evidence.coordinates.latitude.toFixed(6)}, {evidence.coordinates.longitude.toFixed(6)}
          </Text>
          <TouchableOpacity disabled={loading} onPress={evidence.removeLocation} style={styles.removeButton}>
            <Text style={styles.backText}>Remover localização</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.submitButton,
          busy && styles.submitButtonDisabled,
        ]}
        onPress={handleRegister}
        disabled={busy}
      >
        <Text style={styles.submitText}>
          {loading ? 'Registrando...' : 'Registrar ocorrência'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        disabled={loading}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Voltar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 90 },
  photoPreview: { width: '100%', height: 180, borderRadius: 12, marginTop: 8 },
  removeButton: { paddingVertical: 12, alignItems: 'center' },
  coordinates: { color: '#CBD5E1', marginTop: 8 },
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 24,
    paddingTop: 60,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },

  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
    marginBottom: 30,
  },

  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 10,
  },

  options: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 25,
  },

  option: {
    flex: 1,
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  optionSelected: {
    flex: 1,
    backgroundColor: '#172A4A',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  optionText: {
    color: '#94A3B8',
    fontWeight: '600',
  },

  optionTextSelected: {
    color: '#60A5FA',
    fontWeight: 'bold',
  },

  input: {
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 12,
    height: 105,
    padding: 15,
    color: '#F1F5F9',
    textAlignVertical: 'top',
    marginBottom: 24,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#172A4A',
    color: '#60A5FA',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 38,
    marginRight: 12,
  },

  actionContent: {
    flex: 1,
  },

  actionTitle: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 15,
  },

  actionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },

  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 15,
  },

  submitButtonDisabled: {
    opacity: 0.6,
  },

  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  backButton: {
    alignItems: 'center',
    marginTop: 18,
  },

  backText: {
    color: '#94A3B8',
  },
});
