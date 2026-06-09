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
    const robot = body.robot;

    if (!teamName || !pin || !robotName || !robot) {
      return json({ ok: false, error: "Missing teamName/pin/robotName/robot" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("team_name", teamName)
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

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("robots")
      .upsert(
        { team_id: team.id, name: robotName, robot, updated_at: now },
        { onConflict: "team_id,name" }
      );

    if (error) {
      console.error("Save robot error:", error);
      return json({ ok: false, error: `DB error saving robot: ${error.message}` }, 500);
    }

    return json({ ok: true, saved: robotName, updatedAt: now });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
