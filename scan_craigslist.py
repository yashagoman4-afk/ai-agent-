#!/usr/bin/env python3
"""Fetch classifieds-style housing listings for one or more cities via public RSS feeds.

Usage:
    python3 scan_craigslist.py --city newyork miami sfbay --category apa

Adding a new site (once you've confirmed it has a real, no-login RSS feed):
    Just add one line to the SOURCES dict below, using {city} and {category}
    as placeholders for whatever that site's URL needs.
"""

import argparse
import csv
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = "Mozilla/5.0 (compatible; rental-scanner/0.1)"
DC_DATE = "{http://purl.org/dc/elements/1.1/}date"
CSV_FIELDS = ["source", "city", "category", "title", "link", "date"]

# Every source we scan, and the URL template for its RSS feed.
# {city} and {category} get filled in from --city / --category.
# Only add a site here once you've personally confirmed the URL returns
# real RSS/XML without needing to log in - a guessed URL just breaks silently.
SOURCES = {
    "craigslist": "https://{city}.craigslist.org/search/{category}?format=rss",
}

# Craigslist's web addresses for each city (not always the plain city name).
DEFAULT_CITIES = [
    "newyork",
    "miami",
    "sfbay",  # San Francisco Bay Area
    "losangeles",
    "boston",
    "chicago",
    "washingtondc",
    "philadelphia",
    "newmexico",  # covers the whole state, not just one city
]

SECONDS_BETWEEN_REQUESTS = 2


def fetch_rss(source: str, city: str, category: str) -> bytes:
    url = SOURCES[source].format(city=city, category=category)
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=15) as response:
        return response.read()


def parse_listings(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    listings = []
    for item in root.iter("item"):
        listings.append(
            {
                "title": (item.findtext("title") or "").strip(),
                "link": (item.findtext("link") or "").strip(),
                "date": (item.findtext(DC_DATE) or item.findtext("pubDate") or "").strip(),
            }
        )
    return listings


def load_saved_links(csv_path: str) -> set[str]:
    if not os.path.exists(csv_path):
        return set()
    with open(csv_path, newline="", encoding="utf-8") as csv_file:
        return {row["link"] for row in csv.DictReader(csv_file)}


def save_new_listings(csv_path: str, listings: list[dict]) -> int:
    file_exists = os.path.exists(csv_path)
    with open(csv_path, "a", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        for listing in listings:
            writer.writerow(listing)
    return len(listings)


def scan_city(source: str, city: str, category: str, output: str) -> None:
    tag = f"{source}/{city}"
    try:
        xml_bytes = fetch_rss(source, city, category)
    except HTTPError as error:
        print(f"[{tag}] Request failed: HTTP {error.code}", file=sys.stderr)
        return
    except URLError as error:
        print(f"[{tag}] Request failed: {error.reason}", file=sys.stderr)
        return

    listings = parse_listings(xml_bytes)
    for listing in listings:
        listing["source"] = source
        listing["city"] = city
        listing["category"] = category

    already_saved = load_saved_links(output)
    new_listings = [listing for listing in listings if listing["link"] not in already_saved]
    save_new_listings(output, new_listings)

    print(f"[{tag}] found {len(listings)}, saved {len(new_listings)} new, {len(listings) - len(new_listings)} already had")
    for listing in new_listings:
        print(f"  - {listing['title']}")
        print(f"    {listing['link']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch classifieds housing listings via RSS.")
    parser.add_argument(
        "--source",
        nargs="+",
        default=list(SOURCES.keys()),
        choices=list(SOURCES.keys()),
        help="Which site(s) to scan (see the SOURCES dict at the top of this file)",
    )
    parser.add_argument(
        "--city",
        nargs="+",
        default=DEFAULT_CITIES,
        help="One or more Craigslist city codes, e.g. --city newyork sfbay chicago",
    )
    parser.add_argument(
        "--category",
        default="apa",
        choices=["apa", "roo"],
        help="apa = apartments/housing offered, roo = rooms/shared wanted",
    )
    parser.add_argument("--output", default="listings.csv", help="CSV file to save listings into")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Keep running forever, doing a fresh scan every --interval seconds (stop with Ctrl+C)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=300,
        help="Seconds to wait between scans when --loop is on (default 300 = 5 minutes)",
    )
    args = parser.parse_args()

    if args.loop and args.interval < 60:
        parser.error("--interval must be at least 60 seconds to avoid overloading Craigslist")

    jobs = [(source, city) for source in args.source for city in args.city]

    while True:
        print(f"\n=== Scan started {datetime.now():%Y-%m-%d %H:%M:%S} ===")
        for index, (source, city) in enumerate(jobs):
            scan_city(source, city, args.category, args.output)
            if index < len(jobs) - 1:
                time.sleep(SECONDS_BETWEEN_REQUESTS)

        if not args.loop:
            break

        print(f"Sleeping {args.interval} seconds until next scan... (Ctrl+C to stop)")
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
