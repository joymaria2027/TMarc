import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("accessRestrictionsAndNotifications Migration Contract", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../supabase/migrations/20260918075500_c8d1e2f3-4a5b-6c7d-8e9f-0a1b2c3d4e5f.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("creates user_notifications table with RLS and realtime publication", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_notifications");
    expect(sql).toContain("ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain('CREATE POLICY "Users view own notifications" ON public.user_notifications');
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain('CREATE POLICY "Users update own notifications" ON public.user_notifications');
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications");
  });

  it("defines trigger on wholesalers table to notify on approved or declined with rejection reason", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.notify_wholesaler_on_review()");
    expect(sql).toContain("NEW.approval_status = 'approved'");
    expect(sql).toContain("Wholesale application approved");
    expect(sql).toContain("NEW.approval_status = 'rejected'");
    expect(sql).toContain("Wholesale application declined");
    expect(sql).toContain("NEW.rejection_reason");
    expect(sql).toContain("CREATE TRIGGER trg_notify_wholesaler_on_review");
    expect(sql).toContain("AFTER UPDATE OF approval_status, rejection_reason ON public.wholesalers");
  });

  it("drops open policy and restricts merchant_riders to admins, managers, and assigned riders", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can view restaurant riders" ON public.merchant_riders;');
    expect(sql).toContain('CREATE POLICY "merchant_riders_admin_all" ON public.merchant_riders');
    expect(sql).toContain('CREATE POLICY "merchant_riders_manager_select" ON public.merchant_riders');
    expect(sql).toContain("m.manager_user_id = auth.uid() OR m.accountant_user_id = auth.uid()");
    expect(sql).toContain("public.merchant_ids_for_manager(auth.uid())");
    expect(sql).toContain('CREATE POLICY "merchant_riders_manager_insert" ON public.merchant_riders');
    expect(sql).toContain('CREATE POLICY "merchant_riders_manager_delete" ON public.merchant_riders');
    expect(sql).toContain('CREATE POLICY "merchant_riders_rider_select" ON public.merchant_riders');
  });

  it("restricts permissions list, custom_roles, and custom_resources to admins and app_developers", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone authenticated can view permissions" ON public.role_permissions;');
    expect(sql).toContain('CREATE POLICY "role_permissions_authorized_select" ON public.role_permissions');
    expect(sql).toContain("public.has_role(auth.uid(), 'admin'::app_role)");
    expect(sql).toContain("public.has_role(auth.uid(), 'app_developer'::app_role)");

    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can view custom roles" ON public.custom_roles;');
    expect(sql).toContain('CREATE POLICY "custom_roles_authorized_select" ON public.custom_roles');

    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can view custom resources" ON public.custom_resources;');
    expect(sql).toContain('CREATE POLICY "custom_resources_authorized_select" ON public.custom_resources');
  });
});
