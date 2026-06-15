import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://kennyhaggard.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_REQUEST_BYTES = 96_000;
const MAX_NAME_LENGTH = 80;

type AdminClient = ReturnType<typeof createAdminClient>;
type TeamContext =
  | { response: Response; body?: never; team?: never; supabaseAdmin?: never }
  | {
      response: null;
      body: Record<string, unknown>;
      team: { id: string };
      supabaseAdmin: AdminClient;
    };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function readJsonBody(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new Error("Request body is too large.");
  }

  const text = await req.text();
  if (text.length > MAX_REQUEST_BYTES) {
    throw new Error("Request body is too large.");
  }

  return text ? JSON.parse(text) : {};
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function validateTeamName(teamName: string) {
  return teamName.length >= 2 && teamName.length <= 40;
}

function validatePin(pin: string) {
  return /^\d{4}$/.test(pin);
}

function validateRecordName(name: string) {
  return name.length > 0 && name.length <= MAX_NAME_LENGTH;
}

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

async function findTeam(supabaseAdmin: AdminClient, teamName: string) {
  const { data: team, error } = await supabaseAdmin
    .from("teams")
    .select("id")
    .ilike("team_name", teamName)
    .maybeSingle();

  if (error) {
    console.error("Team lookup error:", error);
    return { team: null, response: json({ ok: false, error: "Could not load team." }, 500) };
  }
  if (!team) {
    return { team: null, response: json({ ok: false, error: "Invalid team name or PIN." }, 401) };
  }

  return { team, response: null };
}

async function verifyTeamPin(
  supabaseAdmin: AdminClient,
  teamId: string,
  pin: string
) {
  const { data: pinOk, error } = await supabaseAdmin
    .rpc("verify_team_pin", { team_id_in: teamId, pin_in: pin });

  if (error) {
    console.error("PIN verification error:", error);
    return { ok: false, response: json({ ok: false, error: "Could not verify team PIN." }, 500) };
  }
  if (!pinOk) {
    return { ok: false, response: json({ ok: false, error: "Invalid team name or PIN." }, 401) };
  }

  return { ok: true, response: null };
}

async function requireTeam(req: Request): Promise<TeamContext> {
  if (req.method === "OPTIONS") return { response: new Response("ok", { headers: CORS_HEADERS }) };
  if (req.method !== "POST") return { response: json({ ok: false, error: "Method not allowed" }, 405) };

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON body.";
    return { response: json({ ok: false, error: message }, 400) };
  }

  const teamName = normalizeText(body.teamName);
  const pin = normalizeText(body.pin || body.teamPin);

  if (!validateTeamName(teamName) || !validatePin(pin)) {
    return { response: json({ ok: false, error: "Invalid team name or PIN." }, 400) };
  }

  const supabaseAdmin = createAdminClient();
  const { team, response: teamResponse } = await findTeam(supabaseAdmin, teamName);
  if (teamResponse) return { response: teamResponse };

  const { ok, response: pinResponse } = await verifyTeamPin(supabaseAdmin, team.id, pin);
  if (!ok) return { response: pinResponse };

  return { body, team: { id: team.id }, supabaseAdmin, response: null };
}

export {
  CORS_HEADERS as corsHeaders,
  createAdminClient,
  json,
  normalizeText,
  readJsonBody,
  requireTeam,
  validatePin,
  validateRecordName,
  validateTeamName,
};
