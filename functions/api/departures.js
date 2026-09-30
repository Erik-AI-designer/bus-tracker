const STOP_HAMAR_TEE = 1573;
const STOP_LILLEPI = 1515;

const BUS8_ROUTE = "8";
const CONNECTING_ROUTES = ["1", "5"];

const BUS8_TRAVEL_MINUTES = 10;
const CONNECT_TRAVEL_MINUTES = 30;
const TRANSFER_BUFFER_MINUTES = 1;

const SCHOOL_ARRIVAL_TARGET = "08:00";
const TIME_ZONE = "Europe/Tallinn";

async function getDepartures(stopId, routes) {
  const url = new URL("https://transport.tallinn.ee/siri-stop-departures.php");
  url.searchParams.set("stopid", stopId);
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
  return timesByRoute;
}

function fmt(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
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

function tallinnTarget(date, hh, mm) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const offsetMinutes = tallinnOffsetMinutes(date);
  const utcGuess = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`
  );
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

function isTallinnWeekend(date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

function planSchoolTrip(now, hamarDepartures, lillepiDepartures) {
  const [h, m] = SCHOOL_ARRIVAL_TARGET.split(":").map(Number);
  const target = tallinnTarget(now, h, m);
  const hamarTimes = [...hamarDepartures[BUS8_ROUTE]].sort((a, b) => a - b);
  const connectingTimes = [];
  for (const [route, minutesList] of Object.entries(lillepiDepartures)) {
    for (const mins of minutesList) {
      connectingTimes.push({ time: new Date(now.getTime() + mins * 60000), route });
    }
  }
  connectingTimes.sort((a, b) => a.time - b.time);
  const options = [];
  for (const minutes of hamarTimes.slice(0, 2)) {
    const departHamar = new Date(now.getTime() + minutes * 60000);
    const arriveLillepi = new Date(departHamar.getTime() + BUS8_TRAVEL_MINUTES * 60000);
    const earliestConnect = new Date(arriveLillepi.getTime() + TRANSFER_BUFFER_MINUTES * 60000);
    const connection = connectingTimes.find((c) => c.time >= earliestConnect);
    if (!connection) {
      options.push({ departHamar: fmt(departHamar), status: "no connecting bus found in current data" });
      continue;
    }
    const arriveSchool = new Date(connection.time.getTime() + CONNECT_TRAVEL_MINUTES * 60000);
    options.push({
      departHamar: fmt(departHamar),
      connectRoute: connection.route,
      departLillepi: fmt(connection.time),
      arriveSchool: fmt(arriveSchool),
      onTime: arriveSchool <= target,
    });
  }
  return options;
}

export async function onRequestGet() {
  const now = new Date();
  const [hamarDepartures, lillepiDepartures] = await Promise.all([
    getDepartures(STOP_HAMAR_TEE, ["8", "48"]),
    getDepartures(STOP_LILLEPI, CONNECTING_ROUTES),
  ]);
  const plan = planSchoolTrip(now, hamarDepartures, lillepiDepartures);
  return Response.json({
    now: fmt(now),
    isWeekend: isTallinnWeekend(now),
    hamarTee: hamarDepartures,
    lillepi: lillepiDepartures,
    plan,
  });
}
