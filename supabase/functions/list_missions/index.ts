import { json, requireTeam } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const { data: missions, error } = await context.supabaseAdmin
    .from("missions")
    .select("name, updated_at")
    .eq("team_id", context.team.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("List missions error:", error);
    return json({ ok: false, error: "Could not list missions." }, 500);
  }

  return json({ ok: true, missions: missions ?? [] });
});
