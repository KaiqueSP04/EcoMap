import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>EcoMap</Text>

          <Text style={styles.subtitle}>
            Monitoramento ambiental
          </Text>
        </View>

        <View style={styles.iconCircle}>
          <Text style={styles.icon}>E</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.greeting}>Olá!</Text>

        <Text style={styles.description}>
          Registre problemas ambientais encontrados na cidade e acompanhe as
          ocorrências registradas.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/register')}
        >
          <Text style={styles.primaryButtonText}>
            + Registrar ocorrência
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/occurrences')}
        >
          <Text style={styles.secondaryButtonText}>
            Ver ocorrências
          </Text>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Resumo</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Registradas</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Em análise</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Resolvidas</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footer}>
        Juntos por uma cidade melhor
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 24,
    paddingTop: 65,
    paddingBottom: 30,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 45,
  },

  logo: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#4ADE80',
  },

  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    color: '#4ADE80',
    fontSize: 18,
    fontWeight: 'bold',
  },

  content: {
    flex: 1,
  },

  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#94A3B8',
    marginBottom: 28,
  },

  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  secondaryButton: {
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '600',
  },

  sectionHeader: {
    marginTop: 32,
    marginBottom: 12,
  },

  sectionTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: 'bold',
  },

  statsContainer: {
    width: '100%',
    flexDirection: 'column',
    gap: 10,
  },

  statCard: {
    width: '100%',
    height: 58,
    backgroundColor: '#111C2E',
    borderWidth: 1,
    borderColor: '#24344D',
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  statNumber: {
    width: 42,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4ADE80',
    textAlign: 'center',
    marginRight: 12,
  },

  statLabel: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },

  footer: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
  },
});