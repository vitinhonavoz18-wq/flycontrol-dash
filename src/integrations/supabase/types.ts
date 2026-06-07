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
          delivery_fee: number
          delivery_type: string | null
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
          whatsapp_message: string | null
        }
        Insert: {
          change_for?: number | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          customer_reference?: string | null
          delivery_fee?: number
          delivery_type?: string | null
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
          whatsapp_message?: string | null
        }
        Update: {
          change_for?: number | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          customer_reference?: string | null
          delivery_fee?: number
          delivery_type?: string | null
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
          name: string
          neighborhood: string | null
          opening_hours: Json | null
          owner_id: string | null
          payment_methods: Json | null
          phone: string | null
          primary_color: string | null
          print_auto: boolean
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
        }
        Insert: {
          address?: string | null
          api_key: string
          average_delivery_time?: string | null
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
          name: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          payment_methods?: Json | null
          phone?: string | null
          primary_color?: string | null
          print_auto?: boolean
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
        }
        Update: {
          address?: string | null
          api_key?: string
          average_delivery_time?: string | null
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
          name?: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id?: string | null
          payment_methods?: Json | null
          phone?: string | null
          primary_color?: string | null
          print_auto?: boolean
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
            isOneToOne: false
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
          created_at: string | null
          customer_name: string | null
          id: string
          opened_at: string | null
          restaurant_id: string
          status: string
          table_id: string | null
          table_name: string | null
          table_number: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          id?: string
          opened_at?: string | null
          restaurant_id: string
          status?: string
          table_id?: string | null
          table_name?: string | null
          table_number: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          id?: string
          opened_at?: string | null
          restaurant_id?: string
          status?: string
          table_id?: string | null
          table_name?: string | null
          table_number?: string
          total_amount?: number | null
          updated_at?: string | null
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
  public: {
    Enums: {
      app_role: ["super_admin", "owner"],
    },
  },
} as const
