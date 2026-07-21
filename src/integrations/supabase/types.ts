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
      blocked_emails: {
        Row: {
          created_at: string
          deleted_at: string
          deleted_by: string | null
          email: string
          id: string
          reason: string | null
          user_id_antigo: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email: string
          id?: string
          reason?: string | null
          user_id_antigo?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email?: string
          id?: string
          reason?: string | null
          user_id_antigo?: string | null
        }
        Relationships: []
      }
      club_achievements: {
        Row: {
          club_id: string
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string | null
          icon: string | null
          id: string
          name: string
          rarity: string
          slug: string
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          criteria_type: string
          criteria_value?: number
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          rarity?: string
          slug: string
          status?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          rarity?: string
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_achievements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          device: string | null
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      club_benefits: {
        Row: {
          activation_rule: Json | null
          benefit_type: string
          benefit_value: number | null
          created_at: string
          description: string | null
          expiration_rule: Json | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          activation_rule?: Json | null
          benefit_type: string
          benefit_value?: number | null
          created_at?: string
          description?: string | null
          expiration_rule?: Json | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          activation_rule?: Json | null
          benefit_type?: string
          benefit_value?: number | null
          created_at?: string
          description?: string | null
          expiration_rule?: Json | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      club_campaigns: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          reward: Json | null
          rule: Json | null
          start_date: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          reward?: Json | null
          rule?: Json | null
          start_date?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          reward?: Json | null
          rule?: Json | null
          start_date?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      club_customer_achievements: {
        Row: {
          achievement_id: string
          company_id: string
          id: string
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          company_id: string
          id?: string
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          company_id?: string
          id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_customer_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "club_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_customer_achievements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_customer_achievements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      club_customer_status: {
        Row: {
          club_id: string
          company_id: string
          created_at: string
          current_cycle: number
          current_level: string | null
          current_price: number | null
          current_streak: number
          goal_date: string | null
          goal_reached: boolean
          gold_cycles_total: number
          hall_of_fame: boolean
          id: string
          legend: boolean
          lifetime_orders: number
          next_cycle_price: number | null
          updated_at: string
        }
        Insert: {
          club_id: string
          company_id: string
          created_at?: string
          current_cycle?: number
          current_level?: string | null
          current_price?: number | null
          current_streak?: number
          goal_date?: string | null
          goal_reached?: boolean
          gold_cycles_total?: number
          hall_of_fame?: boolean
          id?: string
          legend?: boolean
          lifetime_orders?: number
          next_cycle_price?: number | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          company_id?: string
          created_at?: string
          current_cycle?: number
          current_level?: string | null
          current_price?: number | null
          current_streak?: number
          goal_date?: string | null
          goal_reached?: boolean
          gold_cycles_total?: number
          hall_of_fame?: boolean
          id?: string
          legend?: boolean
          lifetime_orders?: number
          next_cycle_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_customer_status_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_customer_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_customer_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_customer_status_current_level_fkey"
            columns: ["current_level"]
            isOneToOne: false
            referencedRelation: "club_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      club_cycles: {
        Row: {
          closed_at: string | null
          club_id: string
          company_id: string
          created_at: string
          cycle_number: number
          ends_at: string
          estimated_amount: number | null
          final_amount: number | null
          goal: number
          goal_reached: boolean
          id: string
          next_cycle_price: number | null
          orders: number
          price_per_order: number
          started_at: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          company_id: string
          created_at?: string
          cycle_number: number
          ends_at: string
          estimated_amount?: number | null
          final_amount?: number | null
          goal: number
          goal_reached?: boolean
          id?: string
          next_cycle_price?: number | null
          orders?: number
          price_per_order: number
          started_at: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          company_id?: string
          created_at?: string
          cycle_number?: number
          ends_at?: string
          estimated_amount?: number | null
          final_amount?: number | null
          goal?: number
          goal_reached?: boolean
          id?: string
          next_cycle_price?: number | null
          orders?: number
          price_per_order?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_cycles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      club_history: {
        Row: {
          company_id: string
          created_at: string
          cycle_id: string | null
          description: string | null
          event_type: string
          id: string
          payload_json: Json | null
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cycle_id?: string | null
          description?: string | null
          event_type: string
          id?: string
          payload_json?: Json | null
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cycle_id?: string | null
          description?: string | null
          event_type?: string
          id?: string
          payload_json?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_history_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "club_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_levels: {
        Row: {
          benefit_id: string | null
          club_id: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          maximum_orders: number | null
          minimum_orders: number
          name: string
          priority: number
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          benefit_id?: string | null
          club_id: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          maximum_orders?: number | null
          minimum_orders?: number
          name: string
          priority?: number
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          benefit_id?: string | null
          club_id?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          maximum_orders?: number | null
          minimum_orders?: number
          name?: string
          priority?: number
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_levels_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "club_benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_levels_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_notifications: {
        Row: {
          company_id: string
          created_at: string
          displayed: boolean
          id: string
          message: string
          notification_type: string
          read: boolean
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          displayed?: boolean
          id?: string
          message: string
          notification_type: string
          read?: boolean
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          displayed?: boolean
          id?: string
          message?: string
          notification_type?: string
          read?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      club_rankings: {
        Row: {
          company_id: string
          created_at: string
          cycle: number
          id: string
          level: string | null
          orders: number
          position: number | null
          score: number
          streak: number
        }
        Insert: {
          company_id: string
          created_at?: string
          cycle: number
          id?: string
          level?: string | null
          orders?: number
          position?: number | null
          score?: number
          streak?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          cycle?: number
          id?: string
          level?: string | null
          orders?: number
          position?: number | null
          score?: number
          streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_rankings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_rankings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_rankings_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "club_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      club_settings: {
        Row: {
          challenge_days: number
          club_id: string
          default_price_per_order: number
          enable_campaign: boolean
          enable_hall_of_fame: boolean
          enable_notifications: boolean
          goal_orders: number
          gold_price_per_order: number
          id: string
          legend_streak_required: number
          updated_at: string
          updated_by: string | null
          voucher_months: number
        }
        Insert: {
          challenge_days?: number
          club_id: string
          default_price_per_order?: number
          enable_campaign?: boolean
          enable_hall_of_fame?: boolean
          enable_notifications?: boolean
          goal_orders?: number
          gold_price_per_order?: number
          id?: string
          legend_streak_required?: number
          updated_at?: string
          updated_by?: string | null
          voucher_months?: number
        }
        Update: {
          challenge_days?: number
          club_id?: string
          default_price_per_order?: number
          enable_campaign?: boolean
          enable_hall_of_fame?: boolean
          enable_notifications?: boolean
          goal_orders?: number
          gold_price_per_order?: number
          id?: string
          legend_streak_required?: number
          updated_at?: string
          updated_by?: string | null
          voucher_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_vouchers: {
        Row: {
          company_id: string
          expires_at: string | null
          id: string
          issued_at: string
          months: number | null
          status: string
          used_at: string | null
          voucher_type: string
        }
        Insert: {
          company_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          months?: number | null
          status?: string
          used_at?: string | null
          voucher_type: string
        }
        Update: {
          company_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          months?: number | null
          status?: string
          used_at?: string | null
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_vouchers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "club_vouchers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      combo_items: {
        Row: {
          combo_id: string
          created_at: string | null
          id: string
          product_name: string
          product_type: string | null
          quantity: number | null
        }
        Insert: {
          combo_id: string
          created_at?: string | null
          id?: string
          product_name: string
          product_type?: string | null
          quantity?: number | null
        }
        Update: {
          combo_id?: string
          created_at?: string | null
          id?: string
          product_name?: string
          product_type?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          active: boolean | null
          available_days: string[] | null
          combo_price: number
          created_at: string | null
          description: string | null
          end_time: string | null
          external_id: string | null
          external_source: string | null
          highlight: boolean | null
          id: string
          image_url: string | null
          last_synced_at: string | null
          name: string
          original_price: number
          pizzeria_id: string
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          available_days?: string[] | null
          combo_price?: number
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          external_id?: string | null
          external_source?: string | null
          highlight?: boolean | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name: string
          original_price?: number
          pizzeria_id: string
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          available_days?: string[] | null
          combo_price?: number
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          external_id?: string | null
          external_source?: string | null
          highlight?: boolean | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name?: string
          original_price?: number
          pizzeria_id?: string
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combos_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "combos_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      external_order_logs: {
        Row: {
          api_key_partial: string | null
          created_at: string
          error_message: string | null
          id: string
          payload: Json | null
          status_code: number | null
        }
        Insert: {
          api_key_partial?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          status_code?: number | null
        }
        Update: {
          api_key_partial?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      flycontrol_fiqon_logs: {
        Row: {
          created_at: string
          error_message: string | null
          fiqon_url: string | null
          id: string
          order_id: string | null
          payload: Json | null
          response_body: string | null
          restaurant_id: string | null
          status_http: number | null
          success: boolean | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          fiqon_url?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          response_body?: string | null
          restaurant_id?: string | null
          status_http?: number | null
          success?: boolean | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          fiqon_url?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          response_body?: string | null
          restaurant_id?: string | null
          status_http?: number | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "flycontrol_fiqon_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flycontrol_fiqon_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "flycontrol_fiqon_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          external_id: string | null
          external_source: string | null
          id: string
          last_synced_at: string | null
          name: string
          order_index: number | null
          pizzeria_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          order_index?: number | null
          pizzeria_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          order_index?: number | null
          pizzeria_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "menu_categories_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_extras: {
        Row: {
          active: boolean | null
          created_at: string | null
          external_id: string | null
          external_source: string | null
          extra_type: string
          id: string
          last_synced_at: string | null
          name: string
          pizzeria_id: string
          price: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          external_id?: string | null
          external_source?: string | null
          extra_type: string
          id?: string
          last_synced_at?: string | null
          name: string
          pizzeria_id: string
          price?: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          external_id?: string | null
          external_source?: string | null
          extra_type?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          pizzeria_id?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_products: {
        Row: {
          active: boolean | null
          available: boolean | null
          category_id: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          external_source: string | null
          id: string
          image_url: string | null
          last_synced_at: string | null
          name: string
          pizzeria_id: string
          price: number
          product_type: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          available?: boolean | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name: string
          pizzeria_id: string
          price?: number
          product_type?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          available?: boolean | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          last_synced_at?: string | null
          name?: string
          pizzeria_id?: string
          price?: number
          product_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          observations: string | null
          order_id: string
          pizzeria_id: string | null
          product_name: string
          product_type: string | null
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          observations?: string | null
          order_id: string
          pizzeria_id?: string | null
          product_name: string
          product_type?: string | null
          quantity?: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          observations?: string | null
          order_id?: string
          pizzeria_id?: string | null
          product_name?: string
          product_type?: string | null
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "order_items_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          change_for: number | null
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          customer_reference: string | null
          customer_token: string | null
          delivery_fee: number
          delivery_type: string | null
          dining_session_id: string | null
          discount: number | null
          external_order_id: string | null
          id: string
          items: Json
          neighborhood: string | null
          notes: string | null
          order_number: number
          order_type: string | null
          payment_method: string | null
          payment_status: string | null
          service_mode: string | null
          source: string | null
          status: string
          subtotal: number | null
          table_id: string | null
          table_name: string | null
          table_number: string | null
          table_token: string | null
          tenant_id: string
          ticket_number: string | null
          total: number
          updated_at: string
          waiter_id: string | null
          whatsapp_message: string | null
        }
        Insert: {
          change_for?: number | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          customer_reference?: string | null
          customer_token?: string | null
          delivery_fee?: number
          delivery_type?: string | null
          dining_session_id?: string | null
          discount?: number | null
          external_order_id?: string | null
          id?: string
          items?: Json
          neighborhood?: string | null
          notes?: string | null
          order_number?: number
          order_type?: string | null
          payment_method?: string | null
          payment_status?: string | null
          service_mode?: string | null
          source?: string | null
          status?: string
          subtotal?: number | null
          table_id?: string | null
          table_name?: string | null
          table_number?: string | null
          table_token?: string | null
          tenant_id: string
          ticket_number?: string | null
          total?: number
          updated_at?: string
          waiter_id?: string | null
          whatsapp_message?: string | null
        }
        Update: {
          change_for?: number | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          customer_reference?: string | null
          customer_token?: string | null
          delivery_fee?: number
          delivery_type?: string | null
          dining_session_id?: string | null
          discount?: number | null
          external_order_id?: string | null
          id?: string
          items?: Json
          neighborhood?: string | null
          notes?: string | null
          order_number?: number
          order_type?: string | null
          payment_method?: string | null
          payment_status?: string | null
          service_mode?: string | null
          source?: string | null
          status?: string
          subtotal?: number | null
          table_id?: string | null
          table_name?: string | null
          table_number?: string | null
          table_token?: string | null
          tenant_id?: string
          ticket_number?: string | null
          total?: number
          updated_at?: string
          waiter_id?: string | null
          whatsapp_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "waiters"
            referencedColumns: ["id"]
          },
        ]
      }
      pizzeria_pizza_sizes: {
        Row: {
          active: boolean | null
          created_at: string
          external_id: string | null
          id: string
          max_flavors: number
          name: string
          pizzeria_id: string
          price: number
          slices: number | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          external_id?: string | null
          id?: string
          max_flavors?: number
          name: string
          pizzeria_id: string
          price?: number
          slices?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          external_id?: string | null
          id?: string
          max_flavors?: number
          name?: string
          pizzeria_id?: string
          price?: number
          slices?: number | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey"
            columns: ["pizzeria_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      pizzerias: {
        Row: {
          address: string | null
          api_key: string
          average_delivery_time: string | null
          billing_model: string
          created_at: string
          delivery_fee: number | null
          description: string | null
          fiqon_enabled: boolean | null
          fiqon_webhook_url: string | null
          id: string
          instagram_url: string | null
          internal_notes: string | null
          is_active: boolean | null
          is_open: boolean | null
          logo_url: string | null
          menu_sync_token: string | null
          name: string
          neighborhood: string | null
          opening_hours: Json | null
          owner_id: string | null
          payment_methods: Json | null
          phone: string | null
          plan_type: string
          primary_color: string | null
          print_auto: boolean
          provision_error: string | null
          provision_status: string | null
          provisioned_at: string | null
          public_url: string | null
          service_fee_percent: number
          sf_restaurant_id: string | null
          short_message: string | null
          slug: string
          sound_enabled: boolean
          status: string
          status_art_entregue_url: string | null
          status_art_preparando_url: string | null
          status_art_saiu_url: string | null
          status_text_entregue: string | null
          status_text_preparando: string | null
          status_text_saiu: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          subscription_price: number | null
          subscription_status: string | null
          sync_endpoint: string | null
          updated_at: string
          waiter_commission_percent: number
        }
        Insert: {
          address?: string | null
          api_key: string
          average_delivery_time?: string | null
          billing_model?: string
          created_at?: string
          delivery_fee?: number | null
          description?: string | null
          fiqon_enabled?: boolean | null
          fiqon_webhook_url?: string | null
          id?: string
          instagram_url?: string | null
          internal_notes?: string | null
          is_active?: boolean | null
          is_open?: boolean | null
          logo_url?: string | null
          menu_sync_token?: string | null
          name: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          payment_methods?: Json | null
          phone?: string | null
          plan_type?: string
          primary_color?: string | null
          print_auto?: boolean
          provision_error?: string | null
          provision_status?: string | null
          provisioned_at?: string | null
          public_url?: string | null
          service_fee_percent?: number
          sf_restaurant_id?: string | null
          short_message?: string | null
          slug: string
          sound_enabled?: boolean
          status?: string
          status_art_entregue_url?: string | null
          status_art_preparando_url?: string | null
          status_art_saiu_url?: string | null
          status_text_entregue?: string | null
          status_text_preparando?: string | null
          status_text_saiu?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_price?: number | null
          subscription_status?: string | null
          sync_endpoint?: string | null
          updated_at?: string
          waiter_commission_percent?: number
        }
        Update: {
          address?: string | null
          api_key?: string
          average_delivery_time?: string | null
          billing_model?: string
          created_at?: string
          delivery_fee?: number | null
          description?: string | null
          fiqon_enabled?: boolean | null
          fiqon_webhook_url?: string | null
          id?: string
          instagram_url?: string | null
          internal_notes?: string | null
          is_active?: boolean | null
          is_open?: boolean | null
          logo_url?: string | null
          menu_sync_token?: string | null
          name?: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          payment_methods?: Json | null
          phone?: string | null
          plan_type?: string
          primary_color?: string | null
          print_auto?: boolean
          provision_error?: string | null
          provision_status?: string | null
          provisioned_at?: string | null
          public_url?: string | null
          service_fee_percent?: number
          sf_restaurant_id?: string | null
          short_message?: string | null
          slug?: string
          sound_enabled?: boolean
          status?: string
          status_art_entregue_url?: string | null
          status_art_preparando_url?: string | null
          status_art_saiu_url?: string | null
          status_text_entregue?: string | null
          status_text_preparando?: string | null
          status_text_saiu?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_price?: number | null
          subscription_status?: string | null
          sync_endpoint?: string | null
          updated_at?: string
          waiter_commission_percent?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          is_admin: boolean | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          created_at: string
          default_waiter_id: string | null
          id: string
          is_active: boolean
          public_token: string
          qr_code_url: string | null
          restaurant_id: string | null
          table_name: string | null
          table_number: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_waiter_id?: string | null
          id?: string
          is_active?: boolean
          public_token?: string
          qr_code_url?: string | null
          restaurant_id?: string | null
          table_name?: string | null
          table_number: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_waiter_id?: string | null
          id?: string
          is_active?: boolean
          public_token?: string
          qr_code_url?: string | null
          restaurant_id?: string | null
          table_name?: string | null
          table_number?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_default_waiter_id_fkey"
            columns: ["default_waiter_id"]
            isOneToOne: false
            referencedRelation: "waiters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
      table_close_requests: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_token: string | null
          dining_session_id: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          restaurant_id: string
          session_id: string | null
          status: string
          table_id: string | null
          table_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_token?: string | null
          dining_session_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          restaurant_id: string
          session_id?: string | null
          status?: string
          table_id?: string | null
          table_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_token?: string | null
          dining_session_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          restaurant_id?: string
          session_id?: string | null
          status?: string
          table_id?: string | null
          table_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_session_orders: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          table_session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          table_session_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          table_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_session_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_orders_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closure_reason: string | null
          created_at: string | null
          customer_name: string | null
          customer_token: string
          dining_session_id: string
          id: string
          opened_at: string | null
          restaurant_id: string
          service_fee_amount: number | null
          service_fee_enabled: boolean | null
          service_fee_percent: number | null
          status: string
          subtotal_amount: number | null
          table_id: string | null
          table_name: string | null
          table_number: string
          total_amount: number | null
          updated_at: string | null
          waiter_commission_amount: number | null
          waiter_commission_percent: number | null
          waiter_id: string | null
          webhook_sent_at: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_token?: string
          dining_session_id?: string
          id?: string
          opened_at?: string | null
          restaurant_id: string
          service_fee_amount?: number | null
          service_fee_enabled?: boolean | null
          service_fee_percent?: number | null
          status?: string
          subtotal_amount?: number | null
          table_id?: string | null
          table_name?: string | null
          table_number: string
          total_amount?: number | null
          updated_at?: string | null
          waiter_commission_amount?: number | null
          waiter_commission_percent?: number | null
          waiter_id?: string | null
          webhook_sent_at?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closure_reason?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_token?: string
          dining_session_id?: string
          id?: string
          opened_at?: string | null
          restaurant_id?: string
          service_fee_amount?: number | null
          service_fee_enabled?: boolean | null
          service_fee_percent?: number | null
          status?: string
          subtotal_amount?: number | null
          table_id?: string | null
          table_name?: string | null
          table_number?: string
          total_amount?: number | null
          updated_at?: string | null
          waiter_commission_amount?: number | null
          waiter_commission_percent?: number | null
          waiter_id?: string | null
          webhook_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "waiters"
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
      waiters: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          password_hash: string
          phone: string | null
          tenant_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzeria_financial_metrics"
            referencedColumns: ["pizzeria_id"]
          },
          {
            foreignKeyName: "waiters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "pizzerias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_global_financial_metrics: {
        Row: {
          ticket_avg_month: number | null
          total_orders_day: number | null
          total_orders_month: number | null
          total_orders_week: number | null
          total_revenue_day: number | null
          total_revenue_month: number | null
          total_revenue_week: number | null
        }
        Relationships: []
      }
      pizzeria_financial_metrics: {
        Row: {
          last_order_at: string | null
          orders_day: number | null
          orders_month: number | null
          orders_week: number | null
          owner_id: string | null
          pizzeria_id: string | null
          pizzeria_name: string | null
          revenue_day: number | null
          revenue_month: number | null
          revenue_week: number | null
          status: string | null
          ticket_avg_day: number | null
          ticket_avg_month: number | null
          ticket_avg_week: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      club_check_achievements: {
        Args: { p_club_id: string; p_company_id: string }
        Returns: undefined
      }
      club_close_cycle: { Args: { p_cycle_id: string }; Returns: undefined }
      club_close_due_cycles: { Args: never; Returns: number }
      club_get_hall_of_fame: {
        Args: { p_club_id?: string; p_limit?: number }
        Returns: {
          company_name: string
          company_slug: string
          legend: boolean
          level_color: string
          level_icon: string
          level_name: string
          lifetime_orders: number
          streak: number
        }[]
      }
      club_get_or_create_active_cycle: {
        Args: { p_club_id?: string; p_company_id: string }
        Returns: string
      }
      club_is_challenge_active: {
        Args: { p_cycle_id: string }
        Returns: boolean
      }
      club_recalculate_level: {
        Args: { p_club_id: string; p_company_id: string }
        Returns: undefined
      }
      club_resolve_price: {
        Args: { p_club_id?: string; p_company_id: string }
        Returns: {
          price: number
          source: string
        }[]
      }
      enroll_company_in_cents: {
        Args: { p_club_id?: string; p_company_id: string }
        Returns: undefined
      }
      generate_default_restaurant_tables: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      get_admin_global_metrics: {
        Args: never
        Returns: {
          ticket_avg_month: number | null
          total_orders_day: number | null
          total_orders_month: number | null
          total_orders_week: number | null
          total_revenue_day: number | null
          total_revenue_month: number | null
          total_revenue_week: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_global_financial_metrics"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_dashboard_period_metrics: {
        Args: {
          p_end_date: string
          p_pizzeria_id?: string
          p_start_date: string
        }
        Returns: {
          orders_count: number
          pizzeria_id: string
          pizzeria_name: string
          revenue: number
          ticket_avg: number
        }[]
      }
      get_my_financial_metrics: {
        Args: never
        Returns: {
          last_order_at: string | null
          orders_day: number | null
          orders_month: number | null
          orders_week: number | null
          owner_id: string | null
          pizzeria_id: string | null
          pizzeria_name: string | null
          revenue_day: number | null
          revenue_month: number | null
          revenue_week: number | null
          status: string | null
          ticket_avg_day: number | null
          ticket_avg_month: number | null
          ticket_avg_week: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pizzeria_financial_metrics"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_period_metrics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          last_order_at: string
          orders_count: number
          owner_id: string
          pizzeria_id: string
          pizzeria_name: string
          revenue: number
          status: string
          ticket_avg: number
        }[]
      }
      get_pizzeria_financial_summary: {
        Args: { p_pizzeria_id: string }
        Returns: {
          best_day_date: string
          best_day_revenue: number
          last_order_at: string
          orders_month: number
          pizzeria_name: string
          revenue_month: number
        }[]
      }
      get_pizzerias_ranking: {
        Args: { p_limit?: number }
        Returns: {
          orders_day: number
          orders_month: number
          pizzeria_name: string
          revenue_day: number
          revenue_month: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      owns_pizzeria: {
        Args: { _pizzeria_id: string; _user_id: string }
        Returns: boolean
      }
      recalculate_table_session_totals: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      sync_order_to_table_session_logic: {
        Args: { p_order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "owner"
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
      app_role: ["super_admin", "owner"],
    },
  },
} as const
