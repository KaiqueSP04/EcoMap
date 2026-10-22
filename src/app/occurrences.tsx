import { getOccurrences } from '@/services/occurrences';
import type { Occurrence } from '@/types/occurrence';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function OccurrencesScreen() {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOccurrences() {
    try {
      setLoading(true);

      const data = await getOccurrences();

      setOccurrences(data);
    } catch (error) {
      console.log('ERRO AO BUSCAR OCORRÊNCIAS:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOccurrences();
  }, []);

  function getStatusStyle(status: string) {
    if (status === 'Resolvida') {
      return {
        badge: styles.resolvedBadge,
        text: styles.resolved,
      };
    }

    return {
      badge: styles.statusBadge,
      text: styles.status,
    };
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ocorrências</Text>

      <Text style={styles.subtitle}>
        Ocorrências registradas na sua região
      </Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADE80" />
          <Text style={styles.loadingText}>
            Carregando ocorrências...
          </Text>
        </View>
      ) : occurrences.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            Nenhuma ocorrência registrada
          </Text>

          <Text style={styles.emptyText}>
            Registre uma ocorrência para ela aparecer aqui.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {occurrences.map((occurrence) => {
            const statusStyle = getStatusStyle(
              occurrence.status
            );

            return (
              <TouchableOpacity
                key={occurrence.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/details',
                    params: { id: occurrence.id.toString() },
                })
}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.category}>
                    {occurrence.category}
                  </Text>

                  <View style={statusStyle.badge}>
                    <Text style={statusStyle.text}>
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

                <View style={styles.cardFooter}>
                  <Text style={styles.location}>
                    Ocorrência #{occurrence.id}
                  </Text>

                  <Text style={styles.arrow}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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

const styles = StyleSheet.create({
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
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 6,
    marginBottom: 25,
  },

  list: {
    flex: 1,
  },

  card: {
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  category: {
    color: '#4ADE80',
    fontWeight: 'bold',
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
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  description: {
    color: '#94A3B8',
    lineHeight: 21,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
  },

  location: {
    color: '#64748B',
    fontSize: 13,
  },

  arrow: {
    color: '#64748B',
    fontSize: 24,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: 'bold',
  },

  emptyText: {
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },

  backButton: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },

  backText: {
    color: '#94A3B8',
  },
});
