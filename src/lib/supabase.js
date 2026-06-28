import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tuaifwiigkacrflbhjmu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YWlmd2lpZ2thY3JmbGJoam11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODYzMzQsImV4cCI6MjA5ODA2MjMzNH0.v8MoEksWut2Yo8VYKnFRhbVz6eF-IDBewkGB_wd993I'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
