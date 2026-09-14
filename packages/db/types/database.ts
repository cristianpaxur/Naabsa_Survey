// Snapshot de tipos sincronizado com migrations 0001–0013 (015).
// Regerar: supabase gen types typescript --db-url $DATABASE_URL

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      worker_heartbeats: {
        Row: {
          id: string
          seen_at: string
          ai_enabled: boolean
          ai_provider: string
          ai_model: string
          queue_ready: boolean
        }
        Insert: {
          id: string
          seen_at?: string
          ai_enabled: boolean
          ai_provider: string
          ai_model: string
          queue_ready: boolean
        }
        Update: {
          id?: string
          seen_at?: string
          ai_enabled?: boolean
          ai_provider?: string
          ai_model?: string
          queue_ready?: boolean
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: number
          payload: Json | null
          report_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: never
          payload?: Json | null
          report_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: never
          payload?: Json | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_revoked_at: string | null
          auth_provider: string
          display_name: string
          email: string | null
          last_login_at: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          access_revoked_at?: string | null
          auth_provider?: string
          display_name: string
          email?: string | null
          last_login_at?: string | null
          role: string
          status?: string
          user_id: string
        }
        Update: {
          access_revoked_at?: string | null
          auth_provider?: string
          display_name?: string
          email?: string | null
          last_login_at?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_access: {
        Row: {
          created_at: string
          display_name: string
          email: string
          invited_by: string | null
          last_login_at: string | null
          linked_user_id: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          invited_by?: string | null
          last_login_at?: string | null
          linked_user_id?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          invited_by?: string | null
          last_login_at?: string | null
          linked_user_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_photos: {
        Row: {
          ai_status: string
          ai_request_id: string | null
          ai_run_id: string | null
          ai_job_id: string | null
          ai_attempt: number
          ai_error: string | null
          removed_at: string | null
          ai_suggested: boolean
          confirmed_by: string | null
          created_at: string
          crop: Json | null
          error_message: string | null
          id: string
          original_path: string
          position: number
          processed_path: string | null
          quality_flags: string[]
          report_id: string
          slot_id: string | null
          status: string
          thumb_path: string | null
        }
        Insert: {
          ai_status?: string
          ai_request_id?: string | null
          ai_run_id?: string | null
          ai_job_id?: string | null
          ai_attempt?: number
          ai_error?: string | null
          removed_at?: string | null
          ai_suggested?: boolean
          confirmed_by?: string | null
          created_at?: string
          crop?: Json | null
          error_message?: string | null
          id?: string
          original_path: string
          position?: number
          processed_path?: string | null
          quality_flags?: string[]
          report_id: string
          slot_id?: string | null
          status?: string
          thumb_path?: string | null
        }
        Update: {
          ai_status?: string
          ai_request_id?: string | null
          ai_run_id?: string | null
          ai_job_id?: string | null
          ai_attempt?: number
          ai_error?: string | null
          removed_at?: string | null
          ai_suggested?: boolean
          confirmed_by?: string | null
          created_at?: string
          crop?: Json | null
          error_message?: string | null
          id?: string
          original_path?: string
          position?: number
          processed_path?: string | null
          quality_flags?: string[]
          report_id?: string
          slot_id?: string | null
          status?: string
          thumb_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_specs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          report_type_id: string
          spec: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_type_id: string
          spec: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_type_id?: string
          spec?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_specs_report_type_id_fkey"
            columns: ["report_type_id"]
            isOneToOne: false
            referencedRelation: "report_types"
            referencedColumns: ["id"]
          },
        ]
      }
      report_types: {
        Row: {
          active_spec_id: string | null
          id: string
          name: string
          slug: string
          variants: string[]
        }
        Insert: {
          active_spec_id?: string | null
          id?: string
          name: string
          slug: string
          variants?: string[]
        }
        Update: {
          active_spec_id?: string | null
          id?: string
          name?: string
          slug?: string
          variants?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "report_types_active_spec_id_fkey"
            columns: ["active_spec_id"]
            isOneToOne: false
            referencedRelation: "report_specs"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          working_docx_path: string | null
          wopi_lock: string | null
          wopi_lock_expires_at: string | null
          working_docx_generation: string
          working_docx_revision: number
          working_docx_saved_at: string | null
          approved_docx_path: string | null
          approved_docx_revision: number | null
          photo_review_revision: number
          data_revision: number
          ai_review: Json | null
          created_at: string
          created_by: string
          document_hash: string | null
          document_json: Json | null
          extracted_data: Json | null
          extraction_issues: Json | null
          id: string
          operator_overrides: Json
          pdf_paths: string[]
          purged_at: string | null
          report_type_id: string
          spec_id: string
          spreadsheet_path: string | null
          status: Database["public"]["Enums"]["report_status"]
          variant: string | null
          vessel_name: string | null
        }
        Insert: {
          working_docx_path?: string | null
          wopi_lock?: string | null
          wopi_lock_expires_at?: string | null
          working_docx_generation?: string
          working_docx_revision?: number
          working_docx_saved_at?: string | null
          approved_docx_path?: string | null
          approved_docx_revision?: number | null
          photo_review_revision?: number
          data_revision?: number
          ai_review?: Json | null
          created_at?: string
          created_by: string
          document_hash?: string | null
          document_json?: Json | null
          extracted_data?: Json | null
          extraction_issues?: Json | null
          id?: string
          operator_overrides?: Json
          pdf_paths?: string[]
          purged_at?: string | null
          report_type_id: string
          spec_id: string
          spreadsheet_path?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          variant?: string | null
          vessel_name?: string | null
        }
        Update: {
          working_docx_path?: string | null
          wopi_lock?: string | null
          wopi_lock_expires_at?: string | null
          working_docx_generation?: string
          working_docx_revision?: number
          working_docx_saved_at?: string | null
          approved_docx_path?: string | null
          approved_docx_revision?: number | null
          photo_review_revision?: number
          data_revision?: number
          ai_review?: Json | null
          created_at?: string
          created_by?: string
          document_hash?: string | null
          document_json?: Json | null
          extracted_data?: Json | null
          extraction_issues?: Json | null
          id?: string
          operator_overrides?: Json
          pdf_paths?: string[]
          purged_at?: string | null
          report_type_id?: string
          spec_id?: string
          spreadsheet_path?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          variant?: string | null
          vessel_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_report_type_id_fkey"
            columns: ["report_type_id"]
            isOneToOne: false
            referencedRelation: "report_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "report_specs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_photo_suggestion: { Args: { p_report_id: string; p_photo_id: string; p_request_id: string; p_revision: number; p_slot_id: string | null; p_flags: string[] }; Returns: boolean }
      current_has_role: { Args: never; Returns: boolean }
      current_is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      report_status:
        | "draft"
        | "extracted"
        | "in_review"
        | "editing"
        | "approved"
        | "generated"
        | "purged"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      report_status: [
        "draft",
        "extracted",
        "in_review",
        "editing",
        "approved",
        "generated",
        "purged",
      ],
    },
  },
} as const
