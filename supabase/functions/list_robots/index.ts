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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("team_name", teamName)
      .maybeSingle();

    if (teamErr || !team) return json({ ok: false, error: "Team not found" }, 404);

    const { data: pinOk, error: pinErr } = await supabaseAdmin
      .rpc("verify_team_pin", { team_id_in: team.id, pin_in: pin });

    if (pinErr || !pinOk) return json({ ok: false, error: "Invalid PIN" }, 401);

    const { data: robots, error } = await supabaseAdmin
      .from("robots")
      .select("name, updated_at")
      .eq("team_id", team.id)
      .order("updated_at", { ascending: false });

    if (error) return json({ ok: false, error: "DB error listing robots" }, 500);

    return json({ ok: true, robots: robots ?? [] });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
