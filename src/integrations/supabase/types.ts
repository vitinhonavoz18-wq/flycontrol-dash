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
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          price: number
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          price: number
          product_name: string
          quantity?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          price?: number
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          external_order_id: string | null
          id: string
          items: Json
          neighborhood: string | null
          notes: string | null
          order_number: number
          payment_method: string | null
          source: string | null
          status: string
          subtotal: number | null
          tenant_id: string
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
          external_order_id?: string | null
          id?: string
          items?: Json
          neighborhood?: string | null
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number | null
          tenant_id: string
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
          external_order_id?: string | null
          id?: string
          items?: Json
          neighborhood?: string | null
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number | null
          tenant_id?: string
          total?: number
          updated_at?: string
          whatsapp_message?: string | null
        }
        Relationships: [
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
      pizzerias: {
        Row: {
          address: string | null
          api_key: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          phone: string | null
          primary_color: string | null
          print_auto: boolean
          slug: string
          sound_enabled: boolean
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          api_key: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          primary_color?: string | null
          print_auto?: boolean
          slug: string
          sound_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          api_key?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          primary_color?: string | null
          print_auto?: boolean
          slug?: string
          sound_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          phone?: string | null
          updated_at?: string
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
    }
    Views: {
      admin_global_financial_metrics: {
        Row: {
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
          orders_day: number | null
          orders_month: number | null
          orders_week: number | null
          owner_id: string | null
          pizzeria_id: string | null
          pizzeria_name: string | null
          revenue_day: number | null
          revenue_month: number | null
          revenue_week: number | null
          ticket_avg_day: number | null
          ticket_avg_month: number | null
          ticket_avg_week: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_admin_global_metrics: {
        Args: never
        Returns: {
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
      get_my_financial_metrics: {
        Args: never
        Returns: {
          orders_day: number | null
          orders_month: number | null
          orders_week: number | null
          owner_id: string | null
          pizzeria_id: string | null
          pizzeria_name: string | null
          revenue_day: number | null
          revenue_month: number | null
          revenue_week: number | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
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
