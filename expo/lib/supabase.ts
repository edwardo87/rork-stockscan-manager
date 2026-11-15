import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '@/types/supabase';

// These will be provided by the user when they set up their Supabase project
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseAnonKey);
};

// Only create client if properly configured
export const supabase = isSupabaseConfigured() 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (!isSupabaseConfigured()) {
  console.warn('⚠️ Supabase URL and Anon Key are required. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.');
}

// A saved login whose refresh token no longer exists (e.g. the Supabase
// project was paused and restored, which wipes refresh tokens) makes
// supabase-js throw an UNHANDLED AuthApiError from its token-refresh retry
// loop. That error surfaced as a full-screen runtime error instead of a
// clean sign-out. Catch exactly that case, clear the dead session and let
// the app show the login screen. Any other error is left untouched.
if (Platform.OS === 'web') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (/invalid refresh token|refresh token not found/i.test(message)) {
      event.preventDefault();
      void supabase?.auth.signOut().catch(() => undefined);
    }
  });
}



// Helper function to get current user
export const getCurrentUser = async () => {
  if (!supabase) {
    return null;
  }
  
  // Check for an existing session first to avoid noisy
  // "Auth session missing!" errors on the public/login screen.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return null;
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    // AuthSessionMissingError is expected when the user is logged out — don't log it.
    if (error.name !== 'AuthSessionMissingError') {
      console.error('Error getting current user:', error);
    }
    return null;
  }
  return user;
};

// Helper function to sign out
export const signOut = async () => {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};