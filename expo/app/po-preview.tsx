import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { FileText, Mail, Eye, Printer, Trash2 } from 'lucide-react-native';
import * as Print from 'expo-print';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatDate } from '@/utils/dateUtils';
import { sendPurchaseOrderEmail, previewPurchaseOrderPDF } from '@/services/emailService';
import { generatePurchaseOrderPDF, POData, getPoNumber } from '@/services/pdfService';
import { formatOrderQuantity } from '@/utils/purchasing';

/** Sum of ex-GST line totals for an order (0 when no pricing snapshots exist). */
function poOrderTotal(order: { items: any[] }): number {
  return order.items.reduce(
    (sum, item) => (item?.lineTotal != null ? sum + item.lineTotal : sum),
    0,
  );
}

export default function POPreviewScreen() {
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
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      {sortedOrders.length > 0 ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={[styles.countLine, { color: colors.inactive }]}>
            {sortedOrders.length} {sortedOrders.length === 1 ? 'order' : 'orders'} · newest first
          </Text>
          {sortedOrders.map((order) => {
            const total = poOrderTotal(order);
            const submitted = order.status === 'submitted';
            return (
              <View
                key={order.id}
                style={[styles.poContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <View style={styles.poHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.poNumber, { color: colors.text }]}>{getPoNumber(order.id)}</Text>
                    <Text style={[styles.poSupplier, { color: colors.inactive }]} numberOfLines={1}>
                      {order.supplierName} · {formatDate(new Date(order.date))}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: submitted ? colors.successSoft : colors.chip }]}>
                    <Text style={[styles.statusChipText, { color: submitted ? colors.success : colors.inactive }]}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.docket, { borderColor: colors.border }]}>
                  {order.items.map((item: any, idx: number) => {
                    // Chapter 3: supplier code + order quantity in purchasing units
                    // when the item carries a purchasing snapshot; legacy items
                    // keep the original barcode/quantity display.
                    const code = item.supplierCode?.trim() || item.barcode;
                    const qty = item.orderQuantity !== undefined
                      ? formatOrderQuantity(item, item.orderQuantity)
                      : null;
                    return (
                      <View key={idx} style={styles.docketRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.docketQty, { color: colors.text }]} numberOfLines={2}>
                            {qty ? qty.main : `${item.quantity} ×`}{'  '}
                            <Text style={[styles.docketName, { color: colors.text }]}>{item.name}</Text>
                          </Text>
                          <Text style={[styles.docketMeta, { color: colors.inactive }]} numberOfLines={1}>
                            {code}{qty?.stockEquivalent ? `  ${qty.stockEquivalent}` : ''}
                          </Text>
                        </View>
                        {item?.lineTotal != null ? (
                          <Text style={[styles.docketTotal, { color: colors.text }]}>${Number(item.lineTotal).toFixed(2)}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.inactive }]}>
                    {order.items.length} {order.items.length === 1 ? 'line' : 'lines'}
                    {total > 0 ? ' · Order total ex GST' : ''}
                  </Text>
                  {total > 0 ? (
                    <Text style={[styles.totalValue, { color: colors.text }]}>${total.toFixed(2)}</Text>
                  ) : null}
                </View>

                <View style={styles.buttonGrid}>
                  <TouchableOpacity
                    style={[styles.actionButton, { borderColor: colors.border, opacity: isProcessing ? 0.6 : 1 }]}
                    onPress={() => handlePreviewPDF(order)}
                    disabled={isProcessing}
                  >
                    <Eye size={16} color={colors.text} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>PDF</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, { borderColor: colors.border, opacity: isProcessing ? 0.6 : 1 }]}
                    onPress={() => handlePrintPO(order)}
                    disabled={isProcessing}
                  >
                    <Printer size={16} color={colors.text} />
                    <Text style={[styles.actionButtonText, { color: colors.text }]}>Print</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill, opacity: isProcessing ? 0.6 : 1 }]}
                    onPress={() => handleSendPO(order)}
                    disabled={isProcessing}
                  >
                    <Mail size={16} color={colors.onPrimaryFill} />
                    <Text style={[styles.actionButtonText, { color: colors.onPrimaryFill }]}>Email</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconAction, { borderColor: colors.border, opacity: isProcessing ? 0.6 : 1 }]}
                    onPress={() => handleDeletePO(order)}
                    disabled={isProcessing}
                    accessibilityLabel="Delete order"
                  >
                    <Trash2 size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <Text style={[styles.senderNotice, { color: colors.inactive }]}>
            PO emails are sent from your device&apos;s default mail app/account.
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconTile, { backgroundColor: colors.accentSoft }]}>
            <FileText size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No orders yet</Text>
          <Text style={[styles.emptyMessage, { color: colors.inactive }]}>
            Orders you send appear here with their date, supplier and reference.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 32 },
  countLine: { fontSize: 13, fontWeight: '600', marginBottom: 10, marginLeft: 2 },
  poContainer: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  poHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  poNumber: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  poSupplier: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  docket: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    gap: 10,
  },
  docketRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  docketQty: { fontSize: 14, fontWeight: '700' },
  docketName: { fontSize: 14, fontWeight: '500' },
  docketMeta: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  docketTotal: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 13, fontWeight: '500' },
  totalValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  buttonGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  iconAction: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  actionButtonText: { fontSize: 13, fontWeight: '700' },
  senderNotice: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIconTile: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyMessage: { fontSize: 15, textAlign: 'center', maxWidth: 280, lineHeight: 21 },
});
