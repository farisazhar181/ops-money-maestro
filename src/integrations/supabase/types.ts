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
          bill_date: string
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          is_void: boolean
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          attachment_path?: string | null
          balance_remaining?: number | null
          bill_date?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_amount?: number
          is_void?: boolean
          item_cost_description?: string | null
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["ap_status"]
          updated_at?: string
          vendor_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          attachment_path?: string | null
          balance_remaining?: number | null
          bill_date?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_amount?: number
          is_void?: boolean
          item_cost_description?: string | null
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["ap_status"]
          updated_at?: string
          vendor_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          {
            foreignKeyName: "accounts_payable_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_void: boolean
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
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
          is_void?: boolean
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          remaining_amount?: number | null
          status?: Database["public"]["Enums"]["ar_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          is_void?: boolean
          job_id?: string | null
          paid_amount?: number
          payment_terms_days?: number
          remaining_amount?: number | null
          status?: Database["public"]["Enums"]["ar_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          {
            foreignKeyName: "accounts_receivable_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          new_values: Json | null
          old_values: Json | null
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
          new_values?: Json | null
          old_values?: Json | null
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
          new_values?: Json | null
          old_values?: Json | null
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
          is_void: boolean
          payment_date: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          ap_id: string
          created_at?: string
          created_by: string
          id?: string
          is_void?: boolean
          payment_date?: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          ap_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_void?: boolean
          payment_date?: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_payments_ap_id_fkey"
            columns: ["ap_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_payments_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_void: boolean
          payment_date: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          ar_id: string
          created_at?: string
          created_by: string
          id?: string
          is_void?: boolean
          payment_date?: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          ar_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_void?: boolean
          payment_date?: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_payments_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_payments_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      investor_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          is_void?: boolean
          note: string
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          is_void?: boolean
          note?: string
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_financials: {
        Row: {
          actual_buying: number | null
          actual_selling: number | null
          estimated_buying: number
          estimated_selling: number
          job_id: string
          margin: number | null
          pct_margin: number | null
          updated_at: string
        }
        Insert: {
          actual_buying?: number | null
          actual_selling?: number | null
          estimated_buying?: number
          estimated_selling?: number
          job_id: string
          margin?: number | null
          pct_margin?: number | null
          updated_at?: string
        }
        Update: {
          actual_buying?: number | null
          actual_selling?: number | null
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
          closed_at: string | null
          commodity: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          eta: string | null
          etd: string | null
          id: string
          is_void: boolean
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          volume_weight: string | null
        }
        Insert: {
          closed_at?: string | null
          commodity?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          is_void?: boolean
          job_sheet_no: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
          service_type?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          unit_type?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          volume_weight?: string | null
        }
        Update: {
          closed_at?: string | null
          commodity?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          is_void?: boolean
          job_sheet_no?: string
          order_date?: string
          origin?: string | null
          quantity?: string | null
          service_type?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          unit_type?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          {
            foreignKeyName: "jobs_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overhead_costs: {
        Row: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          cost_date?: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at?: string
          created_by: string
          id?: string
          is_void?: boolean
          note: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          cost_date?: string
          cost_type?: Database["public"]["Enums"]["overhead_type"]
          created_at?: string
          created_by?: string
          id?: string
          is_void?: boolean
          note?: string
          payment_transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overhead_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_costs_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_costs_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_void: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_void?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_id?: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_void?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_id?: string | null
          reference_type?: Database["public"]["Enums"]["reference_type"]
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      create_ap: {
        Args: {
          _amount: number
          _bill_date: string
          _description: string
          _job_id: string
          _payment_type?: Database["public"]["Enums"]["payment_type"]
          _terms: number
          _vendor_id: string
        }
        Returns: {
          attachment_path: string | null
          balance_remaining: number | null
          bill_date: string
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          is_void: boolean
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_payable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_ar: {
        Args: {
          _amount: number
          _invoice_date: string
          _invoice_no: string
          _job_id: string
          _terms: number
        }
        Returns: {
          amount: number
          attachment_path: string | null
          created_at: string
          customer_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_no: string
          is_void: boolean
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_receivable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_investor_transaction: {
        Args: {
          _amount: number
          _date: string
          _note: string
          _type: Database["public"]["Enums"]["investor_transaction_type"]
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "investor_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_job:
        | {
            Args: {
              _customer_id: string
              _destination: string
              _estimated_buying?: number
              _estimated_selling?: number
              _job_sheet_no: string
              _order_date: string
              _origin: string
              _quantity: string
              _service_type: string
              _unit_type: string
              _volume_weight: string
            }
            Returns: {
              closed_at: string | null
              commodity: string | null
              created_at: string
              created_by: string | null
              customer_id: string | null
              destination: string | null
              eta: string | null
              etd: string | null
              id: string
              is_void: boolean
              job_sheet_no: string
              order_date: string
              origin: string | null
              quantity: string | null
              service_type: string | null
              status: Database["public"]["Enums"]["job_status"]
              unit_type: string | null
              updated_at: string
              void_reason: string | null
              voided_at: string | null
              voided_by: string | null
              volume_weight: string | null
            }
            SetofOptions: {
              from: "*"
              to: "jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _commodity?: string
              _customer_id: string
              _destination: string
              _estimated_buying?: number
              _estimated_selling?: number
              _eta?: string
              _etd?: string
              _job_sheet_no: string
              _order_date: string
              _origin: string
              _quantity: string
              _service_type: string
              _unit_type: string
              _volume_weight: string
            }
            Returns: {
              closed_at: string | null
              commodity: string | null
              created_at: string
              created_by: string | null
              customer_id: string | null
              destination: string | null
              eta: string | null
              etd: string | null
              id: string
              is_void: boolean
              job_sheet_no: string
              order_date: string
              origin: string | null
              quantity: string | null
              service_type: string | null
              status: Database["public"]["Enums"]["job_status"]
              unit_type: string | null
              updated_at: string
              void_reason: string | null
              voided_at: string | null
              voided_by: string | null
              volume_weight: string | null
            }
            SetofOptions: {
              from: "*"
              to: "jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_overhead: {
        Args: {
          _amount: number
          _date: string
          _note: string
          _type: Database["public"]["Enums"]["overhead_type"]
        }
        Returns: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "overhead_costs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deactivate_user: { Args: { _user_id: string }; Returns: undefined }
      edit_ap: {
        Args: {
          _amount: number
          _bill_date?: string
          _description: string
          _due_date: string
          _id: string
          _terms: number
          _vendor_id: string
        }
        Returns: {
          attachment_path: string | null
          balance_remaining: number | null
          bill_date: string
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          is_void: boolean
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_payable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_ar: {
        Args: {
          _amount: number
          _customer_id: string
          _due_date: string
          _id: string
          _invoice_date: string
          _invoice_no: string
          _terms: number
        }
        Returns: {
          amount: number
          attachment_path: string | null
          created_at: string
          customer_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_no: string
          is_void: boolean
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_receivable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_cash_transaction: {
        Args: {
          _amount: number
          _date: string
          _id: string
          _method: Database["public"]["Enums"]["payment_method"]
          _notes: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          is_void: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_investor_transaction: {
        Args: {
          _amount: number
          _date: string
          _id: string
          _note: string
          _type: Database["public"]["Enums"]["investor_transaction_type"]
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "investor_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_overhead: {
        Args: {
          _amount: number
          _date: string
          _id: string
          _note: string
          _type: Database["public"]["Enums"]["overhead_type"]
        }
        Returns: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "overhead_costs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_overhead: {
        Args: {
          _id: string
          _method?: Database["public"]["Enums"]["payment_method"]
          _payment_date: string
        }
        Returns: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "overhead_costs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_ap_payment: {
        Args: { _amount: number; _ap_id: string; _payment_date: string }
        Returns: {
          attachment_path: string | null
          balance_remaining: number | null
          bill_date: string
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          is_void: boolean
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
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
          is_void: boolean
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_receivable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_aging: {
        Args: { _kind: string }
        Returns: {
          amount: number
          balance: number
          bucket: string
          days_overdue: number
          doc_date: string
          due_date: string
          id: string
          job_sheet_no: string
          paid: number
          party: string
          reference: string
        }[]
      }
      report_balances: {
        Args: { _from: string; _to: string }
        Returns: {
          ap_outstanding: number
          ar_outstanding: number
          month: string
        }[]
      }
      report_monthly: {
        Args: { _from: string; _to: string }
        Returns: {
          closed_buying: number
          closed_jobs: number
          closed_margin: number
          closed_selling: number
          cost: number
          financing_in: number
          financing_out: number
          jobs_created: number
          month: string
          net_profit: number
          op_cash_in: number
          op_cash_out: number
          overhead: number
          revenue: number
        }[]
      }
      report_summary: {
        Args: never
        Returns: {
          ap_outstanding: number
          ap_paid: number
          ar_outstanding: number
          ar_received: number
          cost: number
          financing_in: number
          financing_out: number
          jobs_closed: number
          jobs_total: number
          liabilities_to_revenue: number
          net_financing: number
          net_operating_cash: number
          net_profit: number
          op_cash_in: number
          op_cash_out: number
          overhead: number
          pipeline_value: number
          revenue: number
        }[]
      }
      report_top_parties: {
        Args: { _from: string; _kind: string; _limit?: number; _to: string }
        Returns: {
          party: string
          total: number
        }[]
      }
      save_customer: {
        Args: {
          _address: string
          _company_name: string
          _contact_name: string
          _email: string
          _id: string
          _phone: string
        }
        Returns: {
          address: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_vendor: {
        Args: {
          _contact_person: string
          _id: string
          _phone: string
          _service_type: string
          _vendor_name: string
        }
        Returns: {
          contact_person: string | null
          created_at: string
          id: string
          phone: string | null
          service_type: string | null
          vendor_name: string
        }
        SetofOptions: {
          from: "*"
          to: "subcontractors_vendors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_attachment: {
        Args: { _id: string; _kind: string; _path: string }
        Returns: undefined
      }
      set_job_estimates: {
        Args: {
          _estimated_buying: number
          _estimated_selling: number
          _job_id: string
        }
        Returns: {
          actual_buying: number | null
          actual_selling: number | null
          estimated_buying: number
          estimated_selling: number
          job_id: string
          margin: number | null
          pct_margin: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "job_financials"
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
          closed_at: string | null
          commodity: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          eta: string | null
          etd: string | null
          id: string
          is_void: boolean
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          volume_weight: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_ap: {
        Args: { _id: string; _reason: string }
        Returns: {
          attachment_path: string | null
          balance_remaining: number | null
          bill_date: string
          created_at: string
          due_date: string | null
          id: string
          invoice_amount: number
          is_void: boolean
          item_cost_description: string | null
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["ap_status"]
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_payable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_ar: {
        Args: { _id: string; _reason: string }
        Returns: {
          amount: number
          attachment_path: string | null
          created_at: string
          customer_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_no: string
          is_void: boolean
          job_id: string | null
          paid_amount: number
          payment_terms_days: number
          remaining_amount: number | null
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts_receivable"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_cash_transaction: {
        Args: { _id: string; _reason: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          is_void: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_id: string | null
          reference_type: Database["public"]["Enums"]["reference_type"]
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_investor_transaction: {
        Args: { _id: string; _reason: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["investor_transaction_type"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "investor_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_job: {
        Args: { _job_id: string; _reason: string }
        Returns: {
          closed_at: string | null
          commodity: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          destination: string | null
          eta: string | null
          etd: string | null
          id: string
          is_void: boolean
          job_sheet_no: string
          order_date: string
          origin: string | null
          quantity: string | null
          service_type: string | null
          status: Database["public"]["Enums"]["job_status"]
          unit_type: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          volume_weight: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_overhead: {
        Args: { _id: string; _reason: string }
        Returns: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["overhead_type"]
          created_at: string
          created_by: string
          id: string
          is_void: boolean
          note: string
          payment_transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "overhead_costs"
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
      investor_transaction_type: "Loan In" | "Repayment"
      job_status: "Pipeline" | "Active" | "Closed"
      overhead_type: "Fixed" | "Variable"
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
      investor_transaction_type: ["Loan In", "Repayment"],
      job_status: ["Pipeline", "Active", "Closed"],
      overhead_type: ["Fixed", "Variable"],
      payment_method: ["Bank Transfer", "Cash", "Giro"],
      payment_type: ["Term", "Cash"],
      reference_type: ["AR_RECEIPT", "AP_PAYMENT", "OPERATIONAL_EXPENSE"],
    },
  },
} as const
