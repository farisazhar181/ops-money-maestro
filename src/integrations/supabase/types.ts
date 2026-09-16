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
      accounts_payable: {
        Row: {
          attachment_path: string | null
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
          attachment_path?: string | null
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
          attachment_path?: string | null
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
          attachment_path: string | null
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
          attachment_path?: string | null
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
          attachment_path?: string | null
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
      activity_log: {
        Row: {
          action: string
          created_at: string
          description: string
          entity_id: string
          entity_type: string
          id: string
          job_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          entity_id: string
          entity_type: string
          id?: string
          job_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          entity_id?: string
          entity_type?: string
          id?: string
          job_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payments: {
        Row: {
          amount: number
          ap_id: string
          created_at: string
          created_by: string
          id: string
          payment_date: string
        }
        Insert: {
          amount: number
          ap_id: string
          created_at?: string
          created_by: string
          id?: string
          payment_date?: string
        }
        Update: {
          amount?: number
          ap_id?: string
          created_at?: string
          created_by?: string
          id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_payments_ap_id_fkey"
            columns: ["ap_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_payments: {
        Row: {
          amount: number
          ar_id: string
          created_at: string
          created_by: string
          id: string
          payment_date: string
        }
        Insert: {
          amount: number
          ar_id: string
          created_at?: string
          created_by: string
          id?: string
          payment_date?: string
        }
        Update: {
          amount?: number
          ar_id?: string
          created_at?: string
          created_by?: string
          id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ar_payments_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
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
      job_financials: {
        Row: {
          actual_buying: number
          actual_selling: number
          estimated_buying: number
          estimated_selling: number
          job_id: string
          margin: number | null
          pct_margin: number | null
          updated_at: string
        }
        Insert: {
          actual_buying?: number
          actual_selling?: number
          estimated_buying?: number
          estimated_selling?: number
          job_id: string
          margin?: number | null
          pct_margin?: number | null
          updated_at?: string
        }
        Update: {
          actual_buying?: number
          actual_selling?: number
          estimated_buying?: number
          estimated_selling?: number
          job_id?: string
          margin?: number | null
          pct_margin?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_financials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          id: string
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          volume_weight: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          id?: string
          job_sheet_no: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
          service_type?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          unit_type?: string | null
          volume_weight?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          id?: string
          job_sheet_no?: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
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
          status: Database["public"]["Enums"]["account_status"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["account_status"]
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["account_status"]
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
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      close_job_financials: {
        Args: {
          _actual_buying: number
          _actual_selling: number
          _job_id: string
          _status: Database["public"]["Enums"]["job_status"]
        }
        Returns: undefined
      }
      deactivate_user: { Args: { _user_id: string }; Returns: undefined }
      record_ap_payment: {
        Args: { _amount: number; _ap_id: string; _payment_date: string }
        Returns: {
          attachment_path: string | null
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
        SetofOptions: {
          from: "*"
          to: "accounts_payable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_ar_payment: {
        Args: { _amount: number; _ar_id: string; _payment_date: string }
        Returns: {
          amount: number
          attachment_path: string | null
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
        SetofOptions: {
          from: "*"
          to: "accounts_receivable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_job_operations: {
        Args: {
          _customer_id: string
          _destination: string
          _job_id: string
          _order_date: string
          _origin: string
          _quantity: string
          _service_type: string
          _unit_type: string
          _volume_weight: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          id: string
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          volume_weight: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_status: "pending" | "active" | "deactivated"
      ap_status: "Unpaid" | "Partially Paid" | "Paid"
      app_role: "owner" | "finance" | "operations"
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
      account_status: ["pending", "active", "deactivated"],
      ap_status: ["Unpaid", "Partially Paid", "Paid"],
      app_role: ["owner", "finance", "operations"],
      ar_status: ["Draft", "Issued", "Partially Paid", "Paid", "Overdue"],
      job_status: ["Draft", "In Progress", "Completed", "Cancelled"],
      payment_method: ["Bank Transfer", "Cash", "Giro"],
      payment_type: ["Term", "Cash"],
      reference_type: ["AR_RECEIPT", "AP_PAYMENT", "OPERATIONAL_EXPENSE"],
    },
  },
} as const
