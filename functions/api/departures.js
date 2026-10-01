const STOP_HAMAR_TEE = "estonia:1573";
const STOP_LILLEPI = "estonia:1515";

const BUS8_ROUTE = "8";
const CONNECTING_ROUTES = ["1", "5"];

const BUS8_TRAVEL_MINUTES = 10;
const CONNECT_TRAVEL_MINUTES = 30;
const TRANSFER_BUFFER_MINUTES = 1;

const SCHOOL_ARRIVAL_TARGET = "08:00";
const TIME_ZONE = "Europe/Tallinn";

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

// Full scheduled timetable for one stop/date, as a flat list of {routeName, time} (absolute JS Date).
async function getScheduledDepartures(stopId, routeNames, dateYyyymmdd) {
  const data = await graphql(`{
    stop(id: "${stopId}") {
      stoptimesForServiceDate(date: "${dateYyyymmdd}") {
        pattern { route { shortName } }
        stoptimes { scheduledDeparture serviceDay }
      }
    }
  }`);

  const patterns = data.stop.stoptimesForServiceDate || [];
  const departures = [];
  for (const pattern of patterns) {
    const routeName = pattern.pattern.route.shortName;
    if (!routeNames.includes(routeName)) continue;
    for (const st of pattern.stoptimes) {
      departures.push({
        route: routeName,
        time: new Date((st.serviceDay + st.scheduledDeparture) * 1000),
      });
    }
  }
  departures.sort((a, b) => a.time - b.time);
  return departures;
}

function fmt(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
}

function tallinnDateString(date, separator) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}${separator}${get("month")}${separator}${get("day")}`;
}

function tallinnOffsetMinutes(date) {
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName").value;
  const match = offsetPart.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

// The next occurrence (today or tomorrow) of hh:mm in Tallinn time, on or after `now`.
function nextTallinnOccurrence(now, hh, mm) {
  const dateStr = tallinnDateString(now, "-");
  const offsetMinutes = tallinnOffsetMinutes(now);
  const utcGuess = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  let target = new Date(utcGuess.getTime() - offsetMinutes * 60000);
  if (target < now) target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  return target;
}

function isTallinnWeekend(date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

async function planSchoolTrip(now, arrivalTarget) {
  const [h, m] = arrivalTarget.split(":").map(Number);
  const target = nextTallinnOccurrence(now, h, m);
  const dateYyyymmdd = tallinnDateString(target, "");

  const [hamarDepartures, lillepiDepartures] = await Promise.all([
    getScheduledDepartures(STOP_HAMAR_TEE, [BUS8_ROUTE], dateYyyymmdd),
    getScheduledDepartures(STOP_LILLEPI, CONNECTING_ROUTES, dateYyyymmdd),
  ]);

  const candidates = [];
  for (const dep of hamarDepartures) {
    if (dep.time < now) continue;
    const arriveLillepi = new Date(dep.time.getTime() + BUS8_TRAVEL_MINUTES * 60000);
    const earliestConnect = new Date(arriveLillepi.getTime() + TRANSFER_BUFFER_MINUTES * 60000);
    const connection = lillepiDepartures.find((c) => c.time >= earliestConnect);
    if (!connection) continue;
    const arriveSchool = new Date(connection.time.getTime() + CONNECT_TRAVEL_MINUTES * 60000);
    candidates.push({
      departHamar: fmt(dep.time),
      connectRoute: connection.route,
      departLillepi: fmt(connection.time),
      arriveSchool: fmt(arriveSchool),
      onTime: arriveSchool <= target,
    });
  }

  if (!candidates.length) {
    return [{ status: "no bus 8 departures found for that day" }];
  }

  const onTimeOptions = candidates.filter((c) => c.onTime);
  if (onTimeOptions.length) {
    // Latest (most efficient) on-time options first.
    return onTimeOptions.slice(-2).reverse();
  }

  // Nothing arrives in time — show the earliest options so it's clear how late they'd be.
  return candidates.slice(0, 2);
}

export async function onRequestGet({ request }) {
  const now = new Date();
  const arrivalTarget = new URL(request.url).searchParams.get("arriveBy") || SCHOOL_ARRIVAL_TARGET;
  const plan = await planSchoolTrip(now, arrivalTarget);

  return Response.json({
    now: fmt(now),
    isWeekend: isTallinnWeekend(now),
    plan,
  });
}
