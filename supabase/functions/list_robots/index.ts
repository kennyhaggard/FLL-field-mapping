import { json, requireTeam } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const context = await requireTeam(req);
  if (context.response) return context.response;

  const { data: robots, error } = await context.supabaseAdmin
    .from("robots")
    .select("name, updated_at")
    .eq("team_id", context.team.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("List robots error:", error);
    return json({ ok: false, error: "Could not list robots." }, 500);
  }

  return json({ ok: true, robots: robots ?? [] });
});
