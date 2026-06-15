import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const missionName = normalizeText(context.body.missionName);
  if (!validateRecordName(missionName)) {
    return json({ ok: false, error: "Invalid mission name." }, 400);
  }

  const { data: row, error } = await context.supabaseAdmin
    .from("missions")
    .select("mission, updated_at")
    .eq("team_id", context.team.id)
    .eq("name", missionName)
    .maybeSingle();

  if (error) {
    console.error("Get mission error:", error);
    return json({ ok: false, error: "Could not load mission." }, 500);
  }
  if (!row) return json({ ok: false, error: "Mission not found" }, 404);

  return json({ ok: true, mission: row.mission, updatedAt: row.updated_at });
});
