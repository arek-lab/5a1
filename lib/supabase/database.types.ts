export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json | null
          property_id: string | null
          target_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json | null
          property_id?: string | null
          target_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json | null
          property_id?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      hotel_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          last_login_at: string | null
          property_id: string
          role: Database["public"]["Enums"]["hotel_role"]
          status: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_login_at?: string | null
          property_id: string
          role?: Database["public"]["Enums"]["hotel_role"]
          status?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_login_at?: string | null
          property_id?: string
          role?: Database["public"]["Enums"]["hotel_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_users_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          payload: Json | null
          property_id: string | null
          run_at: string
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          payload?: Json | null
          property_id?: string | null
          run_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          payload?: Json | null
          property_id?: string | null
          run_at?: string
          status?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          category: string | null
          content: string
          content_hash: string | null
          created_at: string
          embedding: string | null
          id: string
          language: string
          property_id: string
          question: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          category?: string | null
          content: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          language?: string
          property_id: string
          question?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          language?: string
          property_id?: string
          question?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          note: string | null
          price_cents: number | null
          property_id: string
          reservation_id: string | null
          room_id: string | null
          scheduled_at: string | null
          service_id: string
          session_id: string | null
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          price_cents?: number | null
          property_id: string
          reservation_id?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          service_id: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          price_cents?: number | null
          property_id?: string
          reservation_id?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          service_id?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          ai_bot_name: string | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          default_locale: string
          dpa_signed_at: string | null
          id: string
          logo_url: string | null
          name: string
          phone_reception: string | null
          setup_completed: boolean
          timezone: string
        }
        Insert: {
          address?: string | null
          ai_bot_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          default_locale?: string
          dpa_signed_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone_reception?: string | null
          setup_completed?: boolean
          timezone?: string
        }
        Update: {
          address?: string | null
          ai_bot_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          default_locale?: string
          dpa_signed_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone_reception?: string | null
          setup_completed?: boolean
          timezone?: string
        }
        Relationships: []
      }
      qr_codes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          init_token: string
          is_active: boolean
          property_id: string
          room_id: string | null
          rotates_every: string | null
          type: Database["public"]["Enums"]["qr_type"]
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          init_token?: string
          is_active?: boolean
          property_id: string
          room_id?: string | null
          rotates_every?: string | null
          type: Database["public"]["Enums"]["qr_type"]
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          init_token?: string
          is_active?: boolean
          property_id?: string
          room_id?: string | null
          rotates_every?: string | null
          type?: Database["public"]["Enums"]["qr_type"]
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          external_id: string | null
          guest_email: string | null
          guest_first_name: string | null
          id: string
          invite_token: string | null
          invite_token_expires_at: string | null
          property_id: string
          room_id: string | null
          source: string
          status: Database["public"]["Enums"]["reservation_status"]
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          external_id?: string | null
          guest_email?: string | null
          guest_first_name?: string | null
          id?: string
          invite_token?: string | null
          invite_token_expires_at?: string | null
          property_id: string
          room_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          external_id?: string | null
          guest_email?: string | null
          guest_first_name?: string | null
          id?: string
          invite_token?: string | null
          invite_token_expires_at?: string | null
          property_id?: string
          room_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          property_id: string
          room_active_reservation_id: string | null
          room_number: string
          room_type: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          room_active_reservation_id?: string | null
          room_number: string
          room_type?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          room_active_reservation_id?: string | null
          room_number?: string
          room_type?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_active_reservation_id_fkey"
            columns: ["room_active_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          available_from: string | null
          available_to: string | null
          category: string
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_pinned: boolean
          name: string
          price_cents: number | null
          property_id: string
          template_key: string | null
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_pinned?: boolean
          name: string
          price_cents?: number | null
          property_id: string
          template_key?: string | null
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_pinned?: boolean
          name?: string
          price_cents?: number | null
          property_id?: string
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          auth_level: number
          auth_user_id: string | null
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          last_asn: number | null
          property_id: string
          reception_scan_at: string | null
          reservation_id: string
          revoked: boolean
          room_id: string | null
          room_scan_at: string | null
        }
        Insert: {
          auth_level?: number
          auth_user_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          expires_at: string
          id?: string
          last_asn?: number | null
          property_id: string
          reception_scan_at?: string | null
          reservation_id: string
          revoked?: boolean
          room_id?: string | null
          room_scan_at?: string | null
        }
        Update: {
          auth_level?: number
          auth_user_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          last_asn?: number | null
          property_id?: string
          reception_scan_at?: string | null
          reservation_id?: string
          revoked?: boolean
          room_id?: string | null
          room_scan_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_tenant_context: {
        Args: { p_property_id: string; p_session_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      hotel_role: "owner" | "admin" | "staff" | "viewer"
      order_status: "new" | "confirmed" | "fulfilled" | "rejected"
      qr_type: "reception" | "room"
      reservation_status: "pending" | "checked_in" | "checked_out" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      hotel_role: ["owner", "admin", "staff", "viewer"],
      order_status: ["new", "confirmed", "fulfilled", "rejected"],
      qr_type: ["reception", "room"],
      reservation_status: ["pending", "checked_in", "checked_out", "cancelled"],
    },
  },
} as const
