import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RecordScreen from './src/screens/RecordScreen';
import HistoryScreen from './src/screens/HistoryScreen';

type Tab = 'record' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('record');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.screen}>{tab === 'record' ? <RecordScreen /> : <HistoryScreen />}</View>
      <View style={styles.tabBar}>
        <Pressable onPress={() => setTab('record')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'record' && styles.tabLabelActive]}>Record</Text>
        </Pressable>
        <Pressable onPress={() => setTab('history')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'history' && styles.tabLabelActive]}>History</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0b10' },
  screen: { flex: 1 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#26262f' },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabLabel: { color: '#6c6c78', fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
});
