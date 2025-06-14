import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Save, X } from 'lucide-react-native';
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
        "Please fill in all required fields.",
        [{ text: "OK" }]
      );
      return;
    }

    try {
      updateProduct(product.id, { ...product, ...formData } as Product);
      Alert.alert(
        "Success",
        "Product updated successfully",
        [{ 
          text: "OK",
          onPress: () => router.back()
        }]
      );
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to update product",
        [{ text: "OK" }]
      );
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Form Fields */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                }]}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Product name"
                placeholderTextColor={colors.inactive}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { 
                  backgroundColor: colors.lightGray,
                  color: colors.text,
                }]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Product description"
                placeholderTextColor={colors.inactive}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.category}
                  onChangeText={(text) => setFormData({ ...formData, category: text })}
                  placeholder="Category"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Supplier *</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.supplier}
                  onChangeText={(text) => setFormData({ ...formData, supplier: text })}
                  placeholder="Supplier"
                  placeholderTextColor={colors.inactive}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Current Stock</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.currentStock?.toString()}
                  onChangeText={(text) => setFormData({ 
                    ...formData, 
                    currentStock: parseInt(text) || 0 
                  })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Min Stock</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.minStock?.toString()}
                  onChangeText={(text) => setFormData({ 
                    ...formData, 
                    minStock: parseInt(text) || 0 
                  })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.inactive}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Cost ($)</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.cost?.toString()}
                  onChangeText={(text) => setFormData({ 
                    ...formData, 
                    cost: parseFloat(text) || 0 
                  })}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.inactive}
                />
              </View>

              <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.label, { color: colors.text }]}>Price ($)</Text>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: colors.lightGray,
                    color: colors.text,
                  }]}
                  value={formData.price?.toString()}
                  onChangeText={(text) => setFormData({ 
                    ...formData, 
                    price: parseFloat(text) || 0 
                  })}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.inactive}
                />
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => router.back()}
              >
                <X size={20} color={colors.text} />
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
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
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
});