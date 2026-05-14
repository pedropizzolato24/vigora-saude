import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://qlxlabwgflxbzavszbvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseGxhYndnZmx4YnphdnN6YnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODUwMDAsImV4cCI6MjA5NDM2MTAwMH0.wQekRovkFGUIY2wQoL8ChEsuO9Yn0AZNI03bLWuoNc8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: { Tables: Record<string, never> };
};

export function isSupabaseConfigured(): boolean {
  return true;
}
