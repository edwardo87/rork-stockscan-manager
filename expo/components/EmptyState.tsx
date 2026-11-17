import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { ScanBarcode, ClipboardList, Archive } from 'lucide-react-native';

interface EmptyStateProps {
  type: 'order' | 'stocktake' | 'products';
  onAction?: () => void;
}

export default function EmptyState({ type, onAction }: EmptyStateProps) {
  const { colors } = useThemeStore();
  
  let icon;
  let title;
  let message;
  let actionText;

  switch (type) {
    case 'order':
      icon = <ScanBarcode size={40} color={colors.accent} />;
      title = "Nothing on this order yet";
      message = "Scan a barcode or supplier code to add the first item.";
      break;
    case 'stocktake':
      icon = <ClipboardList size={40} color={colors.accent} />;
      title = "Ready to count";
      message = "Scan each product on the shelf and enter what you count.";
      break;
    case 'products':
      icon = <Archive size={40} color={colors.accent} />;
      title = "No products found";
      message = "Your product catalog is empty. Upload a CSV file or add products manually to get started.";
      actionText = "Import products";
      break;
    default:
      icon = <Archive size={40} color={colors.accent} />;
      title = "Nothing here yet";
      message = "Get started by adding some items.";
      actionText = "Take Action";
  }

  return (
    // ScrollView (not flex-centred View): when the space above is squeezed —
    // e.g. the Products screen with its upload-options panel expanded — a
    // flex-centred View's content overflows upward and draws over sibling
    // views. A ScrollView instead scrolls, so it can never overlap anything.
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.accentSoft }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.inactive }]}>{message}</Text>
      {actionText && onAction && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primaryFill }]}
          onPress={onAction}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimaryFill }]}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // flexGrow keeps centre-when-there's-room behaviour; scrolling takes over
  // instead of overflowing when the content is taller than the space.
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    maxWidth: 300,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});