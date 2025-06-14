import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Save } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { Product } from '@/types/inventory';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, updateProduct } = useInventoryStore();
  
  const product = products.find(p => p.id === id);
  
  const [formData, setFormData] = useState<Partial<Product>>(product || {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Product not found</Text>
      </View>
    );
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.barcode?.trim()) {
      newErrors.barcode = 'Barcode is required';
    }
    if (!formData.supplier?.trim()) {
      newErrors.supplier = 'Supplier is required';
    }
    if (formData.minStock === undefined || formData.minStock < 0) {
      newErrors.minStock = 'Minimum stock must be 0 or greater';
    }
    if (formData.currentStock === undefined || formData.currentStock < 0) {
      newErrors.currentStock = 'Current stock must be 0 or greater';
    }
    if (formData.cost === undefined || formData.cost < 0) {
      newErrors.cost = 'Cost must be 0 or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please check the form for errors');
      return;
    }

    try {
      updateProduct(id, formData as Product);
      Alert.alert(
        'Success',
        'Product updated successfully',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update product');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Product</Text>
        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: colors.primary }]} 
          onPress={handleSave}
        >
          <Save size={20} color={colors.background} />
          <Text style={[styles.saveButtonText, { color: colors.background }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form}>
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[
              styles.input,
              { 
                backgroundColor: colors.lightGray,
                color: colors.text,
                borderColor: errors.name ? colors.error : colors.border
              }
            ]}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            placeholder="Product name"
            placeholderTextColor={colors.inactive}
          />
          {errors.name && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errors.name}</Text>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              { 
                backgroundColor: colors.lightGray,
                color: colors.text,
                borderColor: errors.description ? colors.error : colors.border
              }
            ]}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            placeholder="Product description"
            placeholderTextColor={colors.inactive}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Barcode</Text>
          <TextInput
            style={[
              styles.input,
              { 
                backgroundColor: colors.lightGray,
                color: colors.text,
                borderColor: errors.barcode ? colors.error : colors.border
              }
            ]}
            value={formData.barcode}
            onChangeText={(text) => setFormData({ ...formData, barcode: text })}
            placeholder="Product barcode"
            placeholderTextColor={colors.inactive}
          />
          {errors.barcode && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errors.barcode}</Text>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Category</Text>
          <TextInput
            style={[
              styles.input,
              { 
                backgroundColor: colors.lightGray,
                color: colors.text,
                borderColor: errors.category ? colors.error : colors.border
              }
            ]}
            value={formData.category}
            onChangeText={(text) => setFormData({ ...formData, category: text })}
            placeholder="Product category"
            placeholderTextColor={colors.inactive}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Supplier</Text>
          <TextInput
            style={[
              styles.input,
              { 
                backgroundColor: colors.lightGray,
                color: colors.text,
                borderColor: errors.supplier ? colors.error : colors.border
              }
            ]}
            value={formData.supplier}
            onChangeText={(text) => setFormData({ ...formData, supplier: text })}
            placeholder="Supplier name"
            placeholderTextColor={colors.inactive}
          />
          {errors.supplier && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errors.supplier}</Text>
          )}
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, styles.halfWidth]}>
            <Text style={[styles.label, { color: colors.text }]}>Current Stock</Text>
            <TextInput
              style={[
                styles.input,
                { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                  borderColor: errors.currentStock ? colors.error : colors.border
                }
              ]}
              value={formData.currentStock?.toString()}
              onChangeText={(text) => setFormData({ ...formData, currentStock: parseInt(text) || 0 })}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.inactive}
            />
            {errors.currentStock && (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.currentStock}</Text>
            )}
          </View>

          <View style={[styles.formGroup, styles.halfWidth]}>
            <Text style={[styles.label, { color: colors.text }]}>Minimum Stock</Text>
            <TextInput
              style={[
                styles.input,
                { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                  borderColor: errors.minStock ? colors.error : colors.border
                }
              ]}
              value={formData.minStock?.toString()}
              onChangeText={(text) => setFormData({ ...formData, minStock: parseInt(text) || 0 })}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.inactive}
            />
            {errors.minStock && (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.minStock}</Text>
            )}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, styles.halfWidth]}>
            <Text style={[styles.label, { color: colors.text }]}>Cost</Text>
            <TextInput
              style={[
                styles.input,
                { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                  borderColor: errors.cost ? colors.error : colors.border
                }
              ]}
              value={formData.cost?.toString()}
              onChangeText={(text) => {
                const cost = parseFloat(text) || 0;
                setFormData({ 
                  ...formData, 
                  cost,
                  price: Math.round((cost * 1.3) * 100) / 100 // 30% markup
                });
              }}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.inactive}
            />
            {errors.cost && (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.cost}</Text>
            )}
          </View>

          <View style={[styles.formGroup, styles.halfWidth]}>
            <Text style={[styles.label, { color: colors.text }]}>Unit</Text>
            <TextInput
              style={[
                styles.input,
                { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                  borderColor: errors.unit ? colors.error : colors.border
                }
              ]}
              value={formData.unit}
              onChangeText={(text) => setFormData({ ...formData, unit: text })}
              placeholder="each, box, etc."
              placeholderTextColor={colors.inactive}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -8,
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: 8,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});