const PEATUS_API = "https://api.peatus.ee/routing/v1/routers/estonia/index/graphql";

async function graphql(query) {
  const response = await fetch(PEATUS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await response.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.trim().length < 2) {
    return Response.json({ stops: [] });
  }

  const data = await graphql(`{
    stops(name: "${q.replace(/"/g, "")}", maxResults: 10) {
      gtfsId
      name
      lat
      lon
      routes { shortName }
    }
  }`);

  const stops = data.stops.map((s) => ({
    id: s.gtfsId,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    routes: [...new Set(s.routes.map((r) => r.shortName))].sort(),
  }));

  return Response.json({ stops });
}
