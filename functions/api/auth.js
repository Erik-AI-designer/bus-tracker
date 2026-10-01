const SESSION_COOKIE = "creator_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

async function isCreator(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  return (await env.CHAT_KV.get("session:" + token)) === "creator";
}

export async function onRequestGet({ request, env }) {
  return Response.json({ isCreator: await isCreator(request, env) });
}

// Logging in checks the password against a Cloudflare environment variable
// (set once in the dashboard, never committed to the repo) — never a value
// baked into this public source file.
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (!body.password || body.password !== env.OWNER_PASSWORD) {
    return Response.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  const token = crypto.randomUUID();
  await env.CHAT_KV.put("session:" + token, "creator", { expirationTtl: SESSION_TTL_SECONDS });

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}; Path=/`
  );
  return new Response(JSON.stringify({ ok: true }), { headers });
}

export async function onRequestDelete({ request, env }) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.CHAT_KV.delete("session:" + token);

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
