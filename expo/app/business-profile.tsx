import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Building2, Save } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useSupabaseInventoryStore } from '@/store/supabaseInventoryStore';

/**
 * Chapter 2 — Business profile.
 *
 * - Existing members: loads and edits their existing public.businesses row.
 *   claim_my_business() is NEVER called for them.
 * - New users (no business yet): one-time create + claim via the trusted
 *   claim_my_business() RPC.
 * - Membership and role are database-controlled and are never editable here.
 */
export default function BusinessProfileScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const {
    business,
    businessLoaded,
    businessError,
    user,
    loadBusiness,
    createAndClaimBusiness,
    saveBusinessProfile,
  } = useSupabaseInventoryStore();

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const accountEmail: string = user?.email ?? '';

  useEffect(() => {
    if (!businessLoaded) {
      loadBusiness();
    }
  }, [businessLoaded, loadBusiness]);

  // Hydrate the form whenever a profile appears (loaded or created).
  useEffect(() => {
    if (business) {
      setName(business.name ?? '');
      setContactEmail(business.contactEmail ?? '');
      setPhone(business.phone ?? '');
      setAddress(business.address ?? '');
      setDeliveryAddress(business.deliveryAddress ?? '');
      setLogoUrl(business.logoUrl ?? '');
    }
  }, [business]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setFormError('Please enter a business name.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createAndClaimBusiness(name, contactEmail || accountEmail);
      Alert.alert('Business Created', 'Your business profile is ready.', [{ text: 'OK' }]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create your business.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!business) return;
    if (!name.trim()) {
      setFormError('Business name cannot be empty.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveBusinessProfile({
        name,
        contactEmail,
        phone,
        address,
        deliveryAddress,
        logoUrl,
      });
      Alert.alert('Saved', 'Your business profile has been updated.', [{ text: 'OK' }]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save your business profile.');
    } finally {
      setSaving(false);
    }
  };

  const retryLoad = () => {
    setFormError(null);
    loadBusiness();
  };

  // ---- loading ---------------------------------------------------------
  if (!businessLoaded && !businessError) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.inactive }]}>Loading your business…</Text>
      </View>
    );
  }

  // ---- load error (no profile to show) ---------------------------------
  if (businessError && !business) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Business Profile</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.errorText, { color: colors.error }]}>{businessError}</Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={retryLoad}>
            <Text style={[styles.primaryButtonText, { color: colors.background }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- first-time creation (pre-claim account) --------------------------
  if (!business) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Business Profile</Text>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.lightGray }]}>
            <Building2 size={28} color={colors.primary} />
            <Text style={[styles.createTitle, { color: colors.text }]}>Set up your business</Text>
            <Text style={[styles.createDescription, { color: colors.inactive }]}>
              One-time setup. Your business links your products, orders and suppliers together.
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Business name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Lifestyle Windows"
            placeholderTextColor={colors.inactive}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { color: colors.text }]}>Contact email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
            value={contactEmail || accountEmail}
            onChangeText={setContactEmail}
            placeholder="orders@yourbusiness.com"
            placeholderTextColor={colors.inactive}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {!!formError && <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.background }]}>Create Business</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ---- existing profile: view + edit ------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Business Profile</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!businessError && <Text style={[styles.errorText, { color: colors.error }]}>{businessError}</Text>}
        {!!formError && <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>}

        {!!logoUrl.trim() && (
          <Image source={{ uri: logoUrl.trim() }} style={styles.logoPreview} resizeMode="contain" />
        )}

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Business name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Contact email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
          value={contactEmail}
          onChangeText={setContactEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Phone</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Address</Text>
        <TextInput
          style={[
            styles.input,
            styles.multiline,
            { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border },
          ]}
          value={address}
          onChangeText={setAddress}
          multiline
        />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Delivery address</Text>
        <TextInput
          style={[
            styles.input,
            styles.multiline,
            { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border },
          ]}
          value={deliveryAddress}
          onChangeText={setDeliveryAddress}
          multiline
        />

        <Text style={[styles.fieldLabel, { color: colors.text }]}>Logo URL (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.lightGray, color: colors.text, borderColor: colors.border }]}
          value={logoUrl}
          onChangeText={setLogoUrl}
          autoCapitalize="none"
          placeholder="https://…"
          placeholderTextColor={colors.inactive}
        />
        <Text style={[styles.fieldHint, { color: colors.inactive }]}>
          Used as a preview here. PDF and email branding comes from your business name and addresses.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <View style={styles.saveRow}>
              <Save size={18} color={colors.background} />
              <Text style={[styles.primaryButtonText, { color: colors.background }]}>Save Profile</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={[styles.membershipNote, { color: colors.inactive }]}>
          Signed in as {accountEmail || 'owner'} · Business membership and role are managed securely and cannot be
          changed here.
        </Text>
      </ScrollView>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
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
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  createDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
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
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  logoPreview: {
    width: 96,
    height: 96,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
    backgroundColor: '#f0f0f0',
  },
  membershipNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
