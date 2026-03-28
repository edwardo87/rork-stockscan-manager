import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, ArrowLeft, ShoppingBag, ClipboardList } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { Product } from '@/types/inventory';
import QuantityInput from '@/components/QuantityInput';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, updateProduct, addToOrder, addToStocktake } = useInventoryStore();
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [stocktakeQuantity, setStocktakeQuantity] = useState(0);

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

  const handleAddToOrder = () => {
    addToOrder(product, orderQuantity);
    router.replace('/');
  };

  const handleAddToStocktake = () => {
    addToStocktake(product, stocktakeQuantity);
    router.replace('/stocktake');
  };

  const updateField = (field: keyof Product, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
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

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
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
                style={[styles.input, styles.textArea, { 
                  color: colors.text,
                  backgroundColor: colors.lightGray,
                  borderColor: colors.border
                }]}
                value={formData.description}
                onChangeText={(value) => updateField('description', value)}
                placeholder="Product description"
                placeholderTextColor={colors.inactive}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
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

            {/* Quick Actions Section */}
            <View style={[styles.actionsSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Quick Actions</Text>
              
              {/* Order Section */}
              <View style={[styles.actionCard, { backgroundColor: colors.lightGray }]}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Add to Order</Text>
                <View style={styles.actionContent}>
                  <QuantityInput
                    value={orderQuantity}
                    onChange={setOrderQuantity}
                    min={1}
                  />
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: colors.primary }]}
                    onPress={handleAddToOrder}
                  >
                    <ShoppingBag size={20} color={colors.background} />
                    <Text style={[styles.actionButtonText, { color: colors.background }]}>
                      Add to Order
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stocktake Section */}
              <View style={[styles.actionCard, { backgroundColor: colors.lightGray }]}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Add to Stocktake</Text>
                <View style={styles.actionContent}>
                  <QuantityInput
                    value={stocktakeQuantity}
                    onChange={setStocktakeQuantity}
                    min={0}
                  />
                  <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: colors.secondary }]}
                    onPress={handleAddToStocktake}
                  >
                    <ClipboardList size={20} color={colors.background} />
                    <Text style={[styles.actionButtonText, { color: colors.background }]}>
                      Add to Stocktake
                    </Text>
                  </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 120 : 90,
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
  textArea: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
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
  actionsSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  actionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  actionContent: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});