import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import Scanner from '@/components/Scanner';
import { Package, Search } from 'lucide-react-native';

export default function ScannerScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { getProductByBarcode } = useInventoryStore();
  const [showScanner, setShowScanner] = useState(false);

  const handleBarcodeScan = (barcode: string, quantity: number) => {
    const product = getProductByBarcode(barcode);
    if (product) {
      router.push(`/product/${product.id}`);
    }
    setShowScanner(false);
  };

  if (showScanner) {
    return (
      <Scanner
        onClose={() => setShowScanner(false)}
        onBarcodeScan={handleBarcodeScan}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      <View style={[styles.content, { backgroundColor: colors.background }]}>
        <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
          <Search size={48} color={colors.primary} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>
          QR Code Scanner
        </Text>
        
        <Text style={[styles.description, { color: colors.inactive }]}>
          Scan product QR codes to quickly view details, add to orders, or update stock levels.
        </Text>
        
        <TouchableOpacity 
          style={[styles.scanButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowScanner(true)}
        >
          <Package size={20} color={colors.background} />
          <Text style={[styles.scanButtonText, { color: colors.background }]}>
            Start Scanning
          </Text>
        </TouchableOpacity>
        
        <View style={[styles.infoBox, { backgroundColor: colors.lightGray, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>How to use:</Text>
          <Text style={[styles.infoText, { color: colors.inactive }]}>• Point camera at QR code</Text>
          <Text style={[styles.infoText, { color: colors.inactive }]}>• Product details will open automatically</Text>
          <Text style={[styles.infoText, { color: colors.inactive }]}>• Add to orders or stocktake from there</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    margin: 16,
    borderRadius: 16,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 32,
  },
  scanButtonText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
});