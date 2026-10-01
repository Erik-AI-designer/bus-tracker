const SESSION_COOKIE = "creator_session";
const MAX_MESSAGES = 50;

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
  const params = new URL(request.url).searchParams;

  if (params.get("inbox") === "1") {
    if (!(await isCreator(request, env))) {
      return Response.json({ error: "Not logged in" }, { status: 403 });
    }
    const indexRaw = await env.CHAT_KV.get("chat:index");
    const visitorIds = indexRaw ? JSON.parse(indexRaw) : [];
    const conversations = [];
    for (const id of visitorIds) {
      const raw = await env.CHAT_KV.get("chat:" + id);
      conversations.push({ visitorId: id, messages: raw ? JSON.parse(raw) : [] });
    }
    return Response.json({ conversations });
  }

  const visitorId = params.get("visitorId");
  if (!visitorId) {
    return Response.json({ error: "Missing visitorId" }, { status: 400 });
  }
  const raw = await env.CHAT_KV.get("chat:" + visitorId);
  return Response.json({ messages: raw ? JSON.parse(raw) : [] });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const visitorId = body.visitorId;
  const text = (body.text || "").slice(0, 500).trim();
  const from = body.from === "erik" ? "erik" : "visitor";

  if (!visitorId || !text) {
    return Response.json({ error: "Missing visitorId or text" }, { status: 400 });
  }
  // The "erik" sender is only trusted when the request carries a real,
  // server-verified creator session — never because the client claims it.
  if (from === "erik" && !(await isCreator(request, env))) {
    return Response.json({ error: "Not logged in as the creator" }, { status: 403 });
  }

  const raw = await env.CHAT_KV.get("chat:" + visitorId);
  const messages = raw ? JSON.parse(raw) : [];
  messages.push({ from, text, time: Date.now() });
  while (messages.length > MAX_MESSAGES) messages.shift();
  await env.CHAT_KV.put("chat:" + visitorId, JSON.stringify(messages));

  if (from === "visitor") {
    const indexRaw = await env.CHAT_KV.get("chat:index");
    const visitorIds = indexRaw ? JSON.parse(indexRaw) : [];
    if (!visitorIds.includes(visitorId)) {
      visitorIds.push(visitorId);
      await env.CHAT_KV.put("chat:index", JSON.stringify(visitorIds));
    }
  }

  return Response.json({ ok: true, messages });
}
