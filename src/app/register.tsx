import { createOccurrence } from '@/services/occurrences';
import { suggestCategory } from '@/services/categories';
import { describePhoto, improveDescription } from '@/services/descriptions';
import type { DescriptionSuggestion } from '@/types/description-suggestion';
import type { CategorySuggestion } from '@/types/occurrence';
import { uploadPhoto } from '@/services/photos';
import { useOccurrenceEvidence } from '@/hooks/use-occurrence-evidence';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const suggestionVersion = useRef(0);
  const suggestionInFlight = useRef(false);
  const registering = useRef(false);
  const [assisting, setAssisting] = useState(false);
  const [descriptionSuggestion, setDescriptionSuggestion] = useState<DescriptionSuggestion | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const descriptionVersion = useRef(0);
  const descriptionInFlight = useRef(false);

  useFocusEffect(useCallback(() => {
    return () => {
      suggestionVersion.current++;
      descriptionVersion.current++;
      setSuggestion(null);
      setSuggestionError(null);
      setDescriptionSuggestion(null);
      setDescriptionError(null);
    };
  }, []));

  function changeDescription(value: string) {
    invalidateDescriptionSuggestion();
    suggestionVersion.current++;
    setDescription(value);
    setSuggestion(null);
    setSuggestionError(null);
  }

  function invalidateDescriptionSuggestion() {
    descriptionVersion.current++;
    setDescriptionSuggestion(null);
    setDescriptionError(null);
  }

  async function selectPhoto(camera: boolean) {
    invalidateDescriptionSuggestion();
    await evidence.selectPhoto(camera);
  }

  async function handleDescriptionSuggestion(fromPhoto: boolean, expectedVersion = descriptionVersion.current) {
    if (descriptionInFlight.current || suggestionInFlight.current || busy || registering.current
      || expectedVersion !== descriptionVersion.current
      || (fromPhoto ? !evidence.photo : !description.trim() || description.length > 2000)) return;
    descriptionInFlight.current = true;
    const version = ++descriptionVersion.current;
    setAssisting(true);
    setDescriptionSuggestion(null);
    setDescriptionError(null);
    try {
      const result = fromPhoto && evidence.photo
        ? await describePhoto(evidence.photo)
        : await improveDescription(description);
      if (version === descriptionVersion.current) setDescriptionSuggestion(result);
    } catch (error) {
      if (version === descriptionVersion.current) {
        setDescriptionError(error instanceof Error ? error.message : 'Não foi possível consultar a IA.');
      }
    } finally {
      descriptionInFlight.current = false;
      setAssisting(false);
    }
  }

  function confirmImageProcessing() {
    if (busy || descriptionInFlight.current || suggestionInFlight.current) return;
    const version = descriptionVersion.current;
    Alert.alert('Enviar foto ao Google?',
      'A foto será processada pelo serviço externo Gemini, do Google, para sugerir uma descrição. '
      + 'Os metadados serão removidos pelo EcoMap; o conteúdo visível da foto será enviado. '
      + 'Evite fotos com pessoas ou informações pessoais. Deseja continuar?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar foto', onPress: () => { void handleDescriptionSuggestion(true, version); } },
      ]);
  }

  async function handleSuggestCategory() {
    if (suggestionInFlight.current || descriptionInFlight.current || busy || !description.trim() || description.length > 2000) return;
    suggestionInFlight.current = true;
    const version = ++suggestionVersion.current;
    setSuggesting(true);
    setSuggestion(null);
    setSuggestionError(null);
    try {
      const result = await suggestCategory(description);
      if (version === suggestionVersion.current) setSuggestion(result);
    } catch (error) {
      if (version === suggestionVersion.current) {
        setSuggestionError(error instanceof Error ? error.message : 'Não foi possível consultar a IA.');
      }
    } finally {
      suggestionInFlight.current = false;
      setSuggesting(false);
    }
  }

  async function handleRegister() {
    if (busy || registering.current) return;
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
      registering.current = true;
      suggestionVersion.current++;
      invalidateDescriptionSuggestion();
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

      changeDescription('');
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
      registering.current = false;
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
        onChangeText={changeDescription}
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.aiButton, (busy || suggesting || assisting || !description.trim() || description.length > 2000) && styles.submitButtonDisabled]}
        disabled={busy || suggesting || assisting || !description.trim() || description.length > 2000}
        onPress={() => handleDescriptionSuggestion(false)}
      >
        <Text style={styles.actionTitle}>Melhorar texto com IA</Text>
      </TouchableOpacity>
      <Text style={styles.aiHint}>Opcional: o texto será enviado ao Gemini, do Google. Revise a sugestão antes de usar.</Text>
      {assisting && <View><ActivityIndicator color="#4ADE80" /><Text style={styles.aiHint}>Elaborando descrição...</Text></View>}
      {descriptionSuggestion && (
        <View style={styles.aiResult}>
          <Text style={styles.actionTitle}>{descriptionSuggestion.description ?? descriptionSuggestion.message}</Text>
          {descriptionSuggestion.description && <>
            <Text style={styles.aiHint}>{descriptionSuggestion.message}</Text>
            <View style={styles.aiActions}>
              <TouchableOpacity disabled={loading} style={styles.aiAction} onPress={() => {
                if (!registering.current && descriptionSuggestion.description) changeDescription(descriptionSuggestion.description);
              }}><Text style={styles.aiAccept}>Usar descrição</Text></TouchableOpacity>
              <TouchableOpacity disabled={loading} style={styles.aiAction} onPress={invalidateDescriptionSuggestion}>
                <Text style={styles.backText}>Ignorar descrição</Text>
              </TouchableOpacity>
            </View>
          </>}
        </View>
      )}
      {descriptionError && <Text style={styles.aiError}>{descriptionError} Você pode continuar o cadastro manual.</Text>}

      <TouchableOpacity
        style={[styles.aiButton, (busy || suggesting || !description.trim() || description.length > 2000) && styles.submitButtonDisabled]}
        disabled={busy || suggesting || assisting || !description.trim() || description.length > 2000}
        onPress={handleSuggestCategory}
      >
        {suggesting && <ActivityIndicator color="#4ADE80" />}
        <Text style={styles.actionTitle}>{suggesting ? 'Consultando IA...' : 'Sugerir categoria com IA'}</Text>
      </TouchableOpacity>
      <Text style={styles.aiHint}>Opcional: somente a descrição será enviada à IA. Você decide se aceita.</Text>
      {description.length > 2000 && <Text style={styles.aiHint}>A IA aceita até 2.000 caracteres. O cadastro manual continua disponível.</Text>}
      {suggestion && (
        <View style={styles.aiResult}>
          <Text style={styles.actionTitle}>{suggestion.category ? `Sugestão: ${suggestion.category}` : suggestion.message}</Text>
          {suggestion.category && (
            <View style={styles.aiActions}>
              <TouchableOpacity disabled={loading} style={styles.aiAction} onPress={() => {
                if (!registering.current && suggestion.category) { setCategory(suggestion.category); setSuggestion(null); }
              }}>
                <Text style={styles.aiAccept}>Usar sugestão</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={loading} style={styles.aiAction} onPress={() => setSuggestion(null)}>
                <Text style={styles.backText}>Ignorar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {suggestionError && <Text style={styles.aiError}>{suggestionError} Você pode continuar o cadastro manual.</Text>}

      <Text style={styles.label}>Evidências (opcionais)</Text>

      <TouchableOpacity style={styles.actionButton} disabled={busy} onPress={() => selectPhoto(false)}>
        <Text style={styles.actionIcon}>+</Text>

        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Adicionar foto</Text>

          <Text style={styles.actionSubtitle}>
            JPEG, PNG ou WebP de até 8 MB
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionButton} disabled={busy} onPress={() => selectPhoto(true)}>
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
          <TouchableOpacity disabled={loading} onPress={() => { invalidateDescriptionSuggestion(); evidence.removePhoto(); }} style={styles.removeButton}>
            <Text style={styles.backText}>Remover foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiButton} disabled={busy || suggesting || assisting} onPress={confirmImageProcessing}>
            {assisting && <ActivityIndicator color="#4ADE80" />}
            <Text style={styles.actionTitle}>Gerar descrição com IA</Text>
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
  aiButton: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111C2E', borderWidth: 1, borderColor: '#24344D', padding: 14, borderRadius: 12 },
  aiHint: { color: '#94A3B8', fontSize: 12, marginTop: 8, marginBottom: 12 },
  aiResult: { backgroundColor: '#111C2E', padding: 12, borderRadius: 12, marginBottom: 14 },
  aiActions: { flexDirection: 'row', gap: 20 },
  aiAction: { paddingVertical: 12 },
  aiAccept: { color: '#4ADE80', fontWeight: '600' },
  aiError: { color: '#FCA5A5', marginBottom: 14 },
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
