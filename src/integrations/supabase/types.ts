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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      coach_clients: {
        Row: {
          assigned_at: string
          client_id: string
          coach_id: string
          id: string
          status: string
        }
        Insert: {
          assigned_at?: string
          client_id: string
          coach_id: string
          id?: string
          status?: string
        }
        Update: {
          assigned_at?: string
          client_id?: string
          coach_id?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          reps: number | null
          rir: number | null
          session_id: string
          set_number: number
          tempo: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          reps?: number | null
          rir?: number | null
          session_id: string
          set_number: number
          tempo?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rir?: number | null
          session_id?: string
          set_number?: number
          tempo?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      food_items: {
        Row: {
          brand: string | null
          calories: number
          carbs: number
          created_at: string
          created_by: string | null
          fat: number
          fiber: number | null
          id: string
          is_verified: boolean
          name: string
          protein: number
          serving_size: number
          serving_unit: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          calories?: number
          carbs?: number
          created_at?: string
          created_by?: string | null
          fat?: number
          fiber?: number | null
          id?: string
          is_verified?: boolean
          name: string
          protein?: number
          serving_size?: number
          serving_unit?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs?: number
          created_at?: string
          created_by?: string | null
          fat?: number
          fiber?: number | null
          id?: string
          is_verified?: boolean
          name?: string
          protein?: number
          serving_size?: number
          serving_unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      meal_plan_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          custom_name: string | null
          fat: number
          food_item_id: string | null
          id: string
          item_order: number
          meal_plan_id: string
          meal_type: string
          protein: number
          servings: number
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          custom_name?: string | null
          fat?: number
          food_item_id?: string | null
          id?: string
          item_order?: number
          meal_plan_id: string
          meal_type?: string
          protein?: number
          servings?: number
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          custom_name?: string | null
          fat?: number
          food_item_id?: string | null
          id?: string
          item_order?: number
          meal_plan_id?: string
          meal_type?: string
          protein?: number
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          description: string | null
          id: string
          is_template: boolean
          name: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          calories: number
          carbs: number
          client_id: string
          created_at: string
          custom_name: string | null
          fat: number
          food_item_id: string | null
          id: string
          logged_at: string
          meal_type: string
          protein: number
          servings: number
        }
        Insert: {
          calories?: number
          carbs?: number
          client_id: string
          created_at?: string
          custom_name?: string | null
          fat?: number
          food_item_id?: string | null
          id?: string
          logged_at?: string
          meal_type?: string
          protein?: number
          servings?: number
        }
        Update: {
          calories?: number
          carbs?: number
          client_id?: string
          created_at?: string
          custom_name?: string | null
          fat?: number
          food_item_id?: string | null
          id?: string
          logged_at?: string
          meal_type?: string
          protein?: number
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_targets: {
        Row: {
          calories: number
          carbs: number
          client_id: string
          coach_id: string
          created_at: string
          effective_date: string
          fat: number
          id: string
          is_refeed: boolean
          notes: string | null
          protein: number
          updated_at: string
        }
        Insert: {
          calories?: number
          carbs?: number
          client_id: string
          coach_id: string
          created_at?: string
          effective_date?: string
          fat?: number
          id?: string
          is_refeed?: boolean
          notes?: string | null
          protein?: number
          updated_at?: string
        }
        Update: {
          calories?: number
          carbs?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          effective_date?: string
          fat?: number
          id?: string
          is_refeed?: boolean
          notes?: string | null
          protein?: number
          updated_at?: string
        }
        Relationships: []
      }
      personal_records: {
        Row: {
          client_id: string
          exercise_id: string
          id: string
          logged_at: string
          reps: number
          weight: number
        }
        Insert: {
          client_id: string
          exercise_id: string
          id?: string
          logged_at?: string
          reps: number
          weight: number
        }
        Update: {
          client_id?: string
          exercise_id?: string
          id?: string
          logged_at?: string
          reps?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_records_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          amount_ml: number
          client_id: string
          created_at: string
          id: string
          logged_at: string
        }
        Insert: {
          amount_ml?: number
          client_id: string
          created_at?: string
          id?: string
          logged_at?: string
        }
        Update: {
          amount_ml?: number
          client_id?: string
          created_at?: string
          id?: string
          logged_at?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          exercise_order: number
          id: string
          notes: string | null
          reps: string | null
          rest_seconds: number | null
          rir: number | null
          sets: number
          tempo: string | null
          updated_at: string
          workout_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          exercise_order: number
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets: number
          tempo?: string | null
          updated_at?: string
          workout_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          exercise_order?: number
          id?: string
          notes?: string | null
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets?: number
          tempo?: string | null
          updated_at?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          workout_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          workout_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          description: string | null
          id: string
          is_template: boolean
          name: string
          notes: string | null
          phase: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          notes?: string | null
          phase?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          notes?: string | null
          phase?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_personal_record: {
        Args: {
          _client_id: string
          _exercise_id: string
          _reps: number
          _weight: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "client"
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
      app_role: ["admin", "coach", "client"],
    },
  },
} as const
