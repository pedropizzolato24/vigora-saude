import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Share,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';

const CRASH_FILE = FileSystem.documentDirectory
  ? FileSystem.documentDirectory.replace('Documents/', '') + 'files/crash_report.txt'
  : null;

export function CrashReportViewer() {
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !CRASH_FILE) return;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(CRASH_FILE);
        if (!info.exists) return;
        const content = await FileSystem.readAsStringAsync(CRASH_FILE);
        if (content.trim()) setReport(content);
      } catch {}
    })();
  }, []);

  if (!report) return null;

  const dismiss = async () => {
    try {
      if (CRASH_FILE) await FileSystem.deleteAsync(CRASH_FILE, { idempotent: true });
    } catch {}
    setReport(null);
  };

  const share = () => {
    Share.share({ message: report, title: 'Crash Report' }).catch(() => {});
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
        padding: 20, paddingTop: 60,
      }}>
        <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
          Crash detectado na inicialização
        </Text>
        <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 12 }}>
          Capturado antes do JavaScript carregar (crash nativo).
          Compartilhe para diagnóstico.
        </Text>
        <ScrollView style={{ flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <Text selectable style={{ color: '#ff9999', fontSize: 10, fontFamily: 'monospace', lineHeight: 15 }}>
            {report}
          </Text>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={share}
            style={{ flex: 1, backgroundColor: '#0055cc', padding: 14, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Compartilhar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={dismiss}
            style={{ flex: 1, backgroundColor: '#333', padding: 14, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
