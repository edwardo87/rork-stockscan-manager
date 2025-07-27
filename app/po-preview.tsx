import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Mail, Eye } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatDate } from '@/utils/dateUtils';
import { sendPurchaseOrderEmail, previewPurchaseOrderPDF } from '@/services/emailService';

export default function POPreviewScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { purchaseOrders, suppliers } = useInventoryStore();
  const isMountedRef = useRef(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Get the most recent orders (all from the last submission)
  const latestOrders = purchaseOrders.slice(-5); // Show last 5 orders or adjust as needed

  const handleSendPO = useCallback(async (purchaseOrder: any) => {
    if (!isMountedRef.current || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Find supplier email if available
      const supplier = suppliers.find(s => s.name === purchaseOrder.supplierName);
      const supplierEmail = supplier?.email;

      if (!supplierEmail) {
        if (!isMountedRef.current) {
          setIsProcessing(false);
          return;
        }
        Alert.alert(
          "No Email Address",
          `No email address found for ${purchaseOrder.supplierName}. The email will open without a recipient address.`,
          [
            { 
              text: "Cancel", 
              style: "cancel",
              onPress: () => {
                if (isMountedRef.current) {
                  setIsProcessing(false);
                }
              }
            },
            { 
              text: "Continue", 
              onPress: async () => {
                if (!isMountedRef.current) {
                  setIsProcessing(false);
                  return;
                }
                try {
                  const success = await sendPurchaseOrderEmail(purchaseOrder);
                  if (success && isMountedRef.current) {
                    Alert.alert(
                      "Success",
                      "Purchase order email prepared successfully!",
                      [{ 
                        text: "OK",
                        onPress: () => {
                          if (isMountedRef.current) {
                            setIsProcessing(false);
                          }
                        }
                      }]
                    );
                  } else if (isMountedRef.current) {
                    setIsProcessing(false);
                  }
                } catch (err) {
                  console.error('Error sending PO:', err);
                  if (isMountedRef.current) {
                    setIsProcessing(false);
                    Alert.alert(
                      "Error",
                      "Failed to send purchase order. Please try again.",
                      [{ text: "OK" }]
                    );
                  }
                }
              }
            }
          ]
        );
      } else {
        const success = await sendPurchaseOrderEmail(purchaseOrder, supplierEmail);
        if (success && isMountedRef.current) {
          Alert.alert(
            "Success",
            "Purchase order sent successfully!",
            [{ 
              text: "OK",
              onPress: () => {
                if (isMountedRef.current) {
                  setIsProcessing(false);
                }
              }
            }]
          );
        } else if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    } catch (error) {
      console.error('Error in handleSendPO:', error);
      if (isMountedRef.current) {
        setIsProcessing(false);
        Alert.alert(
          "Error",
          "Failed to send purchase order. Please try again.",
          [{ text: "OK" }]
        );
      }
    }
  }, [suppliers, isProcessing]);

  const handlePreviewPDF = useCallback(async (purchaseOrder: any) => {
    if (!isMountedRef.current || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      await previewPurchaseOrderPDF(purchaseOrder);
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error in handlePreviewPDF:', error);
      if (isMountedRef.current) {
        setIsProcessing(false);
        Alert.alert(
          "Error",
          "Failed to preview PDF. Please try again.",
          [{ text: "OK" }]
        );
      }
    }
  }, [isProcessing]);

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

      {latestOrders.length > 0 ? (
        <ScrollView style={styles.content}>
          {latestOrders.map((order, index) => (
            <View 
              key={order.id} 
              style={[styles.poContainer, { 
                backgroundColor: colors.lightGray,
                borderColor: colors.border 
              }]}
            >
              <View style={styles.poHeader}>
                <View>
                  <Text style={[styles.poNumber, { color: colors.text }]}>
                    PO-{String(order.id).slice(-4).padStart(4, '0')}
                  </Text>
                  <Text style={[styles.poSupplier, { color: colors.text }]}>
                    {order.supplierName}
                  </Text>
                  <Text style={[styles.poStatus, { 
                    color: order.status === 'submitted' ? colors.success : colors.inactive 
                  }]}>
                    Status: {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </Text>
                </View>
                <Text style={[styles.poDate, { color: colors.inactive }]}>
                  {formatDate(new Date(order.date))}
                </Text>
              </View>

              <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.columnHeader, styles.codeColumn, { color: colors.inactive }]}>Code</Text>
                <Text style={[styles.columnHeader, styles.descColumn, { color: colors.inactive }]}>Description</Text>
                <Text style={[styles.columnHeader, styles.qtyColumn, { color: colors.inactive }]}>Qty</Text>
              </View>

              {order.items.map((item: any, idx: number) => (
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
                  Total Items: {order.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}
                </Text>
                
                <View style={styles.buttonRow}>
                  <TouchableOpacity 
                    style={[styles.previewButton, { 
                      borderColor: colors.primary,
                      opacity: isProcessing ? 0.6 : 1
                    }]}
                    onPress={() => handlePreviewPDF(order)}
                    disabled={isProcessing}
                  >
                    <Eye size={18} color={colors.primary} />
                    <Text style={[styles.previewButtonText, { color: colors.primary }]}>
                      {isProcessing ? 'Processing...' : 'Preview PDF'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.sendButton, { 
                      backgroundColor: colors.primary,
                      opacity: isProcessing ? 0.6 : 1
                    }]}
                    onPress={() => handleSendPO(order)}
                    disabled={isProcessing}
                  >
                    <Mail size={20} color={colors.background} />
                    <Text style={[styles.sendButtonText, { color: colors.background }]}>
                      {isProcessing ? 'Processing...' : 'Send PO'}
                    </Text>
                  </TouchableOpacity>
                </View>
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
    marginBottom: 4,
  },
  poStatus: {
    fontSize: 14,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
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