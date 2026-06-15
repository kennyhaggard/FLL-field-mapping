import { json, normalizeText, requireTeam, validateRecordName } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const robotName = normalizeText(context.body.robotName);
  const robot = context.body.robot;

  if (!validateRecordName(robotName) || !robot || typeof robot !== "object") {
    return json({ ok: false, error: "Invalid robot payload." }, 400);
  }

  const now = new Date().toISOString();
  const { error } = await context.supabaseAdmin
    .from("robots")
    .upsert(
      { team_id: context.team.id, name: robotName, robot, updated_at: now },
      { onConflict: "team_id,name" }
    );

  if (error) {
    console.error("Save robot error:", error);
    return json({ ok: false, error: "Could not save robot." }, 500);
  }

  return json({ ok: true, saved: robotName, updatedAt: now });
});
