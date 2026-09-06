import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Mail, Eye, Printer, Trash2 } from 'lucide-react-native';
import * as Print from 'expo-print';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatDate } from '@/utils/dateUtils';
import { sendPurchaseOrderEmail, previewPurchaseOrderPDF } from '@/services/emailService';
import { generatePurchaseOrderPDF, POData, getPoNumber } from '@/services/pdfService';

export default function POPreviewScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { purchaseOrders, suppliers, deletePurchaseOrder } = useInventoryStore();
  const isMountedRef = useRef(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Order History: every stored purchase order, newest first.
  // Built from the existing purchase_orders + order_items records loaded by
  // the store — no parallel history system.
  const sortedOrders = [...purchaseOrders].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleSendPO = useCallback(async (purchaseOrder: any) => {
    if (!isMountedRef.current || isProcessing) return;

    setIsProcessing(true);

    try {
      // Prefer the email snapshot saved on the PO at submission time; fall
      // back to the supplier list (older orders may not have a snapshot).
      const supplier = suppliers.find(s => s.name === purchaseOrder.supplierName);
      const supplierEmail = purchaseOrder.supplierEmail || supplier?.email;

      // Show a one-line clarity message before any send action so users know
      // emails come from their device's own mail app, not a backend service.
      const senderNotice = "PO emails will be sent from your device's default mail app/account.";

      if (!supplierEmail) {
        Alert.alert(
          "No Email Address",
          `${senderNotice}\n\nNo email address found for ${purchaseOrder.supplierName}. The email will open without a recipient address.`,
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
                try {
                  const success = await sendPurchaseOrderEmail(purchaseOrder);
                  if (isMountedRef.current) {
                    if (success) {
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
                    } else {
                      setIsProcessing(false);
                    }
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
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Send Purchase Order',
            `${senderNotice}\n\nTo: ${supplierEmail}`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ]
          );
        });

        if (!proceed) {
          setIsProcessing(false);
          return;
        }

        const success = await sendPurchaseOrderEmail(purchaseOrder, supplierEmail);
        if (isMountedRef.current) {
          if (success) {
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
          } else {
            setIsProcessing(false);
          }
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

  /**
   * Print PO using the same generated PDF. On native we hand the HTML to
   * expo-print which opens the system print dialog (AirPrint / Android print
   * service). On web we open the printable HTML in a new tab and trigger the
   * browser's print dialog, mirroring the QR labels print flow.
   */
  const handlePrintPO = useCallback(async (purchaseOrder: any) => {
    if (!isMountedRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const poData: POData = {
        id: purchaseOrder.id,
        supplierName: purchaseOrder.supplierName,
        supplierEmail: purchaseOrder.supplierEmail,
        date: purchaseOrder.date,
        items: purchaseOrder.items,
        status: purchaseOrder.status,
      };

      if (Platform.OS === 'web') {
        const url = await generatePurchaseOrderPDF(poData);
        const w = window.open(url, '_blank');
        if (w) {
          // Give the new tab a moment to render before invoking print.
          setTimeout(() => {
            try { w.print(); } catch (e) { console.log('print() failed', e); }
          }, 500);
        }
      } else {
        // expo-print's printAsync accepts a file URI — generate the PDF then
        // hand it to the native print dialog (AirPrint / Android print).
        const pdfUri = await generatePurchaseOrderPDF(poData);
        await Print.printAsync({ uri: pdfUri });
      }
    } catch (error) {
      console.error('Error printing PO:', error);
      if (isMountedRef.current) {
        Alert.alert('Print Error', 'Failed to print purchase order. Please try again.');
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [isProcessing]);

  const handleDeletePO = useCallback((purchaseOrder: any) => {
    if (!isMountedRef.current || isProcessing) return;
    const poNumber = getPoNumber(purchaseOrder.id);
    Alert.alert(
      'Delete Purchase Order',
      `Are you sure you want to delete ${poNumber} for ${purchaseOrder.supplierName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await deletePurchaseOrder(purchaseOrder.id);
              if (isMountedRef.current) {
                Alert.alert('Deleted', `${poNumber} has been deleted.`);
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Failed to delete purchase order';
              console.error('Error deleting PO:', error);
              if (isMountedRef.current) {
                Alert.alert('Delete Failed', msg);
              }
            } finally {
              if (isMountedRef.current) setIsProcessing(false);
            }
          },
        },
      ]
    );
  }, [deletePurchaseOrder, isProcessing]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Order History</Text>
      </View>

      {sortedOrders.length > 0 ? (
        <ScrollView style={styles.content}>
          {sortedOrders.map((order, index) => (
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
                    {getPoNumber(order.id)}
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
                
                <View style={styles.buttonGrid}>
                  <TouchableOpacity
                    style={[styles.actionButton, {
                      borderColor: colors.primary,
                      opacity: isProcessing ? 0.6 : 1,
                    }]}
                    onPress={() => handlePreviewPDF(order)}
                    disabled={isProcessing}
                  >
                    <Eye size={18} color={colors.primary} />
                    <Text style={[styles.actionButtonText, { color: colors.primary }]}>View PDF</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, {
                      borderColor: colors.primary,
                      opacity: isProcessing ? 0.6 : 1,
                    }]}
                    onPress={() => handlePrintPO(order)}
                    disabled={isProcessing}
                  >
                    <Printer size={18} color={colors.primary} />
                    <Text style={[styles.actionButtonText, { color: colors.primary }]}>Print</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButtonFilled, {
                      backgroundColor: colors.primary,
                      opacity: isProcessing ? 0.6 : 1,
                    }]}
                    onPress={() => handleSendPO(order)}
                    disabled={isProcessing}
                  >
                    <Mail size={18} color={colors.background} />
                    <Text style={[styles.actionButtonText, { color: colors.background }]}>Email</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, {
                      borderColor: colors.error || '#d93025',
                      opacity: isProcessing ? 0.6 : 1,
                    }]}
                    onPress={() => handleDeletePO(order)}
                    disabled={isProcessing}
                  >
                    <Trash2 size={18} color={colors.error || '#d93025'} />
                    <Text style={[styles.actionButtonText, { color: colors.error || '#d93025' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.senderNotice, { color: colors.inactive }]}>
                  PO emails will be sent from your device&apos;s default mail app/account.
                </Text>
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
            No purchase orders yet. Orders you submit will appear here with their date, supplier and reference.
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
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionButtonFilled: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  senderNotice: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
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