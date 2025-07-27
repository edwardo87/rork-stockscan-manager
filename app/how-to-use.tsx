import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Stack } from 'expo-router';
import { ChevronRight, Package, Edit3, QrCode, Mail, Upload, BarChart3, Settings, CheckCircle } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';

const { width } = Dimensions.get('window');

interface GuideStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  steps: string[];
}

const guideSteps: GuideStep[] = [
  {
    id: 'upload-stock',
    title: 'Upload Your Stock',
    description: 'Get your inventory into SmartStock',
    icon: Upload,
    steps: [
      'Go to Settings → Google Sheets Integration',
      'Connect your Google account and create a new sheet',
      'Or manually add products in the Products tab',
      'Tap the + button to add new items',
      'Fill in product name, SKU, price, and current stock',
      'Set minimum stock levels for low stock alerts'
    ]
  },
  {
    id: 'edit-products',
    title: 'Edit Product Information',
    description: 'Update prices, stock levels, and details',
    icon: Edit3,
    steps: [
      'Navigate to the Products tab',
      'Tap on any product card to view details',
      'Tap "Edit Product" to modify information',
      'Update price, current stock, minimum stock level',
      'Add or change product description',
      'Save changes - they sync to Google Sheets if connected'
    ]
  },
  {
    id: 'qr-codes',
    title: 'Create QR Codes',
    description: 'Generate QR codes for quick scanning',
    icon: QrCode,
    steps: [
      'Open any product from the Products tab',
      'Scroll down to see the QR code section',
      'The QR code is automatically generated for each product',
      'Use the Scanner tab to scan QR codes',
      'Scanning will quickly open the product details',
      'Perfect for warehouse or stockroom use'
    ]
  },
  {
    id: 'stocktake',
    title: 'Perform Stocktakes',
    description: 'Count and update your inventory',
    icon: BarChart3,
    steps: [
      'Go to the Stocktake tab',
      'Review all products listed',
      'Enter actual counted quantities',
      'Use the scanner to quickly find products',
      'Submit the stocktake when complete',
      'Stock levels will be updated automatically'
    ]
  },
  {
    id: 'email-setup',
    title: 'Setup Email Function',
    description: 'Configure email for purchase orders',
    icon: Mail,
    steps: [
      'Ensure you have environment variables configured',
      'Go to Settings → Test Environment to verify setup',
      'When creating orders, you can email suppliers',
      'Purchase orders are sent as PDF attachments',
      'Email includes order details and company information',
      'Track sent orders in the order history'
    ]
  },
  {
    id: 'google-sheets',
    title: 'Google Sheets Integration',
    description: 'Sync data with Google Sheets',
    icon: Package,
    steps: [
      'Go to Settings and find Google Sheets Integration',
      'Click "Initialize Google Sheets"',
      'Follow the authentication process',
      'Your data will sync automatically',
      'Changes in the app update the sheet',
      'Multiple devices can access the same data'
    ]
  }
];

export default function HowToUseScreen() {
  const { colors } = useThemeStore();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const toggleStep = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'How to Use SmartStock',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }} 
      />
      
      <ScrollView style={[styles.container, { backgroundColor: colors.lightGray }]}>
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Getting Started with SmartStock
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.inactive }]}>
            Follow these step-by-step guides to make the most of your inventory management
          </Text>
        </View>

        {guideSteps.map((step, index) => {
          const IconComponent = step.icon;
          const isExpanded = expandedStep === step.id;
          
          return (
            <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.background }]}>
              <TouchableOpacity 
                style={styles.stepHeader}
                onPress={() => toggleStep(step.id)}
              >
                <View style={styles.stepHeaderLeft}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.stepNumberText, { color: colors.background }]}>
                      {index + 1}
                    </Text>
                  </View>
                  <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
                    <IconComponent size={20} color={colors.primary} />
                  </View>
                  <View style={styles.stepInfo}>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>
                      {step.title}
                    </Text>
                    <Text style={[styles.stepDescription, { color: colors.inactive }]}>
                      {step.description}
                    </Text>
                  </View>
                </View>
                <ChevronRight 
                  size={20} 
                  color={colors.inactive} 
                  style={[styles.chevron, isExpanded && styles.chevronExpanded]}
                />
              </TouchableOpacity>
              
              {isExpanded && (
                <View style={[styles.stepContent, { borderTopColor: colors.border }]}>
                  {step.steps.map((stepText, stepIndex) => (
                    <View key={stepIndex} style={styles.stepItem}>
                      <CheckCircle size={16} color={colors.primary} style={styles.checkIcon} />
                      <Text style={[styles.stepText, { color: colors.text }]}>
                        {stepText}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <Text style={[styles.footerTitle, { color: colors.text }]}>
            Need More Help?
          </Text>
          <Text style={[styles.footerText, { color: colors.inactive }]}>
            If you&apos;re still having trouble, check the About section for additional resources or contact support.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  stepCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  stepHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 14,
  },
  chevron: {
    marginLeft: 8,
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  stepContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    marginTop: 0,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingLeft: 76, // Align with step info
  },
  checkIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  footerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
  },
});