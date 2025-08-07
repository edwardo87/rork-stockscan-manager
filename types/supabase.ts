export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          user_id: string
          barcode: string
          name: string
          description: string
          price: number
          cost: number
          sku: string
          category: string
          supplier: string
          min_stock: number
          current_stock: number
          unit: string
          image_url: string | null
          last_ordered: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          barcode: string
          name: string
          description: string
          price: number
          cost: number
          sku: string
          category: string
          supplier: string
          min_stock: number
          current_stock: number
          unit: string
          image_url?: string | null
          last_ordered?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          barcode?: string
          name?: string
          description?: string
          price?: number
          cost?: number
          sku?: string
          category?: string
          supplier?: string
          min_stock?: number
          current_stock?: number
          unit?: string
          image_url?: string | null
          last_ordered?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          user_id: string
          supplier_id: string
          supplier_name: string
          date: string
          status: 'draft' | 'submitted' | 'received'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          supplier_id: string
          supplier_name: string
          date: string
          status?: 'draft' | 'submitted' | 'received'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          supplier_id?: string
          supplier_name?: string
          date?: string
          status?: 'draft' | 'submitted' | 'received'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: {
          id: string
          purchase_order_id: string
          product_id: string
          barcode: string
          name: string
          quantity: number
          supplier: string
          created_at: string
        }
        Insert: {
          id?: string
          purchase_order_id: string
          product_id: string
          barcode: string
          name: string
          quantity: number
          supplier: string
          created_at?: string
        }
        Update: {
          id?: string
          purchase_order_id?: string
          product_id?: string
          barcode?: string
          name?: string
          quantity?: number
          supplier?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      stocktakes: {
        Row: {
          id: string
          user_id: string
          date: string
          status: 'in-progress' | 'completed'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          status?: 'in-progress' | 'completed'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          status?: 'in-progress' | 'completed'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      stocktake_items: {
        Row: {
          id: string
          stocktake_id: string
          product_id: string
          barcode: string
          name: string
          expected_quantity: number
          actual_quantity: number
          discrepancy: number
          created_at: string
        }
        Insert: {
          id?: string
          stocktake_id: string
          product_id: string
          barcode: string
          name: string
          expected_quantity: number
          actual_quantity: number
          discrepancy: number
          created_at?: string
        }
        Update: {
          id?: string
          stocktake_id?: string
          product_id?: string
          barcode?: string
          name?: string
          expected_quantity?: number
          actual_quantity?: number
          discrepancy?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      reorder_log: {
        Row: {
          id: string
          user_id: string
          product_id: string
          product_name: string
          quantity_ordered: number
          supplier: string
          order_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          product_name: string
          quantity_ordered: number
          supplier: string
          order_date: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          product_id?: string
          product_name?: string
          quantity_ordered?: number
          supplier?: string
          order_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_log_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_log_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}