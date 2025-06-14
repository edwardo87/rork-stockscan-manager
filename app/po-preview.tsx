import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatDate } from '@/utils/dateUtils';

export default function POPreviewScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { purchaseOrders } = useInventoryStore();

  // Get the most recent order
  const latestOrder = purchaseOrders[purchaseOrders.length - 1];

  // Group items by supplier if we have an order
  const supplierGroups = latestOrder ? {
    [latestOrder.supplierName]: latestOrder.items
  } : {};

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>PO Preview</Text>
      </View>

      {Object.keys(supplierGroups).length > 0 ? (
        <ScrollView style={styles.content}>
          {Object.entries(supplierGroups).map(([supplier, items], index) => (
            <View 
              key={index} 
              style={[styles.poContainer, { 
                backgroundColor: colors.lightGray,
                borderColor: colors.border 
              }]}
            >
              <View style={styles.poHeader}>
                <View>
                  <Text style={[styles.poNumber, { color: colors.text }]}>
                    PO-{String(latestOrder.id).slice(-4).padStart(4, '0')}
                  </Text>
                  <Text style={[styles.poSupplier, { color: colors.text }]}>
                    {supplier}
                  </Text>
                </View>
                <Text style={[styles.poDate, { color: colors.inactive }]}>
                  {formatDate(new Date(latestOrder.date))}
                </Text>
              </View>

              <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.columnHeader, styles.codeColumn, { color: colors.inactive }]}>Code</Text>
                <Text style={[styles.columnHeader, styles.descColumn, { color: colors.inactive }]}>Description</Text>
                <Text style={[styles.columnHeader, styles.qtyColumn, { color: colors.inactive }]}>Qty</Text>
              </View>

              {items.map((item, idx) => (
                <View 
                  key={idx} 
                  style={[styles.tableRow, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.cell, styles.codeColumn, { color: colors.text }]}>
                    {item.barcode}
                  </Text>
                  <Text 
                    style={[styles.cell, styles.descColumn, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={[styles.cell, styles.qtyColumn, { color: colors.text }]}>
                    {item.quantity}
                  </Text>
                </View>
              ))}

              <View style={styles.poFooter}>
                <Text style={[styles.totalItems, { color: colors.inactive }]}>
                  Total Items: {items.reduce((sum, item) => sum + item.quantity, 0)}
                </Text>
                <TouchableOpacity 
                  style={[styles.sendButton, { backgroundColor: colors.inactive }]}
                  disabled={true}
                >
                  <FileText size={20} color={colors.background} />
                  <Text style={[styles.sendButtonText, { color: colors.background }]}>
                    Send PO
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <FileText size={64} color={colors.primary} style={styles.emptyIcon} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No Orders Available
          </Text>
          <Text style={[styles.emptyMessage, { color: colors.inactive }]}>
            Please submit an order to view the PO preview.
          </Text>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  poContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  poHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  poNumber: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  poSupplier: {
    fontSize: 16,
    fontWeight: '500',
  },
  poDate: {
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  columnHeader: {
    fontSize: 14,
    fontWeight: '500',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  cell: {
    fontSize: 14,
  },
  codeColumn: {
    width: '25%',
  },
  descColumn: {
    width: '55%',
  },
  qtyColumn: {
    width: '20%',
    textAlign: 'right',
  },
  poFooter: {
    padding: 16,
  },
  totalItems: {
    fontSize: 14,
    marginBottom: 12,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 16,
    textAlign: 'center',
    maxWidth: 250,
  },
});