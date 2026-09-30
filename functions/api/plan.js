const PEATUS_API = "https://api.peatus.ee/routing/v1/routers/estonia/index/graphql";
const TIME_ZONE = "Europe/Tallinn";

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

function fmt(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function tallinnDateString(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const arriveBy = params.get("arriveBy");

  if (!from || !to) {
    return Response.json({ error: "Missing from/to stop id" }, { status: 400 });
  }

  let dateTimeArgs = "";
  if (arriveBy) {
    const dateStr = tallinnDateString(new Date());
    dateTimeArgs = `, date: "${dateStr}", time: "${arriveBy}", arriveBy: true`;
  }

  const data = await graphql(`{
    plan(fromPlace: "${from}", toPlace: "${to}", numItineraries: 4${dateTimeArgs}) {
      itineraries {
        startTime
        endTime
        duration
        legs {
          mode
          startTime
          endTime
          distance
          route { shortName }
          from { name }
          to { name }
        }
      }
    }
  }`);

  const itineraries = (data.plan.itineraries || [])
    .map((it) => ({
      start: fmt(it.startTime),
      end: fmt(it.endTime),
      durationMin: Math.round(it.duration / 60),
      legs: it.legs.map((leg) => ({
        mode: leg.mode,
        route: leg.route ? leg.route.shortName : null,
        from: leg.from.name,
        to: leg.to.name,
        start: fmt(leg.startTime),
        end: fmt(leg.endTime),
        walkMinutes: leg.mode === "WALK" ? Math.round((leg.endTime - leg.startTime) / 60000) : null,
      })),
    }))
    .sort((a, b) => (a.start > b.start ? 1 : -1));

  return Response.json({ itineraries });
}
