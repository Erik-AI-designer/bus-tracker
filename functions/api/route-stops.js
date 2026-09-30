const PEATUS_API = "https://api.peatus.ee/routing/v1/routers/estonia/index/graphql";
const TALLINN_AGENCY = "estonia:tallinn_10312960";

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
  const q = (new URL(request.url).searchParams.get("q") || "").trim().toUpperCase();
  if (!q) {
    return Response.json({ routes: [] });
  }

  const data = await graphql(`{
    agency(id: "${TALLINN_AGENCY}") {
      routes {
        gtfsId
        shortName
        longName
        mode
        patterns {
          directionId
          headsign
          stops { gtfsId name }
        }
      }
    }
  }`);

  const matches = data.agency.routes.filter((r) => r.shortName.toUpperCase() === q);

  const routes = matches.map((r) => {
    const seenDirections = new Map();
    for (const pattern of r.patterns) {
      if (!seenDirections.has(pattern.directionId)) {
        seenDirections.set(pattern.directionId, pattern);
      }
    }
    return {
      shortName: r.shortName,
      longName: r.longName,
      mode: r.mode,
      directions: [...seenDirections.values()].map((p) => ({
        headsign: p.headsign,
        stops: p.stops.map((s) => ({ id: s.gtfsId, name: s.name })),
      })),
    };
  });

  return Response.json({ routes });
}
