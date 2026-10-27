/**
 * Accounts switch on when the project's two public Supabase settings are
 * there, and not before. Without them there is no sign-in anywhere on the
 * site — no button that leads to an error page, no form that pretends.
 *
 * Both are public by design (the key is the anon / publishable one; row
 * level security is what protects the data), and both are read at build
 * time, so they are set in Vercel and take effect on the next deploy.
 */
export type SupabaseEnv = { readonly url: string; readonly key: string };

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // newer projects call it the publishable key; older ones, the anon key
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export const accountsEnabled = (): boolean => supabaseEnv() !== null;
