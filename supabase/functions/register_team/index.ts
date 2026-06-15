import {
  corsHeaders,
  createAdminClient,
  json,
  normalizeText,
  readJsonBody,
  validatePin,
  validateTeamName,
} from "../_shared/security.ts";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(turnstileToken: string, req: Request) {
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? "";
  if (!secret) return { ok: false, error: "Registration is not configured." };

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    "";

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", turnstileToken);
  if (ip) body.set("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const result = await resp.json();
  if (!result.success) {
    console.error("Turnstile failed:", result);
    return { ok: false, error: "Turnstile verification failed" };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const teamName = normalizeText(body.teamName);
    const teamNameKey = teamName.toLowerCase();
    const pin = normalizeText(body.pin);
    const coachEmail = normalizeText(body.coachEmail);
    const turnstileToken = normalizeText(body.turnstileToken);

    if (!validateTeamName(teamName) || !validatePin(pin) || !isValidEmail(coachEmail) || !turnstileToken) {
      return json({ ok: false, error: "Invalid registration details." }, 400);
    }

    const turnstile = await verifyTurnstile(turnstileToken, req);
    if (!turnstile.ok) return json({ ok: false, error: turnstile.error }, 400);

    const supabaseAdmin = createAdminClient();
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .ilike("team_name", teamName)
      .maybeSingle();

    if (existErr) {
      console.error("Existing team lookup error:", existErr);
      return json({ ok: false, error: "Could not check team name." }, 500);
    }
    if (existing) {
      return json({ ok: false, error: "Team name already registered" }, 409);
    }

    const salt = Deno.env.get("TEAM_PIN_SALT") ?? "";
    if (!salt) return json({ ok: false, error: "Registration is not configured." }, 500);

    const pinHash = await sha256Hex(`${teamNameKey}:${pin}:${salt}`);
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("teams")
      .insert({
        team_name: teamName,
        coach_email: coachEmail,
        pin_hash: pinHash,
      })
      .select("id, team_name")
      .single();

    if (insertErr || !created) {
      console.error("Insert team error:", insertErr);
      return json({ ok: false, error: "Could not register team." }, 500);
    }

    return json({ ok: true, team: created });
  } catch (error) {
    console.error("register_team error:", error);
    return json({ ok: false, error: "Registration failed." }, 500);
  }
});
