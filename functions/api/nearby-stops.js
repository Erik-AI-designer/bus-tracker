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
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Missing or invalid lat/lon" }, { status: 400 });
  }

  const data = await graphql(`{
    nearest(lat: ${lat}, lon: ${lon}, maxDistance: 1500, maxResults: 6, filterByPlaceTypes: STOP) {
      edges {
        node {
          distance
          place {
            ... on Stop {
              gtfsId
              name
              routes { shortName }
            }
          }
        }
      }
    }
  }`);

  const stops = data.nearest.edges.map((e) => ({
    id: e.node.place.gtfsId,
    name: e.node.place.name,
    distance: e.node.distance,
    routes: [...new Set(e.node.place.routes.map((r) => r.shortName))].sort(),
  }));

  return Response.json({ stops });
}
