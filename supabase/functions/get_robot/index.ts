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
    const robotName = String(body.robotName || "").trim();

    if (!teamName || !pin || !robotName) {
      return json({ ok: false, error: "Missing teamName/pin/robotName" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("team_name", teamName)
      .maybeSingle();

    if (!team) return json({ ok: false, error: "Team not found" }, 404);

    const { data: pinOk } = await supabaseAdmin
      .rpc("verify_team_pin", { team_id_in: team.id, pin_in: pin });

    if (!pinOk) return json({ ok: false, error: "Invalid PIN" }, 401);

    const { data: row, error } = await supabaseAdmin
      .from("robots")
      .select("robot, updated_at")
      .eq("team_id", team.id)
      .eq("name", robotName)
      .maybeSingle();

    if (error || !row) return json({ ok: false, error: "Robot not found" }, 404);

    return json({ ok: true, robot: row.robot, updatedAt: row.updated_at });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
