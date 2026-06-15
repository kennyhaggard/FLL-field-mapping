import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const missionName = normalizeText(context.body.missionName);
  const mission = context.body.mission;

  if (!validateRecordName(missionName) || !mission || typeof mission !== "object") {
    return json({ ok: false, error: "Invalid mission payload." }, 400);
  }

  const now = new Date().toISOString();
  const { error } = await context.supabaseAdmin
    .from("missions")
    .upsert(
      { team_id: context.team.id, name: missionName, mission, updated_at: now },
      { onConflict: "team_id,name" }
    );

  if (error) {
    console.error("Save mission error:", error);
    return json({ ok: false, error: "Could not save mission." }, 500);
  }

  return json({ ok: true, saved: missionName, updatedAt: now });
});
