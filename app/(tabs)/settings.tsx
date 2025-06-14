import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { Moon, Sun, Bell, Palette, CheckCircle, AlertTriangle, Settings as SettingsIcon, Tool } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { trpcClient } from '@/lib/trpc';

export default function SettingsScreen() {
  const { colors, theme, toggleTheme } = useThemeStore();
  const [isTestingEnv, setIsTestingEnv] = useState(false);
  const [notifications, setNotifications] = useState(true);
  
  const testEnvironment = async () => {
    try {
      setIsTestingEnv(true);
      const result = await trpcClient.test.env.query();
      
      if (result.success) {
        Alert.alert(
          "✅ Environment Check Passed",
          "All required environment variables are properly configured:\n\n" +
          "• GOOGLE_SERVICE_ACCOUNT_EMAIL\n" +
          "• GOOGLE_PRIVATE_KEY\n" +
          "• GOOGLE_SHEET_ID",
          [{ text: "OK" }]
        );
      } else {
        const missingVars = result.missingVariables.join('\n• ');
        Alert.alert(
          "❌ Environment Check Failed",
          `The following environment variables are missing:\n\n• ${missingVars}\n\nPlease check your environment configuration.`,
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      Alert.alert(
        "❌ Connection Error",
        "Failed to check environment variables. Please verify your internet connection and try again.",
        [{ text: "OK" }]
      );
    } finally {
      setIsTestingEnv(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.lightGray }]}>
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
        
        <TouchableOpacity 
          style={[styles.settingRow, { borderTopColor: colors.border }]}
          onPress={toggleTheme}
        >
          <View style={styles.settingInfo}>
            {theme === 'dark' ? (
              <Moon size={22} color={colors.text} style={styles.settingIcon} />
            ) : (
              <Sun size={22} color={colors.text} style={styles.settingIcon} />
            )}
            <View>
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

        <TouchableOpacity 
          style={[styles.settingRow, { borderTopColor: colors.border }]}
        >
          <View style={styles.settingInfo}>
            <Palette size={22} color={colors.text} style={styles.settingIcon} />
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Theme Color
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Default Blue
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
        
        <TouchableOpacity 
          style={[styles.settingRow, { borderTopColor: colors.border }]}
          onPress={() => setNotifications(!notifications)}
        >
          <View style={styles.settingInfo}>
            <Bell size={22} color={colors.text} style={styles.settingIcon} />
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Push Notifications
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Low stock alerts and order updates
              </Text>
            </View>
          </View>
          <Switch 
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: colors.lightGray, true: colors.primary }}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Data Management</Text>
        
        <TouchableOpacity style={[styles.settingRow, { borderTopColor: colors.border }]}>
          <View style={styles.settingInfo}>
            <Tool size={22} color={colors.text} style={styles.settingIcon} />
            <View>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Import Data
              </Text>
              <Text style={[styles.settingDescription, { color: colors.inactive }]}>
                Import products from CSV
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

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
              <SettingsIcon size={22} color={colors.text} style={styles.settingIcon} />
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

      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        
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
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
    width: 22,
    height: 22,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
  },
});