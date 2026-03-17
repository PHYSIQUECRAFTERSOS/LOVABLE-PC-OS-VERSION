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
      admin_tool_runs: {
        Row: {
          already_correct_count: number | null
          id: string
          notes: string | null
          ran_at: string | null
          ran_by: string | null
          repaired_count: number | null
          tool_name: string
        }
        Insert: {
          already_correct_count?: number | null
          id?: string
          notes?: string | null
          ran_at?: string | null
          ran_by?: string | null
          repaired_count?: number | null
          tool_name: string
        }
        Update: {
          already_correct_count?: number | null
          id?: string
          notes?: string | null
          ran_at?: string | null
          ran_by?: string | null
          repaired_count?: number | null
          tool_name?: string
        }
        Relationships: []
      }
      ai_body_fat_estimates: {
        Row: {
          ai_notes: string | null
          client_id: string
          coach_id: string | null
          coach_notes: string | null
          coach_override_pct: number | null
          confidence_high: number
          confidence_low: number
          created_at: string
          estimated_bf_pct: number
          id: string
          lighting_warning: boolean
          photo_ids: string[]
        }
        Insert: {
          ai_notes?: string | null
          client_id: string
          coach_id?: string | null
          coach_notes?: string | null
          coach_override_pct?: number | null
          confidence_high: number
          confidence_low: number
          created_at?: string
          estimated_bf_pct: number
          id?: string
          lighting_warning?: boolean
          photo_ids?: string[]
        }
        Update: {
          ai_notes?: string | null
          client_id?: string
          coach_id?: string | null
          coach_notes?: string | null
          coach_override_pct?: number | null
          confidence_high?: number
          confidence_low?: number
          created_at?: string
          estimated_bf_pct?: number
          id?: string
          lighting_warning?: boolean
          photo_ids?: string[]
        }
        Relationships: []
      }
      auto_message_logs: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          message_content: string
          read_at: string | null
          sent_at: string
          template_id: string | null
          trigger_id: string | null
          trigger_reason: string | null
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          message_content: string
          read_at?: string | null
          sent_at?: string
          template_id?: string | null
          trigger_id?: string | null
          trigger_reason?: string | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          message_content?: string
          read_at?: string | null
          sent_at?: string
          template_id?: string | null
          trigger_id?: string | null
          trigger_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_message_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "auto_message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_message_logs_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "auto_message_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_message_templates: {
        Row: {
          category: string
          coach_id: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          coach_id: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          coach_id?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      auto_message_triggers: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          last_evaluated_at: string | null
          recurrence_cron: string | null
          target_client_id: string | null
          target_tag: string | null
          target_type: string
          template_id: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_evaluated_at?: string | null
          recurrence_cron?: string | null
          target_client_id?: string | null
          target_tag?: string | null
          target_type?: string
          template_id: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_evaluated_at?: string | null
          recurrence_cron?: string | null
          target_client_id?: string | null
          target_tag?: string | null
          target_type?: string
          template_id?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_message_triggers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "auto_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          icon: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          body_fat_pct: number | null
          chest: number | null
          client_id: string
          created_at: string
          hips: number | null
          id: string
          left_arm: number | null
          left_calf: number | null
          left_thigh: number | null
          measured_at: string
          neck: number | null
          resting_hr: number | null
          right_arm: number | null
          right_calf: number | null
          right_thigh: number | null
          sleep_hours: number | null
          steps: number | null
          waist: number | null
        }
        Insert: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          body_fat_pct?: number | null
          chest?: number | null
          client_id: string
          created_at?: string
          hips?: number | null
          id?: string
          left_arm?: number | null
          left_calf?: number | null
          left_thigh?: number | null
          measured_at?: string
          neck?: number | null
          resting_hr?: number | null
          right_arm?: number | null
          right_calf?: number | null
          right_thigh?: number | null
          sleep_hours?: number | null
          steps?: number | null
          waist?: number | null
        }
        Update: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          body_fat_pct?: number | null
          chest?: number | null
          client_id?: string
          created_at?: string
          hips?: number | null
          id?: string
          left_arm?: number | null
          left_calf?: number | null
          left_thigh?: number | null
          measured_at?: string
          neck?: number | null
          resting_hr?: number | null
          right_arm?: number | null
          right_calf?: number | null
          right_thigh?: number | null
          sleep_hours?: number | null
          steps?: number | null
          waist?: number | null
        }
        Relationships: []
      }
      body_stats: {
        Row: {
          bicep_in: number | null
          body_weight_lbs: number | null
          calf_in: number | null
          chest_in: number | null
          client_id: string
          created_at: string | null
          forearm_in: number | null
          hips_in: number | null
          id: string
          log_date: string
          neck_in: number | null
          shoulders_in: number | null
          thigh_in: number | null
          updated_at: string | null
          waist_in: number | null
        }
        Insert: {
          bicep_in?: number | null
          body_weight_lbs?: number | null
          calf_in?: number | null
          chest_in?: number | null
          client_id: string
          created_at?: string | null
          forearm_in?: number | null
          hips_in?: number | null
          id?: string
          log_date: string
          neck_in?: number | null
          shoulders_in?: number | null
          thigh_in?: number | null
          updated_at?: string | null
          waist_in?: number | null
        }
        Update: {
          bicep_in?: number | null
          body_weight_lbs?: number | null
          calf_in?: number | null
          chest_in?: number | null
          client_id?: string
          created_at?: string | null
          forearm_in?: number | null
          hips_in?: number | null
          id?: string
          log_date?: string
          neck_in?: number | null
          shoulders_in?: number | null
          thigh_in?: number | null
          updated_at?: string | null
          waist_in?: number | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          color: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_date: string
          event_time: string | null
          event_type: string
          id: string
          is_completed: boolean
          is_recurring: boolean
          linked_cardio_id: string | null
          linked_checkin_id: string | null
          linked_workout_id: string | null
          notes: string | null
          recurrence_days: number[] | null
          recurrence_end_date: string | null
          recurrence_pattern: string | null
          target_client_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date: string
          event_time?: string | null
          event_type?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          linked_cardio_id?: string | null
          linked_checkin_id?: string | null
          linked_workout_id?: string | null
          notes?: string | null
          recurrence_days?: number[] | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          target_client_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          linked_cardio_id?: string | null
          linked_checkin_id?: string | null
          linked_workout_id?: string | null
          notes?: string | null
          recurrence_days?: number[] | null
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          target_client_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_linked_cardio_id_fkey"
            columns: ["linked_cardio_id"]
            isOneToOne: false
            referencedRelation: "cardio_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_linked_checkin_id_fkey"
            columns: ["linked_checkin_id"]
            isOneToOne: false
            referencedRelation: "checkin_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_linked_workout_id_fkey"
            columns: ["linked_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      cardio_assignments: {
        Row: {
          assigned_date: string
          cardio_type: string
          client_id: string
          coach_id: string
          created_at: string
          description: string | null
          id: string
          interval_config: Json | null
          is_active: boolean
          is_recurring: boolean
          notes: string | null
          recurrence_days: string[] | null
          target_calories: number | null
          target_distance_km: number | null
          target_duration_min: number | null
          target_hr_zone: string | null
          target_steps: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          cardio_type?: string
          client_id: string
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          interval_config?: Json | null
          is_active?: boolean
          is_recurring?: boolean
          notes?: string | null
          recurrence_days?: string[] | null
          target_calories?: number | null
          target_distance_km?: number | null
          target_duration_min?: number | null
          target_hr_zone?: string | null
          target_steps?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          cardio_type?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          interval_config?: Json | null
          is_active?: boolean
          is_recurring?: boolean
          notes?: string | null
          recurrence_days?: string[] | null
          target_calories?: number | null
          target_distance_km?: number | null
          target_duration_min?: number | null
          target_hr_zone?: string | null
          target_steps?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cardio_logs: {
        Row: {
          assignment_id: string | null
          avg_hr: number | null
          calories_burned: number | null
          cardio_type: string
          client_id: string
          completed: boolean
          created_at: string
          difficulty_rating: number | null
          distance_km: number | null
          duration_min: number | null
          id: string
          logged_at: string
          max_hr: number | null
          notes: string | null
          steps: number | null
          title: string
        }
        Insert: {
          assignment_id?: string | null
          avg_hr?: number | null
          calories_burned?: number | null
          cardio_type?: string
          client_id: string
          completed?: boolean
          created_at?: string
          difficulty_rating?: number | null
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          logged_at?: string
          max_hr?: number | null
          notes?: string | null
          steps?: number | null
          title: string
        }
        Update: {
          assignment_id?: string | null
          avg_hr?: number | null
          calories_burned?: number | null
          cardio_type?: string
          client_id?: string
          completed?: boolean
          created_at?: string
          difficulty_rating?: number | null
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          logged_at?: string
          max_hr?: number | null
          notes?: string | null
          steps?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "cardio_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_banner_dismissals: {
        Row: {
          challenge_id: string
          dismissed_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          dismissed_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          dismissed_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_banner_dismissals_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_logs: {
        Row: {
          challenge_id: string
          created_at: string | null
          id: string
          log_date: string
          metadata: Json | null
          source: string | null
          user_id: string
          value: number
        }
        Insert: {
          challenge_id: string
          created_at?: string | null
          id?: string
          log_date: string
          metadata?: Json | null
          source?: string | null
          user_id: string
          value: number
        }
        Update: {
          challenge_id?: string
          created_at?: string | null
          id?: string
          log_date?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_logs_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          best_value: number | null
          challenge_id: string
          completed_at: string | null
          current_value: number | null
          id: string
          joined_at: string | null
          rank: number | null
          status: string | null
          user_id: string
          xp_earned: number | null
        }
        Insert: {
          best_value?: number | null
          challenge_id: string
          completed_at?: string | null
          current_value?: number | null
          id?: string
          joined_at?: string | null
          rank?: number | null
          status?: string | null
          user_id: string
          xp_earned?: number | null
        }
        Update: {
          best_value?: number | null
          challenge_id?: string
          completed_at?: string | null
          current_value?: number | null
          id?: string
          joined_at?: string | null
          rank?: number | null
          status?: string | null
          user_id?: string
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_scoring_rules: {
        Row: {
          action_type: string
          challenge_id: string
          created_at: string
          daily_cap: number
          id: string
          is_enabled: boolean
          points: number
        }
        Insert: {
          action_type: string
          challenge_id: string
          created_at?: string
          daily_cap?: number
          id?: string
          is_enabled?: boolean
          points?: number
        }
        Update: {
          action_type?: string
          challenge_id?: string
          created_at?: string
          daily_cap?: number
          id?: string
          is_enabled?: boolean
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_scoring_rules_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_templates: {
        Row: {
          challenge_type: string
          config: Json
          created_at: string | null
          created_by: string
          default_duration_days: number | null
          default_enrollment: string | null
          default_xp_reward: number | null
          description: string | null
          id: string
          is_archived: boolean | null
          name: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          challenge_type: string
          config?: Json
          created_at?: string | null
          created_by: string
          default_duration_days?: number | null
          default_enrollment?: string | null
          default_xp_reward?: number | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          name: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          challenge_type?: string
          config?: Json
          created_at?: string | null
          created_by?: string
          default_duration_days?: number | null
          default_enrollment?: string | null
          default_xp_reward?: number | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          name?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      challenge_tiers: {
        Row: {
          challenge_id: string
          color: string
          created_at: string
          icon: string | null
          id: string
          min_points: number
          name: string
          sort_order: number
        }
        Insert: {
          challenge_id: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          min_points?: number
          name: string
          sort_order?: number
        }
        Update: {
          challenge_id?: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          min_points?: number
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_tiers_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          badge_id: string | null
          challenge_type: string
          config: Json
          created_at: string | null
          created_by: string
          description: string | null
          end_date: string
          id: string
          max_participants: number | null
          start_date: string
          status: string
          title: string
          updated_at: string | null
          visibility: string | null
          xp_reward: number
        }
        Insert: {
          badge_id?: string | null
          challenge_type: string
          config?: Json
          created_at?: string | null
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          max_participants?: number | null
          start_date: string
          status?: string
          title: string
          updated_at?: string | null
          visibility?: string | null
          xp_reward?: number
        }
        Update: {
          badge_id?: string | null
          challenge_type?: string
          config?: Json
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          max_participants?: number | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string | null
          visibility?: string | null
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_assignments: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          day_of_week: number | null
          deadline_hours: number | null
          id: string
          is_active: boolean
          next_due_date: string
          recurrence: string
          template_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          day_of_week?: number | null
          deadline_hours?: number | null
          id?: string
          is_active?: boolean
          next_due_date?: string
          recurrence?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          day_of_week?: number | null
          deadline_hours?: number | null
          id?: string
          is_active?: boolean
          next_due_date?: string
          recurrence?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          options: Json | null
          question_order: number
          question_text: string
          question_type: string
          scale_max: number | null
          scale_min: number | null
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          question_order?: number
          question_text: string
          question_type?: string
          scale_max?: number | null
          scale_min?: number | null
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          question_order?: number
          question_text?: string
          question_type?: string
          scale_max?: number | null
          scale_min?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_responses: {
        Row: {
          answer_boolean: boolean | null
          answer_choice: string | null
          answer_numeric: number | null
          answer_scale: number | null
          answer_text: string | null
          created_at: string
          id: string
          question_id: string
          submission_id: string
        }
        Insert: {
          answer_boolean?: boolean | null
          answer_choice?: string | null
          answer_numeric?: number | null
          answer_scale?: number | null
          answer_text?: string | null
          created_at?: string
          id?: string
          question_id: string
          submission_id: string
        }
        Update: {
          answer_boolean?: boolean | null
          answer_choice?: string | null
          answer_numeric?: number | null
          answer_scale?: number | null
          answer_text?: string | null
          created_at?: string
          id?: string
          question_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "checkin_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checkin_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_reviewers: {
        Row: {
          coach_id: string
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          coach_id: string
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          coach_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      checkin_submissions: {
        Row: {
          assignment_id: string | null
          client_id: string
          coach_notes: string | null
          coach_response: string | null
          created_at: string
          due_date: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_at_pst: string | null
          template_id: string | null
          week_number: number | null
        }
        Insert: {
          assignment_id?: string | null
          client_id: string
          coach_notes?: string | null
          coach_response?: string | null
          created_at?: string
          due_date: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_at_pst?: string | null
          template_id?: string | null
          week_number?: number | null
        }
        Update: {
          assignment_id?: string | null
          client_id?: string
          coach_notes?: string | null
          coach_response?: string | null
          created_at?: string
          due_date?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_at_pst?: string | null
          template_id?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "checkin_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "checkin_reviewers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkin_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_templates: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_custom_foods: {
        Row: {
          brand: string | null
          calories: number | null
          carbs: number | null
          client_id: string
          created_at: string | null
          fat: number | null
          id: string
          name: string
          protein: number | null
          serving_size: string | null
          servings_per_container: number | null
        }
        Insert: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          client_id: string
          created_at?: string | null
          fat?: number | null
          id?: string
          name: string
          protein?: number | null
          serving_size?: string | null
          servings_per_container?: number | null
        }
        Update: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          client_id?: string
          created_at?: string | null
          fat?: number | null
          id?: string
          name?: string
          protein?: number | null
          serving_size?: string | null
          servings_per_container?: number | null
        }
        Relationships: []
      }
      client_goals: {
        Row: {
          aggressiveness: number | null
          client_id: string
          created_at: string
          goal: string
          id: string
          phase_notes: string | null
          started_at: string
          starting_weight: number | null
          target_rate: number
          target_weight: number | null
          updated_at: string
        }
        Insert: {
          aggressiveness?: number | null
          client_id: string
          created_at?: string
          goal?: string
          id?: string
          phase_notes?: string | null
          started_at?: string
          starting_weight?: number | null
          target_rate?: number
          target_weight?: number | null
          updated_at?: string
        }
        Update: {
          aggressiveness?: number | null
          client_id?: string
          created_at?: string
          goal?: string
          id?: string
          phase_notes?: string | null
          started_at?: string
          starting_weight?: number | null
          target_rate?: number
          target_weight?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      client_health_metrics: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          metric_type: string
          provider: string
          recorded_at: string | null
          recorded_date: string
          source_device: string | null
          value: number
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          metric_type: string
          provider: string
          recorded_at?: string | null
          recorded_date: string
          source_device?: string | null
          value: number
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          metric_type?: string
          provider?: string
          recorded_at?: string | null
          recorded_date?: string
          source_device?: string | null
          value?: number
        }
        Relationships: []
      }
      client_invites: {
        Row: {
          accepted_at: string | null
          assigned_coach_id: string
          client_type: string
          created_at: string
          created_client_id: string | null
          email: string
          expires_at: string
          first_name: string
          id: string
          invite_status: string
          invite_token: string
          last_name: string
          phone: string | null
          tags: string[] | null
          tier_id: string | null
          tier_name: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_coach_id: string
          client_type?: string
          created_at?: string
          created_client_id?: string | null
          email: string
          expires_at: string
          first_name: string
          id?: string
          invite_status?: string
          invite_token: string
          last_name: string
          phone?: string | null
          tags?: string[] | null
          tier_id?: string | null
          tier_name?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_coach_id?: string
          client_type?: string
          created_at?: string
          created_client_id?: string | null
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          invite_status?: string
          invite_token?: string
          last_name?: string
          phone?: string | null
          tags?: string[] | null
          tier_id?: string | null
          tier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invites_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "client_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_micronutrient_overrides: {
        Row: {
          client_id: string
          coach_notes: string | null
          custom_target: number | null
          custom_tier: number | null
          id: string
          is_hidden: boolean | null
          nutrient_key: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id: string
          coach_notes?: string | null
          custom_target?: number | null
          custom_tier?: number | null
          id?: string
          is_hidden?: boolean | null
          nutrient_key: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          coach_notes?: string | null
          custom_target?: number | null
          custom_tier?: number | null
          id?: string
          is_hidden?: boolean | null
          nutrient_key?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          client_id: string
          coach_id: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_program_assignments: {
        Row: {
          auto_advance: boolean
          client_id: string
          coach_id: string
          created_at: string
          current_phase_id: string | null
          current_week_number: number
          forked_from_program_id: string | null
          id: string
          is_linked_to_master: boolean
          last_synced_at: string | null
          master_version_number: number
          program_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          auto_advance?: boolean
          client_id: string
          coach_id: string
          created_at?: string
          current_phase_id?: string | null
          current_week_number?: number
          forked_from_program_id?: string | null
          id?: string
          is_linked_to_master?: boolean
          last_synced_at?: string | null
          master_version_number?: number
          program_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auto_advance?: boolean
          client_id?: string
          coach_id?: string
          created_at?: string
          current_phase_id?: string | null
          current_week_number?: number
          forked_from_program_id?: string | null
          id?: string
          is_linked_to_master?: boolean
          last_synced_at?: string | null
          master_version_number?: number
          program_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_program_assignments_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "program_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_assignments_forked_from_program_id_fkey"
            columns: ["forked_from_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_recipe_ingredients: {
        Row: {
          brand: string | null
          calories: number | null
          carbs: number | null
          created_at: string | null
          fat: number | null
          food_name: string
          id: string
          protein: number | null
          quantity: number | null
          recipe_id: string
          serving_size: string | null
        }
        Insert: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          food_name: string
          id?: string
          protein?: number | null
          quantity?: number | null
          recipe_id: string
          serving_size?: string | null
        }
        Update: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          food_name?: string
          id?: string
          protein?: number | null
          quantity?: number | null
          recipe_id?: string
          serving_size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "client_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_recipes: {
        Row: {
          calories_per_serving: number | null
          carbs_per_serving: number | null
          client_id: string
          created_at: string | null
          fat_per_serving: number | null
          id: string
          name: string
          protein_per_serving: number | null
          servings: number | null
          total_calories: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          updated_at: string | null
        }
        Insert: {
          calories_per_serving?: number | null
          carbs_per_serving?: number | null
          client_id: string
          created_at?: string | null
          fat_per_serving?: number | null
          id?: string
          name: string
          protein_per_serving?: number | null
          servings?: number | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
        }
        Update: {
          calories_per_serving?: number | null
          carbs_per_serving?: number | null
          client_id?: string
          created_at?: string | null
          fat_per_serving?: number | null
          id?: string
          name?: string
          protein_per_serving?: number | null
          servings?: number | null
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      client_reviewer_assignments: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          reviewer_id: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          reviewer_id: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviewer_assignments_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "checkin_reviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_risk_scores: {
        Row: {
          calculated_at: string
          client_id: string
          created_at: string
          id: string
          risk_level: string
          score: number
          signals: Json
        }
        Insert: {
          calculated_at?: string
          client_id: string
          created_at?: string
          id?: string
          risk_level?: string
          score?: number
          signals?: Json
        }
        Update: {
          calculated_at?: string
          client_id?: string
          created_at?: string
          id?: string
          risk_level?: string
          score?: number
          signals?: Json
        }
        Relationships: []
      }
      client_signatures: {
        Row: {
          client_id: string
          document_template_id: string
          document_version: string
          id: string
          ip_address: string | null
          pdf_storage_path: string | null
          signed_at: string | null
          signed_name: string
          tier_at_signing: string
        }
        Insert: {
          client_id: string
          document_template_id: string
          document_version: string
          id?: string
          ip_address?: string | null
          pdf_storage_path?: string | null
          signed_at?: string | null
          signed_name: string
          tier_at_signing: string
        }
        Update: {
          client_id?: string
          document_template_id?: string
          document_version?: string
          id?: string
          ip_address?: string | null
          pdf_storage_path?: string | null
          signed_at?: string | null
          signed_name?: string
          tier_at_signing?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_signatures_document_template_id_fkey"
            columns: ["document_template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: []
      }
      client_tiers: {
        Row: {
          contract_template_key: string | null
          created_at: string | null
          id: string
          name: string
          requires_contract: boolean
        }
        Insert: {
          contract_template_key?: string | null
          created_at?: string | null
          id?: string
          name: string
          requires_contract?: boolean
        }
        Update: {
          contract_template_key?: string | null
          created_at?: string | null
          id?: string
          name?: string
          requires_contract?: boolean
        }
        Relationships: []
      }
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
      coach_favorite_foods: {
        Row: {
          coach_id: string
          created_at: string
          food_item_id: string
          id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          food_item_id: string
          id?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          food_item_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_favorite_foods_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_meal_plan_uploads: {
        Row: {
          client_id: string
          client_viewed_at: string | null
          coach_id: string
          coach_notes: string | null
          created_at: string
          effective_date: string
          file_name: string
          id: string
          is_active: boolean
          storage_path: string
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          client_viewed_at?: string | null
          coach_id: string
          coach_notes?: string | null
          created_at?: string
          effective_date?: string
          file_name: string
          id?: string
          is_active?: boolean
          storage_path: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          client_viewed_at?: string | null
          coach_id?: string
          coach_notes?: string | null
          created_at?: string
          effective_date?: string
          file_name?: string
          id?: string
          is_active?: boolean
          storage_path?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      coach_recent_foods: {
        Row: {
          coach_id: string
          food_item_id: string
          id: string
          use_count: number
          used_at: string
        }
        Insert: {
          coach_id: string
          food_item_id: string
          id?: string
          use_count?: number
          used_at?: string
        }
        Update: {
          coach_id?: string
          food_item_id?: string
          id?: string
          use_count?: number
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_recent_foods_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          comments_locked: boolean
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          is_spotlight: boolean
          media_type: string | null
          media_url: string | null
          post_type: string
          updated_at: string
        }
        Insert: {
          author_id: string
          comments_locked?: boolean
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_spotlight?: boolean
          media_type?: string | null
          media_url?: string | null
          post_type?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          comments_locked?: boolean
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_spotlight?: boolean
          media_type?: string | null
          media_url?: string | null
          post_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reason: string
          reporter_id: string
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reason?: string
          reporter_id: string
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reporter_id?: string
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_user_stats: {
        Row: {
          badges: Json
          created_at: string
          current_streak: number
          engagement_score: number
          id: string
          last_post_date: string | null
          longest_streak: number
          posting_restricted: boolean
          total_comments: number
          total_likes_received: number
          total_posts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badges?: Json
          created_at?: string
          current_streak?: number
          engagement_score?: number
          id?: string
          last_post_date?: string | null
          longest_streak?: number
          posting_restricted?: boolean
          total_comments?: number
          total_likes_received?: number
          total_posts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badges?: Json
          created_at?: string
          current_streak?: number
          engagement_score?: number
          id?: string
          last_post_date?: string | null
          longest_streak?: number
          posting_restricted?: boolean
          total_comments?: number
          total_likes_received?: number
          total_posts?: number
          updated_at?: string
          user_id?: string
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
      culture_badges: {
        Row: {
          badge_type: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
          week_start: string
        }
        Insert: {
          badge_type: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id: string
          week_start: string
        }
        Update: {
          badge_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      culture_messages: {
        Row: {
          coach_id: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          week_start: string
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          week_start: string
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          week_start?: string
        }
        Relationships: []
      }
      culture_profiles: {
        Row: {
          below_60_weeks: number
          below_70_weeks: number
          comeback_count: number
          consistency_active: boolean
          consistency_weeks: number
          created_at: string
          current_streak: number
          id: string
          lifetime_avg: number
          longest_streak: number
          most_improved_count: number
          reset_count: number
          reset_week_active: boolean
          reset_week_eligible: boolean
          tier: string
          total_elite_weeks: number
          updated_at: string
          user_id: string
        }
        Insert: {
          below_60_weeks?: number
          below_70_weeks?: number
          comeback_count?: number
          consistency_active?: boolean
          consistency_weeks?: number
          created_at?: string
          current_streak?: number
          id?: string
          lifetime_avg?: number
          longest_streak?: number
          most_improved_count?: number
          reset_count?: number
          reset_week_active?: boolean
          reset_week_eligible?: boolean
          tier?: string
          total_elite_weeks?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          below_60_weeks?: number
          below_70_weeks?: number
          comeback_count?: number
          consistency_active?: boolean
          consistency_weeks?: number
          created_at?: string
          current_streak?: number
          id?: string
          lifetime_avg?: number
          longest_streak?: number
          most_improved_count?: number
          reset_count?: number
          reset_week_active?: boolean
          reset_week_eligible?: boolean
          tier?: string
          total_elite_weeks?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      culture_spotlights: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          message: string | null
          spotlight_type: string
          user_id: string
          week_start: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string | null
          spotlight_type: string
          user_id: string
          week_start: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string | null
          spotlight_type?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      daily_health_metrics: {
        Row: {
          active_energy_kcal: number | null
          created_at: string
          hrv_ms: number | null
          id: string
          metric_date: string
          resting_heart_rate: number | null
          sleep_duration_min: number | null
          source: string
          step_goal: number | null
          steps: number | null
          synced_at: string | null
          updated_at: string
          user_id: string
          vo2_max: number | null
          walking_running_distance_km: number | null
          weight_kg: number | null
        }
        Insert: {
          active_energy_kcal?: number | null
          created_at?: string
          hrv_ms?: number | null
          id?: string
          metric_date: string
          resting_heart_rate?: number | null
          sleep_duration_min?: number | null
          source?: string
          step_goal?: number | null
          steps?: number | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
          vo2_max?: number | null
          walking_running_distance_km?: number | null
          weight_kg?: number | null
        }
        Update: {
          active_energy_kcal?: number | null
          created_at?: string
          hrv_ms?: number | null
          id?: string
          metric_date?: string
          resting_heart_rate?: number | null
          sleep_duration_min?: number | null
          source?: string
          step_goal?: number | null
          steps?: number | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          vo2_max?: number | null
          walking_running_distance_km?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      deletion_requests: {
        Row: {
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          ip_address: string | null
          reason: string | null
          requested_at: string
          source: string
          status: string
          token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          requested_at?: string
          source?: string
          status?: string
          token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          requested_at?: string
          source?: string
          status?: string
          token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          body: string
          created_at: string | null
          document_type: string
          id: string
          is_active: boolean | null
          template_key: string
          tier_applicability: string[] | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          body: string
          created_at?: string | null
          document_type: string
          id?: string
          is_active?: boolean | null
          template_key: string
          tier_applicability?: string[] | null
          title: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          body?: string
          created_at?: string | null
          document_type?: string
          id?: string
          is_active?: boolean | null
          template_key?: string
          tier_applicability?: string[] | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          logged_at: string | null
          notes: string | null
          reps: number | null
          rir: number | null
          rpe: number | null
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
          logged_at?: string | null
          notes?: string | null
          reps?: number | null
          rir?: number | null
          rpe?: number | null
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
          logged_at?: string | null
          notes?: string | null
          reps?: number | null
          rir?: number | null
          rpe?: number | null
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
      exercise_media: {
        Row: {
          created_at: string
          duration: number | null
          exercise_id: string
          id: string
          media_type: string
          thumbnail_url: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          exercise_id: string
          id?: string
          media_type?: string
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          exercise_id?: string
          id?: string
          media_type?: string
          thumbnail_url?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_media_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string
          coaching_cues: string | null
          created_at: string
          created_by: string | null
          description: string | null
          equipment: string | null
          id: string
          movement_pattern: string | null
          name: string
          primary_muscle: string | null
          secondary_muscle: string | null
          tags: string[] | null
          updated_at: string
          video_url: string | null
          youtube_thumbnail: string | null
          youtube_url: string | null
        }
        Insert: {
          category: string
          coaching_cues?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment?: string | null
          id?: string
          movement_pattern?: string | null
          name: string
          primary_muscle?: string | null
          secondary_muscle?: string | null
          tags?: string[] | null
          updated_at?: string
          video_url?: string | null
          youtube_thumbnail?: string | null
          youtube_url?: string | null
        }
        Update: {
          category?: string
          coaching_cues?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment?: string | null
          id?: string
          movement_pattern?: string | null
          name?: string
          primary_muscle?: string | null
          secondary_muscle?: string | null
          tags?: string[] | null
          updated_at?: string
          video_url?: string | null
          youtube_thumbnail?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      food_cache: {
        Row: {
          cached_at: string | null
          expires_at: string | null
          id: string
          query_key: string
          results: Json
          source: string
        }
        Insert: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          query_key: string
          results: Json
          source?: string
        }
        Update: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          query_key?: string
          results?: Json
          source?: string
        }
        Relationships: []
      }
      food_items: {
        Row: {
          added_sugars: number | null
          alcohol: number | null
          barcode: string | null
          brand: string | null
          calcium_mg: number | null
          calories: number
          carbs: number
          category: string | null
          cholesterol: number | null
          chromium_mcg: number | null
          copper_mg: number | null
          created_at: string
          created_by: string | null
          data_source: string | null
          fat: number
          fiber: number | null
          food_quality_score: number | null
          id: string
          insoluble_fiber: number | null
          iodine_mcg: number | null
          iron_mg: number | null
          is_verified: boolean
          magnesium_mg: number | null
          manganese_mg: number | null
          molybdenum_mcg: number | null
          monounsaturated_fat: number | null
          name: string
          net_carbs: number | null
          omega_3: number | null
          omega_6: number | null
          phosphorus_mg: number | null
          polyunsaturated_fat: number | null
          potassium_mg: number | null
          protein: number
          saturated_fat: number | null
          selenium_mcg: number | null
          serving_label: string | null
          serving_size: number
          serving_unit: string
          sodium: number | null
          soluble_fiber: number | null
          sugar: number | null
          trans_fat: number | null
          updated_at: string
          usda_fdc_id: string | null
          vitamin_a_mcg: number | null
          vitamin_b1_mg: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2_mg: number | null
          vitamin_b3_mg: number | null
          vitamin_b5_mg: number | null
          vitamin_b6_mg: number | null
          vitamin_b7_mcg: number | null
          vitamin_b9_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          vitamin_k_mcg: number | null
          zinc_mg: number | null
        }
        Insert: {
          added_sugars?: number | null
          alcohol?: number | null
          barcode?: string | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number
          carbs?: number
          category?: string | null
          cholesterol?: number | null
          chromium_mcg?: number | null
          copper_mg?: number | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          fat?: number
          fiber?: number | null
          food_quality_score?: number | null
          id?: string
          insoluble_fiber?: number | null
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_verified?: boolean
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          monounsaturated_fat?: number | null
          name: string
          net_carbs?: number | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          potassium_mg?: number | null
          protein?: number
          saturated_fat?: number | null
          selenium_mcg?: number | null
          serving_label?: string | null
          serving_size?: number
          serving_unit?: string
          sodium?: number | null
          soluble_fiber?: number | null
          sugar?: number | null
          trans_fat?: number | null
          updated_at?: string
          usda_fdc_id?: string | null
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          added_sugars?: number | null
          alcohol?: number | null
          barcode?: string | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number
          carbs?: number
          category?: string | null
          cholesterol?: number | null
          chromium_mcg?: number | null
          copper_mg?: number | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          fat?: number
          fiber?: number | null
          food_quality_score?: number | null
          id?: string
          insoluble_fiber?: number | null
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_verified?: boolean
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          monounsaturated_fat?: number | null
          name?: string
          net_carbs?: number | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          potassium_mg?: number | null
          protein?: number
          saturated_fat?: number | null
          selenium_mcg?: number | null
          serving_label?: string | null
          serving_size?: number
          serving_unit?: string
          sodium?: number | null
          soluble_fiber?: number | null
          sugar?: number | null
          trans_fat?: number | null
          updated_at?: string
          usda_fdc_id?: string | null
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      food_search_cache: {
        Row: {
          cached_at: string | null
          expires_at: string | null
          id: string
          query_key: string
          result_count: number
          results: Json
        }
        Insert: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          query_key: string
          result_count?: number
          results?: Json
        }
        Update: {
          cached_at?: string | null
          expires_at?: string | null
          id?: string
          query_key?: string
          result_count?: number
          results?: Json
        }
        Relationships: []
      }
      food_search_log: {
        Row: {
          best_match_count: number | null
          clicked_food_id: string | null
          created_at: string | null
          detected_brand: string | null
          id: string
          normalized_query: string | null
          query: string
          results_count: number | null
          search_strategy: string | null
          user_id: string | null
        }
        Insert: {
          best_match_count?: number | null
          clicked_food_id?: string | null
          created_at?: string | null
          detected_brand?: string | null
          id?: string
          normalized_query?: string | null
          query: string
          results_count?: number | null
          search_strategy?: string | null
          user_id?: string | null
        }
        Update: {
          best_match_count?: number | null
          clicked_food_id?: string | null
          created_at?: string | null
          detected_brand?: string | null
          id?: string
          normalized_query?: string | null
          query?: string
          results_count?: number | null
          search_strategy?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      food_selection_log: {
        Row: {
          created_at: string | null
          food_id: string | null
          id: string
          meal_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          food_id?: string | null
          id?: string
          meal_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_selection_log_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_synonyms: {
        Row: {
          created_at: string | null
          id: string
          synonym: string
          term: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          synonym: string
          term: string
        }
        Update: {
          created_at?: string | null
          id?: string
          synonym?: string
          term?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          additional_serving_sizes: Json | null
          barcode: string | null
          brand: string | null
          calories_per_100g: number | null
          carbs_per_100g: number | null
          country_code: string | null
          created_at: string | null
          data_quality_score: number | null
          fat_per_100g: number | null
          fatsecret_id: string | null
          fiber_per_100g: number | null
          has_complete_macros: boolean | null
          household_serving_fulltext: string | null
          id: string
          image_url: string | null
          is_branded: boolean | null
          is_custom: boolean | null
          is_verified: boolean | null
          language_code: string | null
          name: string
          off_id: string | null
          popularity_score: number | null
          protein_per_100g: number | null
          search_vector: unknown
          serving_description: string | null
          serving_size_g: number | null
          serving_unit: string | null
          sodium_per_100g: number | null
          source: string | null
          sugar_per_100g: number | null
          updated_at: string | null
          usda_data_type: string | null
          usda_fdc_id: string | null
        }
        Insert: {
          additional_serving_sizes?: Json | null
          barcode?: string | null
          brand?: string | null
          calories_per_100g?: number | null
          carbs_per_100g?: number | null
          country_code?: string | null
          created_at?: string | null
          data_quality_score?: number | null
          fat_per_100g?: number | null
          fatsecret_id?: string | null
          fiber_per_100g?: number | null
          has_complete_macros?: boolean | null
          household_serving_fulltext?: string | null
          id?: string
          image_url?: string | null
          is_branded?: boolean | null
          is_custom?: boolean | null
          is_verified?: boolean | null
          language_code?: string | null
          name: string
          off_id?: string | null
          popularity_score?: number | null
          protein_per_100g?: number | null
          search_vector?: unknown
          serving_description?: string | null
          serving_size_g?: number | null
          serving_unit?: string | null
          sodium_per_100g?: number | null
          source?: string | null
          sugar_per_100g?: number | null
          updated_at?: string | null
          usda_data_type?: string | null
          usda_fdc_id?: string | null
        }
        Update: {
          additional_serving_sizes?: Json | null
          barcode?: string | null
          brand?: string | null
          calories_per_100g?: number | null
          carbs_per_100g?: number | null
          country_code?: string | null
          created_at?: string | null
          data_quality_score?: number | null
          fat_per_100g?: number | null
          fatsecret_id?: string | null
          fiber_per_100g?: number | null
          has_complete_macros?: boolean | null
          household_serving_fulltext?: string | null
          id?: string
          image_url?: string | null
          is_branded?: boolean | null
          is_custom?: boolean | null
          is_verified?: boolean | null
          language_code?: string | null
          name?: string
          off_id?: string | null
          popularity_score?: number | null
          protein_per_100g?: number | null
          search_vector?: unknown
          serving_description?: string | null
          serving_size_g?: number | null
          serving_unit?: string | null
          sodium_per_100g?: number | null
          source?: string | null
          sugar_per_100g?: number | null
          updated_at?: string | null
          usda_data_type?: string | null
          usda_fdc_id?: string | null
        }
        Relationships: []
      }
      frequent_meal_templates: {
        Row: {
          combo_key: string
          created_at: string | null
          food_count: number
          foods: Json
          id: string
          is_dismissed: boolean | null
          is_pinned: boolean | null
          last_logged_at: string | null
          meal_name: string
          occurrence_count: number
          template_name: string
          total_cal: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          combo_key: string
          created_at?: string | null
          food_count: number
          foods: Json
          id?: string
          is_dismissed?: boolean | null
          is_pinned?: boolean | null
          last_logged_at?: string | null
          meal_name: string
          occurrence_count?: number
          template_name: string
          total_cal?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          combo_key?: string
          created_at?: string | null
          food_count?: number
          foods?: Json
          id?: string
          is_dismissed?: boolean | null
          is_pinned?: boolean | null
          last_logged_at?: string | null
          meal_name?: string
          occurrence_count?: number
          template_name?: string
          total_cal?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      health_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          is_connected: boolean
          last_sync_at: string | null
          permissions_granted: string[]
          provider: string
          sync_error: string | null
          sync_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          permissions_granted?: string[]
          provider: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          permissions_granted?: string[]
          provider?: string
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          app_version: string | null
          created_at: string
          document_id: string
          document_type: string
          document_version: number
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          app_version?: string | null
          created_at?: string
          document_id: string
          document_type: string
          document_version: number
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          app_version?: string | null
          created_at?: string
          document_id?: string
          document_type?: string
          document_version?: number
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          document_type: string
          effective_date: string
          id: string
          is_current: boolean
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          document_type: string
          effective_date?: string
          id?: string
          is_current?: boolean
          title: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          effective_date?: string
          id?: string
          is_current?: boolean
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: []
      }
      macro_adjustment_history: {
        Row: {
          adjustment_date: string
          client_id: string
          created_at: string
          estimated_tdee: number | null
          id: string
          new_calories: number
          new_carbs: number | null
          new_fat: number | null
          new_protein: number | null
          previous_calories: number
          previous_carbs: number | null
          previous_fat: number | null
          previous_protein: number | null
          reason: string
        }
        Insert: {
          adjustment_date?: string
          client_id: string
          created_at?: string
          estimated_tdee?: number | null
          id?: string
          new_calories: number
          new_carbs?: number | null
          new_fat?: number | null
          new_protein?: number | null
          previous_calories: number
          previous_carbs?: number | null
          previous_fat?: number | null
          previous_protein?: number | null
          reason: string
        }
        Update: {
          adjustment_date?: string
          client_id?: string
          created_at?: string
          estimated_tdee?: number | null
          id?: string
          new_calories?: number
          new_carbs?: number | null
          new_fat?: number | null
          new_protein?: number | null
          previous_calories?: number
          previous_carbs?: number | null
          previous_fat?: number | null
          previous_protein?: number | null
          reason?: string
        }
        Relationships: []
      }
      master_program_versions: {
        Row: {
          change_log: string | null
          created_at: string
          id: string
          program_id: string
          snapshot: Json | null
          updated_by: string
          version_number: number
        }
        Insert: {
          change_log?: string | null
          created_at?: string
          id?: string
          program_id: string
          snapshot?: Json | null
          updated_by: string
          version_number: number
        }
        Update: {
          change_log?: string | null
          created_at?: string
          id?: string
          program_id?: string
          snapshot?: Json | null
          updated_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "master_program_versions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      master_workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          master_workout_id: string
          notes: string | null
          order_index: number
          reps: string | null
          rest_seconds: number | null
          rir: number | null
          sets: number
          superset_group: string | null
          tempo: string | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          master_workout_id: string
          notes?: string | null
          order_index?: number
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets?: number
          superset_group?: string | null
          tempo?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          master_workout_id?: string
          notes?: string | null
          order_index?: number
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          sets?: number
          superset_group?: string | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_workout_exercises_master_workout_id_fkey"
            columns: ["master_workout_id"]
            isOneToOne: false
            referencedRelation: "master_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      master_workouts: {
        Row: {
          coach_id: string
          created_at: string
          estimated_duration: number | null
          id: string
          instructions: string | null
          updated_at: string
          workout_name: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          estimated_duration?: number | null
          id?: string
          instructions?: string | null
          updated_at?: string
          workout_name: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          estimated_duration?: number | null
          id?: string
          instructions?: string | null
          updated_at?: string
          workout_name?: string
        }
        Relationships: []
      }
      meal_log_snapshots: {
        Row: {
          combo_key: string
          created_at: string | null
          food_count: number
          foods: Json
          id: string
          logged_date: string
          meal_name: string
          total_cal: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          user_id: string
        }
        Insert: {
          combo_key: string
          created_at?: string | null
          food_count?: number
          foods: Json
          id?: string
          logged_date: string
          meal_name: string
          total_cal?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id: string
        }
        Update: {
          combo_key?: string
          created_at?: string | null
          food_count?: number
          foods?: Json
          id?: string
          logged_date?: string
          meal_name?: string
          total_cal?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id?: string
        }
        Relationships: []
      }
      meal_plan_days: {
        Row: {
          created_at: string
          day_order: number
          day_type: string
          id: string
          meal_plan_id: string
        }
        Insert: {
          created_at?: string
          day_order?: number
          day_type?: string
          id?: string
          meal_plan_id: string
        }
        Update: {
          created_at?: string
          day_order?: number
          day_type?: string
          id?: string
          meal_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_days_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          custom_name: string | null
          day_id: string | null
          fat: number
          food_item_id: string | null
          gram_amount: number
          id: string
          item_order: number
          meal_name: string
          meal_order: number
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
          day_id?: string | null
          fat?: number
          food_item_id?: string | null
          gram_amount?: number
          id?: string
          item_order?: number
          meal_name?: string
          meal_order?: number
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
          day_id?: string | null
          fat?: number
          food_item_id?: string | null
          gram_amount?: number
          id?: string
          item_order?: number
          meal_name?: string
          meal_order?: number
          meal_plan_id?: string
          meal_type?: string
          protein?: number
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_days"
            referencedColumns: ["id"]
          },
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
          category: string | null
          client_id: string | null
          coach_id: string
          created_at: string
          day_type: string
          day_type_label: string
          description: string | null
          flexibility_mode: boolean
          id: string
          is_favorite: boolean | null
          is_template: boolean
          name: string
          sort_order: number
          target_calories: number | null
          target_carbs: number | null
          target_fat: number | null
          target_protein: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          coach_id: string
          created_at?: string
          day_type?: string
          day_type_label?: string
          description?: string | null
          flexibility_mode?: boolean
          id?: string
          is_favorite?: boolean | null
          is_template?: boolean
          name: string
          sort_order?: number
          target_calories?: number | null
          target_carbs?: number | null
          target_fat?: number | null
          target_protein?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_id?: string | null
          coach_id?: string
          created_at?: string
          day_type?: string
          day_type_label?: string
          description?: string | null
          flexibility_mode?: boolean
          id?: string
          is_favorite?: boolean | null
          is_template?: boolean
          name?: string
          sort_order?: number
          target_calories?: number | null
          target_carbs?: number | null
          target_fat?: number | null
          target_protein?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "thread_messages"
            referencedColumns: ["id"]
          },
        ]
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
      message_threads: {
        Row: {
          client_id: string
          coach_id: string
          coach_last_seen_at: string | null
          coach_marked_unread: boolean
          created_at: string
          id: string
          is_archived: boolean
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          coach_last_seen_at?: string | null
          coach_marked_unread?: boolean
          created_at?: string
          id?: string
          is_archived?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          coach_last_seen_at?: string | null
          coach_marked_unread?: boolean
          created_at?: string
          id?: string
          is_archived?: boolean
          updated_at?: string
        }
        Relationships: []
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
      micronutrient_display_config: {
        Row: {
          category: string
          created_at: string | null
          default_target_female: number | null
          default_target_male: number | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          nutrient_key: string
          sort_order: number
          tier: number
          top_food_sources: Json | null
          unit: string
          why_it_matters: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_target_female?: number | null
          default_target_male?: number | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          nutrient_key: string
          sort_order?: number
          tier?: number
          top_food_sources?: Json | null
          unit: string
          why_it_matters?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_target_female?: number | null
          default_target_male?: number | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          nutrient_key?: string
          sort_order?: number
          tier?: number
          top_food_sources?: Json | null
          unit?: string
          why_it_matters?: string | null
        }
        Relationships: []
      }
      micronutrient_targets: {
        Row: {
          calcium_mg: number | null
          chromium_mcg: number | null
          client_id: string
          coach_id: string | null
          copper_mg: number | null
          created_at: string
          id: string
          iodine_mcg: number | null
          iron_mg: number | null
          is_athlete_profile: boolean | null
          magnesium_mg: number | null
          manganese_mg: number | null
          molybdenum_mcg: number | null
          notes: string | null
          omega_3: number | null
          phosphorus_mg: number | null
          potassium_mg: number | null
          selenium_mcg: number | null
          sodium_mg: number | null
          updated_at: string
          vitamin_a_mcg: number | null
          vitamin_b1_mg: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2_mg: number | null
          vitamin_b3_mg: number | null
          vitamin_b5_mg: number | null
          vitamin_b6_mg: number | null
          vitamin_b7_mcg: number | null
          vitamin_b9_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          vitamin_k_mcg: number | null
          zinc_mg: number | null
        }
        Insert: {
          calcium_mg?: number | null
          chromium_mcg?: number | null
          client_id: string
          coach_id?: string | null
          copper_mg?: number | null
          created_at?: string
          id?: string
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_athlete_profile?: boolean | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          notes?: string | null
          omega_3?: number | null
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          selenium_mcg?: number | null
          sodium_mg?: number | null
          updated_at?: string
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          calcium_mg?: number | null
          chromium_mcg?: number | null
          client_id?: string
          coach_id?: string | null
          copper_mg?: number | null
          created_at?: string
          id?: string
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_athlete_profile?: boolean | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          notes?: string | null
          omega_3?: number | null
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          selenium_mcg?: number | null
          sodium_mg?: number | null
          updated_at?: string
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          added_sugars: number | null
          alcohol: number | null
          calcium_mg: number | null
          calories: number
          carbs: number
          cholesterol: number | null
          chromium_mcg: number | null
          client_id: string
          copper_mg: number | null
          created_at: string
          custom_name: string | null
          fat: number
          fiber: number | null
          food_item_id: string | null
          id: string
          insoluble_fiber: number | null
          iodine_mcg: number | null
          iron_mg: number | null
          logged_at: string
          magnesium_mg: number | null
          manganese_mg: number | null
          meal_type: string
          molybdenum_mcg: number | null
          monounsaturated_fat: number | null
          net_carbs: number | null
          omega_3: number | null
          omega_6: number | null
          phosphorus_mg: number | null
          polyunsaturated_fat: number | null
          potassium_mg: number | null
          protein: number
          quantity_display: number | null
          quantity_unit: string | null
          saturated_fat: number | null
          selenium_mcg: number | null
          servings: number
          sodium: number | null
          soluble_fiber: number | null
          sugar: number | null
          trans_fat: number | null
          tz_corrected: boolean | null
          vitamin_a_mcg: number | null
          vitamin_b1_mg: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2_mg: number | null
          vitamin_b3_mg: number | null
          vitamin_b5_mg: number | null
          vitamin_b6_mg: number | null
          vitamin_b7_mcg: number | null
          vitamin_b9_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          vitamin_k_mcg: number | null
          zinc_mg: number | null
        }
        Insert: {
          added_sugars?: number | null
          alcohol?: number | null
          calcium_mg?: number | null
          calories?: number
          carbs?: number
          cholesterol?: number | null
          chromium_mcg?: number | null
          client_id: string
          copper_mg?: number | null
          created_at?: string
          custom_name?: string | null
          fat?: number
          fiber?: number | null
          food_item_id?: string | null
          id?: string
          insoluble_fiber?: number | null
          iodine_mcg?: number | null
          iron_mg?: number | null
          logged_at?: string
          magnesium_mg?: number | null
          manganese_mg?: number | null
          meal_type?: string
          molybdenum_mcg?: number | null
          monounsaturated_fat?: number | null
          net_carbs?: number | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          potassium_mg?: number | null
          protein?: number
          quantity_display?: number | null
          quantity_unit?: string | null
          saturated_fat?: number | null
          selenium_mcg?: number | null
          servings?: number
          sodium?: number | null
          soluble_fiber?: number | null
          sugar?: number | null
          trans_fat?: number | null
          tz_corrected?: boolean | null
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          added_sugars?: number | null
          alcohol?: number | null
          calcium_mg?: number | null
          calories?: number
          carbs?: number
          cholesterol?: number | null
          chromium_mcg?: number | null
          client_id?: string
          copper_mg?: number | null
          created_at?: string
          custom_name?: string | null
          fat?: number
          fiber?: number | null
          food_item_id?: string | null
          id?: string
          insoluble_fiber?: number | null
          iodine_mcg?: number | null
          iron_mg?: number | null
          logged_at?: string
          magnesium_mg?: number | null
          manganese_mg?: number | null
          meal_type?: string
          molybdenum_mcg?: number | null
          monounsaturated_fat?: number | null
          net_carbs?: number | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          potassium_mg?: number | null
          protein?: number
          quantity_display?: number | null
          quantity_unit?: string | null
          saturated_fat?: number | null
          selenium_mcg?: number | null
          servings?: number
          sodium?: number | null
          soluble_fiber?: number | null
          sugar?: number | null
          trans_fat?: number | null
          tz_corrected?: boolean | null
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
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
          daily_step_goal: number | null
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
          daily_step_goal?: number | null
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
          daily_step_goal?: number | null
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
      onboarding_profiles: {
        Row: {
          activity_level: string | null
          age: number | null
          available_days: string[] | null
          baseline_assessment_date: string | null
          baseline_photo_set_id: string | null
          bodyfat_final_confirmed: number | null
          bodyfat_range_high: number | null
          bodyfat_range_low: number | null
          completed_at: string | null
          confidence_level: string | null
          created_at: string
          current_step: number
          current_weight_kg: number | null
          custom_allergy_text: string | null
          custom_digestive_text: string | null
          digestive_issues: string[] | null
          equipment_photo_urls: string[] | null
          estimated_body_fat_pct: number | null
          favorite_body_part: string | null
          final_notes: string | null
          food_intolerances: string[] | null
          foods_dislike: string | null
          foods_love: string | null
          gender: string | null
          gym_name_address: string | null
          health_sync_status: string
          height_cm: number | null
          height_feet: number | null
          height_inches: number | null
          home_equipment_list: string | null
          id: string
          injuries: string | null
          lower_body_score: number | null
          midsection_score: number | null
          motivation_text: string | null
          occupation: string | null
          onboarding_completed: boolean
          posture_flag: string | null
          primary_goal: string | null
          sleep_time: string | null
          surgeries: string | null
          tracked_macros_before: boolean | null
          training_location: string | null
          updated_at: string
          upper_body_score: number | null
          user_id: string
          waiver_signature: string | null
          waiver_signed: boolean | null
          waiver_signed_at: string | null
          wake_time: string | null
          weight_lb: number | null
          work_on_most: string | null
          workout_days_current: string | null
          workout_days_realistic: string | null
          workout_days_realistic_other: string | null
          workout_time: string | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          available_days?: string[] | null
          baseline_assessment_date?: string | null
          baseline_photo_set_id?: string | null
          bodyfat_final_confirmed?: number | null
          bodyfat_range_high?: number | null
          bodyfat_range_low?: number | null
          completed_at?: string | null
          confidence_level?: string | null
          created_at?: string
          current_step?: number
          current_weight_kg?: number | null
          custom_allergy_text?: string | null
          custom_digestive_text?: string | null
          digestive_issues?: string[] | null
          equipment_photo_urls?: string[] | null
          estimated_body_fat_pct?: number | null
          favorite_body_part?: string | null
          final_notes?: string | null
          food_intolerances?: string[] | null
          foods_dislike?: string | null
          foods_love?: string | null
          gender?: string | null
          gym_name_address?: string | null
          health_sync_status?: string
          height_cm?: number | null
          height_feet?: number | null
          height_inches?: number | null
          home_equipment_list?: string | null
          id?: string
          injuries?: string | null
          lower_body_score?: number | null
          midsection_score?: number | null
          motivation_text?: string | null
          occupation?: string | null
          onboarding_completed?: boolean
          posture_flag?: string | null
          primary_goal?: string | null
          sleep_time?: string | null
          surgeries?: string | null
          tracked_macros_before?: boolean | null
          training_location?: string | null
          updated_at?: string
          upper_body_score?: number | null
          user_id: string
          waiver_signature?: string | null
          waiver_signed?: boolean | null
          waiver_signed_at?: string | null
          wake_time?: string | null
          weight_lb?: number | null
          work_on_most?: string | null
          workout_days_current?: string | null
          workout_days_realistic?: string | null
          workout_days_realistic_other?: string | null
          workout_time?: string | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          available_days?: string[] | null
          baseline_assessment_date?: string | null
          baseline_photo_set_id?: string | null
          bodyfat_final_confirmed?: number | null
          bodyfat_range_high?: number | null
          bodyfat_range_low?: number | null
          completed_at?: string | null
          confidence_level?: string | null
          created_at?: string
          current_step?: number
          current_weight_kg?: number | null
          custom_allergy_text?: string | null
          custom_digestive_text?: string | null
          digestive_issues?: string[] | null
          equipment_photo_urls?: string[] | null
          estimated_body_fat_pct?: number | null
          favorite_body_part?: string | null
          final_notes?: string | null
          food_intolerances?: string[] | null
          foods_dislike?: string | null
          foods_love?: string | null
          gender?: string | null
          gym_name_address?: string | null
          health_sync_status?: string
          height_cm?: number | null
          height_feet?: number | null
          height_inches?: number | null
          home_equipment_list?: string | null
          id?: string
          injuries?: string | null
          lower_body_score?: number | null
          midsection_score?: number | null
          motivation_text?: string | null
          occupation?: string | null
          onboarding_completed?: boolean
          posture_flag?: string | null
          primary_goal?: string | null
          sleep_time?: string | null
          surgeries?: string | null
          tracked_macros_before?: boolean | null
          training_location?: string | null
          updated_at?: string
          upper_body_score?: number | null
          user_id?: string
          waiver_signature?: string | null
          waiver_signed?: boolean | null
          waiver_signed_at?: string | null
          wake_time?: string | null
          weight_lb?: number | null
          work_on_most?: string | null
          workout_days_current?: string | null
          workout_days_realistic?: string | null
          workout_days_realistic_other?: string | null
          workout_time?: string | null
        }
        Relationships: []
      }
      pc_recipe_ingredients: {
        Row: {
          calories: number
          carbs: number
          fat: number
          food_item_id: string | null
          food_name: string
          id: string
          protein: number
          quantity: number
          recipe_id: string
          serving_unit: string
          sort_order: number
        }
        Insert: {
          calories?: number
          carbs?: number
          fat?: number
          food_item_id?: string | null
          food_name: string
          id?: string
          protein?: number
          quantity?: number
          recipe_id: string
          serving_unit?: string
          sort_order?: number
        }
        Update: {
          calories?: number
          carbs?: number
          fat?: number
          food_item_id?: string | null
          food_name?: string
          id?: string
          protein?: number
          quantity?: number
          recipe_id?: string
          serving_unit?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_recipe_ingredients_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "pc_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_recipe_instructions: {
        Row: {
          id: string
          instruction_text: string
          recipe_id: string
          step_number: number
        }
        Insert: {
          id?: string
          instruction_text: string
          recipe_id: string
          step_number: number
        }
        Update: {
          id?: string
          instruction_text?: string
          recipe_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_recipe_instructions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "pc_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_recipes: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          servings: number
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          servings?: number
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          servings?: number
          updated_at?: string
          youtube_url?: string | null
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
      plateau_flags: {
        Row: {
          client_id: string
          coach_id: string | null
          created_at: string
          exercise_id: string
          flagged_at: string
          id: string
          last_reps: number | null
          last_rpe: number | null
          last_weight: number | null
          resolution: string | null
          resolved_at: string | null
          stagnant_sessions: number | null
          workout_id: string
        }
        Insert: {
          client_id: string
          coach_id?: string | null
          created_at?: string
          exercise_id: string
          flagged_at?: string
          id?: string
          last_reps?: number | null
          last_rpe?: number | null
          last_weight?: number | null
          resolution?: string | null
          resolved_at?: string | null
          stagnant_sessions?: number | null
          workout_id: string
        }
        Update: {
          client_id?: string
          coach_id?: string | null
          created_at?: string
          exercise_id?: string
          flagged_at?: string
          id?: string
          last_reps?: number | null
          last_rpe?: number | null
          last_weight?: number | null
          resolution?: string | null
          resolved_at?: string | null
          stagnant_sessions?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plateau_flags_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plateau_flags_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
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
          measurements_enabled: boolean | null
          phone: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          measurements_enabled?: boolean | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          measurements_enabled?: boolean | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: []
      }
      program_phases: {
        Row: {
          created_at: string
          custom_intensity: string | null
          description: string | null
          duration_weeks: number
          id: string
          intensity_system: string | null
          name: string
          phase_order: number
          program_id: string
          progression_rule: string | null
          training_style: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_intensity?: string | null
          description?: string | null
          duration_weeks?: number
          id?: string
          intensity_system?: string | null
          name?: string
          phase_order?: number
          program_id: string
          progression_rule?: string | null
          training_style?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_intensity?: string | null
          description?: string | null
          duration_weeks?: number
          id?: string
          intensity_system?: string | null
          name?: string
          phase_order?: number
          program_id?: string
          progression_rule?: string | null
          training_style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_phases_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_weeks: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phase_id: string | null
          program_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phase_id?: string | null
          program_id: string
          week_number?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phase_id?: string | null
          program_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "program_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_workouts: {
        Row: {
          created_at: string
          custom_tag: string | null
          day_label: string | null
          day_of_week: number | null
          exclude_from_numbering: boolean | null
          id: string
          phase_id: string | null
          sort_order: number | null
          week_id: string | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          custom_tag?: string | null
          day_label?: string | null
          day_of_week?: number | null
          exclude_from_numbering?: boolean | null
          id?: string
          phase_id?: string | null
          sort_order?: number | null
          week_id?: string | null
          workout_id: string
        }
        Update: {
          created_at?: string
          custom_tag?: string | null
          day_label?: string | null
          day_of_week?: number | null
          exclude_from_numbering?: boolean | null
          id?: string
          phase_id?: string | null
          sort_order?: number | null
          week_id?: string | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_workouts_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "program_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_workouts_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "program_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_workouts_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          description: string | null
          duration_weeks: number | null
          end_date: string | null
          goal_type: string | null
          id: string
          is_master: boolean
          is_template: boolean | null
          name: string
          start_date: string | null
          tags: string[] | null
          updated_at: string
          version_number: number
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          goal_type?: string | null
          id?: string
          is_master?: boolean
          is_template?: boolean | null
          name: string
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          goal_type?: string | null
          id?: string
          is_master?: boolean
          is_template?: boolean | null
          name?: string
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string
          version_number?: number
        }
        Relationships: []
      }
      progress_photos: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          photo_date: string
          photo_type: string | null
          pose: string
          source: string | null
          storage_path: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_date?: string
          photo_type?: string | null
          pose?: string
          source?: string | null
          storage_path: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_date?: string
          photo_type?: string | null
          pose?: string
          source?: string | null
          storage_path?: string
        }
        Relationships: []
      }
      ranked_badges: {
        Row: {
          category: string
          created_at: string | null
          description: string
          display_name: string
          icon_name: string
          id: string
          name: string
          requirement_type: string
          requirement_value: Json
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          display_name: string
          icon_name: string
          id?: string
          name: string
          requirement_type: string
          requirement_value?: Json
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          display_name?: string
          icon_name?: string
          id?: string
          name?: string
          requirement_type?: string
          requirement_value?: Json
        }
        Relationships: []
      }
      ranked_notifications_queue: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          notification_type: string
          sent_at: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type: string
          sent_at?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ranked_profiles: {
        Row: {
          created_at: string | null
          current_division: number | null
          current_division_xp: number
          current_streak: number
          current_tier: string
          id: string
          inactive_days: number
          is_new_client_boost: boolean | null
          last_active_date: string | null
          last_rank_up_at: string | null
          longest_streak: number
          new_client_boost_expires: string | null
          total_xp: number
          updated_at: string | null
          user_id: string
          weekly_xp: number
          weekly_xp_reset_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_division?: number | null
          current_division_xp?: number
          current_streak?: number
          current_tier?: string
          id?: string
          inactive_days?: number
          is_new_client_boost?: boolean | null
          last_active_date?: string | null
          last_rank_up_at?: string | null
          longest_streak?: number
          new_client_boost_expires?: string | null
          total_xp?: number
          updated_at?: string | null
          user_id: string
          weekly_xp?: number
          weekly_xp_reset_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_division?: number | null
          current_division_xp?: number
          current_streak?: number
          current_tier?: string
          id?: string
          inactive_days?: number
          is_new_client_boost?: boolean | null
          last_active_date?: string | null
          last_rank_up_at?: string | null
          longest_streak?: number
          new_client_boost_expires?: string | null
          total_xp?: number
          updated_at?: string | null
          user_id?: string
          weekly_xp?: number
          weekly_xp_reset_at?: string | null
        }
        Relationships: []
      }
      ranked_user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranked_user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "ranked_badges"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          food_item_id: string
          gram_amount: number
          id: string
          ingredient_order: number
          recipe_id: string
        }
        Insert: {
          created_at?: string
          food_item_id: string
          gram_amount?: number
          id?: string
          ingredient_order?: number
          recipe_id: string
        }
        Update: {
          created_at?: string
          food_item_id?: string
          gram_amount?: number
          id?: string
          ingredient_order?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories_per_100g: number
          carbs_per_100g: number
          created_at: string
          created_by: string
          description: string | null
          fat_per_100g: number
          fiber_per_100g: number | null
          id: string
          is_public: boolean
          name: string
          protein_per_100g: number
          sugar_per_100g: number | null
          total_weight_g: number
          updated_at: string
        }
        Insert: {
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          created_by: string
          description?: string | null
          fat_per_100g?: number
          fiber_per_100g?: number | null
          id?: string
          is_public?: boolean
          name: string
          protein_per_100g?: number
          sugar_per_100g?: number | null
          total_weight_g?: number
          updated_at?: string
        }
        Update: {
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          created_by?: string
          description?: string | null
          fat_per_100g?: number
          fiber_per_100g?: number | null
          id?: string
          is_public?: boolean
          name?: string
          protein_per_100g?: number
          sugar_per_100g?: number | null
          total_weight_g?: number
          updated_at?: string
        }
        Relationships: []
      }
      recommit_events: {
        Row: {
          badge_awarded: boolean
          client_id: string
          completed_at: string | null
          created_at: string
          id: string
          micro_action: string | null
          public_post: string | null
          step_completed: number
          streak_reset: boolean
        }
        Insert: {
          badge_awarded?: boolean
          client_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          micro_action?: string | null
          public_post?: string | null
          step_completed?: number
          streak_reset?: boolean
        }
        Update: {
          badge_awarded?: boolean
          client_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          micro_action?: string | null
          public_post?: string | null
          step_completed?: number
          streak_reset?: boolean
        }
        Relationships: []
      }
      retention_nudges: {
        Row: {
          acknowledged_at: string | null
          client_id: string
          created_at: string
          id: string
          message: string
          nudge_type: string
          reengaged_at: string | null
          risk_level_at_send: string
          sent_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          message: string
          nudge_type?: string
          reengaged_at?: string | null
          risk_level_at_send: string
          sent_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          message?: string
          nudge_type?: string
          reengaged_at?: string | null
          risk_level_at_send?: string
          sent_at?: string
        }
        Relationships: []
      }
      saved_meal_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          fat: number
          food_item_id: string | null
          food_name: string
          id: string
          protein: number
          quantity: number
          saved_meal_id: string
          serving_unit: string
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          food_item_id?: string | null
          food_name: string
          id?: string
          protein?: number
          quantity?: number
          saved_meal_id: string
          serving_unit?: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          food_item_id?: string | null
          food_name?: string
          id?: string
          protein?: number
          quantity?: number
          saved_meal_id?: string
          serving_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_meal_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          calories: number
          carbs: number
          client_id: string
          created_at: string
          fat: number
          fiber: number | null
          id: string
          meal_type: string
          name: string
          notes: string | null
          protein: number
          servings: number
          sodium: number | null
          sugar: number | null
          updated_at: string
        }
        Insert: {
          calories?: number
          carbs?: number
          client_id: string
          created_at?: string
          fat?: number
          fiber?: number | null
          id?: string
          meal_type?: string
          name: string
          notes?: string | null
          protein?: number
          servings?: number
          sodium?: number | null
          sugar?: number | null
          updated_at?: string
        }
        Update: {
          calories?: number
          carbs?: number
          client_id?: string
          created_at?: string
          fat?: number
          fiber?: number | null
          id?: string
          meal_type?: string
          name?: string
          notes?: string | null
          protein?: number
          servings?: number
          sodium?: number | null
          sugar?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_user_id: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invite_token: string
          invited_by: string
          last_name: string | null
          role: Database["public"]["Enums"]["app_role"]
          used: boolean
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_user_id?: string | null
          email: string
          expires_at: string
          first_name?: string | null
          id?: string
          invite_token: string
          invited_by: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          used?: boolean
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_user_id?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invite_token?: string
          invited_by?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          used?: boolean
        }
        Relationships: []
      }
      supplement_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          logged_at: string
          notes: string | null
          servings: number
          supplement_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          servings?: number
          supplement_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          servings?: number
          supplement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_logs_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_nutrient_forms: {
        Row: {
          absorption_multiplier: number
          created_at: string
          form_name: string
          id: string
          nutrient_key: string
          supplement_id: string
        }
        Insert: {
          absorption_multiplier?: number
          created_at?: string
          form_name: string
          id?: string
          nutrient_key: string
          supplement_id: string
        }
        Update: {
          absorption_multiplier?: number
          created_at?: string
          form_name?: string
          id?: string
          nutrient_key?: string
          supplement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_nutrient_forms_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplement_stacks: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          supplement_ids: string[]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          supplement_ids?: string[]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          supplement_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      supplements: {
        Row: {
          added_sugars: number | null
          barcode: string | null
          bioavailability_multiplier: number | null
          brand: string | null
          calcium_mg: number | null
          calories: number | null
          carbs: number | null
          cholesterol: number | null
          chromium_mcg: number | null
          client_id: string
          coach_id: string | null
          copper_mg: number | null
          created_at: string
          data_source: string | null
          electrolytes_mg: number | null
          fat: number | null
          fiber: number | null
          form_type: string | null
          id: string
          iodine_mcg: number | null
          iron_mg: number | null
          is_active: boolean
          is_coach_recommended: boolean | null
          is_verified: boolean | null
          magnesium_mg: number | null
          manganese_mg: number | null
          molybdenum_mcg: number | null
          name: string
          notes: string | null
          omega_3: number | null
          omega_6: number | null
          phosphorus_mg: number | null
          potassium_mg: number | null
          protein: number | null
          selenium_mcg: number | null
          serving_size: number | null
          serving_unit: string | null
          servings_per_container: number | null
          sodium: number | null
          updated_at: string
          vitamin_a_mcg: number | null
          vitamin_b1_mg: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2_mg: number | null
          vitamin_b3_mg: number | null
          vitamin_b5_mg: number | null
          vitamin_b6_mg: number | null
          vitamin_b7_mcg: number | null
          vitamin_b9_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          vitamin_k_mcg: number | null
          zinc_mg: number | null
        }
        Insert: {
          added_sugars?: number | null
          barcode?: string | null
          bioavailability_multiplier?: number | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          cholesterol?: number | null
          chromium_mcg?: number | null
          client_id: string
          coach_id?: string | null
          copper_mg?: number | null
          created_at?: string
          data_source?: string | null
          electrolytes_mg?: number | null
          fat?: number | null
          fiber?: number | null
          form_type?: string | null
          id?: string
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_active?: boolean
          is_coach_recommended?: boolean | null
          is_verified?: boolean | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          name: string
          notes?: string | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          protein?: number | null
          selenium_mcg?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          servings_per_container?: number | null
          sodium?: number | null
          updated_at?: string
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          added_sugars?: number | null
          barcode?: string | null
          bioavailability_multiplier?: number | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          cholesterol?: number | null
          chromium_mcg?: number | null
          client_id?: string
          coach_id?: string | null
          copper_mg?: number | null
          created_at?: string
          data_source?: string | null
          electrolytes_mg?: number | null
          fat?: number | null
          fiber?: number | null
          form_type?: string | null
          id?: string
          iodine_mcg?: number | null
          iron_mg?: number | null
          is_active?: boolean
          is_coach_recommended?: boolean | null
          is_verified?: boolean | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          molybdenum_mcg?: number | null
          name?: string
          notes?: string | null
          omega_3?: number | null
          omega_6?: number | null
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          protein?: number | null
          selenium_mcg?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          servings_per_container?: number | null
          sodium?: number | null
          updated_at?: string
          vitamin_a_mcg?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b7_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_mcg?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      tdee_estimates: {
        Row: {
          adherence_pct: number
          avg_daily_calories: number
          avg_sleep_hours: number | null
          avg_steps: number | null
          avg_weight: number
          calculated_at: string
          cardio_minutes: number | null
          client_id: string
          created_at: string
          data_points: number
          estimated_tdee: number
          id: string
          metabolic_adaptation_pct: number | null
          training_sessions: number | null
          weight_change_rate: number
        }
        Insert: {
          adherence_pct?: number
          avg_daily_calories: number
          avg_sleep_hours?: number | null
          avg_steps?: number | null
          avg_weight: number
          calculated_at?: string
          cardio_minutes?: number | null
          client_id: string
          created_at?: string
          data_points?: number
          estimated_tdee: number
          id?: string
          metabolic_adaptation_pct?: number | null
          training_sessions?: number | null
          weight_change_rate: number
        }
        Update: {
          adherence_pct?: number
          avg_daily_calories?: number
          avg_sleep_hours?: number | null
          avg_steps?: number | null
          avg_weight?: number
          calculated_at?: string
          cardio_minutes?: number | null
          client_id?: string
          created_at?: string
          data_points?: number
          estimated_tdee?: number
          id?: string
          metabolic_adaptation_pct?: number | null
          training_sessions?: number | null
          weight_change_rate?: number
        }
        Relationships: []
      }
      thread_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      tiers: {
        Row: {
          color: string
          icon: string | null
          id: string
          min_xp: number
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          icon?: string | null
          id?: string
          min_xp?: number
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          icon?: string | null
          id?: string
          min_xp?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          source_challenge_id: string | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          source_challenge_id?: string | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          source_challenge_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_source_challenge_id_fkey"
            columns: ["source_challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_food_history: {
        Row: {
          created_at: string | null
          first_logged_at: string
          food_id: string
          id: string
          is_favorite: boolean
          last_logged_at: string
          log_count: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_logged_at?: string
          food_id: string
          id?: string
          is_favorite?: boolean
          last_logged_at?: string
          log_count?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_logged_at?: string
          food_id?: string
          id?: string
          is_favorite?: boolean
          last_logged_at?: string
          log_count?: number
          user_id?: string
        }
        Relationships: []
      }
      user_food_serving_memory: {
        Row: {
          food_id: string
          id: string
          last_logged_at: string
          log_count: number
          serving_size: number
          serving_unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          food_id: string
          id?: string
          last_logged_at?: string
          log_count?: number
          serving_size: number
          serving_unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          food_id?: string
          id?: string
          last_logged_at?: string
          log_count?: number
          serving_size?: number
          serving_unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_food_serving_memory_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recent_foods: {
        Row: {
          food_data: Json | null
          food_id: string | null
          food_name: string | null
          id: string
          selected_at: string | null
          user_id: string
        }
        Insert: {
          food_data?: Json | null
          food_id?: string | null
          food_name?: string | null
          id?: string
          selected_at?: string | null
          user_id: string
        }
        Update: {
          food_data?: Json | null
          food_id?: string | null
          food_name?: string | null
          id?: string
          selected_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_recent_foods_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
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
      user_xp_summary: {
        Row: {
          comebacks: number | null
          current_streak: number | null
          current_tier_id: string | null
          elite_weeks: number | null
          lifetime_avg_pct: number | null
          longest_streak: number | null
          resets: number | null
          total_xp: number | null
          user_id: string
        }
        Insert: {
          comebacks?: number | null
          current_streak?: number | null
          current_tier_id?: string | null
          elite_weeks?: number | null
          lifetime_avg_pct?: number | null
          longest_streak?: number | null
          resets?: number | null
          total_xp?: number | null
          user_id: string
        }
        Update: {
          comebacks?: number | null
          current_streak?: number | null
          current_tier_id?: string | null
          elite_weeks?: number | null
          lifetime_avg_pct?: number | null
          longest_streak?: number | null
          resets?: number | null
          total_xp?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_xp_summary_current_tier_id_fkey"
            columns: ["current_tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
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
      wearable_connections: {
        Row: {
          access_token: string | null
          client_id: string
          created_at: string | null
          error_message: string | null
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          client_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          client_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_calorie_suggestions: {
        Row: {
          biofeedback_factors: Json | null
          client_id: string
          coach_id: string | null
          coach_modified_calories: number | null
          coach_notes: string | null
          created_at: string
          current_calories: number
          estimated_tdee: number
          id: string
          metabolic_adaptation_pct: number | null
          phase: string
          predicted_4week_weight: number | null
          predicted_weekly_change: number | null
          reason: string
          resolved_at: string | null
          status: string
          suggested_calories: number
          suggested_carbs: number | null
          suggested_fat: number | null
          suggested_protein: number | null
          week_start: string
        }
        Insert: {
          biofeedback_factors?: Json | null
          client_id: string
          coach_id?: string | null
          coach_modified_calories?: number | null
          coach_notes?: string | null
          created_at?: string
          current_calories: number
          estimated_tdee: number
          id?: string
          metabolic_adaptation_pct?: number | null
          phase?: string
          predicted_4week_weight?: number | null
          predicted_weekly_change?: number | null
          reason: string
          resolved_at?: string | null
          status?: string
          suggested_calories: number
          suggested_carbs?: number | null
          suggested_fat?: number | null
          suggested_protein?: number | null
          week_start?: string
        }
        Update: {
          biofeedback_factors?: Json | null
          client_id?: string
          coach_id?: string | null
          coach_modified_calories?: number | null
          coach_notes?: string | null
          created_at?: string
          current_calories?: number
          estimated_tdee?: number
          id?: string
          metabolic_adaptation_pct?: number | null
          phase?: string
          predicted_4week_weight?: number | null
          predicted_weekly_change?: number | null
          reason?: string
          resolved_at?: string | null
          status?: string
          suggested_calories?: number
          suggested_carbs?: number | null
          suggested_fat?: number | null
          suggested_protein?: number | null
          week_start?: string
        }
        Relationships: []
      }
      weekly_checkins: {
        Row: {
          client_id: string
          created_at: string
          digestion: number | null
          energy_level: number | null
          id: string
          libido: number | null
          mood: number | null
          notes: string | null
          sleep_quality: number | null
          stress_level: number | null
          updated_at: string
          week_date: string
          weight: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          digestion?: number | null
          energy_level?: number | null
          id?: string
          libido?: number | null
          mood?: number | null
          notes?: string | null
          sleep_quality?: number | null
          stress_level?: number | null
          updated_at?: string
          week_date?: string
          weight?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          digestion?: number | null
          energy_level?: number | null
          id?: string
          libido?: number | null
          mood?: number | null
          notes?: string | null
          sleep_quality?: number | null
          stress_level?: number | null
          updated_at?: string
          week_date?: string
          weight?: number | null
        }
        Relationships: []
      }
      weekly_compliance_scores: {
        Row: {
          checkin_completed: boolean
          community_post_count: number
          created_at: string
          id: string
          nutrition_pct: number
          total_score: number
          user_id: string
          week_start: string
          workout_pct: number
        }
        Insert: {
          checkin_completed?: boolean
          community_post_count?: number
          created_at?: string
          id?: string
          nutrition_pct?: number
          total_score?: number
          user_id: string
          week_start: string
          workout_pct?: number
        }
        Update: {
          checkin_completed?: boolean
          community_post_count?: number
          created_at?: string
          id?: string
          nutrition_pct?: number
          total_score?: number
          user_id?: string
          week_start?: string
          workout_pct?: number
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          logged_at: string
          notes: string | null
          source: string | null
          weight: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          source?: string | null
          weight: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          source?: string | null
          weight?: number
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          exercise_order: number
          grouping_id: string | null
          grouping_type: string | null
          id: string
          increment_type: string | null
          intensity_type: string | null
          is_amrap: boolean | null
          loading_percentage: number | null
          loading_type: string | null
          notes: string | null
          progression_mode: string | null
          progression_type: string | null
          reps: string | null
          rest_seconds: number | null
          rir: number | null
          rpe_target: number | null
          rpe_threshold: number | null
          sets: number
          superset_group: string | null
          tempo: string | null
          updated_at: string
          video_override: string | null
          weight_increment: number | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          exercise_order: number
          grouping_id?: string | null
          grouping_type?: string | null
          id?: string
          increment_type?: string | null
          intensity_type?: string | null
          is_amrap?: boolean | null
          loading_percentage?: number | null
          loading_type?: string | null
          notes?: string | null
          progression_mode?: string | null
          progression_type?: string | null
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          rpe_target?: number | null
          rpe_threshold?: number | null
          sets: number
          superset_group?: string | null
          tempo?: string | null
          updated_at?: string
          video_override?: string | null
          weight_increment?: number | null
          workout_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          exercise_order?: number
          grouping_id?: string | null
          grouping_type?: string | null
          id?: string
          increment_type?: string | null
          intensity_type?: string | null
          is_amrap?: boolean | null
          loading_percentage?: number | null
          loading_type?: string | null
          notes?: string | null
          progression_mode?: string | null
          progression_type?: string | null
          reps?: string | null
          rest_seconds?: number | null
          rir?: number | null
          rpe_target?: number | null
          rpe_threshold?: number | null
          sets?: number
          superset_group?: string | null
          tempo?: string | null
          updated_at?: string
          video_override?: string | null
          weight_increment?: number | null
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
          duration_seconds: number | null
          exercise_modifications: Json | null
          had_unlogged_sets: boolean | null
          id: string
          last_heartbeat: string | null
          last_seen: string | null
          notes: string | null
          pr_count: number | null
          session_date: string | null
          sets_completed: number | null
          started_at: string | null
          status: string
          total_volume: number | null
          tz_corrected: boolean | null
          updated_at: string
          workout_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          exercise_modifications?: Json | null
          had_unlogged_sets?: boolean | null
          id?: string
          last_heartbeat?: string | null
          last_seen?: string | null
          notes?: string | null
          pr_count?: number | null
          session_date?: string | null
          sets_completed?: number | null
          started_at?: string | null
          status?: string
          total_volume?: number | null
          tz_corrected?: boolean | null
          updated_at?: string
          workout_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          exercise_modifications?: Json | null
          had_unlogged_sets?: boolean | null
          id?: string
          last_heartbeat?: string | null
          last_seen?: string | null
          notes?: string | null
          pr_count?: number | null
          session_date?: string | null
          sets_completed?: number | null
          started_at?: string | null
          status?: string
          total_volume?: number | null
          tz_corrected?: boolean | null
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
      workout_sets: {
        Row: {
          created_at: string
          id: string
          rep_target: string | null
          rpe_target: number | null
          set_number: number
          set_type: string | null
          weight_target: number | null
          workout_exercise_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rep_target?: string | null
          rpe_target?: number | null
          set_number: number
          set_type?: string | null
          weight_target?: number | null
          workout_exercise_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rep_target?: string | null
          rpe_target?: number | null
          set_number?: number
          set_type?: string | null
          weight_target?: number | null
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
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
          estimated_duration: number | null
          id: string
          instructions: string | null
          is_template: boolean
          name: string
          notes: string | null
          order_index: number | null
          phase: string | null
          source_workout_id: string | null
          updated_at: string
          workout_type: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          description?: string | null
          estimated_duration?: number | null
          id?: string
          instructions?: string | null
          is_template?: boolean
          name: string
          notes?: string | null
          order_index?: number | null
          phase?: string | null
          source_workout_id?: string | null
          updated_at?: string
          workout_type?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          description?: string | null
          estimated_duration?: number | null
          id?: string
          instructions?: string | null
          is_template?: boolean
          name?: string
          notes?: string | null
          order_index?: number | null
          phase?: string | null
          source_workout_id?: string | null
          updated_at?: string
          workout_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_source_workout_id_fkey"
            columns: ["source_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_ledger: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_transactions: {
        Row: {
          base_amount: number
          coach_award_preset: string | null
          coach_id: string | null
          coach_note: string | null
          created_at: string | null
          description: string | null
          id: string
          multiplier: number | null
          related_event_id: string | null
          transaction_type: string
          user_id: string
          xp_amount: number
        }
        Insert: {
          base_amount: number
          coach_award_preset?: string | null
          coach_id?: string | null
          coach_note?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          multiplier?: number | null
          related_event_id?: string | null
          transaction_type: string
          user_id: string
          xp_amount: number
        }
        Update: {
          base_amount?: number
          coach_award_preset?: string | null
          coach_id?: string | null
          coach_note?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          multiplier?: number | null
          related_event_id?: string | null
          transaction_type?: string
          user_id?: string
          xp_amount?: number
        }
        Relationships: []
      }
    }
    Views: {
      data_quality_tz_summary: {
        Row: {
          corrected_rows: number | null
          legacy_rows: number | null
          pct_corrected: number | null
          table_name: string | null
          total_rows: number | null
        }
        Relationships: []
      }
      zero_result_searches: {
        Row: {
          last_searched_at: string | null
          query: string | null
          search_count: number | null
          unique_users: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_repair_workout_labels: { Args: never; Returns: Json }
      get_logging_streak: { Args: { p_user_id: string }; Returns: number }
      get_logging_streak_v2:
        | { Args: { p_today: string; p_user_id: string }; Returns: number }
        | {
            Args: { p_today: string; p_tz_only?: boolean; p_user_id: string }
            Returns: number
          }
      get_synonyms_for_query: {
        Args: { input_query: string }
        Returns: string[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_workout_streak: {
        Args: { p_today: string; p_tz_only?: boolean; p_user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      log_food_to_history: {
        Args: { p_food_id: string; p_user_id: string }
        Returns: undefined
      }
      recalc_engagement_score: {
        Args: { _user_id: string }
        Returns: undefined
      }
      search_foods: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          barcode: string
          brand: string
          calories: number
          carbs: number
          category: string
          data_source: string
          fat: number
          fiber: number
          id: string
          is_verified: boolean
          name: string
          protein: number
          relevance_score: number
          serving_label: string
          serving_size: number
          serving_unit: string
          sodium: number
          sugar: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      toggle_food_favorite: {
        Args: { p_food_id: string; p_user_id: string }
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
