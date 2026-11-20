import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";

const VALID_ROLES = ["admin", "stock_keeper", "viewer", "pending"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Missing auth header", 401);

    const jwt = authHeader.replace("Bearer ", "");

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(jwt);
    if (authErr || !user) return jsonError("Invalid session", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");

    if (!companyId) return jsonError("company_id required", 400);

    // Check if caller is owner or admin of this company
    const { data: callerMembership } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();

    const isOwner = company?.owner_id === user.id;
    const callerRole = isOwner ? "owner" : callerMembership?.role;

    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return jsonError("Owner or admin only", 403);
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("company_members")
        .select("id,user_id,role,approved_at,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) return jsonError("Database error", 500);

      // Fetch user emails from auth.users
      const userIds = (data ?? []).map((m: any) => m.user_id);
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const emailMap = new Map();
      for (const au of (authUsers?.users ?? [])) {
        emailMap.set(au.id, { email: au.email, name: au.user_metadata?.name });
      }

      const result = (data ?? []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        email: emailMap.get(m.user_id)?.email ?? "—",
        name: emailMap.get(m.user_id)?.name ?? null,
        role: m.role,
        approved_at: m.approved_at,
        created_at: m.created_at,
      }));

      return jsonResponse(result);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { user_id, role } = body as { user_id: string; role: string };
      if (!user_id || !role) return jsonError("user_id and role required", 400);
      if (!VALID_ROLES.includes(role)) {
        return jsonError("Invalid role. Use: admin, stock_keeper, viewer, pending", 400);
      }
      const approvedAt = role === "pending" ? null : new Date().toISOString();
      const { data, error } = await supabase
        .from("company_members")
        .update({ role, approved_at: approvedAt })
        .eq("company_id", companyId)
        .eq("user_id", user_id)
        .select()
        .maybeSingle();

      if (error) return jsonError("Database error", 500);
      if (!data) return jsonError("Member not found", 404);
      return jsonResponse(data);
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      const { user_id } = body as { user_id: string };
      if (!user_id) return jsonError("user_id required", 400);

      // Cannot remove the owner
      if (company?.owner_id === user_id) {
        return jsonError("Cannot remove the company owner", 400);
      }

      // Admins can only remove stock_keepers, viewers, and pending — not other admins
      const { data: targetMember } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user_id)
        .maybeSingle();

      if (!targetMember) return jsonError("Member not found", 404);

      if (callerRole === "admin" && targetMember.role === "admin") {
        return jsonError("Admins cannot remove other admins. Only the owner can.", 403);
      }

      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", user_id);

      if (error) return jsonError("Database error", 500);
      return jsonResponse({ success: true });
    }

    return jsonError("Method not allowed", 405);
  } catch (err) {
    return jsonError(err.message || "Internal error", 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
