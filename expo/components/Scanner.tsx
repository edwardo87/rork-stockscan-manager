import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Plus, Minus, ShoppingBag, ArrowLeft, Eye } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { useRouter } from 'expo-router';
import { Product } from '@/types/inventory';

interface ScannerProps {
  onClose: () => void;
  onBarcodeScan: (barcode: string, quantity?: number) => void;
  mode?: 'order' | 'stocktake' | 'view';
}

export default function Scanner({ onClose, onBarcodeScan, mode = 'order' }: ScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const { colors } = useThemeStore();
  const { getProductByBarcode } = useInventoryStore();
  const router = useRouter();

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.text }]}>Camera access needed to scan QR codes</Text>
        <TouchableOpacity 
          style={[styles.permissionButton, { backgroundColor: colors.primary }]} 
          onPress={requestPermission}
        >
          <Text style={[styles.permissionButtonText, { color: colors.background }]}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanned) {
      setScanned(true);
      const product = getProductByBarcode(data);
      
      if (product) {
        setScannedProduct(product);
        setError(null);
      } else {
        setError(`No product found with code: ${data}`);
        setTimeout(() => {
          setScanned(false);
          setError(null);
        }, 2000);
      }
    }
  };

  const handleQuantityChange = (increment: number) => {
    setQuantity(prev => Math.max(1, prev + increment));
  };

  const handleAddToOrder = () => {
    if (scannedProduct) {
      if (mode === 'order') {
        onBarcodeScan(scannedProduct.barcode, quantity);
      } else {
        onBarcodeScan(scannedProduct.barcode);
      }
      // Reset for next scan
      setScanned(false);
      setScannedProduct(null);
      setQuantity(1);
      setError(null);
    }
  };

  const handleViewProduct = () => {
    if (scannedProduct) {
      onClose();
      router.push(`/product/${scannedProduct.id}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code39', 'code128'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={[styles.scanArea, { borderColor: colors.primary }]} />
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: colors.error }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.exitButton, { backgroundColor: colors.primary }]} 
          onPress={onClose}
        >
          <ArrowLeft size={20} color={colors.background} />
          <Text style={[styles.exitButtonText, { color: colors.background }]}>See Order</Text>
        </TouchableOpacity>
        
        {!scanned ? (
          <View style={styles.guideTextContainer}>
            <Text style={styles.guideText}>Position barcode in frame</Text>
          </View>
        ) : scannedProduct ? (
          <View style={[styles.productContainer, { 
            backgroundColor: colors.background,
            shadowColor: colors.text,
          }]}>
            <Text style={[styles.productTitle, { color: colors.text }]}>{scannedProduct.name}</Text>
            <Text style={[styles.productCode, { color: colors.inactive }]}>Code: {scannedProduct.barcode}</Text>
            
            <View style={styles.quantityControls}>
              <TouchableOpacity 
                style={[styles.quantityButton, { backgroundColor: colors.lightGray }]} 
                onPress={() => handleQuantityChange(-1)}
                disabled={quantity <= 1}
              >
                <Minus size={20} color={quantity <= 1 ? colors.inactive : colors.text} />
              </TouchableOpacity>
              
              <Text style={[styles.quantityText, { color: colors.text }]}>{quantity}</Text>
              
              <TouchableOpacity 
                style={[styles.quantityButton, { backgroundColor: colors.lightGray }]} 
                onPress={() => handleQuantityChange(1)}
              >
                <Plus size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={handleAddToOrder}
              >
                <ShoppingBag size={20} color={colors.background} />
                <Text style={[styles.addButtonText, { color: colors.background }]}>
                  {mode === 'order' ? 'Add to Order' : mode === 'stocktake' ? 'Add to Stocktake' : 'Add'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.viewButton, { borderColor: colors.primary }]}
                onPress={handleViewProduct}
              >
                <Eye size={20} color={colors.primary} />
                <Text style={[styles.viewButtonText, { color: colors.primary }]}>
                  View Details
                </Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={[styles.scanAgainButton, { borderColor: colors.border }]}
              onPress={() => {
                setScanned(false);
                setScannedProduct(null);
                setQuantity(1);
              }}
            >
              <Text style={[styles.scanAgainText, { color: colors.primary }]}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 280,
    height: 280,
    borderWidth: 3,
    backgroundColor: 'transparent',
    borderRadius: 20,
  },
  exitButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  exitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  guideTextContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  permissionButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  productContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  productTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  productCode: {
    fontSize: 14,
    marginBottom: 20,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  quantityButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 24,
    fontWeight: '700',
    marginHorizontal: 24,
    minWidth: 40,
    textAlign: 'center',
  },
  scanAgainButton: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  scanAgainText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 180,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});