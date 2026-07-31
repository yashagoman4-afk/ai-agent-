#!/usr/bin/env python3
"""Fetch Craigslist housing listings for one city via its public RSS feed.

Usage:
    python3 scan_craigslist.py --city newyork --category apa
"""

import argparse
import csv
import os
import sys
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = "Mozilla/5.0 (compatible; rental-scanner/0.1)"
DC_DATE = "{http://purl.org/dc/elements/1.1/}date"
CSV_FIELDS = ["city", "category", "title", "link", "date"]


def fetch_rss(city: str, category: str) -> bytes:
    url = f"https://{city}.craigslist.org/search/{category}?format=rss"
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Craigslist housing listings via RSS.")
    parser.add_argument("--city", default="newyork", help="Craigslist city subdomain, e.g. newyork, losangeles, chicago")
    parser.add_argument(
        "--category",
        default="apa",
        choices=["apa", "roo"],
        help="apa = apartments/housing offered, roo = rooms/shared wanted",
    )
    parser.add_argument("--output", default="listings.csv", help="CSV file to save listings into")
    args = parser.parse_args()

    try:
        xml_bytes = fetch_rss(args.city, args.category)
    except HTTPError as error:
        print(f"Request failed: HTTP {error.code}", file=sys.stderr)
        sys.exit(1)
    except URLError as error:
        print(f"Request failed: {error.reason}", file=sys.stderr)
        sys.exit(1)

    listings = parse_listings(xml_bytes)
    for listing in listings:
        listing["city"] = args.city
        listing["category"] = args.category

    already_saved = load_saved_links(args.output)
    new_listings = [listing for listing in listings if listing["link"] not in already_saved]
    save_new_listings(args.output, new_listings)

    print(f"Found {len(listings)} listings for {args.city}/{args.category}")
    print(f"{len(new_listings)} were new and got saved to {args.output}")
    print(f"{len(listings) - len(new_listings)} were already saved from before\n")
    for listing in new_listings:
        print(f"- {listing['title']}")
        print(f"  {listing['link']}")
        print(f"  {listing['date']}\n")


if __name__ == "__main__":
    main()
