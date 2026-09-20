const SESSION_COOKIE = "__Host-baram_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, extra_headers = {}) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=UTF-8",
    "X-Content-Type-Options": "nosniff",
    ...extra_headers,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function encode_base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode_base64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function configured_password(env) {
  return String(env.ADMIN_LOGIN_PASSWORD || "");
}

function login_configured(env) {
  return configured_password(env).length >= 16;
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function equal_bytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function password_matches(candidate, env) {
  const [candidate_hash, expected_hash] = await Promise.all([
    sha256(String(candidate || "")),
    sha256(configured_password(env)),
  ]);
  return equal_bytes(candidate_hash, expected_hash);
}

async function session_key(env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(configured_password(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function create_session(env) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = encode_base64url(new TextEncoder().encode(JSON.stringify({
    version: 1,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: encode_base64url(nonce),
  })));
  const signature = await crypto.subtle.sign("HMAC", await session_key(env), new TextEncoder().encode(payload));
  return `${payload}.${encode_base64url(new Uint8Array(signature))}`;
}

function cookie_value(request, name) {
  for (const part of String(request.headers.get("Cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

async function has_valid_session(request, env) {
  const token = cookie_value(request, SESSION_COOKIE);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await session_key(env),
      decode_base64url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const session = JSON.parse(new TextDecoder().decode(decode_base64url(payload)));
    return session.version === 1 && Number(session.expires_at) > Math.floor(Date.now() / 1000);
  } catch (_error) {
    return false;
  }
}

function session_cookie(token, max_age = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${max_age}`;
}

function request_is_same_origin(request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function allowed_admin_request(method, path) {
  if (path === "licenses") return method === "GET" || method === "POST";
  if (/^licenses\/\d+$/.test(path)) return method === "PATCH" || method === "DELETE";
  if (/^licenses\/\d+\/status$/.test(path)) return method === "PATCH";
  return /^licenses\/\d+\/(extend|convert-trial|block-devices|unblock-devices|reset-devices)$/.test(path) && method === "POST";
}

async function handle_auth(request, env, path, method) {
  if (path === "auth/status" && method === "GET") {
    if (!login_configured(env)) return json({ ok: false, error: "admin_login_not_configured" }, 503);
    return json({ ok: true, authenticated: await has_valid_session(request, env) });
  }

  if (path === "auth/login" && method === "POST") {
    if (!login_configured(env)) return json({ ok: false, error: "admin_login_not_configured" }, 503);
    if (!request_is_same_origin(request)) return json({ ok: false, error: "invalid_request_origin" }, 403);
    let body;
    try {
      body = await request.json();
    } catch (_error) {
      return json({ ok: false, error: "invalid_login_request" }, 400);
    }
    if (typeof body.password !== "string" || body.password.length > 512 || !(await password_matches(body.password, env))) {
      return json({ ok: false, error: "invalid_admin_password" }, 401);
    }
    const token = await create_session(env);
    return json({ ok: true }, 200, { "Set-Cookie": session_cookie(token) });
  }

  if (path === "auth/logout" && method === "POST") {
    if (!request_is_same_origin(request)) return json({ ok: false, error: "invalid_request_origin" }, 403);
    return json({ ok: true }, 200, { "Set-Cookie": session_cookie("", 0) });
  }

  return null;
}

export async function onRequest(context) {
  const raw_path = Array.isArray(context.params.path) ? context.params.path.join("/") : String(context.params.path || "");
  const method = context.request.method.toUpperCase();
  const auth_response = await handle_auth(context.request, context.env, raw_path, method);
  if (auth_response) return auth_response;

  if (!context.env.LICENSE_API || !context.env.ADMIN_API_KEY) {
    return json({ ok: false, error: "admin_backend_not_configured" }, 503);
  }
  if (!login_configured(context.env)) return json({ ok: false, error: "admin_login_not_configured" }, 503);
  if (!(await has_valid_session(context.request, context.env))) {
    return json({ ok: false, error: "admin_login_required" }, 401);
  }
  if (method !== "GET" && method !== "HEAD" && !request_is_same_origin(context.request)) {
    return json({ ok: false, error: "invalid_request_origin" }, 403);
  }
  if (!allowed_admin_request(method, raw_path)) return json({ ok: false, error: "admin_route_not_allowed" }, 404);

  const incoming_url = new URL(context.request.url);
  const upstream_url = new URL(`https://license-api.internal/v1/admin/${raw_path}`);
  upstream_url.search = incoming_url.search;
  const headers = new Headers({ Authorization: `Bearer ${context.env.ADMIN_API_KEY}`, Accept: "application/json" });
  let body;
  if (method !== "GET" && method !== "HEAD") {
    headers.set("Content-Type", "application/json; charset=UTF-8");
    body = await context.request.arrayBuffer();
  }

  try {
    const upstream = await context.env.LICENSE_API.fetch(new Request(upstream_url, { method, headers, body }));
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Admin API proxy failed:", error);
    return json({ ok: false, error: "admin_backend_unavailable" }, 502);
  }
}
