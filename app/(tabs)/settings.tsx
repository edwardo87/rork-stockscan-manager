import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator, Linking } from 'react-native';
import { Moon, Sun, Bell, Palette, CheckCircle, AlertTriangle, Settings as SettingsIcon, Wrench, Mail, Globe } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { trpcClient } from '@/lib/trpc';
import SmartStockLogo from '@/components/SmartStockLogo';

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

  const handleEmailPress = () => {
    Linking.openURL('mailto:smartstock.app@gmail.com');
  };

  const handleWebsitePress = () => {
    Alert.alert(
      "Coming Soon",
      "The SmartStock website will be available soon!",
      [{ text: "OK" }]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.lightGray }]}>
      {/* About Section */}
      <View style={[styles.section, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About SmartStock</Text>
        
        <View style={styles.aboutHeader}>
          <SmartStockLogo size="large" />
          <Text style={[styles.tagline, { color: colors.text }]}>
            Smarter Stock. Simpler Workdays.
          </Text>
        </View>

        <Text style={[styles.description, { color: colors.inactive }]}>
          Running a business is hard enough without chasing missing parts or drowning in spreadsheets. That's why we built SmartStock — a sleek, powerful inventory tool designed for businesses that don't have time to waste.
        </Text>

        <Text style={[styles.subheading, { color: colors.text }]}>Why We Built It</Text>
        <Text style={[styles.description, { color: colors.inactive }]}>
          After 20 years managing inventory across factories, warehouses, and job sites, we saw the same problems over and over:
        </Text>
        <View style={styles.bulletPoints}>
          <Text style={[styles.bulletPoint, { color: colors.error }]}>❌ Stockouts at the worst time</Text>
          <Text style={[styles.bulletPoint, { color: colors.error }]}>❌ Over-ordering just to be "safe"</Text>
          <Text style={[styles.bulletPoint, { color: colors.error }]}>❌ Reordering systems that don't... work</Text>
        </View>

        <Text style={[styles.subheading, { color: colors.text }]}>Key Features That Just Work:</Text>
        <View style={styles.bulletPoints}>
          <Text style={[styles.bulletPoint, { color: colors.primary }]}>🔹 Scan & Reorder with QR or Barcode</Text>
          <Text style={[styles.bulletPoint, { color: colors.primary }]}>🔹 Live Inventory Visibility via Google Sheets</Text>
          <Text style={[styles.bulletPoint, { color: colors.primary }]}>🔹 Set Min Stock Alerts</Text>
          <Text style={[styles.bulletPoint, { color: colors.primary }]}>🔹 Track Orders in One Tap</Text>
          <Text style={[styles.bulletPoint, { color: colors.primary }]}>🔹 Works Offline, syncs when you're back online</Text>
        </View>

        <Text style={[styles.subheading, { color: colors.text }]}>A Word from the Founder</Text>
        <View style={[styles.quote, { backgroundColor: colors.lightGray }]}>
          <Text style={[styles.quoteText, { color: colors.text }]}>
            "I didn't create SmartStock to get rich. I created it because I was sick of seeing good businesses fall behind because their systems couldn't keep up. SmartStock helps level the playing field — and that's something I'm proud to stand behind."
          </Text>
        </View>

        <Text style={[styles.subheading, { color: colors.text }]}>Support & Contact</Text>
        <TouchableOpacity style={styles.contactRow} onPress={handleEmailPress}>
          <Mail size={20} color={colors.primary} />
          <Text style={[styles.contactText, { color: colors.primary }]}>
            smartstock.app@gmail.com
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.contactRow} onPress={handleWebsitePress}>
          <Globe size={20} color={colors.primary} />
          <Text style={[styles.contactText, { color: colors.primary }]}>
            www.smartstock.ai (coming soon)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Appearance Section */}
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

      {/* Notifications Section */}
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
  aboutHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  bulletPoints: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bulletPoint: {
    fontSize: 14,
    lineHeight: 22,
    paddingVertical: 2,
  },
  quote: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contactText: {
    fontSize: 14,
    marginLeft: 8,
    textDecorationLine: 'underline',
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