import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Switch, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Info, Wrench } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { trpcClient } from '@/lib/trpc';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, theme, toggleTheme } = useThemeStore();
  const [isTestingEnv, setIsTestingEnv] = useState(false);
  
  const {
    lowStockAlerts,
    orderUpdates,
    recentlyOrdered,
    toggleLowStockAlerts,
    toggleOrderUpdates,
    toggleRecentlyOrdered,
  } = useNotificationsStore();

  const testEnvironment = async () => {
    try {
      setIsTestingEnv(true);
      const result = await trpcClient.test.env.query();
      
      if (result.success) {
        Alert.alert(
          "✅ Environment Check Passed",
          "All required environment variables are properly configured.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "❌ Environment Check Failed",
          `Missing variables: ${result.missingVariables.join(', ')}`,
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      Alert.alert(
        "❌ Connection Error",
        "Failed to check environment variables.",
        [{ text: "OK" }]
      );
    } finally {
      setIsTestingEnv(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.lightGray }]}>
      {/* Appearance Section */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
        
        <TouchableOpacity 
          style={[styles.settingRow, { borderTopColor: colors.border }]}
          onPress={toggleTheme}
        >
          <View style={styles.settingInfo}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Dark Mode
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                {theme === 'dark' ? 'On' : 'Off'}
              </Text>
            </View>
          </View>
          <Switch 
            value={theme === 'dark'}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.lightGray, true: colors.primary }}
          />
        </TouchableOpacity>
      </View>

      {/* Notifications Section */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
        
        <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
          <View style={styles.settingInfo}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Low Stock Alerts
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Get notified when items run low
              </Text>
            </View>
          </View>
          <Switch 
            value={lowStockAlerts}
            onValueChange={toggleLowStockAlerts}
            trackColor={{ false: colors.lightGray, true: colors.primary }}
          />
        </View>

        <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
          <View style={styles.settingInfo}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Order Updates
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Get notified about order status changes
              </Text>
            </View>
          </View>
          <Switch 
            value={orderUpdates}
            onValueChange={toggleOrderUpdates}
            trackColor={{ false: colors.lightGray, true: colors.primary }}
          />
        </View>

        <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
          <View style={styles.settingInfo}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Recently Ordered
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Show orders from last 48 hours
              </Text>
            </View>
          </View>
          <Switch 
            value={recentlyOrdered}
            onValueChange={toggleRecentlyOrdered}
            trackColor={{ false: colors.lightGray, true: colors.primary }}
          />
        </View>
      </View>

      {/* About Section */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <TouchableOpacity 
          style={[styles.settingRow, { borderTopColor: colors.border }]}
          onPress={() => router.push('/about')}
        >
          <View style={styles.settingInfo}>
            <Info size={22} color={colors.text} style={styles.settingIcon} />
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                About SmartStock
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Learn more about the app
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Developer Tools Section */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Developer Tools</Text>
        
        <TouchableOpacity 
          style={[
            styles.settingRow, 
            { borderTopColor: colors.border },
            isTestingEnv && { opacity: 0.7 }
          ]}
          onPress={testEnvironment}
          disabled={isTestingEnv}
        >
          <View style={styles.settingInfo}>
            {isTestingEnv ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.settingIcon} />
            ) : (
              <Wrench size={22} color={colors.text} style={styles.settingIcon} />
            )}
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Test Environment
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Verify environment configuration
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
          <View style={styles.settingInfo}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Version
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                1.0.0 (build 1)
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 16,
  },
  settingIcon: {
    marginRight: 12,
    width: 22,
    height: 22,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 6,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});