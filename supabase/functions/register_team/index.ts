// supabase/functions/register_team/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kennyhaggard.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(email) {
  // Simple, practical validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(turnstileToken, req) {
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? "";
  if (!secret) return { ok: false, error: "Missing TURNSTILE_SECRET" };

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    "";

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", String(turnstileToken || ""));
  if (ip) body.set("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const result = await resp.json();

  if (!result.success) {
    // Don’t leak too much detail to spammers, but log for you
    console.error("Turnstile failed:", result);
    return { ok: false, error: "Turnstile verification failed" };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    const teamNameRaw = String(body.teamName || "").trim();
    const teamName = teamNameRaw; // preserve display casing
    const teamNameKey = teamNameRaw.toLowerCase(); // for duplicate check (case-insensitive)

    const pin = String(body.pin || "").trim();
    const coachEmail = String(body.coachEmail || "").trim();
    const turnstileToken = String(body.turnstileToken || "").trim();

    // Basic validation
    if (!teamName || !pin || !coachEmail || !turnstileToken) {
      return json({ ok: false, error: "Missing teamName/pin/coachEmail/turnstileToken" }, 400);
    }
    if (!/^\d{4}$/.test(pin)) {
      return json({ ok: false, error: "PIN must be exactly 4 digits" }, 400);
    }
    if (!isValidEmail(coachEmail)) {
      return json({ ok: false, error: "Invalid coach email" }, 400);
    }
    if (teamName.length < 2 || teamName.length > 40) {
      return json({ ok: false, error: "Team name must be 2–40 characters" }, 400);
    }

    // Turnstile verify
    const turnstile = await verifyTurnstile(turnstileToken, req);
    if (!turnstile.ok) return json({ ok: false, error: turnstile.error }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Duplicate check (case-insensitive)
    // If your column is `team_name` and you want case-insensitive uniqueness,
    // this pattern works well.
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("teams")
      .select("id, team_name")
      .ilike("team_name", teamNameKey) // ilike requires pattern; use exact-match pattern
      .maybeSingle();

    // NOTE: ilike with exact match should use the same string with no wildcards
    // Some users prefer: .ilike("team_name", teamName) but case-insens is fine.
    // If you see weird behavior, replace this with an RPC or a computed column.
    if (existErr) {
      console.error("Existing team lookup error:", existErr);
      return json({ ok: false, error: "DB error checking team" }, 500);
    }
    if (existing) {
      return json({ ok: false, error: "Team name already registered" }, 409);
    }

    // Hash PIN with server-side salt
    const salt = Deno.env.get("TEAM_PIN_SALT") ?? "";
    if (!salt) return json({ ok: false, error: "Missing TEAM_PIN_SALT" }, 500);

    const pinHash = await sha256Hex(`${teamNameKey}:${pin}:${salt}`);

    // Insert team
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("teams")
      .insert({
        team_name: teamName,
        coach_email: coachEmail,
        pin_hash: pinHash,
      })
      .select("id, team_name")
      .single();

    if (insertErr || !created) {
      console.error("Insert team error:", insertErr);
      return json({ ok: false, error: "DB error registering team" }, 500);
    }

    return json({ ok: true, team: created });
  } catch (e) {
    console.error("register_team error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});