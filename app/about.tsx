import React, { useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail, Globe } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import SmartStockLogo from '@/components/SmartStockLogo';
import Animated, { 
  FadeIn,
  FadeInRight,
  FadeInUp,
  SlideInDown
} from 'react-native-reanimated';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function AboutScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const scrollRef = useRef<ScrollView>(null);

  const handleEmailPress = () => {
    Linking.openURL('mailto:smartstock.app@gmail.com');
  };

  const handleWebsitePress = () => {
    // Website coming soon message
    router.push('/coming-soon');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { 
        backgroundColor: colors.background,
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>About</Text>
      </View>

      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Logo and Tagline */}
          <Animated.View 
            entering={FadeIn.delay(200)}
            style={styles.logoContainer}
          >
            <SmartStockLogo size="large" />
          </Animated.View>

          <Animated.Text 
            entering={FadeInUp.delay(400)}
            style={[styles.tagline, { color: colors.text }]}
          >
            Smarter Stock. Simpler Workdays.
          </Animated.Text>

          {/* Intro */}
          <Animated.Text 
            entering={FadeInUp.delay(600)}
            style={[styles.description, { color: colors.inactive }]}
          >
            Running a business is hard enough without chasing missing parts or drowning in spreadsheets. That's why we built SmartStock — a sleek, powerful inventory tool designed for businesses that don't have time to waste.
          </Animated.Text>

          {/* Why We Built It */}
          <Animated.View entering={FadeInRight.delay(800)}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Why We Built It
            </Text>
            <Text style={[styles.description, { color: colors.inactive }]}>
              After 20 years in inventory management, we kept seeing the same pain points:
            </Text>
            <View style={styles.bulletPoints}>
              <Text style={[styles.bulletPoint, { color: colors.error }]}>
                ❌ Stockouts at the worst time
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.error }]}>
                ❌ Over-ordering just to feel "safe"
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.error }]}>
                ❌ Reordering systems that don't... work
              </Text>
            </View>
            <Text style={[styles.description, { color: colors.inactive }]}>
              SmartStock fixes that — with clarity, automation, and simplicity.
            </Text>
          </Animated.View>

          {/* Key Features */}
          <Animated.View entering={FadeInRight.delay(1000)}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Key Features
            </Text>
            <View style={styles.bulletPoints}>
              <Text style={[styles.bulletPoint, { color: colors.primary }]}>
                🔹 Scan & Reorder with QR / Barcodes
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.primary }]}>
                🔹 Google Sheets Sync
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.primary }]}>
                🔹 Live Stock Levels & Alerts
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.primary }]}>
                🔹 Offline-First Architecture
              </Text>
              <Text style={[styles.bulletPoint, { color: colors.primary }]}>
                🔹 Clean, Fast, Reliable UI
              </Text>
            </View>
          </Animated.View>

          {/* Founder's Note */}
          <Animated.View 
            entering={SlideInDown.delay(1200)}
            style={[styles.quoteContainer, { backgroundColor: colors.lightGray }]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Founder's Note
            </Text>
            <Text style={[styles.quote, { color: colors.text }]}>
              "I built SmartStock after two decades of solving stock problems the hard way — spreadsheets, guesswork, and missed orders. Now, small businesses have something better. Simple, smart, and built to perform."
            </Text>
          </Animated.View>

          {/* Contact */}
          <Animated.View entering={FadeIn.delay(1400)}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Contact
            </Text>
            <AnimatedTouchableOpacity 
              style={styles.contactButton}
              onPress={handleEmailPress}
            >
              <Mail size={20} color={colors.primary} />
              <Text style={[styles.contactText, { color: colors.primary }]}>
                smartstock.app@gmail.com
              </Text>
            </AnimatedTouchableOpacity>
            <AnimatedTouchableOpacity 
              style={styles.contactButton}
              onPress={handleWebsitePress}
            >
              <Globe size={20} color={colors.primary} />
              <Text style={[styles.contactText, { color: colors.primary }]}>
                www.smartstock.ai (coming soon)
              </Text>
            </AnimatedTouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
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
    padding: 24,
    paddingBottom: 48,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  tagline: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  bulletPoints: {
    marginBottom: 24,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  quoteContainer: {
    padding: 20,
    borderRadius: 12,
    marginVertical: 24,
  },
  quote: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  contactText: {
    fontSize: 16,
    marginLeft: 12,
    textDecorationLine: 'underline',
  },
});