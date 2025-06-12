import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileSpreadsheet, Database, Table } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';

export default function SetupGuideScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>CSV Format Guide</Text>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <FileSpreadsheet size={40} color={colors.primary} style={styles.sectionIcon} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Step 1: Prepare Your CSV File</Text>
          <Text style={[styles.sectionText, { color: colors.inactive }]}>
            Your CSV file should have these exact column headers:
          </Text>
          <View style={[styles.codeBlock, { backgroundColor: colors.lightGray }]}>
            <Text style={[styles.codeText, { color: colors.text }]}>
              Category,Supplier,Item_Description,Pack_Size,itemcode,barcode,current_stock,last_ordered,cost,minstock
            </Text>
          </View>
        </View>
        
        <View style={styles.section}>
          <Table size={40} color={colors.primary} style={styles.sectionIcon} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Step 2: Column Details</Text>
          <Text style={[styles.sectionText, { color: colors.inactive }]}>
            • Category: Product category name{"\n"}
            • Supplier: Supplier name{"\n"}
            • Item_Description: Product name and description{"\n"}
            • Pack_Size: Unit of measure (e.g., "each", "box", "kg"){"\n"}
            • itemcode: Unique product ID/SKU{"\n"}
            • barcode: Product barcode number{"\n"}
            • current_stock: Current quantity in stock{"\n"}
            • last_ordered: Last order date (optional){"\n"}
            • cost: Product cost price{"\n"}
            • minstock: Minimum stock level
          </Text>
        </View>
        
        <View style={styles.section}>
          <Database size={40} color={colors.primary} style={styles.sectionIcon} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Step 3: Export from Google Sheets</Text>
          <Text style={[styles.sectionText, { color: colors.inactive }]}>
            1. Open your Google Sheet{"\n"}
            2. Click File {">"} Download {">"} Comma Separated Values (.csv){"\n"}
            3. Save the file to your device
          </Text>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Step 4: Import to SmartStock</Text>
          <Text style={[styles.sectionText, { color: colors.inactive }]}>
            1. Go to Settings {">"} Data Management{"\n"}
            2. Tap "Import CSV File"{"\n"}
            3. Select your saved CSV file{"\n"}
            4. Confirm the import when prompted
          </Text>
          <Text style={[styles.note, { color: colors.warning }]}>
            Note: Importing will replace all existing product data in the app.
            Make sure to back up any existing data if needed.
          </Text>
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
  section: {
    marginBottom: 24,
  },
  sectionIcon: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  note: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 16,
  },
});