import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Save, Package } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { Product } from '@/types/inventory';

export default function AddProductScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { addProduct } = useInventoryStore();
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    supplier: '',
    currentStock: '',
    minStock: '',
    price: '',
    cost: '',
    unit: 'pcs',
    description: '',
  });

  const handleSave = () => {
    if (!formData.name.trim() || !formData.sku.trim()) {
      Alert.alert('Error', 'Product name and SKU are required');
      return;
    }

    const newProduct: Omit<Product, 'id'> = {
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim() || `SKU-${formData.sku.trim()}`,
      category: formData.category.trim() || 'General',
      supplier: formData.supplier.trim() || 'Unknown',
      currentStock: parseInt(formData.currentStock) || 0,
      minStock: parseInt(formData.minStock) || 0,
      price: parseFloat(formData.price) || 0,
      cost: parseFloat(formData.cost) || 0,
      unit: formData.unit,
      description: formData.description.trim(),
    };

    addProduct(newProduct);
    Alert.alert('Success', 'Product added successfully', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Add Product',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity 
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Save size={20} color={colors.background} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.lightGray }]}
      >
        <ScrollView style={styles.scrollView}>
          <View style={[styles.section, { backgroundColor: colors.background }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
              <Package size={24} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Product Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Product Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.name}
                onChangeText={(value) => updateFormData('name', value)}
                placeholder="Enter product name"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>SKU *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.sku}
                onChangeText={(value) => updateFormData('sku', value)}
                placeholder="Enter SKU"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Barcode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.barcode}
                onChangeText={(value) => updateFormData('barcode', value)}
                placeholder="Enter barcode (optional)"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Category</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.category}
                onChangeText={(value) => updateFormData('category', value)}
                placeholder="Enter category"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Supplier</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.supplier}
                onChangeText={(value) => updateFormData('supplier', value)}
                placeholder="Enter supplier"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.label, { color: colors.text }]}>Current Stock</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                  value={formData.currentStock}
                  onChangeText={(value) => updateFormData('currentStock', value)}
                  placeholder="0"
                  placeholderTextColor={colors.inactive}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.label, { color: colors.text }]}>Min Stock</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                  value={formData.minStock}
                  onChangeText={(value) => updateFormData('minStock', value)}
                  placeholder="0"
                  placeholderTextColor={colors.inactive}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.label, { color: colors.text }]}>Price</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                  value={formData.price}
                  onChangeText={(value) => updateFormData('price', value)}
                  placeholder="0.00"
                  placeholderTextColor={colors.inactive}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={[styles.label, { color: colors.text }]}>Cost</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                  value={formData.cost}
                  onChangeText={(value) => updateFormData('cost', value)}
                  placeholder="0.00"
                  placeholderTextColor={colors.inactive}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Unit</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.unit}
                onChangeText={(value) => updateFormData('unit', value)}
                placeholder="pcs"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
                value={formData.description}
                onChangeText={(value) => updateFormData('description', value)}
                placeholder="Enter product description (optional)"
                placeholderTextColor={colors.inactive}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 80,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
});