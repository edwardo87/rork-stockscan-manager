import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Save, X, Package } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { Product } from '@/types/inventory';

export default function AddProductScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, addProduct } = useInventoryStore();
  
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    category: '',
    supplier: '',
    price: 0,
    cost: 0,
    currentStock: 0,
    minStock: 0,
    unit: 'each',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: keyof Product, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateId = () => {
    return 'PROD_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
  };

  const generateBarcode = () => {
    const timestamp = Date.now().toString();
    const random = Math.random().toString().substr(2, 4);
    return timestamp.substr(-8) + random;
  };

  const validateForm = (): boolean => {
    if (!formData.name?.trim()) {
      Alert.alert('Validation Error', 'Product name is required');
      return false;
    }
    
    if (!formData.sku?.trim()) {
      Alert.alert('Validation Error', 'SKU is required');
      return false;
    }
    
    if (formData.price === undefined || formData.price < 0) {
      Alert.alert('Validation Error', 'Price must be a positive number');
      return false;
    }
    
    if (formData.cost === undefined || formData.cost < 0) {
      Alert.alert('Validation Error', 'Cost must be a positive number');
      return false;
    }
    
    if (formData.currentStock === undefined || formData.currentStock < 0) {
      Alert.alert('Validation Error', 'Current stock must be a positive number');
      return false;
    }
    
    if (formData.minStock === undefined || formData.minStock < 0) {
      Alert.alert('Validation Error', 'Minimum stock must be a positive number');
      return false;
    }
    
    // Check if SKU already exists
    const existingSku = products.find(p => p.sku.toLowerCase() === formData.sku?.toLowerCase());
    if (existingSku) {
      Alert.alert('Validation Error', 'A product with this SKU already exists');
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const newProduct: Product = {
        id: generateId(),
        name: formData.name!.trim(),
        description: formData.description?.trim() || formData.name!.trim(),
        sku: formData.sku!.trim(),
        barcode: formData.barcode?.trim() || generateBarcode(),
        category: formData.category?.trim() || 'Uncategorized',
        supplier: formData.supplier?.trim() || 'Unknown Supplier',
        price: Number(formData.price),
        cost: Number(formData.cost),
        currentStock: Number(formData.currentStock),
        minStock: Number(formData.minStock),
        unit: formData.unit || 'each',
      };
      
      addProduct(newProduct);
      
      Alert.alert(
        'Success',
        'Product has been added successfully!',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to add product. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Changes',
      'Are you sure you want to discard your changes?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() }
      ]
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen 
        options={{
          title: 'Add Product',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity onPress={handleCancel}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView 
        style={[styles.container, { backgroundColor: colors.lightGray }]}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <View style={styles.sectionHeader}>
            <Package size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Product Information</Text>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Product Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
              value={formData.name}
              onChangeText={(value) => handleInputChange('name', value)}
              placeholder="Enter product name"
              placeholderTextColor={colors.inactive}
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
              value={formData.description}
              onChangeText={(value) => handleInputChange('description', value)}
              placeholder="Enter product description"
              placeholderTextColor={colors.inactive}
              multiline
              numberOfLines={3}
            />
          </View>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>SKU *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.sku}
                onChangeText={(value) => handleInputChange('sku', value)}
                placeholder="Enter SKU"
                placeholderTextColor={colors.inactive}
                autoCapitalize="characters"
              />
            </View>
            
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Barcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.barcode}
                onChangeText={(value) => handleInputChange('barcode', value)}
                placeholder="Auto-generated"
                placeholderTextColor={colors.inactive}
              />
            </View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.category}
                onChangeText={(value) => handleInputChange('category', value)}
                placeholder="Enter category"
                placeholderTextColor={colors.inactive}
              />
            </View>
            
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Supplier</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.supplier}
                onChangeText={(value) => handleInputChange('supplier', value)}
                placeholder="Enter supplier"
                placeholderTextColor={colors.inactive}
              />
            </View>
          </View>
        </View>
        
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pricing & Stock</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Cost Price *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.cost?.toString()}
                onChangeText={(value) => handleInputChange('cost', parseFloat(value) || 0)}
                placeholder="0.00"
                placeholderTextColor={colors.inactive}
                keyboardType="decimal-pad"
              />
            </View>
            
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Selling Price *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.price?.toString()}
                onChangeText={(value) => handleInputChange('price', parseFloat(value) || 0)}
                placeholder="0.00"
                placeholderTextColor={colors.inactive}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Current Stock *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.currentStock?.toString()}
                onChangeText={(value) => handleInputChange('currentStock', parseInt(value) || 0)}
                placeholder="0"
                placeholderTextColor={colors.inactive}
                keyboardType="number-pad"
              />
            </View>
            
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, { color: colors.text }]}>Minimum Stock *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.minStock?.toString()}
                onChangeText={(value) => handleInputChange('minStock', parseInt(value) || 0)}
                placeholder="0"
                placeholderTextColor={colors.inactive}
                keyboardType="number-pad"
              />
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Unit</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
              value={formData.unit}
              onChangeText={(value) => handleInputChange('unit', value)}
              placeholder="each"
              placeholderTextColor={colors.inactive}
            />
          </View>
        </View>
        
        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={isSubmitting}
        >
          <Save size={20} color={colors.background} />
          <Text style={[styles.saveButtonText, { color: colors.background }]}>
            {isSubmitting ? 'Adding Product...' : 'Add Product'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});