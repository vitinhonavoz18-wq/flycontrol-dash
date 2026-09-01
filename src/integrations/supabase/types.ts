export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string;
          admin_user_id: string | null;
          created_at: string;
          details: Json | null;
          id: string;
          status: string;
          target_store_id: string | null;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          admin_user_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          status: string;
          target_store_id?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          admin_user_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          status?: string;
          target_store_id?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [];
      };
      billing_cycles: {
        Row: {
          billable_order_count: number;
          closed_at: string | null;
          company_id: string;
          created_at: string;
          cycle_end: string;
          cycle_start: string;
          discount_amount_cents: number;
          gross_usage_amount_cents: number;
          id: string;
          monthly_fee_amount_cents: number;
          promotion_threshold_orders: number;
          qualified_for_next_cycle: boolean;
          qualified_from_previous_cycle: boolean;
          setup_fee_amount_cents: number;
          status: string;
          subscription_id: string;
          total_amount_cents: number;
          unit_price_cents: number;
          updated_at: string;
        };
        Insert: {
          billable_order_count?: number;
          closed_at?: string | null;
          company_id: string;
          created_at?: string;
          cycle_end: string;
          cycle_start: string;
          discount_amount_cents?: number;
          gross_usage_amount_cents?: number;
          id?: string;
          monthly_fee_amount_cents?: number;
          promotion_threshold_orders?: number;
          qualified_for_next_cycle?: boolean;
          qualified_from_previous_cycle?: boolean;
          setup_fee_amount_cents?: number;
          status?: string;
          subscription_id: string;
          total_amount_cents?: number;
          unit_price_cents?: number;
          updated_at?: string;
        };
        Update: {
          billable_order_count?: number;
          closed_at?: string | null;
          company_id?: string;
          created_at?: string;
          cycle_end?: string;
          cycle_start?: string;
          discount_amount_cents?: number;
          gross_usage_amount_cents?: number;
          id?: string;
          monthly_fee_amount_cents?: number;
          promotion_threshold_orders?: number;
          qualified_for_next_cycle?: boolean;
          qualified_from_previous_cycle?: boolean;
          setup_fee_amount_cents?: number;
          status?: string;
          subscription_id?: string;
          total_amount_cents?: number;
          unit_price_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "billing_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_cycles_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      blocked_emails: {
        Row: {
          created_at: string;
          deleted_at: string;
          deleted_by: string | null;
          email: string;
          id: string;
          reason: string | null;
          user_id_antigo: string | null;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string;
          deleted_by?: string | null;
          email: string;
          id?: string;
          reason?: string | null;
          user_id_antigo?: string | null;
        };
        Update: {
          created_at?: string;
          deleted_at?: string;
          deleted_by?: string | null;
          email?: string;
          id?: string;
          reason?: string | null;
          user_id_antigo?: string | null;
        };
        Relationships: [];
      };
      checkout_intents: {
        Row: {
          checkout_url: string;
          company_id: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          expected_amount_cents: number;
          expires_at: string;
          id: string;
          plan_code: string;
          returned_at: string | null;
          status: string;
          subscription_id: string | null;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          checkout_url: string;
          company_id: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          expected_amount_cents: number;
          expires_at: string;
          id?: string;
          plan_code: string;
          returned_at?: string | null;
          status?: string;
          subscription_id?: string | null;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          checkout_url?: string;
          company_id?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          expected_amount_cents?: number;
          expires_at?: string;
          id?: string;
          plan_code?: string;
          returned_at?: string | null;
          status?: string;
          subscription_id?: string | null;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkout_intents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkout_intents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "checkout_intents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checkout_intents_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      club_achievements: {
        Row: {
          club_id: string;
          created_at: string;
          criteria_type: string;
          criteria_value: number;
          description: string | null;
          icon: string | null;
          id: string;
          name: string;
          rarity: string;
          slug: string;
          status: string;
        };
        Insert: {
          club_id: string;
          created_at?: string;
          criteria_type: string;
          criteria_value?: number;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          rarity?: string;
          slug: string;
          status?: string;
        };
        Update: {
          club_id?: string;
          created_at?: string;
          criteria_type?: string;
          criteria_value?: number;
          description?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          rarity?: string;
          slug?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_achievements_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      club_audit_logs: {
        Row: {
          action: string;
          company_id: string | null;
          created_at: string;
          device: string | null;
          id: string;
          ip: string | null;
          new_value: Json | null;
          old_value: Json | null;
          table_name: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          company_id?: string | null;
          created_at?: string;
          device?: string | null;
          id?: string;
          ip?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          table_name: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          company_id?: string | null;
          created_at?: string;
          device?: string | null;
          id?: string;
          ip?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          table_name?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "club_audit_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_audit_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_audit_logs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      club_benefits: {
        Row: {
          activation_rule: Json | null;
          benefit_type: string;
          benefit_value: number | null;
          created_at: string;
          description: string | null;
          expiration_rule: Json | null;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          activation_rule?: Json | null;
          benefit_type: string;
          benefit_value?: number | null;
          created_at?: string;
          description?: string | null;
          expiration_rule?: Json | null;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          activation_rule?: Json | null;
          benefit_type?: string;
          benefit_value?: number | null;
          created_at?: string;
          description?: string | null;
          expiration_rule?: Json | null;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      club_campaigns: {
        Row: {
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          reward: Json | null;
          rule: Json | null;
          start_date: string | null;
          status: string;
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          reward?: Json | null;
          rule?: Json | null;
          start_date?: string | null;
          status?: string;
          title: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          reward?: Json | null;
          rule?: Json | null;
          start_date?: string | null;
          status?: string;
          title?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      club_customer_achievements: {
        Row: {
          achievement_id: string;
          company_id: string;
          id: string;
          unlocked_at: string;
        };
        Insert: {
          achievement_id: string;
          company_id: string;
          id?: string;
          unlocked_at?: string;
        };
        Update: {
          achievement_id?: string;
          company_id?: string;
          id?: string;
          unlocked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_customer_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "club_achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_customer_achievements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_customer_achievements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_customer_achievements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      club_customer_status: {
        Row: {
          club_id: string;
          company_id: string;
          created_at: string;
          current_cycle: number;
          current_level: string | null;
          current_price: number | null;
          current_streak: number;
          goal_date: string | null;
          goal_reached: boolean;
          gold_cycles_total: number;
          hall_of_fame: boolean;
          id: string;
          legend: boolean;
          lifetime_orders: number;
          next_cycle_price: number | null;
          updated_at: string;
        };
        Insert: {
          club_id: string;
          company_id: string;
          created_at?: string;
          current_cycle?: number;
          current_level?: string | null;
          current_price?: number | null;
          current_streak?: number;
          goal_date?: string | null;
          goal_reached?: boolean;
          gold_cycles_total?: number;
          hall_of_fame?: boolean;
          id?: string;
          legend?: boolean;
          lifetime_orders?: number;
          next_cycle_price?: number | null;
          updated_at?: string;
        };
        Update: {
          club_id?: string;
          company_id?: string;
          created_at?: string;
          current_cycle?: number;
          current_level?: string | null;
          current_price?: number | null;
          current_streak?: number;
          goal_date?: string | null;
          goal_reached?: boolean;
          gold_cycles_total?: number;
          hall_of_fame?: boolean;
          id?: string;
          legend?: boolean;
          lifetime_orders?: number;
          next_cycle_price?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_customer_status_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_customer_status_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_customer_status_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_customer_status_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_customer_status_current_level_fkey";
            columns: ["current_level"];
            isOneToOne: false;
            referencedRelation: "club_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      club_cycles: {
        Row: {
          closed_at: string | null;
          club_id: string;
          company_id: string;
          created_at: string;
          cycle_number: number;
          ends_at: string;
          estimated_amount: number | null;
          final_amount: number | null;
          goal: number;
          goal_reached: boolean;
          id: string;
          next_cycle_price: number | null;
          orders: number;
          price_per_order: number;
          started_at: string;
          status: string;
        };
        Insert: {
          closed_at?: string | null;
          club_id: string;
          company_id: string;
          created_at?: string;
          cycle_number: number;
          ends_at: string;
          estimated_amount?: number | null;
          final_amount?: number | null;
          goal: number;
          goal_reached?: boolean;
          id?: string;
          next_cycle_price?: number | null;
          orders?: number;
          price_per_order: number;
          started_at: string;
          status?: string;
        };
        Update: {
          closed_at?: string | null;
          club_id?: string;
          company_id?: string;
          created_at?: string;
          cycle_number?: number;
          ends_at?: string;
          estimated_amount?: number | null;
          final_amount?: number | null;
          goal?: number;
          goal_reached?: boolean;
          id?: string;
          next_cycle_price?: number | null;
          orders?: number;
          price_per_order?: number;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_cycles_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_cycles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      club_history: {
        Row: {
          company_id: string;
          created_at: string;
          cycle_id: string | null;
          description: string | null;
          event_type: string;
          id: string;
          payload_json: Json | null;
          title: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          cycle_id?: string | null;
          description?: string | null;
          event_type: string;
          id?: string;
          payload_json?: Json | null;
          title: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          cycle_id?: string | null;
          description?: string | null;
          event_type?: string;
          id?: string;
          payload_json?: Json | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_history_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_history_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_history_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_history_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "club_cycles";
            referencedColumns: ["id"];
          },
        ];
      };
      club_levels: {
        Row: {
          benefit_id: string | null;
          club_id: string;
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          maximum_orders: number | null;
          minimum_orders: number;
          name: string;
          priority: number;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          benefit_id?: string | null;
          club_id: string;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          maximum_orders?: number | null;
          minimum_orders?: number;
          name: string;
          priority?: number;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          benefit_id?: string | null;
          club_id?: string;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          maximum_orders?: number | null;
          minimum_orders?: number;
          name?: string;
          priority?: number;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_levels_benefit_id_fkey";
            columns: ["benefit_id"];
            isOneToOne: false;
            referencedRelation: "club_benefits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_levels_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      club_notifications: {
        Row: {
          company_id: string;
          created_at: string;
          displayed: boolean;
          id: string;
          message: string;
          notification_type: string;
          read: boolean;
          title: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          displayed?: boolean;
          id?: string;
          message: string;
          notification_type: string;
          read?: boolean;
          title: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          displayed?: boolean;
          id?: string;
          message?: string;
          notification_type?: string;
          read?: boolean;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      club_rankings: {
        Row: {
          company_id: string;
          created_at: string;
          cycle: number;
          id: string;
          level: string | null;
          orders: number;
          position: number | null;
          score: number;
          streak: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          cycle: number;
          id?: string;
          level?: string | null;
          orders?: number;
          position?: number | null;
          score?: number;
          streak?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          level?: string | null;
          orders?: number;
          position?: number | null;
          score?: number;
          streak?: number;
        };
        Relationships: [
          {
            foreignKeyName: "club_rankings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_rankings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_rankings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_rankings_level_fkey";
            columns: ["level"];
            isOneToOne: false;
            referencedRelation: "club_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      club_settings: {
        Row: {
          challenge_days: number;
          club_id: string;
          default_price_per_order: number;
          enable_campaign: boolean;
          enable_hall_of_fame: boolean;
          enable_notifications: boolean;
          goal_orders: number;
          gold_price_per_order: number;
          id: string;
          legend_streak_required: number;
          updated_at: string;
          updated_by: string | null;
          voucher_months: number;
        };
        Insert: {
          challenge_days?: number;
          club_id: string;
          default_price_per_order?: number;
          enable_campaign?: boolean;
          enable_hall_of_fame?: boolean;
          enable_notifications?: boolean;
          goal_orders?: number;
          gold_price_per_order?: number;
          id?: string;
          legend_streak_required?: number;
          updated_at?: string;
          updated_by?: string | null;
          voucher_months?: number;
        };
        Update: {
          challenge_days?: number;
          club_id?: string;
          default_price_per_order?: number;
          enable_campaign?: boolean;
          enable_hall_of_fame?: boolean;
          enable_notifications?: boolean;
          goal_orders?: number;
          gold_price_per_order?: number;
          id?: string;
          legend_streak_required?: number;
          updated_at?: string;
          updated_by?: string | null;
          voucher_months?: number;
        };
        Relationships: [
          {
            foreignKeyName: "club_settings_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: true;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      club_vouchers: {
        Row: {
          company_id: string;
          expires_at: string | null;
          id: string;
          issued_at: string;
          months: number | null;
          status: string;
          used_at: string | null;
          voucher_type: string;
        };
        Insert: {
          company_id: string;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          months?: number | null;
          status?: string;
          used_at?: string | null;
          voucher_type: string;
        };
        Update: {
          company_id?: string;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          months?: number | null;
          status?: string;
          used_at?: string | null;
          voucher_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "club_vouchers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "club_vouchers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "club_vouchers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      clubs: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      combo_items: {
        Row: {
          combo_id: string;
          created_at: string | null;
          id: string;
          product_name: string;
          product_type: string | null;
          quantity: number | null;
        };
        Insert: {
          combo_id: string;
          created_at?: string | null;
          id?: string;
          product_name: string;
          product_type?: string | null;
          quantity?: number | null;
        };
        Update: {
          combo_id?: string;
          created_at?: string | null;
          id?: string;
          product_name?: string;
          product_type?: string | null;
          quantity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "combos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_combos";
            referencedColumns: ["id"];
          },
        ];
      };
      combos: {
        Row: {
          active: boolean | null;
          available_days: string[] | null;
          combo_price: number;
          created_at: string | null;
          description: string | null;
          end_time: string | null;
          external_id: string | null;
          external_source: string | null;
          highlight: boolean | null;
          id: string;
          image_url: string | null;
          last_synced_at: string | null;
          name: string;
          original_price: number;
          pizzeria_id: string;
          start_time: string | null;
          updated_at: string | null;
        };
        Insert: {
          active?: boolean | null;
          available_days?: string[] | null;
          combo_price?: number;
          created_at?: string | null;
          description?: string | null;
          end_time?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          highlight?: boolean | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name: string;
          original_price?: number;
          pizzeria_id: string;
          start_time?: string | null;
          updated_at?: string | null;
        };
        Update: {
          active?: boolean | null;
          available_days?: string[] | null;
          combo_price?: number;
          created_at?: string | null;
          description?: string | null;
          end_time?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          highlight?: boolean | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name?: string;
          original_price?: number;
          pizzeria_id?: string;
          start_time?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      external_order_logs: {
        Row: {
          api_key_partial: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          payload: Json | null;
          status_code: number | null;
        };
        Insert: {
          api_key_partial?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json | null;
          status_code?: number | null;
        };
        Update: {
          api_key_partial?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json | null;
          status_code?: number | null;
        };
        Relationships: [];
      };
      flycontrol_fiqon_logs: {
        Row: {
          created_at: string;
          error_message: string | null;
          fiqon_url: string | null;
          id: string;
          order_id: string | null;
          payload: Json | null;
          response_body: string | null;
          restaurant_id: string | null;
          status_http: number | null;
          success: boolean | null;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          fiqon_url?: string | null;
          id?: string;
          order_id?: string | null;
          payload?: Json | null;
          response_body?: string | null;
          restaurant_id?: string | null;
          status_http?: number | null;
          success?: boolean | null;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          fiqon_url?: string | null;
          id?: string;
          order_id?: string | null;
          payload?: Json | null;
          response_body?: string | null;
          restaurant_id?: string | null;
          status_http?: number | null;
          success?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "flycontrol_fiqon_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flycontrol_fiqon_logs_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flycontrol_fiqon_logs_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flycontrol_fiqon_logs_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_addresses: {
        Row: {
          cep: string | null;
          city: string | null;
          complement: string | null;
          created_at: string;
          id: string;
          is_default: boolean;
          label: string;
          latitude: number | null;
          longitude: number | null;
          neighborhood: string | null;
          number: string | null;
          reference: string | null;
          state: string | null;
          street: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cep?: string | null;
          city?: string | null;
          complement?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string;
          latitude?: number | null;
          longitude?: number | null;
          neighborhood?: string | null;
          number?: string | null;
          reference?: string | null;
          state?: string | null;
          street: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cep?: string | null;
          city?: string | null;
          complement?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string;
          latitude?: number | null;
          longitude?: number | null;
          neighborhood?: string | null;
          number?: string | null;
          reference?: string | null;
          state?: string | null;
          street?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      flydelivery_categories: {
        Row: {
          active: boolean;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      flydelivery_consents: {
        Row: {
          accepted: boolean;
          accepted_at: string;
          id: string;
          kind: string;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted?: boolean;
          accepted_at?: string;
          id?: string;
          kind: string;
          user_id: string;
          version?: string;
        };
        Update: {
          accepted?: boolean;
          accepted_at?: string;
          id?: string;
          kind?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [];
      };
      flydelivery_coupon_redemptions: {
        Row: {
          coupon_id: string;
          created_at: string;
          discount: number;
          id: string;
          order_id: string;
          user_id: string;
        };
        Insert: {
          coupon_id: string;
          created_at?: string;
          discount: number;
          id?: string;
          order_id: string;
          user_id: string;
        };
        Update: {
          coupon_id?: string;
          created_at?: string;
          discount?: number;
          id?: string;
          order_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_coupon_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_coupons: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          expires_at: string | null;
          first_order_only: boolean;
          id: string;
          max_discount: number | null;
          max_uses: number | null;
          max_uses_per_user: number;
          min_order_value: number;
          starts_at: string | null;
          store_id: string | null;
          updated_at: string;
          used_count: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          description?: string | null;
          discount_type: string;
          discount_value: number;
          expires_at?: string | null;
          first_order_only?: boolean;
          id?: string;
          max_discount?: number | null;
          max_uses?: number | null;
          max_uses_per_user?: number;
          min_order_value?: number;
          starts_at?: string | null;
          store_id?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          expires_at?: string | null;
          first_order_only?: boolean;
          id?: string;
          max_discount?: number | null;
          max_uses?: number | null;
          max_uses_per_user?: number;
          min_order_value?: number;
          starts_at?: string | null;
          store_id?: string | null;
          updated_at?: string;
          used_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_coupons_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_coupons_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_coupons_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_deletion_requests: {
        Row: {
          completed_at: string | null;
          email: string | null;
          id: string;
          requested_at: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          email?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          email?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      flydelivery_delivery_zones: {
        Row: {
          active: boolean;
          city: string | null;
          created_at: string;
          delivery_fee: number;
          estimated_minutes: number | null;
          id: string;
          min_order_value: number;
          name: string;
          neighborhood: string | null;
          radius_km: number | null;
          sort_order: number;
          store_id: string;
          updated_at: string;
          zone_type: string;
        };
        Insert: {
          active?: boolean;
          city?: string | null;
          created_at?: string;
          delivery_fee?: number;
          estimated_minutes?: number | null;
          id?: string;
          min_order_value?: number;
          name: string;
          neighborhood?: string | null;
          radius_km?: number | null;
          sort_order?: number;
          store_id: string;
          updated_at?: string;
          zone_type?: string;
        };
        Update: {
          active?: boolean;
          city?: string | null;
          created_at?: string;
          delivery_fee?: number;
          estimated_minutes?: number | null;
          id?: string;
          min_order_value?: number;
          name?: string;
          neighborhood?: string | null;
          radius_km?: number | null;
          sort_order?: number;
          store_id?: string;
          updated_at?: string;
          zone_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_delivery_zones_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_delivery_zones_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_delivery_zones_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: number;
          metadata: Json;
          product_id: string | null;
          session_id: string | null;
          store_id: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: number;
          metadata?: Json;
          product_id?: string | null;
          session_id?: string | null;
          store_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: number;
          metadata?: Json;
          product_id?: string | null;
          session_id?: string | null;
          store_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_favorites: {
        Row: {
          created_at: string;
          store_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          store_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          store_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_favorites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_favorites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_favorites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_placements: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          params: Json;
          rule: string;
          slug: string;
          sort_order: number;
          subtitle: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          params?: Json;
          rule: string;
          slug: string;
          sort_order?: number;
          subtitle?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          params?: Json;
          rule?: string;
          slug?: string;
          sort_order?: number;
          subtitle?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      flydelivery_push_tokens: {
        Row: {
          allow_marketing: boolean;
          allow_order_updates: boolean;
          created_at: string;
          id: string;
          last_seen_at: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Insert: {
          allow_marketing?: boolean;
          allow_order_updates?: boolean;
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          token: string;
          user_id: string;
        };
        Update: {
          allow_marketing?: boolean;
          allow_order_updates?: boolean;
          created_at?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      flydelivery_reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          delivery_rating: number | null;
          food_rating: number | null;
          id: string;
          moderation: string;
          order_id: string;
          rating: number;
          store_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          delivery_rating?: number | null;
          food_rating?: number | null;
          id?: string;
          moderation?: string;
          order_id: string;
          rating: number;
          store_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          delivery_rating?: number | null;
          food_rating?: number | null;
          id?: string;
          moderation?: string;
          order_id?: string;
          rating?: number;
          store_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_reviews_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_reviews_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_reviews_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_store_placements: {
        Row: {
          active: boolean;
          created_at: string;
          ends_at: string | null;
          id: string;
          placement_id: string;
          priority: number;
          starts_at: string | null;
          store_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          placement_id: string;
          priority?: number;
          starts_at?: string | null;
          store_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          placement_id?: string;
          priority?: number;
          starts_at?: string | null;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flydelivery_store_placements_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_store_placements_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flydelivery_store_placements_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "flydelivery_store_placements_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          invoice_id: string;
          item_type: string;
          metadata: Json;
          quantity: number;
          total_amount_cents: number;
          unit_amount_cents: number;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          invoice_id: string;
          item_type: string;
          metadata?: Json;
          quantity?: number;
          total_amount_cents: number;
          unit_amount_cents: number;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          invoice_id?: string;
          item_type?: string;
          metadata?: Json;
          quantity?: number;
          total_amount_cents?: number;
          unit_amount_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          billing_cycle_id: string;
          company_id: string;
          created_at: string;
          discount_cents: number;
          due_at: string | null;
          external_invoice_id: string | null;
          external_reference: string | null;
          id: string;
          invoice_number: string;
          paid_at: string | null;
          payment_provider: string;
          status: string;
          subscription_id: string;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          billing_cycle_id: string;
          company_id: string;
          created_at?: string;
          discount_cents?: number;
          due_at?: string | null;
          external_invoice_id?: string | null;
          external_reference?: string | null;
          id?: string;
          invoice_number: string;
          paid_at?: string | null;
          payment_provider?: string;
          status?: string;
          subscription_id: string;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Update: {
          billing_cycle_id?: string;
          company_id?: string;
          created_at?: string;
          discount_cents?: number;
          due_at?: string | null;
          external_invoice_id?: string | null;
          external_reference?: string | null;
          id?: string;
          invoice_number?: string;
          paid_at?: string | null;
          payment_provider?: string;
          status?: string;
          subscription_id?: string;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_billing_cycle_id_fkey";
            columns: ["billing_cycle_id"];
            isOneToOne: false;
            referencedRelation: "billing_cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_categories: {
        Row: {
          active: boolean | null;
          created_at: string | null;
          description: string | null;
          external_id: string | null;
          external_source: string | null;
          id: string;
          image_url: string | null;
          last_synced_at: string | null;
          name: string;
          order_index: number | null;
          pizzeria_id: string;
          updated_at: string | null;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name: string;
          order_index?: number | null;
          pizzeria_id: string;
          updated_at?: string | null;
        };
        Update: {
          active?: boolean | null;
          created_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name?: string;
          order_index?: number | null;
          pizzeria_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "menu_categories_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_categories_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "menu_categories_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_extras: {
        Row: {
          active: boolean | null;
          created_at: string | null;
          external_id: string | null;
          external_source: string | null;
          extra_type: string;
          id: string;
          last_synced_at: string | null;
          name: string;
          pizzeria_id: string;
          price: number;
          updated_at: string | null;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          extra_type: string;
          id?: string;
          last_synced_at?: string | null;
          name: string;
          pizzeria_id: string;
          price?: number;
          updated_at?: string | null;
        };
        Update: {
          active?: boolean | null;
          created_at?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          extra_type?: string;
          id?: string;
          last_synced_at?: string | null;
          name?: string;
          pizzeria_id?: string;
          price?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_products: {
        Row: {
          active: boolean | null;
          available: boolean | null;
          category_id: string | null;
          created_at: string | null;
          description: string | null;
          external_id: string | null;
          external_source: string | null;
          id: string;
          image_url: string | null;
          last_synced_at: string | null;
          name: string;
          pizzeria_id: string;
          price: number;
          product_type: string | null;
          updated_at: string | null;
        };
        Insert: {
          active?: boolean | null;
          available?: boolean | null;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name: string;
          pizzeria_id: string;
          price?: number;
          product_type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          active?: boolean | null;
          available?: boolean | null;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          external_id?: string | null;
          external_source?: string | null;
          id?: string;
          image_url?: string | null;
          last_synced_at?: string | null;
          name?: string;
          pizzeria_id?: string;
          price?: number;
          product_type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "menu_products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_drafts: {
        Row: {
          created_at: string;
          current_step: number;
          data: Json;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_step?: number;
          data?: Json;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_step?: number;
          data?: Json;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string | null;
          discount: number | null;
          id: string;
          observations: string | null;
          order_id: string;
          pizzeria_id: string | null;
          product_name: string;
          product_type: string | null;
          quantity: number;
          total_price: number | null;
          unit_price: number;
        };
        Insert: {
          created_at?: string | null;
          discount?: number | null;
          id?: string;
          observations?: string | null;
          order_id: string;
          pizzeria_id?: string | null;
          product_name: string;
          product_type?: string | null;
          quantity?: number;
          total_price?: number | null;
          unit_price: number;
        };
        Update: {
          created_at?: string | null;
          discount?: number | null;
          id?: string;
          observations?: string | null;
          order_id?: string;
          pizzeria_id?: string | null;
          product_name?: string;
          product_type?: string | null;
          quantity?: number;
          total_price?: number | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "order_items_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: string;
          id: string;
          note: string | null;
          order_id: string;
          source: string;
          tenant_id: string;
          to_status: string;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status: string;
          id?: string;
          note?: string | null;
          order_id: string;
          source?: string;
          tenant_id: string;
          to_status: string;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: string;
          id?: string;
          note?: string | null;
          order_id?: string;
          source?: string;
          tenant_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          change_for: number | null;
          created_at: string;
          customer_address: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          customer_reference: string | null;
          customer_token: string | null;
          delivery_fee: number;
          delivery_type: string | null;
          dining_session_id: string | null;
          discount: number | null;
          external_order_id: string | null;
          flydelivery_coupon_code: string | null;
          flydelivery_coupon_id: string | null;
          flydelivery_request_id: string | null;
          id: string;
          items: Json;
          neighborhood: string | null;
          notes: string | null;
          order_number: number;
          order_type: string | null;
          payment_method: string | null;
          payment_status: string | null;
          service_mode: string | null;
          source: string | null;
          status: string;
          subtotal: number | null;
          table_id: string | null;
          table_name: string | null;
          table_number: string | null;
          table_token: string | null;
          tenant_id: string;
          ticket_number: string | null;
          total: number;
          updated_at: string;
          waiter_id: string | null;
          whatsapp_message: string | null;
        };
        Insert: {
          change_for?: number | null;
          created_at?: string;
          customer_address?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          customer_reference?: string | null;
          customer_token?: string | null;
          delivery_fee?: number;
          delivery_type?: string | null;
          dining_session_id?: string | null;
          discount?: number | null;
          external_order_id?: string | null;
          flydelivery_coupon_code?: string | null;
          flydelivery_coupon_id?: string | null;
          flydelivery_request_id?: string | null;
          id?: string;
          items?: Json;
          neighborhood?: string | null;
          notes?: string | null;
          order_number?: number;
          order_type?: string | null;
          payment_method?: string | null;
          payment_status?: string | null;
          service_mode?: string | null;
          source?: string | null;
          status?: string;
          subtotal?: number | null;
          table_id?: string | null;
          table_name?: string | null;
          table_number?: string | null;
          table_token?: string | null;
          tenant_id: string;
          ticket_number?: string | null;
          total?: number;
          updated_at?: string;
          waiter_id?: string | null;
          whatsapp_message?: string | null;
        };
        Update: {
          change_for?: number | null;
          created_at?: string;
          customer_address?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          customer_reference?: string | null;
          customer_token?: string | null;
          delivery_fee?: number;
          delivery_type?: string | null;
          dining_session_id?: string | null;
          discount?: number | null;
          external_order_id?: string | null;
          flydelivery_coupon_code?: string | null;
          flydelivery_coupon_id?: string | null;
          flydelivery_request_id?: string | null;
          id?: string;
          items?: Json;
          neighborhood?: string | null;
          notes?: string | null;
          order_number?: number;
          order_type?: string | null;
          payment_method?: string | null;
          payment_status?: string | null;
          service_mode?: string | null;
          source?: string | null;
          status?: string;
          subtotal?: number | null;
          table_id?: string | null;
          table_name?: string | null;
          table_number?: string | null;
          table_token?: string | null;
          tenant_id?: string;
          ticket_number?: string | null;
          total?: number;
          updated_at?: string;
          waiter_id?: string | null;
          whatsapp_message?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_flydelivery_coupon_id_fkey";
            columns: ["flydelivery_coupon_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "restaurant_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_waiter_id_fkey";
            columns: ["waiter_id"];
            isOneToOne: false;
            referencedRelation: "waiters";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_intents: {
        Row: {
          amount_cents: number;
          approved_at: string | null;
          created_at: string;
          id: string;
          owner_id: string;
          plan_type: string;
          provider: string;
          status: string;
        };
        Insert: {
          amount_cents: number;
          approved_at?: string | null;
          created_at?: string;
          id?: string;
          owner_id: string;
          plan_type: string;
          provider?: string;
          status?: string;
        };
        Update: {
          amount_cents?: number;
          approved_at?: string | null;
          created_at?: string;
          id?: string;
          owner_id?: string;
          plan_type?: string;
          provider?: string;
          status?: string;
        };
        Relationships: [];
      };
      payment_transactions: {
        Row: {
          amount_cents: number;
          checkout_url: string | null;
          created_at: string;
          expires_at: string | null;
          external_transaction_id: string | null;
          id: string;
          invoice_id: string;
          paid_at: string | null;
          payment_method: string | null;
          pix_copy_paste: string | null;
          provider: string;
          qr_code_reference: string | null;
          raw_provider_status: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          checkout_url?: string | null;
          created_at?: string;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          invoice_id: string;
          paid_at?: string | null;
          payment_method?: string | null;
          pix_copy_paste?: string | null;
          provider?: string;
          qr_code_reference?: string | null;
          raw_provider_status?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          checkout_url?: string | null;
          created_at?: string;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          invoice_id?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          pix_copy_paste?: string | null;
          provider?: string;
          qr_code_reference?: string | null;
          raw_provider_status?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      pizzeria_pizza_sizes: {
        Row: {
          active: boolean | null;
          created_at: string;
          external_id: string | null;
          id: string;
          max_flavors: number;
          name: string;
          pizzeria_id: string;
          price: number;
          slices: number | null;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          max_flavors?: number;
          name: string;
          pizzeria_id: string;
          price?: number;
          slices?: number | null;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          max_flavors?: number;
          name?: string;
          pizzeria_id?: string;
          price?: number;
          slices?: number | null;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["pizzeria_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      pizzerias: {
        Row: {
          address: string | null;
          api_key: string;
          average_delivery_time: string | null;
          billing_model: string;
          business_type: string | null;
          button_color: string | null;
          cep: string | null;
          city: string | null;
          cnpj: string | null;
          complement: string | null;
          country: string | null;
          created_at: string;
          delivery_enabled: boolean;
          delivery_fee: number | null;
          delivery_radius_km: number | null;
          description: string | null;
          email: string | null;
          facebook_url: string | null;
          fiqon_enabled: boolean | null;
          fiqon_webhook_url: string | null;
          flydelivery_accept_orders: boolean;
          flydelivery_category: string | null;
          flydelivery_enabled: boolean;
          flydelivery_paused: boolean;
          flydelivery_paused_until: string | null;
          flydelivery_rating: number | null;
          flydelivery_rating_count: number;
          hero_image_url: string | null;
          hero_media_type: string;
          hero_video_url: string | null;
          id: string;
          instagram_url: string | null;
          internal_notes: string | null;
          is_active: boolean | null;
          is_open: boolean | null;
          latitude: number | null;
          logo_url: string | null;
          longitude: number | null;
          menu_sync_token: string | null;
          min_order_value: number;
          name: string;
          neighborhood: string | null;
          number: string | null;
          opening_hours: Json | null;
          owner_id: string | null;
          payment_methods: Json | null;
          phone: string | null;
          pickup_enabled: boolean;
          plan_type: string;
          primary_color: string | null;
          print_auto: boolean;
          provision_error: string | null;
          provision_status: string | null;
          provisioned_at: string | null;
          public_url: string | null;
          razao_social: string | null;
          secondary_color: string | null;
          selected_template: string;
          service_fee_percent: number;
          sf_restaurant_id: string | null;
          short_message: string | null;
          show_item_images: boolean;
          site_settings: Json;
          slug: string;
          sound_enabled: boolean;
          state: string | null;
          status: string;
          status_art_entregue_url: string | null;
          status_art_preparando_url: string | null;
          status_art_saiu_url: string | null;
          status_text_entregue: string | null;
          status_text_preparando: string | null;
          status_text_saiu: string | null;
          street: string | null;
          subscription_expires_at: string | null;
          subscription_plan: string | null;
          subscription_price: number | null;
          subscription_status: string | null;
          sync_endpoint: string | null;
          table_enabled: boolean;
          tagline: string | null;
          theme_mode: string;
          updated_at: string;
          waiter_commission_percent: number;
          website_url: string | null;
          welcome_seen: boolean;
          whatsapp: string | null;
          whatsapp_display: string | null;
        };
        Insert: {
          address?: string | null;
          api_key: string;
          average_delivery_time?: string | null;
          billing_model?: string;
          business_type?: string | null;
          button_color?: string | null;
          cep?: string | null;
          city?: string | null;
          cnpj?: string | null;
          complement?: string | null;
          country?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number | null;
          delivery_radius_km?: number | null;
          description?: string | null;
          email?: string | null;
          facebook_url?: string | null;
          fiqon_enabled?: boolean | null;
          fiqon_webhook_url?: string | null;
          flydelivery_accept_orders?: boolean;
          flydelivery_category?: string | null;
          flydelivery_enabled?: boolean;
          flydelivery_paused?: boolean;
          flydelivery_paused_until?: string | null;
          flydelivery_rating?: number | null;
          flydelivery_rating_count?: number;
          hero_image_url?: string | null;
          hero_media_type?: string;
          hero_video_url?: string | null;
          id?: string;
          instagram_url?: string | null;
          internal_notes?: string | null;
          is_active?: boolean | null;
          is_open?: boolean | null;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          menu_sync_token?: string | null;
          min_order_value?: number;
          name: string;
          neighborhood?: string | null;
          number?: string | null;
          opening_hours?: Json | null;
          owner_id?: string | null;
          payment_methods?: Json | null;
          phone?: string | null;
          pickup_enabled?: boolean;
          plan_type?: string;
          primary_color?: string | null;
          print_auto?: boolean;
          provision_error?: string | null;
          provision_status?: string | null;
          provisioned_at?: string | null;
          public_url?: string | null;
          razao_social?: string | null;
          secondary_color?: string | null;
          selected_template?: string;
          service_fee_percent?: number;
          sf_restaurant_id?: string | null;
          short_message?: string | null;
          show_item_images?: boolean;
          site_settings?: Json;
          slug: string;
          sound_enabled?: boolean;
          state?: string | null;
          status?: string;
          status_art_entregue_url?: string | null;
          status_art_preparando_url?: string | null;
          status_art_saiu_url?: string | null;
          status_text_entregue?: string | null;
          status_text_preparando?: string | null;
          status_text_saiu?: string | null;
          street?: string | null;
          subscription_expires_at?: string | null;
          subscription_plan?: string | null;
          subscription_price?: number | null;
          subscription_status?: string | null;
          sync_endpoint?: string | null;
          table_enabled?: boolean;
          tagline?: string | null;
          theme_mode?: string;
          updated_at?: string;
          waiter_commission_percent?: number;
          website_url?: string | null;
          welcome_seen?: boolean;
          whatsapp?: string | null;
          whatsapp_display?: string | null;
        };
        Update: {
          address?: string | null;
          api_key?: string;
          average_delivery_time?: string | null;
          billing_model?: string;
          business_type?: string | null;
          button_color?: string | null;
          cep?: string | null;
          city?: string | null;
          cnpj?: string | null;
          complement?: string | null;
          country?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number | null;
          delivery_radius_km?: number | null;
          description?: string | null;
          email?: string | null;
          facebook_url?: string | null;
          fiqon_enabled?: boolean | null;
          fiqon_webhook_url?: string | null;
          flydelivery_accept_orders?: boolean;
          flydelivery_category?: string | null;
          flydelivery_enabled?: boolean;
          flydelivery_paused?: boolean;
          flydelivery_paused_until?: string | null;
          flydelivery_rating?: number | null;
          flydelivery_rating_count?: number;
          hero_image_url?: string | null;
          hero_media_type?: string;
          hero_video_url?: string | null;
          id?: string;
          instagram_url?: string | null;
          internal_notes?: string | null;
          is_active?: boolean | null;
          is_open?: boolean | null;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          menu_sync_token?: string | null;
          min_order_value?: number;
          name?: string;
          neighborhood?: string | null;
          number?: string | null;
          opening_hours?: Json | null;
          owner_id?: string | null;
          payment_methods?: Json | null;
          phone?: string | null;
          pickup_enabled?: boolean;
          plan_type?: string;
          primary_color?: string | null;
          print_auto?: boolean;
          provision_error?: string | null;
          provision_status?: string | null;
          provisioned_at?: string | null;
          public_url?: string | null;
          razao_social?: string | null;
          secondary_color?: string | null;
          selected_template?: string;
          service_fee_percent?: number;
          sf_restaurant_id?: string | null;
          short_message?: string | null;
          show_item_images?: boolean;
          site_settings?: Json;
          slug?: string;
          sound_enabled?: boolean;
          state?: string | null;
          status?: string;
          status_art_entregue_url?: string | null;
          status_art_preparando_url?: string | null;
          status_art_saiu_url?: string | null;
          status_text_entregue?: string | null;
          status_text_preparando?: string | null;
          status_text_saiu?: string | null;
          street?: string | null;
          subscription_expires_at?: string | null;
          subscription_plan?: string | null;
          subscription_price?: number | null;
          subscription_status?: string | null;
          sync_endpoint?: string | null;
          table_enabled?: boolean;
          tagline?: string | null;
          theme_mode?: string;
          updated_at?: string;
          waiter_commission_percent?: number;
          website_url?: string | null;
          welcome_seen?: boolean;
          whatsapp?: string | null;
          whatsapp_display?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pizzerias_flydelivery_category_fkey";
            columns: ["flydelivery_category"];
            isOneToOne: false;
            referencedRelation: "flydelivery_categories";
            referencedColumns: ["slug"];
          },
        ];
      };
      plan_features: {
        Row: {
          created_at: string;
          feature_key: string;
          id: string;
          is_enabled: boolean;
          limit_value: number | null;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          feature_key: string;
          id?: string;
          is_enabled?: boolean;
          limit_value?: number | null;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          feature_key?: string;
          id?: string;
          is_enabled?: boolean;
          limit_value?: number | null;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_price_versions: {
        Row: {
          change_reason: string | null;
          created_at: string;
          created_by: string | null;
          default_order_unit_price_cents: number;
          effective_from: string;
          effective_until: string | null;
          id: string;
          is_active: boolean;
          monthly_fee_cents: number;
          plan_id: string;
          promotion_threshold_orders: number;
          promotional_order_unit_price_cents: number;
          setup_fee_cents: number;
          version: number;
        };
        Insert: {
          change_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_order_unit_price_cents?: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          is_active?: boolean;
          monthly_fee_cents?: number;
          plan_id: string;
          promotion_threshold_orders?: number;
          promotional_order_unit_price_cents?: number;
          setup_fee_cents?: number;
          version: number;
        };
        Update: {
          change_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_order_unit_price_cents?: number;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          is_active?: boolean;
          monthly_fee_cents?: number;
          plan_id?: string;
          promotion_threshold_orders?: number;
          promotional_order_unit_price_cents?: number;
          setup_fee_cents?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_price_versions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          billing_model: string;
          code: string;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_public: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          billing_model: string;
          code: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_public?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          billing_model?: string;
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_public?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          full_name: string | null;
          id: string;
          is_admin: boolean | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id: string;
          is_admin?: boolean | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string | null;
          id?: string;
          is_admin?: boolean | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      restaurant_tables: {
        Row: {
          created_at: string;
          default_waiter_id: string | null;
          id: string;
          is_active: boolean;
          public_token: string;
          qr_code_url: string | null;
          restaurant_id: string | null;
          table_name: string | null;
          table_number: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_waiter_id?: string | null;
          id?: string;
          is_active?: boolean;
          public_token?: string;
          qr_code_url?: string | null;
          restaurant_id?: string | null;
          table_name?: string | null;
          table_number: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_waiter_id?: string | null;
          id?: string;
          is_active?: boolean;
          public_token?: string;
          qr_code_url?: string | null;
          restaurant_id?: string | null;
          table_name?: string | null;
          table_number?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_default_waiter_id_fkey";
            columns: ["default_waiter_id"];
            isOneToOne: false;
            referencedRelation: "waiters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_events: {
        Row: {
          company_id: string;
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          new_status: string | null;
          performed_by: string | null;
          previous_status: string | null;
          reason: string | null;
          subscription_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          new_status?: string | null;
          performed_by?: string | null;
          previous_status?: string | null;
          reason?: string | null;
          subscription_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          new_status?: string | null;
          performed_by?: string | null;
          previous_status?: string | null;
          reason?: string | null;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "subscription_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          activated_at: string | null;
          billing_anchor_day: number | null;
          billing_model: string;
          canceled_at: string | null;
          company_id: string;
          created_at: string;
          current_cycle_id: string | null;
          external_customer_id: string | null;
          external_subscription_id: string | null;
          id: string;
          payment_provider: string;
          plan_id: string;
          plan_price_version_id: string;
          status: string;
          suspended_at: string | null;
          timezone: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          billing_anchor_day?: number | null;
          billing_model: string;
          canceled_at?: string | null;
          company_id: string;
          created_at?: string;
          current_cycle_id?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          payment_provider?: string;
          plan_id: string;
          plan_price_version_id: string;
          status?: string;
          suspended_at?: string | null;
          timezone?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          billing_anchor_day?: number | null;
          billing_model?: string;
          canceled_at?: string | null;
          company_id?: string;
          created_at?: string;
          current_cycle_id?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          payment_provider?: string;
          plan_id?: string;
          plan_price_version_id?: string;
          status?: string;
          suspended_at?: string | null;
          timezone?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_current_cycle_fkey";
            columns: ["current_cycle_id"];
            isOneToOne: false;
            referencedRelation: "billing_cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_price_version_id_fkey";
            columns: ["plan_price_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_price_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      table_close_requests: {
        Row: {
          created_at: string;
          customer_name: string | null;
          customer_token: string | null;
          dining_session_id: string | null;
          id: string;
          processed_at: string | null;
          processed_by: string | null;
          requested_at: string;
          restaurant_id: string;
          session_id: string | null;
          status: string;
          table_id: string | null;
          table_number: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_name?: string | null;
          customer_token?: string | null;
          dining_session_id?: string | null;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          requested_at?: string;
          restaurant_id: string;
          session_id?: string | null;
          status?: string;
          table_id?: string | null;
          table_number: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_name?: string | null;
          customer_token?: string | null;
          dining_session_id?: string | null;
          id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          requested_at?: string;
          restaurant_id?: string;
          session_id?: string | null;
          status?: string;
          table_id?: string | null;
          table_number?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      table_session_orders: {
        Row: {
          created_at: string | null;
          id: string;
          order_id: string;
          table_session_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          order_id: string;
          table_session_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          order_id?: string;
          table_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_session_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_session_orders_table_session_id_fkey";
            columns: ["table_session_id"];
            isOneToOne: false;
            referencedRelation: "table_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      table_sessions: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          closure_reason: string | null;
          created_at: string | null;
          customer_name: string | null;
          customer_token: string;
          dining_session_id: string;
          id: string;
          opened_at: string | null;
          restaurant_id: string;
          service_fee_amount: number | null;
          service_fee_enabled: boolean | null;
          service_fee_percent: number | null;
          status: string;
          subtotal_amount: number | null;
          table_id: string | null;
          table_name: string | null;
          table_number: string;
          total_amount: number | null;
          updated_at: string | null;
          waiter_commission_amount: number | null;
          waiter_commission_percent: number | null;
          waiter_id: string | null;
          webhook_sent_at: string | null;
        };
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          closure_reason?: string | null;
          created_at?: string | null;
          customer_name?: string | null;
          customer_token?: string;
          dining_session_id?: string;
          id?: string;
          opened_at?: string | null;
          restaurant_id: string;
          service_fee_amount?: number | null;
          service_fee_enabled?: boolean | null;
          service_fee_percent?: number | null;
          status?: string;
          subtotal_amount?: number | null;
          table_id?: string | null;
          table_name?: string | null;
          table_number: string;
          total_amount?: number | null;
          updated_at?: string | null;
          waiter_commission_amount?: number | null;
          waiter_commission_percent?: number | null;
          waiter_id?: string | null;
          webhook_sent_at?: string | null;
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          closure_reason?: string | null;
          created_at?: string | null;
          customer_name?: string | null;
          customer_token?: string;
          dining_session_id?: string;
          id?: string;
          opened_at?: string | null;
          restaurant_id?: string;
          service_fee_amount?: number | null;
          service_fee_enabled?: boolean | null;
          service_fee_percent?: number | null;
          status?: string;
          subtotal_amount?: number | null;
          table_id?: string | null;
          table_name?: string | null;
          table_number?: string;
          total_amount?: number | null;
          updated_at?: string | null;
          waiter_commission_amount?: number | null;
          waiter_commission_percent?: number | null;
          waiter_id?: string | null;
          webhook_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "table_sessions_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "restaurant_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "table_sessions_waiter_id_fkey";
            columns: ["waiter_id"];
            isOneToOne: false;
            referencedRelation: "waiters";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_events: {
        Row: {
          billing_cycle_id: string;
          company_id: string;
          created_at: string;
          event_type: string;
          id: string;
          idempotency_key: string;
          metadata: Json;
          occurred_at: string;
          order_id: string | null;
          quantity: number;
          subscription_id: string;
          unit_price_cents: number;
        };
        Insert: {
          billing_cycle_id: string;
          company_id: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          idempotency_key: string;
          metadata?: Json;
          occurred_at?: string;
          order_id?: string | null;
          quantity?: number;
          subscription_id: string;
          unit_price_cents: number;
        };
        Update: {
          billing_cycle_id?: string;
          company_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          idempotency_key?: string;
          metadata?: Json;
          occurred_at?: string;
          order_id?: string | null;
          quantity?: number;
          subscription_id?: string;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "usage_events_billing_cycle_id_fkey";
            columns: ["billing_cycle_id"];
            isOneToOne: false;
            referencedRelation: "billing_cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "usage_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      waiters: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          password_hash: string;
          phone: string | null;
          tenant_id: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          password_hash: string;
          phone?: string | null;
          tenant_id: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          password_hash?: string;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waiters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waiters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "waiters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      admin_global_financial_metrics: {
        Row: {
          ticket_avg_month: number | null;
          total_orders_day: number | null;
          total_orders_month: number | null;
          total_orders_week: number | null;
          total_revenue_day: number | null;
          total_revenue_month: number | null;
          total_revenue_week: number | null;
        };
        Relationships: [];
      };
      flydelivery_combos: {
        Row: {
          available_days: string[] | null;
          combo_price: number | null;
          description: string | null;
          end_time: string | null;
          highlight: boolean | null;
          id: string | null;
          image_url: string | null;
          items: Json | null;
          name: string | null;
          original_price: number | null;
          start_time: string | null;
          store_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "combos_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_extras: {
        Row: {
          extra_type: string | null;
          id: string | null;
          name: string | null;
          price: number | null;
          store_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "menu_extras_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_products: {
        Row: {
          available: boolean | null;
          category_id: string | null;
          category_name: string | null;
          category_order: number | null;
          description: string | null;
          id: string | null;
          image_url: string | null;
          name: string | null;
          price: number | null;
          product_type: string | null;
          store_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "menu_products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "menu_products_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_sizes: {
        Row: {
          id: string | null;
          max_flavors: number | null;
          name: string | null;
          price: number | null;
          slices: number | null;
          sort_order: number | null;
          store_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "flydelivery_stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzeria_financial_metrics";
            referencedColumns: ["pizzeria_id"];
          },
          {
            foreignKeyName: "pizzeria_pizza_sizes_pizzeria_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "pizzerias";
            referencedColumns: ["id"];
          },
        ];
      };
      flydelivery_stores: {
        Row: {
          accepts_orders: boolean | null;
          average_delivery_time: string | null;
          category_slug: string | null;
          cep: string | null;
          city: string | null;
          created_at: string | null;
          delivery_enabled: boolean | null;
          delivery_fee: number | null;
          delivery_radius_km: number | null;
          description: string | null;
          hero_image_url: string | null;
          id: string | null;
          latitude: number | null;
          logo_url: string | null;
          longitude: number | null;
          min_order_value: number | null;
          name: string | null;
          neighborhood: string | null;
          number: string | null;
          opening_hours_text: string | null;
          payment_methods: Json | null;
          phone: string | null;
          pickup_enabled: boolean | null;
          primary_color: string | null;
          rating: number | null;
          rating_count: number | null;
          slug: string | null;
          state: string | null;
          store_status: string | null;
          street: string | null;
          tagline: string | null;
          whatsapp_display: string | null;
        };
        Insert: {
          accepts_orders?: boolean | null;
          average_delivery_time?: string | null;
          category_slug?: never;
          cep?: string | null;
          city?: string | null;
          created_at?: string | null;
          delivery_enabled?: boolean | null;
          delivery_fee?: number | null;
          delivery_radius_km?: number | null;
          description?: string | null;
          hero_image_url?: string | null;
          id?: string | null;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          min_order_value?: number | null;
          name?: string | null;
          neighborhood?: string | null;
          number?: string | null;
          opening_hours_text?: never;
          payment_methods?: never;
          phone?: string | null;
          pickup_enabled?: boolean | null;
          primary_color?: string | null;
          rating?: number | null;
          rating_count?: number | null;
          slug?: string | null;
          state?: string | null;
          store_status?: never;
          street?: string | null;
          tagline?: string | null;
          whatsapp_display?: string | null;
        };
        Update: {
          accepts_orders?: boolean | null;
          average_delivery_time?: string | null;
          category_slug?: never;
          cep?: string | null;
          city?: string | null;
          created_at?: string | null;
          delivery_enabled?: boolean | null;
          delivery_fee?: number | null;
          delivery_radius_km?: number | null;
          description?: string | null;
          hero_image_url?: string | null;
          id?: string | null;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          min_order_value?: number | null;
          name?: string | null;
          neighborhood?: string | null;
          number?: string | null;
          opening_hours_text?: never;
          payment_methods?: never;
          phone?: string | null;
          pickup_enabled?: boolean | null;
          primary_color?: string | null;
          rating?: number | null;
          rating_count?: number | null;
          slug?: string | null;
          state?: string | null;
          store_status?: never;
          street?: string | null;
          tagline?: string | null;
          whatsapp_display?: string | null;
        };
        Relationships: [];
      };
      pizzeria_financial_metrics: {
        Row: {
          last_order_at: string | null;
          orders_day: number | null;
          orders_month: number | null;
          orders_week: number | null;
          owner_id: string | null;
          pizzeria_id: string | null;
          pizzeria_name: string | null;
          revenue_day: number | null;
          revenue_month: number | null;
          revenue_week: number | null;
          status: string | null;
          ticket_avg_day: number | null;
          ticket_avg_month: number | null;
          ticket_avg_week: number | null;
        };
        Relationships: [];
      };
      subscription_setup_fee_charged: {
        Row: {
          charged_at: string | null;
          subscription_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      billing_cycle_true_count: {
        Args: { p_cycle_id: string };
        Returns: number;
      };
      club_check_achievements: {
        Args: { p_club_id: string; p_company_id: string };
        Returns: undefined;
      };
      club_close_cycle: { Args: { p_cycle_id: string }; Returns: undefined };
      club_close_due_cycles: { Args: never; Returns: number };
      club_get_hall_of_fame: {
        Args: { p_club_id?: string; p_limit?: number };
        Returns: {
          company_name: string;
          company_slug: string;
          legend: boolean;
          level_color: string;
          level_icon: string;
          level_name: string;
          lifetime_orders: number;
          streak: number;
        }[];
      };
      club_get_or_create_active_cycle: {
        Args: { p_club_id?: string; p_company_id: string };
        Returns: string;
      };
      club_is_challenge_active: {
        Args: { p_cycle_id: string };
        Returns: boolean;
      };
      club_recalculate_level: {
        Args: { p_club_id: string; p_company_id: string };
        Returns: undefined;
      };
      club_resolve_price: {
        Args: { p_club_id?: string; p_company_id: string };
        Returns: {
          price: number;
          source: string;
        }[];
      };
      enroll_company_in_cents: {
        Args: { p_club_id?: string; p_company_id: string };
        Returns: undefined;
      };
      expire_stale_checkout_intents: { Args: never; Returns: number };
      fly_unaccent: { Args: { txt: string }; Returns: string };
      flydelivery_bump_coupon_use: {
        Args: { p_coupon_id: string };
        Returns: undefined;
      };
      flydelivery_infer_category: {
        Args: { store_name: string };
        Returns: string;
      };
      flydelivery_nearby_stores: {
        Args: {
          max_results?: number;
          radius_km?: number;
          user_lat?: number;
          user_lng?: number;
        };
        Returns: {
          average_delivery_time: string;
          category_slug: string;
          city: string;
          delivery_fee: number;
          distance_km: number;
          hero_image_url: string;
          id: string;
          logo_url: string;
          min_order_value: number;
          name: string;
          neighborhood: string;
          rating: number;
          rating_count: number;
          slug: string;
          store_status: string;
        }[];
      };
      flydelivery_resolve_zone: {
        Args: {
          p_distance_km?: number;
          p_neighborhood?: string;
          p_store_id: string;
        };
        Returns: {
          delivery_fee: number;
          estimated_minutes: number;
          min_order_value: number;
          serves: boolean;
          zone_id: string;
          zone_name: string;
        }[];
      };
      flydelivery_search_stores: {
        Args: {
          max_results?: number;
          term: string;
          user_lat?: number;
          user_lng?: number;
        };
        Returns: {
          average_delivery_time: string;
          category_slug: string;
          city: string;
          delivery_fee: number;
          distance_km: number;
          hero_image_url: string;
          id: string;
          logo_url: string;
          matched_products: string[];
          min_order_value: number;
          name: string;
          neighborhood: string;
          rating: number;
          rating_count: number;
          slug: string;
          store_status: string;
        }[];
      };
      flydelivery_store_analytics: {
        Args: { p_from?: string; p_store_id: string; p_to?: string };
        Returns: {
          add_to_carts: number;
          avg_ticket: number;
          checkout_starts: number;
          day: string;
          orders_count: number;
          product_views: number;
          revenue: number;
          store_views: number;
        }[];
      };
      flydelivery_store_customers: {
        Args: { p_from?: string; p_store_id: string; p_to?: string };
        Returns: {
          new_customers: number;
          returning_customers: number;
        }[];
      };
      flydelivery_store_top_products: {
        Args: {
          p_from?: string;
          p_limit?: number;
          p_store_id: string;
          p_to?: string;
        };
        Returns: {
          product_name: string;
          quantity: number;
          revenue: number;
        }[];
      };
      generate_default_restaurant_tables: {
        Args: { p_restaurant_id: string };
        Returns: undefined;
      };
      get_admin_global_metrics: {
        Args: never;
        Returns: {
          ticket_avg_month: number | null;
          total_orders_day: number | null;
          total_orders_month: number | null;
          total_orders_week: number | null;
          total_revenue_day: number | null;
          total_revenue_month: number | null;
          total_revenue_week: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "admin_global_financial_metrics";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_dashboard_period_metrics: {
        Args: {
          p_end_date: string;
          p_pizzeria_id?: string;
          p_start_date: string;
        };
        Returns: {
          orders_count: number;
          pizzeria_id: string;
          pizzeria_name: string;
          revenue: number;
          ticket_avg: number;
        }[];
      };
      get_my_financial_metrics: {
        Args: never;
        Returns: {
          last_order_at: string | null;
          orders_day: number | null;
          orders_month: number | null;
          orders_week: number | null;
          owner_id: string | null;
          pizzeria_id: string | null;
          pizzeria_name: string | null;
          revenue_day: number | null;
          revenue_month: number | null;
          revenue_week: number | null;
          status: string | null;
          ticket_avg_day: number | null;
          ticket_avg_month: number | null;
          ticket_avg_week: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "pizzeria_financial_metrics";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_period_metrics: {
        Args: { p_end_date: string; p_start_date: string };
        Returns: {
          last_order_at: string;
          orders_count: number;
          owner_id: string;
          pizzeria_id: string;
          pizzeria_name: string;
          revenue: number;
          status: string;
          ticket_avg: number;
        }[];
      };
      get_pizzeria_financial_summary: {
        Args: { p_pizzeria_id: string };
        Returns: {
          best_day_date: string;
          best_day_revenue: number;
          last_order_at: string;
          orders_month: number;
          pizzeria_name: string;
          revenue_month: number;
        }[];
      };
      get_pizzerias_ranking: {
        Args: { p_limit?: number };
        Returns: {
          orders_day: number;
          orders_month: number;
          pizzeria_name: string;
          revenue_day: number;
          revenue_month: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin:
        { Args: never; Returns: boolean } | { Args: { p_user_id: string }; Returns: boolean };
      is_billable_order_status: { Args: { p_status: string }; Returns: boolean };
      is_customer: { Args: { p_user_id?: string }; Returns: boolean };
      is_ghost_order: {
        Args: { p_customer_name: string; p_items: Json; p_total: number };
        Returns: boolean;
      };
      open_billing_cycle: {
        Args: {
          p_cycle_start?: string;
          p_qualified_from_previous?: boolean;
          p_subscription_id: string;
          p_unit_price_cents?: number;
        };
        Returns: string;
      };
      owns_pizzeria: {
        Args: { _pizzeria_id: string; _user_id: string };
        Returns: boolean;
      };
      pode_ver_loja: { Args: { p_store_id: string }; Returns: boolean };
      tem_permissao: { Args: { p_permissao: string }; Returns: boolean };
      recalculate_table_session_totals: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      sync_order_to_table_session_logic: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "super_admin" | "owner" | "customer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "owner", "customer"],
    },
  },
} as const;
