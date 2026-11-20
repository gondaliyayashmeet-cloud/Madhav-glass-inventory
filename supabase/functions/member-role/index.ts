import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";

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

    // Get all companies this user owns
    const { data: ownedCompanies, error: ownedErr } = await supabase
      .from("companies")
      .select("id, name, description, invite_code")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    if (ownedErr) return jsonError("Database error", 500);

    // Get all company memberships for this user
    const { data: memberships, error: memberErr } = await supabase
      .from("company_members")
      .select("company_id, role, approved_at, companies(id, name, description, invite_code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (memberErr) return jsonError("Database error", 500);

    // Build a map of companies, deduplicating by company id
    const companyMap = new Map<string, CompanyInfo>();

    // Add owned companies first (as owner)
    for (const oc of (ownedCompanies ?? [])) {
      companyMap.set(oc.id, {
        id: oc.id,
        name: oc.name,
        description: oc.description,
        invite_code: oc.invite_code,
        role: "owner",
        approved: true,
      });
    }

    // Add membership companies (may override role if also a member)
    for (const m of (memberships ?? [])) {
      const c = (m as any).companies;
      if (!c) continue;
      const approved = m.role !== "pending" && m.approved_at !== null;
      // If already in map as owner, keep owner role
      if (!companyMap.has(c.id) || m.role === "owner") {
        companyMap.set(c.id, {
          id: c.id,
          name: c.name,
          description: c.description,
          invite_code: c.invite_code,
          role: m.role,
          approved,
        });
      } else {
        // Update approved status for existing entries
        const existing = companyMap.get(c.id);
        if (existing && existing.role === "owner") {
          // Keep as owner, already approved
        } else {
          companyMap.set(c.id, {
            id: c.id,
            name: c.name,
            description: c.description,
            invite_code: c.invite_code,
            role: m.role,
            approved,
          });
        }
      }
    }

    const companies = Array.from(companyMap.values());

    return jsonResponse({
      companies,
      name: user.user_metadata?.name ?? null,
      email: user.email,
    });
  } catch (err) {
    return jsonError(err.message || "Internal error", 500);
  }
});

interface CompanyInfo {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  role: string;
  approved: boolean;
}

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
