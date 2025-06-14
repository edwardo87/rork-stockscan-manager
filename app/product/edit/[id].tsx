import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, ArrowLeft } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { Product } from '@/types/inventory';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, updateProduct } = useInventoryStore();

  const product = products.find(p => p.id === id);
  const [formData, setFormData] = useState<Partial<Product>>(product || {});

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Product not found</Text>
      </View>
    );
  }

  const handleSave = () => {
    if (!formData.name || !formData.supplier || !formData.category) {
      Alert.alert(
        "Validation Error",
        "Please fill in all required fields",
        [{ text: "OK" }]
      );
      return;
    }

    updateProduct(id as string, { ...product, ...formData });
    router.back();
  };

  const updateField = (field: keyof Product, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <ArrowLeft size={24} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Save size={20} color={colors.background} />
                <Text style={[styles.saveButtonText, { color: colors.background }]}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
                <TextInput
                  style={[styles.input, { 
                    color: colors.text,
                    backgroundColor: colors.lightGray,
                    borderColor: colors.border
                  }]}
                  value={formData.name}
                  onChangeText={(value) => updateField('name', value)}
                  placeholder="Product name"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Description</Text>
                <TextInput
                  style={[styles.input, { 
                    color: colors.text,
                    backgroundColor: colors.lightGray,
                    borderColor: colors.border
                  }]}
                  value={formData.description}
                  onChangeText={(value) => updateField('description', value)}
                  placeholder="Product description"
                  placeholderTextColor={colors.inactive}
                  multiline
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
                <TextInput
                  style={[styles.input, { 
                    color: colors.text,
                    backgroundColor: colors.lightGray,
                    borderColor: colors.border
                  }]}
                  value={formData.category}
                  onChangeText={(value) => updateField('category', value)}
                  placeholder="Product category"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Supplier *</Text>
                <TextInput
                  style={[styles.input, { 
                    color: colors.text,
                    backgroundColor: colors.lightGray,
                    borderColor: colors.border
                  }]}
                  value={formData.supplier}
                  onChangeText={(value) => updateField('supplier', value)}
                  placeholder="Supplier name"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Min Stock</Text>
                  <TextInput
                    style={[styles.input, { 
                      color: colors.text,
                      backgroundColor: colors.lightGray,
                      borderColor: colors.border
                    }]}
                    value={formData.minStock?.toString()}
                    onChangeText={(value) => updateField('minStock', parseInt(value) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.inactive}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Unit</Text>
                  <TextInput
                    style={[styles.input, { 
                      color: colors.text,
                      backgroundColor: colors.lightGray,
                      borderColor: colors.border
                    }]}
                    value={formData.unit}
                    onChangeText={(value) => updateField('unit', value)}
                    placeholder="each"
                    placeholderTextColor={colors.inactive}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Cost</Text>
                  <TextInput
                    style={[styles.input, { 
                      color: colors.text,
                      backgroundColor: colors.lightGray,
                      borderColor: colors.border
                    }]}
                    value={formData.cost?.toString()}
                    onChangeText={(value) => updateField('cost', parseFloat(value) || 0)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={colors.inactive}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>Price</Text>
                  <TextInput
                    style={[styles.input, { 
                      color: colors.text,
                      backgroundColor: colors.lightGray,
                      borderColor: colors.border
                    }]}
                    value={formData.price?.toString()}
                    onChangeText={(value) => updateField('price', parseFloat(value) || 0)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={colors.inactive}
                  />
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
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
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
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
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
});