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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          balance_remaining: number | null
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          vendor_id: string | null
        }
        Insert: {
          balance_remaining?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_amount?: number
          item_cost_description?: string | null
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["ap_status"]
          vendor_id?: string | null
        }
        Update: {
          balance_remaining?: number | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_amount?: number
          item_cost_description?: string | null
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["ap_status"]
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_no: string
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_no: string
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          remaining_amount?: number | null
          status?: Database["public"]["Enums"]["ar_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_no?: string
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          remaining_amount?: number | null
          status?: Database["public"]["Enums"]["ar_status"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          buying_price_est: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          id: string
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          selling_price: number
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          volume_weight: string | null
        }
        Insert: {
          buying_price_est?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          id?: string
          job_sheet_no: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
          selling_price?: number
          service_type?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          unit_type?: string | null
          volume_weight?: string | null
        }
        Update: {
          buying_price_est?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          id?: string
          job_sheet_no?: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
          selling_price?: number
          service_type?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          unit_type?: string | null
          volume_weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["reference_type"]
          transaction_date?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      subcontractors_vendors: {
        Row: {
          contact_person: string | null
          created_at: string
          id: string
          phone: string | null
          service_type: string | null
          vendor_name: string
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          service_type?: string | null
          vendor_name: string
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          service_type?: string | null
          vendor_name?: string
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ap_status: "Unpaid" | "Partially Paid" | "Paid"
      app_role: "admin" | "finance" | "operations"
      ar_status: "Draft" | "Issued" | "Partially Paid" | "Paid" | "Overdue"
      job_status: "Draft" | "In Progress" | "Completed" | "Cancelled"
      payment_method: "Bank Transfer" | "Cash" | "Giro"
      payment_type: "Term" | "Cash"
      reference_type: "AR_RECEIPT" | "AP_PAYMENT" | "OPERATIONAL_EXPENSE"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      ap_status: ["Unpaid", "Partially Paid", "Paid"],
      app_role: ["admin", "finance", "operations"],
      ar_status: ["Draft", "Issued", "Partially Paid", "Paid", "Overdue"],
      job_status: ["Draft", "In Progress", "Completed", "Cancelled"],
      payment_method: ["Bank Transfer", "Cash", "Giro"],
      payment_type: ["Term", "Cash"],
      reference_type: ["AR_RECEIPT", "AP_PAYMENT", "OPERATIONAL_EXPENSE"],
    },
  },
} as const
