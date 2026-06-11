import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kennyhaggard.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const teamName = String(body.teamName || "").trim();
    const pin = String(body.pin || "").trim();

    if (!teamName || !pin) return json({ ok: false, error: "Missing teamName/pin" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // safe in Edge Functions, never in browser  [oai_citation:2‡Supabase](https://supabase.com/docs/guides/functions/secrets?utm_source=chatgpt.com)
    );

    // Verify pin
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, pin_hash")
      .ilike("team_name", teamName)
      .maybeSingle();

    if (teamErr) {
      console.error("Team lookup error:", teamErr);
      return json({ ok: false, error: `DB error loading team: ${teamErr.message}` }, 500);
    }
    if (!team) return json({ ok: false, error: "Team not found" }, 404);

    const { data: pinOk, error: pinErr } = await supabaseAdmin
      .rpc("verify_team_pin", { team_id_in: team.id, pin_in: pin });

    if (pinErr) {
      console.error("PIN verification error:", pinErr);
      return json({ ok: false, error: `DB error verifying PIN: ${pinErr.message}` }, 500);
    }
    if (!pinOk) return json({ ok: false, error: "Invalid PIN" }, 401);

    const { data: missions, error } = await supabaseAdmin
      .from("missions")
      .select("name, updated_at")
      .eq("team_id", team.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("List missions error:", error);
      return json({ ok: false, error: `DB error listing missions: ${error.message}` }, 500);
    }

    return json({ ok: true, missions: missions ?? [] });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
