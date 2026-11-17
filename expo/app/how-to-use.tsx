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
      'Go to Settings → Import Supplier Catalogue',
      'Choose a supplier and a CSV, Excel or text-based PDF supplier document',
      'Review selected products, purchasing units and any questions before approving the import',
      'Or manually add products in the Products tab',
      'Tap the + button to add new items',
      'Fill in product name, SKU, price, and current stock',
      'Supplier quantities are not your physical stock counts; use a stocktake to record those'
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
      'Tap "Edit" to modify information',
      'Update price, current stock, minimum stock level',
      'Add or change product description',
      'Save while connected and check that saving succeeds before leaving the screen'
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
      'Stay connected to the internet while QR images load or labels are prepared',
      'Use the product print action to prepare one label, or the Products print action to select several labels',
      'On your phone, labels are shared as a PDF with the QR images included',
      'Wait for preparation to finish; if it fails, check your connection and retry',
      'In a browser, allow the label pop-up and wait for the images before printing',
      'Print a sample and check that it scans to the correct product before printing a full batch',
      'Use Scan in the Order or Stocktake tab',
      'Use View Details on the scan card to open the product',
      'Keep the printed code clear and readable; an internet connection is still needed to load and save cloud records'
    ]
  },
  {
    id: 'ordering-round',
    title: 'Complete an Ordering Round',
    description: 'Scan, review by supplier and prepare purchase orders',
    icon: Package,
    steps: [
      'Open Order → Scan and scan a product label',
      'Check supplier code, order unit, pack quantity and the latest available order',
      'Enter the required quantity in order units, then tap Add to Order and continue scanning',
      'Tap See Order to review items grouped by supplier',
      'Correct any unresolved purchasing details before submitting',
      'Submit creates separate supplier purchase orders; open History to review and share each one',
      'Recent orders never prevent ordering again, and ordering does not increase physical stock'
    ]
  },
  {
    id: 'stocktake',
    title: 'Perform Stocktakes',
    description: 'Count and update your inventory',
    icon: BarChart3,
    steps: [
      'Go to the Stocktake tab',
      'Scan the products you want to count',
      'Enter actual counted quantities',
      'Use the scanner to quickly find products',
      'Submit the stocktake when complete',
      'Saving updates recorded stock counts; it does not create an order',
      'If a save is interrupted, use Retry unfinished save before starting another attempt',
      'Open History & export to review a saved count and share its CSV spreadsheet',
      'Historic counts keep the values saved at that time; they do not measure usage since then'
    ]
  },
  {
    id: 'email-setup',
    title: 'Setup Email Function',
    description: 'Configure email for purchase orders',
    icon: Mail,
    steps: [
      'Enter your company and delivery details in Settings → Business Profile',
      'Set supplier ordering emails in Settings → Suppliers',
      'Create an order, then open Order → History to review each supplier purchase order',
      'On your phone, Email opens a draft with the PDF attached, or a share sheet when no mail app is configured',
      'Review the recipient and attachment, then send using your chosen app',
      'Order History records created orders; it is not proof of email delivery'
    ]
  },
  {
    id: 'cloud-sync',
    title: 'Cloud Sync & Multi-Device',
    description: 'Access your data from any device',
    icon: Package,
    steps: [
      'Sign in with the same account on any device',
      'All inventory data is stored securely in the cloud',
      'An internet connection is needed to load and save cloud records',
      'Refresh the relevant screen to check for saved changes; cached counts may be older',
      'Log out anytime to switch accounts',
      'Your data stays private to your account'
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
