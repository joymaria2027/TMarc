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
      audit_acknowledgements: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          check_key: string
          entity_id: string
          id: string
          note: string | null
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          check_key: string
          entity_id: string
          id?: string
          note?: string | null
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          check_key?: string
          entity_id?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      business_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_resources: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address: string
          created_at: string
          customer_id: string
          id: string
          label: string | null
          lat: number | null
          lng: number | null
        }
        Insert: {
          address: string
          created_at?: string
          customer_id: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
        }
        Update: {
          address?: string
          created_at?: string
          customer_id?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          default_address: string | null
          default_lat: number | null
          default_lng: number | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_address?: string | null
          default_lat?: number | null
          default_lng?: number | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_address?: string | null
          default_lat?: number | null
          default_lng?: number | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          actual_distance_km: number | null
          actual_tariff: number | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          dispatched_at: string | null
          dropoff_address: string
          dropoff_latitude: number | null
          dropoff_longitude: number | null
          end_odometer_at: string | null
          end_odometer_miles: number | null
          end_odometer_photo_url: string | null
          estimated_distance_km: number | null
          estimated_tariff: number | null
          flag_reason: string | null
          gps_confirmed: boolean
          id: string
          is_flagged: boolean
          merchant_id: string
          order_reference: string | null
          payment_bank_name: string | null
          payment_method: string | null
          picked_up_at: string | null
          pickup_address: string
          pickup_latitude: number | null
          pickup_longitude: number | null
          receipt_attached: boolean
          rider_id: string | null
          route_deviation_detected: boolean
          settlement_approved: boolean
          settlement_approved_by: string | null
          start_odometer_at: string | null
          start_odometer_miles: number | null
          start_odometer_photo_url: string | null
          status: string
          tariff_override_by: string | null
          tariff_override_reason: string | null
          updated_at: string
        }
        Insert: {
          actual_distance_km?: number | null
          actual_tariff?: number | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          dropoff_address: string
          dropoff_latitude?: number | null
          dropoff_longitude?: number | null
          end_odometer_at?: string | null
          end_odometer_miles?: number | null
          end_odometer_photo_url?: string | null
          estimated_distance_km?: number | null
          estimated_tariff?: number | null
          flag_reason?: string | null
          gps_confirmed?: boolean
          id?: string
          is_flagged?: boolean
          merchant_id: string
          order_reference?: string | null
          payment_bank_name?: string | null
          payment_method?: string | null
          picked_up_at?: string | null
          pickup_address: string
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          receipt_attached?: boolean
          rider_id?: string | null
          route_deviation_detected?: boolean
          settlement_approved?: boolean
          settlement_approved_by?: string | null
          start_odometer_at?: string | null
          start_odometer_miles?: number | null
          start_odometer_photo_url?: string | null
          status?: string
          tariff_override_by?: string | null
          tariff_override_reason?: string | null
          updated_at?: string
        }
        Update: {
          actual_distance_km?: number | null
          actual_tariff?: number | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          dropoff_address?: string
          dropoff_latitude?: number | null
          dropoff_longitude?: number | null
          end_odometer_at?: string | null
          end_odometer_miles?: number | null
          end_odometer_photo_url?: string | null
          estimated_distance_km?: number | null
          estimated_tariff?: number | null
          flag_reason?: string | null
          gps_confirmed?: boolean
          id?: string
          is_flagged?: boolean
          merchant_id?: string
          order_reference?: string | null
          payment_bank_name?: string | null
          payment_method?: string | null
          picked_up_at?: string | null
          pickup_address?: string
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          receipt_attached?: boolean
          rider_id?: string | null
          route_deviation_detected?: boolean
          settlement_approved?: boolean
          settlement_approved_by?: string | null
          start_odometer_at?: string | null
          start_odometer_miles?: number | null
          start_odometer_photo_url?: string | null
          status?: string
          tariff_override_by?: string | null
          tariff_override_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_restaurant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_alerts: {
        Row: {
          alert_type: string
          created_at: string
          delivery_id: string | null
          id: string
          is_resolved: boolean
          merchant_id: string | null
          message: string
          resolved_by: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          is_resolved?: boolean
          merchant_id?: string | null
          message: string
          resolved_by?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          is_resolved?: boolean
          merchant_id?: string | null
          message?: string
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_alerts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_holder_events: {
        Row: {
          created_at: string
          delivery_id: string
          event_type: string
          from_rider_id: string | null
          id: string
          rider_id: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          event_type: string
          from_rider_id?: string | null
          id?: string
          rider_id: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          event_type?: string
          from_rider_id?: string | null
          id?: string
          rider_id?: string
        }
        Relationships: []
      }
      delivery_receipts: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          receipt_url: string
          uploaded_by: string
          verified: boolean
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          receipt_url: string
          uploaded_by: string
          verified?: boolean
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          receipt_url?: string
          uploaded_by?: string
          verified?: boolean
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_receipts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_rejections: {
        Row: {
          created_at: string
          delivery_id: string
          reason: string | null
          rider_id: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          reason?: string | null
          rider_id: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          reason?: string | null
          rider_id?: string
        }
        Relationships: []
      }
      delivery_waypoints: {
        Row: {
          accuracy: number | null
          delivery_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          delivery_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          delivery_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_waypoints_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delivery_id: string | null
          detail: Json
          event_type: string
          id: string
          order_id: string | null
          rider_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delivery_id?: string | null
          detail?: Json
          event_type: string
          id?: string
          order_id?: string | null
          rider_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delivery_id?: string | null
          detail?: Json
          event_type?: string
          id?: string
          order_id?: string | null
          rider_id?: string | null
        }
        Relationships: []
      }
      expense_alerts: {
        Row: {
          alert_type: string
          created_at: string
          expense_id: string
          id: string
          is_read: boolean
          merchant_id: string | null
          message: string
          rider_id: string
          target_role: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          expense_id: string
          id?: string
          is_read?: boolean
          merchant_id?: string | null
          message: string
          rider_id: string
          target_role: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          expense_id?: string
          id?: string
          is_read?: boolean
          merchant_id?: string | null
          message?: string
          rider_id?: string
          target_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_alerts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "rider_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_types: {
        Row: {
          amortize_over: number | null
          applies_to: string
          cost_per_mile: number
          created_at: string
          fuel_type: string | null
          id: string
          is_active: boolean
          is_fuel: boolean
          is_maintenance: boolean
          name: string
          price_per_litre: number | null
          updated_at: string
        }
        Insert: {
          amortize_over?: number | null
          applies_to?: string
          cost_per_mile?: number
          created_at?: string
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          is_fuel?: boolean
          is_maintenance?: boolean
          name: string
          price_per_litre?: number | null
          updated_at?: string
        }
        Update: {
          amortize_over?: number | null
          applies_to?: string
          cost_per_mile?: number
          created_at?: string
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          is_fuel?: boolean
          is_maintenance?: boolean
          name?: string
          price_per_litre?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fuel_price_changes: {
        Row: {
          created_at: string
          expense_type_id: string
          fuel_variant_id: string | null
          id: string
          new_cost_per_mile: number | null
          new_fuel_type: string | null
          new_price_per_litre: number | null
          notes: string | null
          old_cost_per_mile: number | null
          old_fuel_type: string | null
          old_price_per_litre: number | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expense_type_id: string
          fuel_variant_id?: string | null
          id?: string
          new_cost_per_mile?: number | null
          new_fuel_type?: string | null
          new_price_per_litre?: number | null
          notes?: string | null
          old_cost_per_mile?: number | null
          old_fuel_type?: string | null
          old_price_per_litre?: number | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expense_type_id?: string
          fuel_variant_id?: string | null
          id?: string
          new_cost_per_mile?: number | null
          new_fuel_type?: string | null
          new_price_per_litre?: number | null
          notes?: string | null
          old_cost_per_mile?: number | null
          old_fuel_type?: string | null
          old_price_per_litre?: number | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_price_changes_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_price_changes_fuel_variant_id_fkey"
            columns: ["fuel_variant_id"]
            isOneToOne: false
            referencedRelation: "fuel_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_variants: {
        Row: {
          cost_per_mile: number
          created_at: string
          expense_type_id: string
          fuel_type: string
          id: string
          is_active: boolean
          is_default: boolean
          price_per_litre: number | null
          updated_at: string
        }
        Insert: {
          cost_per_mile?: number
          created_at?: string
          expense_type_id: string
          fuel_type: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price_per_litre?: number | null
          updated_at?: string
        }
        Update: {
          cost_per_mile?: number
          created_at?: string
          expense_type_id?: string
          fuel_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price_per_litre?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_variants_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          merchant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          merchant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_audit_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_riders: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          rider_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          rider_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          rider_id?: string
        }
        Relationships: []
      }
      merchant_tariffs: {
        Row: {
          created_at: string
          id: string
          location_name: string
          merchant_id: string
          set_by: string
          tariff_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_name: string
          merchant_id: string
          set_by: string
          tariff_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_name?: string
          merchant_id?: string
          set_by?: string
          tariff_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tariffs_restaurant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_wholesale_settings: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          is_enabled: boolean
          merchant_id: string
          min_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_enabled?: boolean
          merchant_id: string
          min_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_enabled?: boolean
          merchant_id?: string
          min_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_wholesale_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          accountant_user_id: string | null
          address: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_type_id: string | null
          can_create_submerchants: boolean
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          manager_user_id: string | null
          name: string
          parent_merchant_id: string | null
          phone: string | null
          rejection_reason: string | null
          updated_at: string
        }
        Insert: {
          accountant_user_id?: string | null
          address: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type_id?: string | null
          can_create_submerchants?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_user_id?: string | null
          name: string
          parent_merchant_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Update: {
          accountant_user_id?: string | null
          address?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_type_id?: string | null
          can_create_submerchants?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_user_id?: string | null
          name?: string
          parent_merchant_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_business_type_id_fkey"
            columns: ["business_type_id"]
            isOneToOne: false
            referencedRelation: "business_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_parent_merchant_id_fkey"
            columns: ["parent_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      modempay_webhook_events: {
        Row: {
          event_id: string | null
          event_type: string | null
          id: string
          order_id: string | null
          payload_json: Json | null
          payment_reference: string | null
          processing_error: string | null
          processing_status: string
          raw_body: string | null
          received_at: string
          retry_of_id: string | null
          signature_header: string | null
          signature_valid: boolean | null
        }
        Insert: {
          event_id?: string | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          payload_json?: Json | null
          payment_reference?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_body?: string | null
          received_at?: string
          retry_of_id?: string | null
          signature_header?: string | null
          signature_valid?: boolean | null
        }
        Update: {
          event_id?: string | null
          event_type?: string | null
          id?: string
          order_id?: string | null
          payload_json?: Json | null
          payment_reference?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_body?: string | null
          received_at?: string
          retry_of_id?: string | null
          signature_header?: string | null
          signature_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "modempay_webhook_events_retry_of_id_fkey"
            columns: ["retry_of_id"]
            isOneToOne: false
            referencedRelation: "modempay_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name_snapshot: string
          order_id: string
          price_snapshot: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          name_snapshot: string
          order_id: string
          price_snapshot: number
          product_id?: string | null
          quantity: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name_snapshot?: string
          order_id?: string
          price_snapshot?: number
          product_id?: string | null
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
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          read_at: string | null
          sender_role: string
          sender_user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          read_at?: string | null
          sender_role: string
          sender_user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          read_at?: string | null
          sender_role?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_user_id: string | null
          at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          actor_user_id?: string | null
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          actor_user_id?: string | null
          at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          customer_notes: string | null
          delivery_fee: number
          delivery_id: string | null
          dropoff_address: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          fulfillment_type: string
          id: string
          merchant_id: string
          order_reference: string | null
          payment_provider: string | null
          payment_reference: string | null
          payment_status: string
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          customer_notes?: string | null
          delivery_fee?: number
          delivery_id?: string | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          fulfillment_type: string
          id?: string
          merchant_id: string
          order_reference?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          customer_notes?: string | null
          delivery_fee?: number
          delivery_id?: string | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          fulfillment_type?: string
          id?: string
          merchant_id?: string
          order_reference?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliations: {
        Row: {
          amount: number
          created_at: string
          delivery_id: string | null
          entry_type: string
          id: string
          matched_at: string | null
          matched_by: string | null
          notes: string | null
          occurred_at: string
          party_label: string | null
          payment_method: string | null
          payment_reference: string | null
          statement_url: string | null
          status: string
          updated_at: string
          wallet_transaction_id: string | null
          withdrawal_request_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          delivery_id?: string | null
          entry_type: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          notes?: string | null
          occurred_at?: string
          party_label?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          statement_url?: string | null
          status?: string
          updated_at?: string
          wallet_transaction_id?: string | null
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_id?: string | null
          entry_type?: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          notes?: string | null
          occurred_at?: string
          party_label?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          statement_url?: string | null
          status?: string
          updated_at?: string
          wallet_transaction_id?: string | null
          withdrawal_request_id?: string | null
        }
        Relationships: []
      }
      payroll_assignments: {
        Row: {
          basis: Database["public"]["Enums"]["payroll_basis"]
          created_at: string
          created_by: string
          fixed_amount: number | null
          id: string
          is_active: boolean
          notes: string | null
          payee_user_id: string
          payer_merchant_id: string | null
          payer_type: Database["public"]["Enums"]["payroll_payer_type"]
          percent: number | null
          updated_at: string
        }
        Insert: {
          basis: Database["public"]["Enums"]["payroll_basis"]
          created_at?: string
          created_by: string
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payee_user_id: string
          payer_merchant_id?: string | null
          payer_type: Database["public"]["Enums"]["payroll_payer_type"]
          percent?: number | null
          updated_at?: string
        }
        Update: {
          basis?: Database["public"]["Enums"]["payroll_basis"]
          created_at?: string
          created_by?: string
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payee_user_id?: string
          payer_merchant_id?: string | null
          payer_type?: Database["public"]["Enums"]["payroll_payer_type"]
          percent?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          assignment_id: string
          computed_amount: number
          created_at: string
          id: string
          payee_wallet_id: string
          payer_wallet_id: string | null
          period_end: string
          period_start: string
          run_by: string
          status: string
        }
        Insert: {
          assignment_id: string
          computed_amount: number
          created_at?: string
          id?: string
          payee_wallet_id: string
          payer_wallet_id?: string | null
          period_end: string
          period_start: string
          run_by: string
          status?: string
        }
        Update: {
          assignment_id?: string
          computed_amount?: number
          created_at?: string
          id?: string
          payee_wallet_id?: string
          payer_wallet_id?: string | null
          period_end?: string
          period_start?: string
          run_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "payroll_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_wholesale_pricing: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          min_quantity: number
          product_id: string
          updated_at: string
          wholesale_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          min_quantity?: number
          product_id: string
          updated_at?: string
          wholesale_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          min_quantity?: number
          product_id?: string
          updated_at?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_wholesale_pricing_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_wholesale_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          available_today: boolean
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          merchant_id: string
          name: string
          price: number
          quantity: number
          rejection_reason: string | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          available_today?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          merchant_id: string
          name: string
          price: number
          quantity?: number
          rejection_reason?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          available_today?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          merchant_id?: string
          name?: string
          price?: number
          quantity?: number
          rejection_reason?: string | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
          withdrawal_pin: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          withdrawal_pin?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          withdrawal_pin?: string | null
        }
        Relationships: []
      }
      revenue_sharing: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          merchant_id: string | null
          merchant_percentage: number
          platform_percentage: number
          rider_id: string | null
          rider_percentage: number
          ucs_rides_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          merchant_id?: string | null
          merchant_percentage?: number
          platform_percentage?: number
          rider_id?: string | null
          rider_percentage?: number
          ucs_rides_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          merchant_id?: string | null
          merchant_percentage?: number
          platform_percentage?: number
          rider_id?: string | null
          rider_percentage?: number
          ucs_rides_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_sharing_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_sharing_restaurant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_sharing_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_dispatch_offers: {
        Row: {
          delivery_id: string | null
          expires_at: string | null
          id: string
          offered_at: string
          order_id: string
          rider_id: string
          status: string
        }
        Insert: {
          delivery_id?: string | null
          expires_at?: string | null
          id?: string
          offered_at?: string
          order_id: string
          rider_id: string
          status?: string
        }
        Update: {
          delivery_id?: string | null
          expires_at?: string | null
          id?: string
          offered_at?: string
          order_id?: string
          rider_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_dispatch_offers_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_dispatch_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_dispatch_offers_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_expense_consumptions: {
        Row: {
          amount_consumed: number
          created_at: string
          delivery_id: string
          id: string
          kind: string
          rider_expense_id: string
        }
        Insert: {
          amount_consumed: number
          created_at?: string
          delivery_id: string
          id?: string
          kind?: string
          rider_expense_id: string
        }
        Update: {
          amount_consumed?: number
          created_at?: string
          delivery_id?: string
          id?: string
          kind?: string
          rider_expense_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_expense_consumptions_rider_expense_id_fkey"
            columns: ["rider_expense_id"]
            isOneToOne: false
            referencedRelation: "rider_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_expenses: {
        Row: {
          amount: number
          consumed_amount: number
          created_at: string
          deducted_in_delivery_id: string | null
          description: string
          expense_date: string
          expense_type_id: string | null
          fully_consumed_at: string | null
          id: string
          merchant_id: string | null
          receipt_url: string | null
          rider_id: string
          status: string
          uploaded_by: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount?: number
          consumed_amount?: number
          created_at?: string
          deducted_in_delivery_id?: string | null
          description?: string
          expense_date?: string
          expense_type_id?: string | null
          fully_consumed_at?: string | null
          id?: string
          merchant_id?: string | null
          receipt_url?: string | null
          rider_id: string
          status?: string
          uploaded_by: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          consumed_amount?: number
          created_at?: string
          deducted_in_delivery_id?: string | null
          description?: string
          expense_date?: string
          expense_type_id?: string | null
          fully_consumed_at?: string | null
          id?: string
          merchant_id?: string | null
          receipt_url?: string | null
          rider_id?: string
          status?: string
          uploaded_by?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_expenses_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_expenses_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          created_at: string
          current_latitude: number | null
          current_longitude: number | null
          fuel_variant_id: string | null
          id: string
          is_active: boolean
          is_online: boolean
          last_location_update: string | null
          license_plate: string | null
          rider_code: string
          updated_at: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          fuel_variant_id?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_location_update?: string | null
          license_plate?: string | null
          rider_code: string
          updated_at?: string
          user_id: string
          vehicle_type?: string
        }
        Update: {
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          fuel_variant_id?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_location_update?: string | null
          license_plate?: string | null
          rider_code?: string
          updated_at?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "riders_fuel_variant_id_fkey"
            columns: ["fuel_variant_id"]
            isOneToOne: false
            referencedRelation: "fuel_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_add: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          resource: string
          role: string
          updated_at: string
        }
        Insert: {
          can_add?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          resource: string
          role: string
          updated_at?: string
        }
        Update: {
          can_add?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          resource?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          center_latitude: number
          center_longitude: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          radius_km: number
        }
        Insert: {
          center_latitude: number
          center_longitude: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          radius_km?: number
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          radius_km?: number
        }
        Relationships: []
      }
      tariff_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          location_name: string
          merchant_id: string
          message: string
          new_amount: number
          old_amount: number | null
          read_by: string[] | null
          tariff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          location_name: string
          merchant_id: string
          message: string
          new_amount: number
          old_amount?: number | null
          read_by?: string[] | null
          tariff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          location_name?: string
          merchant_id?: string
          message?: string
          new_amount?: number
          old_amount?: number | null
          read_by?: string[] | null
          tariff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariff_notifications_restaurant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariff_notifications_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "merchant_tariffs"
            referencedColumns: ["id"]
          },
        ]
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
      wallet_backfill_results: {
        Row: {
          amount: number
          created_at: string
          detail: string | null
          id: string
          merchant_id: string | null
          order_id: string
          order_reference: string | null
          outcome: string
          run_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          detail?: string | null
          id?: string
          merchant_id?: string | null
          order_id: string
          order_reference?: string | null
          outcome: string
          run_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          detail?: string | null
          id?: string
          merchant_id?: string | null
          order_id?: string
          order_reference?: string | null
          outcome?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_backfill_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wallet_backfill_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_backfill_runs: {
        Row: {
          created_at: string
          credited_amount: number
          credited_count: number
          failed_count: number
          id: string
          merchant_id: string | null
          range_from: string | null
          range_to: string | null
          run_by: string
          skipped_count: number
          total_orders: number
        }
        Insert: {
          created_at?: string
          credited_amount?: number
          credited_count?: number
          failed_count?: number
          id?: string
          merchant_id?: string | null
          range_from?: string | null
          range_to?: string | null
          run_by: string
          skipped_count?: number
          total_orders?: number
        }
        Update: {
          created_at?: string
          credited_amount?: number
          credited_count?: number
          failed_count?: number
          id?: string
          merchant_id?: string | null
          range_from?: string | null
          range_to?: string | null
          run_by?: string
          skipped_count?: number
          total_orders?: number
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          delivery_id: string | null
          description: string
          id: string
          order_id: string | null
          type: string
          wallet_id: string
          withdrawal_request_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          delivery_id?: string | null
          description?: string
          id?: string
          order_id?: string | null
          type: string
          wallet_id: string
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_id?: string | null
          description?: string
          id?: string
          order_id?: string | null
          type?: string
          wallet_id?: string
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          merchant_id: string | null
          party_id: string | null
          party_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          merchant_id?: string | null
          party_id?: string | null
          party_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          merchant_id?: string | null
          party_id?: string | null
          party_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      wholesalers: {
        Row: {
          address: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_name: string
          created_at: string
          id: string
          phone: string | null
          rejection_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_name: string
          created_at?: string
          id?: string
          phone?: string | null
          rejection_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string
          created_at?: string
          id?: string
          phone?: string | null
          rejection_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payout_method: string | null
          payout_reference: string | null
          processed_at: string | null
          processed_by: string | null
          requested_by: string
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_by: string
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_delivery_acceptance: {
        Args: { _delivery_id: string; _reason?: string }
        Returns: boolean
      }
      claim_delivery: { Args: { _delivery_id: string }; Returns: boolean }
      claim_dispatched_order: { Args: { _order_id: string }; Returns: boolean }
      credit_merchant_for_order: {
        Args: { _order_id: string; _source?: string }
        Returns: string
      }
      delete_delivery_cascade: { Args: { _id: string }; Returns: boolean }
      fraud_audit_report: { Args: never; Returns: Json }
      get_offered_deliveries: {
        Args: never
        Returns: {
          actual_distance_km: number | null
          actual_tariff: number | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          dispatched_at: string | null
          dropoff_address: string
          dropoff_latitude: number | null
          dropoff_longitude: number | null
          end_odometer_at: string | null
          end_odometer_miles: number | null
          end_odometer_photo_url: string | null
          estimated_distance_km: number | null
          estimated_tariff: number | null
          flag_reason: string | null
          gps_confirmed: boolean
          id: string
          is_flagged: boolean
          merchant_id: string
          order_reference: string | null
          payment_bank_name: string | null
          payment_method: string | null
          picked_up_at: string | null
          pickup_address: string
          pickup_latitude: number | null
          pickup_longitude: number | null
          receipt_attached: boolean
          rider_id: string | null
          route_deviation_detected: boolean
          settlement_approved: boolean
          settlement_approved_by: string | null
          start_odometer_at: string | null
          start_odometer_miles: number | null
          start_odometer_photo_url: string | null
          status: string
          tariff_override_by: string | null
          tariff_override_reason: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_offered_orders_for_rider: {
        Args: never
        Returns: {
          delivery_id: string
          dropoff_address: string
          dropoff_lat: number
          dropoff_lng: number
          estimated_tariff: number
          expires_at: string
          merchant_id: string
          merchant_name: string
          offered_at: string
          order_id: string
          order_reference: string
          pickup_lat: number
          pickup_lng: number
        }[]
      }
      get_order_live_location: {
        Args: { _order_id: string }
        Returns: {
          delivery_status: string
          dropoff_lat: number
          dropoff_lng: number
          latitude: number
          longitude: number
          order_status: string
          pickup_lat: number
          pickup_lng: number
          recorded_at: string
        }[]
      }
      get_public_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      get_rider_rejected_deliveries: {
        Args: never
        Returns: {
          actual_distance_km: number | null
          actual_tariff: number | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          dispatched_at: string | null
          dropoff_address: string
          dropoff_latitude: number | null
          dropoff_longitude: number | null
          end_odometer_at: string | null
          end_odometer_miles: number | null
          end_odometer_photo_url: string | null
          estimated_distance_km: number | null
          estimated_tariff: number | null
          flag_reason: string | null
          gps_confirmed: boolean
          id: string
          is_flagged: boolean
          merchant_id: string
          order_reference: string | null
          payment_bank_name: string | null
          payment_method: string | null
          picked_up_at: string | null
          pickup_address: string
          pickup_latitude: number | null
          pickup_longitude: number | null
          receipt_attached: boolean
          rider_id: string | null
          route_deviation_detected: boolean
          settlement_approved: boolean
          settlement_approved_by: string | null
          start_odometer_at: string | null
          start_odometer_miles: number | null
          start_odometer_photo_url: string | null
          status: string
          tariff_override_by: string | null
          tariff_override_reason: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "deliveries"
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
      has_withdrawal_pin: { Args: never; Returns: boolean }
      haversine_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      is_approved_wholesaler: { Args: { _user_id: string }; Returns: boolean }
      log_dispatch_event: {
        Args: {
          _delivery_id: string
          _detail?: Json
          _event_type: string
          _order_id: string
          _rider_id: string
        }
        Returns: undefined
      }
      mark_order_ready: { Args: { _order_id: string }; Returns: string }
      merchant_ids_for_manager: {
        Args: { _user_id: string }
        Returns: {
          merchant_id: string
        }[]
      }
      offer_delivery_to_pool: {
        Args: {
          _delivery_id: string
          _exclude_rider?: string
          _order_id: string
        }
        Returns: number
      }
      payment_reconciliation_report: {
        Args: { _from?: string; _merchant_id?: string; _to?: string }
        Returns: {
          credited_amount: number
          credited_at: string
          delivery_fee: number
          expected_credit: number
          merchant_id: string
          merchant_name: string
          order_id: string
          order_reference: string
          paid_at: string
          payment_provider: string
          payment_reference: string
          status: string
          subtotal: number
          total: number
        }[]
      }
      reclaim_delivery: { Args: { _delivery_id: string }; Returns: boolean }
      reject_delivery: {
        Args: { _delivery_id: string; _reason?: string }
        Returns: boolean
      }
      run_payroll: {
        Args: {
          _assignment_id: string
          _period_end: string
          _period_start: string
        }
        Returns: string
      }
      run_wallet_backfill: {
        Args: { _from?: string; _merchant_id?: string; _to?: string }
        Returns: string
      }
      self_assign_customer_role: { Args: never; Returns: boolean }
      set_withdrawal_pin: { Args: { _pin: string }; Returns: boolean }
      submit_order: { Args: { _order_id: string }; Returns: boolean }
      verify_withdrawal_pin: { Args: { _pin: string }; Returns: boolean }
      widen_dispatch_pool: { Args: { _order_id: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "admin"
        | "rider"
        | "accountant"
        | "company_manager"
        | "business_owner"
        | "app_developer"
        | "customer"
        | "wholesaler"
      payroll_basis: "fixed" | "percent_of_wallet_income"
      payroll_payer_type: "merchant" | "business_owner" | "platform"
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
      app_role: [
        "admin",
        "rider",
        "accountant",
        "company_manager",
        "business_owner",
        "app_developer",
        "customer",
        "wholesaler",
      ],
      payroll_basis: ["fixed", "percent_of_wallet_income"],
      payroll_payer_type: ["merchant", "business_owner", "platform"],
    },
  },
} as const
