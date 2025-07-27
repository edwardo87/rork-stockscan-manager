import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Search, Filter, Plus } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import ProductCard from '@/components/ProductCard';
import EmptyState from '@/components/EmptyState';

export default function ProductsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const { colors } = useThemeStore();
  
  const { products } = useInventoryStore();

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode.includes(searchQuery) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  return (
    <>
      <Stack.Screen 
        options={{
          headerRight: () => (
            <TouchableOpacity 
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/product/add')}
            >
              <Plus size={20} color={colors.background} />
            </TouchableOpacity>
          ),
        }} 
      />
      <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      <View style={[styles.searchContainer, { 
        backgroundColor: colors.background,
        borderBottomColor: colors.border
      }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.lightGray }]}>
          <Search size={20} color={colors.inactive} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search products..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.inactive}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearButton, { color: colors.primary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity style={[styles.filterButton, { backgroundColor: colors.lightGray }]}>
          <Filter size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      {filteredProducts.length > 0 ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => handleProductPress(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState 
          type="products" 
          onAction={() => router.push('/product/add')} 
        />
      )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  clearButton: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
});