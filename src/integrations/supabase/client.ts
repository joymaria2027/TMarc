import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ynlbzxpgjduvpjvbnpyb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_60xj55Rr3SfzCoHUE2fpeA_K5dZ59z2';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});