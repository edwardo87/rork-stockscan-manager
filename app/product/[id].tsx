import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShoppingCart, ClipboardList, Edit, Trash2, Clock } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { formatDate } from '@/utils/dateUtils';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeStore();
  
  const { products, addToOrder, addToStocktake } = useInventoryStore();
  const product = products.find(p => p.id === id);
  
  if (!product) {
    return (
      <View style={[styles.notFoundContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundText, { color: colors.text }]}>Product not found</Text>
        <TouchableOpacity 
          style={[styles.backButton, { backgroundColor: colors.primary }]} 
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLowStock = product.currentStock < product.minStock;

  const handleAddToOrder = () => {
    addToOrder(product, 1);
    router.push('/');
  };

  const handleAddToStocktake = () => {
    addToStocktake(product, product.currentStock);
    router.push('/stocktake');
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.lightGray }]} 
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
        <Text style={[styles.sku, { color: colors.inactive }]}>{product.sku}</Text>
      </View>
      
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Product Information</Text>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Barcode</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.barcode}</Text>
        </View>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Category</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.category}</Text>
        </View>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Description</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.description}</Text>
        </View>
      </View>
      
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Inventory</Text>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Current Stock</Text>
          <Text style={[
            styles.stockValue, 
            isLowStock ? { color: colors.warning } : { color: colors.success }
          ]}>
            {product.currentStock} {product.unit}
            {isLowStock && " (Low)"}
          </Text>
        </View>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Minimum Stock</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.minStock} {product.unit}</Text>
        </View>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Unit</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.unit}</Text>
        </View>
        
        {product.lastOrdered && (
          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.inactive }]}>Last Ordered</Text>
            <View style={styles.lastOrderedContainer}>
              <Clock size={16} color={colors.primary} style={styles.lastOrderedIcon} />
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatDate(new Date(product.lastOrdered))}
              </Text>
            </View>
          </View>
        )}
      </View>
      
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Pricing</Text>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Cost Price</Text>
          <Text style={[styles.priceValue, { color: colors.text }]}>${product.cost.toFixed(2)}</Text>
        </View>
      </View>
      
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Supplier</Text>
        
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.inactive }]}>Supplier</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{product.supplier}</Text>
        </View>
      </View>
      
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={handleAddToOrder}
        >
          <ShoppingCart size={20} color={colors.background} />
          <Text style={[styles.actionButtonText, { color: colors.background }]}>Add to Order</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.stocktakeButton, { backgroundColor: colors.secondary }]}
          onPress={handleAddToStocktake}
        >
          <ClipboardList size={20} color={colors.background} />
          <Text style={[styles.actionButtonText, { color: colors.background }]}>Add to Stocktake</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.adminActionsContainer}>
        <TouchableOpacity style={[styles.adminActionButton, { 
          backgroundColor: colors.lightGray, 
          borderColor: colors.border 
        }]}>
          <Edit size={20} color={colors.text} />
          <Text style={[styles.adminActionText, { color: colors.text }]}>Edit</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.adminActionButton, styles.deleteButton, { 
          backgroundColor: colors.lightGray, 
          borderColor: colors.error 
        }]}>
          <Trash2 size={20} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notFoundText: {
    fontSize: 18,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
  },
  sku: {
    fontSize: 16,
    marginTop: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 16,
    flex: 1,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  stockValue: {
    fontSize: 16,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  lastOrderedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 2,
    justifyContent: 'flex-end',
  },
  lastOrderedIcon: {
    marginRight: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: 8,
  },
  stocktakeButton: {
    marginRight: 0,
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  adminActionsContainer: {
    flexDirection: 'row',
  },
  adminActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: 8,
  },
  adminActionText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  deleteButton: {
    marginRight: 0,
    marginLeft: 8,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});