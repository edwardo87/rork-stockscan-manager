import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Pencil, Trash2, Truck, Building2 } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useSupabaseInventoryStore } from '@/store/supabaseInventoryStore';
import { Supplier } from '@/types/inventory';

const emptySupplier = (): Supplier => ({
  id: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  contactPerson: '',
});

/**
 * Chapter 2 — Supplier records (public.suppliers), scoped to the caller's
 * business by RLS. Products keep their supplier TEXT fields; the record link
 * (supplier_id) is maintained in the background. Historical purchase-order
 * snapshots are never modified.
 */
export default function SuppliersScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const {
    business,
    businessLoaded,
    supplierRecords,
    supplierRecordsLoading,
    loadBusiness,
    loadSupplierRecords,
    saveSupplierRecord,
    deleteSupplierRecord,
  } = useSupabaseInventoryStore();

  const [editing, setEditing] = useState<Supplier | null>(null); // null = list view
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessLoaded) {
      loadBusiness();
    } else if (business) {
      loadSupplierRecords();
    }
  }, [businessLoaded, business, loadBusiness, loadSupplierRecords]);

  const handleDelete = (supplier: Supplier) => {
    Alert.alert(
      'Delete Supplier',
      `Delete "${supplier.name}"?\n\nProducts keep their supplier names. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplierRecord(supplier.id);
            } catch (error) {
              // e.g. blocked because historical POs reference this record.
              Alert.alert(
                'Cannot Delete Supplier',
                error instanceof Error ? error.message : 'Failed to delete supplier.',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveSupplierRecord(editing);
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setFormError(null);
    setEditing(emptySupplier());
  };

  const openEdit = (supplier: Supplier) => {
    setFormError(null);
    setEditing({ ...supplier });
  };

  // ---- supplier form (add / edit) ---------------------------------------
  if (editing) {
    const isNew = !editing.id;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (saving ? undefined : setEditing(null))}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isNew ? 'Add Supplier' : 'Edit Supplier'}
          </Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Supplier name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={editing.name}
            onChangeText={name => setEditing({ ...editing, name })}
            placeholder="e.g. AWS"
            placeholderTextColor={colors.inactive}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Ordering email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={editing.email}
            onChangeText={email => setEditing({ ...editing, email })}
            placeholder="orders@supplier.com"
            placeholderTextColor={colors.inactive}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Contact person</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={editing.contactPerson}
            onChangeText={contactPerson => setEditing({ ...editing, contactPerson })}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Phone</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={editing.phone}
            onChangeText={phone => setEditing({ ...editing, phone })}
            keyboardType="phone-pad"
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Address</Text>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border },
            ]}
            value={editing.address}
            onChangeText={address => setEditing({ ...editing, address })}
            multiline
          />

          {!!formError && <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.background }]}>
                {isNew ? 'Add Supplier' : 'Save Supplier'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ---- list view ---------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Suppliers</Text>
        <TouchableOpacity style={styles.addButton} onPress={openNew} disabled={!business}>
          <Plus size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* No business yet — supplier records require a business (RLS model). */}
      {businessLoaded && !business ? (
        <View style={[styles.centered, styles.container]}>
          <Building2 size={36} color={colors.inactive} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No business profile yet</Text>
          <Text style={[styles.emptyText, { color: colors.inactive }]}>
            Suppliers belong to your business. Set up your business profile first.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/business-profile')}
          >
            <Text style={[styles.primaryButtonText, { color: colors.background }]}>Set Up Business</Text>
          </TouchableOpacity>
        </View>
      ) : supplierRecordsLoading && supplierRecords.length === 0 ? (
        <View style={[styles.centered, styles.container]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.inactive }]}>Loading suppliers…</Text>
        </View>
      ) : supplierRecords.length === 0 ? (
        <View style={[styles.centered, styles.container]}>
          <Truck size={36} color={colors.inactive} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No suppliers yet</Text>
          <Text style={[styles.emptyText, { color: colors.inactive }]}>
            Add a supplier to keep ordering emails, phone numbers and addresses in one place.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={openNew}
          >
            <Text style={[styles.primaryButtonText, { color: colors.background }]}>Add Supplier</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.listContent}>
          {supplierRecords.map(supplier => (
            <View key={supplier.id} style={[styles.supplierCard, { backgroundColor: colors.lightGray }]}>
              <View style={styles.supplierInfo}>
                <Text style={[styles.supplierName, { color: colors.text }]}>{supplier.name}</Text>
                {!!supplier.email && (
                  <Text style={[styles.supplierLine, { color: colors.inactive }]} numberOfLines={1}>
                    {supplier.email}
                  </Text>
                )}
                {!!supplier.contactPerson && (
                  <Text style={[styles.supplierLine, { color: colors.inactive }]} numberOfLines={1}>
                    {supplier.contactPerson}
                  </Text>
                )}
                {!!supplier.phone && (
                  <Text style={[styles.supplierLine, { color: colors.inactive }]} numberOfLines={1}>
                    {supplier.phone}
                  </Text>
                )}
              </View>
              <View style={styles.supplierActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEdit(supplier)}>
                  <Pencil size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(supplier)}>
                  <Trash2 size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={[styles.footnote, { color: colors.inactive }]}>
            Suppliers shown here are stored against your business. Products and purchase orders keep their existing
            supplier names during the transition.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  addButton: {
    padding: 6,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
  },
  supplierCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  supplierLine: {
    fontSize: 13,
    marginTop: 2,
  },
  supplierActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  footnote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});
