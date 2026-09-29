const STOP_HAMAR_TEE = 1573;
const STOP_LILLEPI = 1515;

const BUS8_ROUTE = "8";
const CONNECTING_ROUTES = ["1", "5"];

const BUS8_TRAVEL_MINUTES = 10;
const CONNECT_TRAVEL_MINUTES = 30;
const TRANSFER_BUFFER_MINUTES = 1;

const SCHOOL_ARRIVAL_TARGET = "08:45";

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
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function planSchoolTrip(now, hamarDepartures, lillepiDepartures) {
  const [h, m] = SCHOOL_ARRIVAL_TARGET.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
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
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    hamarTee: hamarDepartures,
    lillepi: lillepiDepartures,
    plan,
  });
}
