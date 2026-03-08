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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          consultation_type: string | null
          created_at: string
          doctor_id: string
          duration: number | null
          id: string
          meeting_url: string | null
          notes: string | null
          patient_id: string
          payment_intent_id: string | null
          payment_status: string | null
          scheduled_at: string
          status: string | null
          updated_at: string
        }
        Insert: {
          consultation_type?: string | null
          created_at?: string
          doctor_id: string
          duration?: number | null
          id?: string
          meeting_url?: string | null
          notes?: string | null
          patient_id: string
          payment_intent_id?: string | null
          payment_status?: string | null
          scheduled_at: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          consultation_type?: string | null
          created_at?: string
          doctor_id?: string
          duration?: number | null
          id?: string
          meeting_url?: string | null
          notes?: string | null
          patient_id?: string
          payment_intent_id?: string | null
          payment_status?: string | null
          scheduled_at?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consultation_settings: {
        Row: {
          consultation_duration: number | null
          consultation_price: number | null
          created_at: string
          currency: string | null
          doctor_id: string
          id: string
          is_available: boolean | null
          stripe_account_id: string | null
          updated_at: string
          video_enabled: boolean | null
        }
        Insert: {
          consultation_duration?: number | null
          consultation_price?: number | null
          created_at?: string
          currency?: string | null
          doctor_id: string
          id?: string
          is_available?: boolean | null
          stripe_account_id?: string | null
          updated_at?: string
          video_enabled?: boolean | null
        }
        Update: {
          consultation_duration?: number | null
          consultation_price?: number | null
          created_at?: string
          currency?: string | null
          doctor_id?: string
          id?: string
          is_available?: boolean | null
          stripe_account_id?: string | null
          updated_at?: string
          video_enabled?: boolean | null
        }
        Relationships: []
      }
      daily_health_signals: {
        Row: {
          created_at: string
          discharge: string | null
          id: string
          intercourse: Json | null
          mood: string[] | null
          notes: string | null
          signal_date: string
          symptoms: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discharge?: string | null
          id?: string
          intercourse?: Json | null
          mood?: string[] | null
          notes?: string | null
          signal_date: string
          symptoms?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discharge?: string | null
          id?: string
          intercourse?: Json | null
          mood?: string[] | null
          notes?: string | null
          signal_date?: string
          symptoms?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      doctor_notes: {
        Row: {
          content: string
          created_at: string
          doctor_id: string
          id: string
          is_visible_to_patient: boolean | null
          note_type: string | null
          patient_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          doctor_id: string
          id?: string
          is_visible_to_patient?: boolean | null
          note_type?: string | null
          patient_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          doctor_id?: string
          id?: string
          is_visible_to_patient?: boolean | null
          note_type?: string | null
          patient_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_patient_connections: {
        Row: {
          approved_at: string | null
          connection_type: string | null
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          status: string | null
        }
        Insert: {
          approved_at?: string | null
          connection_type?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          status?: string | null
        }
        Update: {
          approved_at?: string | null
          connection_type?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          status?: string | null
        }
        Relationships: []
      }
      doctor_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string
          id: string
          is_verified: boolean | null
          license_number: string | null
          specialty: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_verified?: boolean | null
          license_number?: string | null
          specialty?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_verified?: boolean | null
          license_number?: string | null
          specialty?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      doctor_schedule: {
        Row: {
          created_at: string
          day_of_week: number | null
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean | null
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean | null
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
        }
        Relationships: []
      }
      health_documents: {
        Row: {
          ai_suggested_category: string | null
          ai_suggested_name: string | null
          ai_summary: string | null
          created_at: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          notes: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          ai_suggested_category?: string | null
          ai_suggested_name?: string | null
          ai_summary?: string | null
          created_at?: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          notes?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          ai_suggested_category?: string | null
          ai_suggested_name?: string | null
          ai_summary?: string | null
          created_at?: string | null
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          notes?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      medical_extracted_data: {
        Row: {
          created_at: string
          data_type: string
          date_recorded: string | null
          document_id: string | null
          id: string
          notes: string | null
          raw_data: Json | null
          reference_range: string | null
          status: string | null
          title: string
          unit: string | null
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          data_type: string
          date_recorded?: string | null
          document_id?: string | null
          id?: string
          notes?: string | null
          raw_data?: Json | null
          reference_range?: string | null
          status?: string | null
          title: string
          unit?: string | null
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          data_type?: string
          date_recorded?: string | null
          document_id?: string | null
          id?: string
          notes?: string | null
          raw_data?: Json | null
          reference_range?: string | null
          status?: string | null
          title?: string
          unit?: string | null
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_extracted_data_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "health_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_access_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          is_used: boolean | null
          patient_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          patient_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          patient_id?: string
        }
        Relationships: []
      }
      period_tracking: {
        Row: {
          created_at: string
          cycle_length: number
          id: string
          period_end_date: string | null
          period_start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_length?: number
          id?: string
          period_end_date?: string | null
          period_start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_length?: number
          id?: string
          period_end_date?: string | null
          period_start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          life_stage: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          life_stage?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          life_stage?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      available_consultations: {
        Row: {
          consultation_duration: number | null
          consultation_price: number | null
          currency: string | null
          doctor_id: string | null
          is_available: boolean | null
          video_enabled: boolean | null
        }
        Insert: {
          consultation_duration?: number | null
          consultation_price?: number | null
          currency?: string | null
          doctor_id?: string | null
          is_available?: boolean | null
          video_enabled?: boolean | null
        }
        Update: {
          consultation_duration?: number | null
          consultation_price?: number | null
          currency?: string | null
          doctor_id?: string | null
          is_available?: boolean | null
          video_enabled?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_patient_access: {
        Args: { _doctor_id: string; _patient_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "patient" | "doctor" | "admin"
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
      app_role: ["patient", "doctor", "admin"],
    },
  },
} as const
