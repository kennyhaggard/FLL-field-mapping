import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const robotName = normalizeText(context.body.robotName);
  if (!validateRecordName(robotName)) {
    return json({ ok: false, error: "Invalid robot name." }, 400);
  }

  const { data: row, error } = await context.supabaseAdmin
    .from("robots")
    .select("robot, updated_at")
    .eq("team_id", context.team.id)
    .eq("name", robotName)
    .maybeSingle();

  if (error) {
    console.error("Get robot error:", error);
    return json({ ok: false, error: "Could not load robot." }, 500);
  }
  if (!row) return json({ ok: false, error: "Robot not found" }, 404);

  return json({ ok: true, robot: row.robot, updatedAt: row.updated_at });
});
