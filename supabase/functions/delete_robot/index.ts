import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const robotName = normalizeText(context.body.name || context.body.robotName);
  if (!validateRecordName(robotName)) {
    return json({ ok: false, error: "Invalid robot name." }, 400);
  }

  const { error, count } = await context.supabaseAdmin
    .from("robots")
    .delete({ count: "exact" })
    .eq("team_id", context.team.id)
    .eq("name", robotName);

  if (error) {
    console.error("Delete robot error:", error);
    return json({ ok: false, error: "Could not delete robot." }, 500);
  }
  if (!count || count === 0) return json({ ok: false, error: "Robot not found" }, 404);

  return json({ ok: true, deleted: count, name: robotName });
});
