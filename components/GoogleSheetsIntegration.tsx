import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { Cloud, CloudOff, RefreshCw, Settings, CheckCircle, AlertCircle } from 'lucide-react-native';

export const GoogleSheetsIntegration: React.FC = () => {
  const {
    isGoogleSheetsEnabled,
    lastSyncTime,
    isLoading,
    error,
    initializeGoogleSheets,
    syncWithGoogleSheets,
    setGoogleSheetsEnabled,
    setError
  } = useInventoryStore();

  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  const handleInitializeSheets = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      await initializeGoogleSheets();
      Alert.alert(
        'Success',
        'Google Sheets integration has been initialized successfully! Your inventory data is now synced.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to initialize Google Sheets integration. Please check your configuration and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSync = async () => {
    try {
      setError(null);
      await syncWithGoogleSheets();
      Alert.alert(
        'Success',
        'Inventory data has been synced with Google Sheets.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to sync with Google Sheets. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDisableIntegration = () => {
    Alert.alert(
      'Disable Google Sheets Integration',
      'Are you sure you want to disable Google Sheets integration? Your local data will remain, but changes won\\'t sync to Google Sheets.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            setGoogleSheetsEnabled(false);
            setError(null);
          }
        }
      ]
    );
  };

  const formatLastSyncTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {isGoogleSheetsEnabled ? (
            <Cloud size={24} color=\"#10B981\" />
          ) : (
            <CloudOff size={24} color=\"#6B7280\" />
          )}
          <Text style={styles.title}>Google Sheets Integration</Text>
        </View>
        
        <View style={styles.statusRow}>
          {isGoogleSheetsEnabled ? (
            <View style={styles.statusBadge}>
              <CheckCircle size={16} color=\"#10B981\" />
              <Text style={styles.statusTextEnabled}>Enabled</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.statusBadgeDisabled]}>
              <AlertCircle size={16} color=\"#6B7280\" />
              <Text style={styles.statusTextDisabled}>Disabled</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.description}>
        Sync your inventory data with Google Sheets for real-time collaboration and backup.
      </Text>

      {error && (
        <View style={styles.errorContainer}>
          <AlertCircle size={16} color=\"#EF4444\" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isGoogleSheetsEnabled && (
        <View style={styles.syncInfo}>
          <Text style={styles.syncLabel}>Last sync:</Text>
          <Text style={styles.syncTime}>{formatLastSyncTime(lastSyncTime)}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {!isGoogleSheetsEnabled ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleInitializeSheets}
            disabled={isInitializing || isLoading}
          >
            <Settings size={20} color=\"#FFFFFF\" />
            <Text style={styles.primaryButtonText}>
              {isInitializing ? 'Initializing...' : 'Initialize Google Sheets'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.enabledActions}>
            <TouchableOpacity
              style={styles.syncButton}
              onPress={handleSync}
              disabled={isLoading}
            >
              <RefreshCw size={20} color=\"#10B981\" />
              <Text style={styles.syncButtonText}>
                {isLoading ? 'Syncing...' : 'Sync Now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.disableButton}
              onPress={handleDisableIntegration}
              disabled={isLoading}
            >
              <Text style={styles.disableButtonText}>Disable</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isGoogleSheetsEnabled && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Integration Active</Text>
          <Text style={styles.infoText}>
            • Product changes sync automatically{'\n'}
            • Orders are logged to Google Sheets{'\n'}
            • Stocktake results are recorded{'\n'}
            • Data persists across devices
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeDisabled: {
    backgroundColor: '#F3F4F6',
  },
  statusTextEnabled: {
    fontSize: 12,
    fontWeight: '500',
    color: '#10B981',
    marginLeft: 4,
  },
  statusTextDisabled: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginLeft: 8,
    flex: 1,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  syncTime: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  actions: {
    marginBottom: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  enabledActions: {
    flexDirection: 'row',
    gap: 12,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  syncButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  disableButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  disableButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  infoBox: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
});