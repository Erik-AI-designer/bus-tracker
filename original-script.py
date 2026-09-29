import sys
from datetime import datetime, timedelta

import requests

STOP_HAMAR_TEE = 1573
STOP_LILLEPI = 1515

BUS8_ROUTE = "8"
CONNECTING_ROUTES = ["1", "5"]

BUS8_TRAVEL_MINUTES = 10
CONNECT_TRAVEL_MINUTES = 30
TRANSFER_BUFFER_MINUTES = 1

SCHOOL_ARRIVAL_TARGET = "08:45"


def get_departures(stop_id, routes):
    url = "https://transport.tallinn.ee/siri-stop-departures.php"
    response = requests.get(url, params={"stopid": stop_id}, headers={"user-agent": "Mozilla/5.0"})
    lines = response.text.splitlines()[2:]

    times_by_route = {route: [] for route in routes}
    for line in lines:
        fields = line.split(",")
        route_num = fields[1]
        minutes = int(fields[5]) // 60
        if route_num in times_by_route:
            times_by_route[route_num].append(minutes)

    return times_by_route


def print_departures(stop_name, times_by_route):
    print(f"── {stop_name} ──")
    for route, times in times_by_route.items():
        times_text = ", ".join(f"{m} min" for m in times) or "no upcoming buses"
        print(f"  Bus {route:<3} {times_text}")
    print()


def plan_school_trip(now, hamar_departures, lillepi_departures):
    target = datetime.strptime(SCHOOL_ARRIVAL_TARGET, "%H:%M").replace(
        year=now.year, month=now.month, day=now.day
    )

    hamar_departures = sorted(hamar_departures[BUS8_ROUTE])
    connecting_times = sorted(
        (now + timedelta(minutes=m), route)
        for route, minutes_list in lillepi_departures.items()
        for m in minutes_list
    )

    print(f"── Bus 8 options from Hämar tee (target: school by {SCHOOL_ARRIVAL_TARGET}) ──")
    for i, minutes in enumerate(hamar_departures[:2], start=1):
        depart_hamar = now + timedelta(minutes=minutes)
        arrive_lillepi = depart_hamar + timedelta(minutes=BUS8_TRAVEL_MINUTES)
        earliest_connect = arrive_lillepi + timedelta(minutes=TRANSFER_BUFFER_MINUTES)

        connection = next((dt_route for dt_route in connecting_times if dt_route[0] >= earliest_connect), None)

        label = "1st" if i == 1 else "2nd"
        if connection is None:
            print(f"  {label} bus 8 (departs {depart_hamar:%H:%M}): no connecting bus found in current data")
            continue

        depart_lillepi, connect_route = connection
        arrive_school = depart_lillepi + timedelta(minutes=CONNECT_TRAVEL_MINUTES)
        status = "on time" if arrive_school <= target else "LATE"

        print(
            f"  {label} bus 8 (departs {depart_hamar:%H:%M}) -> bus {connect_route} "
            f"at Lillepi ({depart_lillepi:%H:%M}) -> school ~{arrive_school:%H:%M} [{status}]"
        )


if __name__ == "__main__":
    now = datetime.now()
    if now.weekday() >= 5:
        print("It's the weekend — no school run today.")
        sys.exit(0)

    hamar_departures = get_departures(STOP_HAMAR_TEE, ["8", "48"])
    lillepi_departures = get_departures(STOP_LILLEPI, CONNECTING_ROUTES)

    print_departures("Hämar tee", hamar_departures)
    print_departures("Lillepi", lillepi_departures)

    plan_school_trip(now, hamar_departures, lillepi_departures)
