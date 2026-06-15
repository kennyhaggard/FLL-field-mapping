import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const missionName = normalizeText(context.body.name || context.body.missionName);
  if (!validateRecordName(missionName)) {
    return json({ ok: false, error: "Invalid mission name." }, 400);
  }

  const { error, count } = await context.supabaseAdmin
    .from("missions")
    .delete({ count: "exact" })
    .eq("team_id", context.team.id)
    .eq("name", missionName);

  if (error) {
    console.error("Delete mission error:", error);
    return json({ ok: false, error: "Could not delete mission." }, 500);
  }
  if (!count || count === 0) return json({ ok: false, error: "Mission not found" }, 404);

  return json({ ok: true, deleted: count, name: missionName });
});
