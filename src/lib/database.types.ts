/**
 * The database's shape, for the parts the app reads so far.
 *
 * Written by hand from supabase/migrations/0001_canon_init.sql because there
 * is no linked project to generate it from yet. Once there is, replace this
 * file wholesale with
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * and let the compiler say where the app and the schema disagree.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  region: string;
  theme: Json;
  default_audience: "private" | "invited" | "household" | "everyone";
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id" | "handle" | "display_name"> &
          Partial<Omit<ProfileRow, "id" | "handle" | "display_name">>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProfileRecord = ProfileRow;
