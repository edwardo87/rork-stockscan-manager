import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSupabaseInventoryStore } from '@/store/supabaseInventoryStore';
import AuthScreen from '@/components/AuthScreen';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AppWrapperProps {
  children: React.ReactNode;
}

export default function AppWrapper({ children }: AppWrapperProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const {
    isSupabaseEnabled,
    isAuthenticated,
    checkSupabaseStatus,
    checkAuthStatus,
  } = useSupabaseInventoryStore();

  useEffect(() => {
    const initialize = async () => {
      try {
        // Check if Supabase is configured
        checkSupabaseStatus();
        
        if (isSupabaseConfigured()) {
          // Check authentication status
          await checkAuthStatus();
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Initializing SmartStock...</Text>
      </View>
    );
  }

  // If Supabase is not configured, show a setup message but still allow app usage
  if (!isSupabaseEnabled) {
    return (
      <View style={styles.container}>
        <View style={styles.setupBanner}>
          <Text style={styles.setupText}>
            📱 Running in offline mode. Set up Supabase for cloud sync and multi-device access.
          </Text>
        </View>
        {children}
      </View>
    );
  }

  // If Supabase is configured but user is not authenticated, show auth screen
  if (isSupabaseEnabled && !isAuthenticated) {
    return (
      <AuthScreen 
        onAuthSuccess={() => {
          // Auth state will be updated automatically by the store
        }} 
      />
    );
  }

  // User is authenticated or Supabase is not configured, show the app
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  setupBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f59e0b',
  },
  setupText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
});