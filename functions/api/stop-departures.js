export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const routes = (params.get("routes") || "").split(",").filter(Boolean);

  if (!id || !routes.length) {
    return Response.json({ error: "Missing id or routes" }, { status: 400 });
  }

  const legacyStopId = id.split(":")[1];
  const url = new URL("https://transport.tallinn.ee/siri-stop-departures.php");
  url.searchParams.set("stopid", legacyStopId);
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const text = await response.text();
  const lines = text.split("\n").slice(2);
  const timesByRoute = Object.fromEntries(routes.map((r) => [r, []]));
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split(",");
    const routeNum = fields[1];
    const minutes = Math.floor(Number(fields[5]) / 60);
    if (routeNum in timesByRoute) timesByRoute[routeNum].push(minutes);
  }

  return Response.json({ departures: timesByRoute });
}
