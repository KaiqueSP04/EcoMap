import { getOccurrences } from '@/services/occurrences';
import { getPhotoUrl } from '@/services/photos';
import type { Occurrence } from '@/types/occurrence';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function DetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [occurrence, setOccurrence] =
    useState<Occurrence | null>(null);

  const [loading, setLoading] = useState(true);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function loadOccurrence() {
      setLoading(true);
      setError(null);
      setPhotoFailed(false);
      setOccurrence(null);
      const selectedId = Number(id);
      if (typeof id !== 'string' || !Number.isInteger(selectedId) || selectedId <= 0) {
        setLoading(false);
        return;
      }
      try {
        const data = await getOccurrences();
        if (active) setOccurrence(data.find(item => item.id === selectedId) ?? null);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Falha ao carregar ocorrência.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOccurrence();
    return () => { active = false; };
  }, [id, attempt]));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ADE80" />

        <Text style={styles.loadingText}>
          Carregando ocorrência...
        </Text>
      </View>
    );
  }

  if (error || !occurrence) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>
          {error ? 'Não foi possível carregar a ocorrência' : 'Ocorrência não encontrada'}
        </Text>
        {error && (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.backButton} onPress={() => setAttempt(value => value + 1)}>
              <Text style={styles.backText}>Tentar novamente</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isResolved = occurrence.status === 'Resolvida';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 90 }}>
      <Text style={styles.title}>
        Detalhes da ocorrência
      </Text>

      {occurrence.photo_path && !photoFailed ? (
        <Image
          source={{ uri: getPhotoUrl(occurrence.photo_path) }}
          style={styles.photo}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imageIcon}>+</Text>
          <Text style={styles.imageText}>
            {photoFailed ? 'Foto indisponível' : 'Foto da ocorrência'}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.topRow}>
          <Text style={styles.category}>
            {occurrence.category}
          </Text>

          <View
            style={
              isResolved
                ? styles.resolvedBadge
                : styles.statusBadge
            }
          >
            <Text
              style={
                isResolved
                  ? styles.resolved
                  : styles.status
              }
            >
              {occurrence.status}
            </Text>
          </View>
        </View>

        <Text style={styles.problem}>
          {occurrence.category}
        </Text>

        <Text style={styles.description}>
          {occurrence.description}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Informações
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>ID</Text>

          <Text style={styles.infoValue}>
            #{occurrence.id}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>

          <Text style={styles.infoValue}>
            {occurrence.status}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>
            Localização
          </Text>

          <Text style={styles.infoValue}>
            {occurrence.latitude != null && occurrence.longitude != null
              ? `${occurrence.latitude.toFixed(6)}, ${occurrence.longitude.toFixed(6)}`
              : 'Não informada'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Voltar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  errorText: { color: '#94A3B8', marginBottom: 12 },
  photo: { width: '100%', height: 190, borderRadius: 14 },
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 24,
    paddingTop: 60,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B1220',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 25,
  },

  imagePlaceholder: {
    height: 190,
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  imageIcon: {
    color: '#475569',
    fontSize: 28,
    fontWeight: 'bold',
  },

  imageText: {
    color: '#64748B',
    marginTop: 5,
  },

  section: {
    marginTop: 22,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  category: {
    color: '#4ADE80',
    fontWeight: 'bold',
    fontSize: 15,
  },

  statusBadge: {
    backgroundColor: '#332B10',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  status: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: '600',
  },

  resolvedBadge: {
    backgroundColor: '#123322',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  resolved: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
  },

  problem: {
    color: '#F1F5F9',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
  },

  description: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },

  infoCard: {
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 14,
    padding: 18,
    marginTop: 24,
  },

  infoTitle: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },

  infoLabel: {
    color: '#64748B',
  },

  infoValue: {
    color: '#CBD5E1',
    fontWeight: '600',
  },

  backButton: {
    alignItems: 'center',
    marginTop: 20,
  },

  backText: {
    color: '#94A3B8',
  },
});
