let cached_jwks = null;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function decode_base64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decode_json_part(value) {
  return JSON.parse(new TextDecoder().decode(decode_base64url(value)));
}

function configured_allowed_emails(env) {
  return String(env.ADMIN_ALLOWED_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function access_keys(team_domain) {
  const now = Date.now();
  if (cached_jwks?.team_domain === team_domain && cached_jwks.expires_at > now) return cached_jwks.keys;
  const response = await fetch(`https://${team_domain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("access_certs_unavailable");
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw new Error("access_certs_invalid");
  cached_jwks = { team_domain, keys: body.keys, expires_at: now + 60 * 60 * 1000 };
  return body.keys;
}

async function authenticate_access(request, env) {
  const team_domain = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const expected_aud = String(env.ACCESS_AUD || "").trim();
  const allowed_emails = configured_allowed_emails(env);
  if (!team_domain || !expected_aud || !allowed_emails.length) {
    return { ok: false, response: json({ ok: false, error: "admin_access_not_configured" }, 503) };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, response: json({ ok: false, error: "access_login_required" }, 401) };

  try {
    const header = decode_json_part(parts[0]);
    const claims = decode_json_part(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== "RS256" || !header.kid || claims.iss !== `https://${team_domain}`
        || !audiences.includes(expected_aud) || Number(claims.exp) <= now
        || (claims.nbf !== undefined && Number(claims.nbf) > now)) throw new Error("access_claims_invalid");
    const jwk = (await access_keys(team_domain)).find((candidate) => candidate.kid === header.kid);
    if (!jwk) throw new Error("access_key_not_found");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode_base64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const email = String(claims.email || "").trim().toLowerCase();
    if (!valid || !allowed_emails.includes(email)) throw new Error("access_email_denied");
    return { ok: true, email };
  } catch (error) {
    console.warn("Admin Access authentication failed:", error.message);
    return { ok: false, response: json({ ok: false, error: "admin_access_denied" }, 403) };
  }
}

function allowed_admin_request(method, path) {
  if (path === "licenses") return method === "GET" || method === "POST";
  if (/^licenses\/\d+$/.test(path)) return method === "PATCH" || method === "DELETE";
  if (/^licenses\/\d+\/status$/.test(path)) return method === "PATCH";
  return /^licenses\/\d+\/(extend|convert-trial|block-devices|unblock-devices|reset-devices)$/.test(path) && method === "POST";
}

export async function onRequest(context) {
  if (!context.env.LICENSE_API || !context.env.ADMIN_API_KEY) {
    return json({ ok: false, error: "admin_backend_not_configured" }, 503);
  }
  const authentication = await authenticate_access(context.request, context.env);
  if (!authentication.ok) return authentication.response;

  const raw_path = Array.isArray(context.params.path) ? context.params.path.join("/") : String(context.params.path || "");
  const method = context.request.method.toUpperCase();
  if (!allowed_admin_request(method, raw_path)) return json({ ok: false, error: "admin_route_not_allowed" }, 404);

  const incoming_url = new URL(context.request.url);
  const upstream_url = new URL(`https://license-api.internal/v1/admin/${raw_path}`);
  upstream_url.search = incoming_url.search;
  const headers = new Headers({ Authorization: `Bearer ${context.env.ADMIN_API_KEY}`, Accept: "application/json", "X-Admin-Email": authentication.email });
  let body;
  if (method !== "GET" && method !== "HEAD") {
    headers.set("Content-Type", "application/json; charset=UTF-8");
    body = await context.request.arrayBuffer();
  }

  try {
    const upstream = await context.env.LICENSE_API.fetch(new Request(upstream_url, { method, headers, body }));
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("Admin API proxy failed:", error);
    return json({ ok: false, error: "admin_backend_unavailable" }, 502);
  }
}
