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
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = "Mozilla/5.0 (compatible; rental-scanner/0.1)"
DC_DATE = "{http://purl.org/dc/elements/1.1/}date"
CSV_FIELDS = ["source", "city", "category", "title", "link", "date"]

DEFAULT_TEMPLATE = """\
Hi, I saw your listing "{title}" and I'm interested. Is it still available?

(This message was drafted for you - nothing gets sent automatically.
Edit reply_template.txt to write your own wording. You can use
{{title}}, {{link}}, and {{price}} anywhere in it.)
"""

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


def extract_price(title: str) -> int | None:
    match = re.search(r"\$([\d,]+)", title)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def listing_matches(listing: dict, keywords: list[str] | None, max_price: int | None) -> bool:
    if keywords:
        title_lower = listing["title"].lower()
        if not any(keyword.lower() in title_lower for keyword in keywords):
            return False
    if max_price is not None:
        price = extract_price(listing["title"])
        if price is None or price > max_price:
            return False
    return True


def load_template(template_path: str) -> str:
    if not os.path.exists(template_path):
        with open(template_path, "w", encoding="utf-8") as file:
            file.write(DEFAULT_TEMPLATE)
        print(f"Created {template_path} - edit it any time to change your reply wording.")
    with open(template_path, encoding="utf-8") as file:
        return file.read()


def write_draft(drafts_path: str, drafts_json_path: str, template: str, listing: dict) -> None:
    price = extract_price(listing["title"])
    message = template.format(title=listing["title"], link=listing["link"], price=price if price is not None else "?")
    message = message.strip()

    with open(drafts_path, "a", encoding="utf-8") as file:
        file.write("=" * 60 + "\n")
        file.write(f"Listing: {listing['title']}\n")
        file.write(f"Link:    {listing['link']}\n")
        file.write(f"Go here to actually reply: {listing['link']}\n\n")
        file.write(message + "\n\n")

    records = []
    if os.path.exists(drafts_json_path):
        with open(drafts_json_path, encoding="utf-8") as file:
            records = json.load(file)
    records.append({"title": listing["title"], "link": listing["link"], "message": message})
    with open(drafts_json_path, "w", encoding="utf-8") as file:
        json.dump(records, file, indent=2)

    print(f"  >> DRAFTED a reply for you in {drafts_path} - go read it and send it yourself!")


REVIEW_PAGE_TEMPLATE = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Reply Review Queue</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 20px; }
  #progress { color: #666; margin-bottom: 16px; }
  #title { font-weight: bold; margin-bottom: 4px; }
  #link { display: block; margin-bottom: 12px; word-break: break-all; }
  textarea { width: 100%; height: 160px; box-sizing: border-box; font-family: inherit; font-size: 14px; padding: 8px; }
  .buttons { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
  button { padding: 10px 16px; font-size: 14px; cursor: pointer; border-radius: 6px; border: 1px solid #ccc; background: #f5f5f5; }
  #next { background: #2563eb; color: white; border-color: #2563eb; font-weight: bold; }
  #done { font-size: 18px; margin-top: 40px; }
</style>
</head>
<body>
<h1>Reply Review Queue</h1>
<p>This page never sends anything by itself. For each listing: click <b>Open listing</b>,
reply on that site yourself using the pasted message, then click <b>Sent it - Next</b>
to move on (your tab stays open in case you want to go back to it).</p>
<div id="progress"></div>
<div id="card">
  <div id="title"></div>
  <a id="link" target="_blank"></a>
  <textarea id="message" readonly></textarea>
  <div class="buttons">
    <button id="copy">Copy message</button>
    <button id="open">Open listing</button>
    <button id="next">Sent it - Next</button>
    <button id="skip">Skip this one</button>
  </div>
</div>
<div id="done" style="display:none">All done for now! Re-run the scanner and reload this page for more.</div>
<script>
const DRAFTS = __DRAFTS_JSON__;
let index = 0;

function render() {
  if (index >= DRAFTS.length) {
    document.getElementById("card").style.display = "none";
    document.getElementById("progress").style.display = "none";
    document.getElementById("done").style.display = "block";
    return;
  }
  const draft = DRAFTS[index];
  document.getElementById("progress").textContent = (index + 1) + " of " + DRAFTS.length;
  document.getElementById("title").textContent = draft.title;
  document.getElementById("link").textContent = draft.link;
  document.getElementById("link").href = draft.link;
  document.getElementById("message").value = draft.message;
}

document.getElementById("copy").addEventListener("click", () => {
  navigator.clipboard.writeText(DRAFTS[index].message).catch(() => {
    document.getElementById("message").select();
    document.execCommand("copy");
  });
});

document.getElementById("open").addEventListener("click", () => {
  window.open(DRAFTS[index].link, "_blank");
  navigator.clipboard.writeText(DRAFTS[index].message).catch(() => {});
});

document.getElementById("next").addEventListener("click", () => {
  index++;
  render();
});

document.getElementById("skip").addEventListener("click", () => {
  index++;
  render();
});

render();
</script>
</body>
</html>
"""


def build_review_page(drafts_json_path: str, review_page_path: str) -> None:
    if not os.path.exists(drafts_json_path):
        return
    with open(drafts_json_path, encoding="utf-8") as file:
        records = json.load(file)
    json_blob = json.dumps(records).replace("</", "<\\/")
    html = REVIEW_PAGE_TEMPLATE.replace("__DRAFTS_JSON__", json_blob)
    with open(review_page_path, "w", encoding="utf-8") as file:
        file.write(html)
    print(f"Updated {review_page_path} - open it in your browser to go through replies one by one.")


def scan_city(
    source: str,
    city: str,
    category: str,
    output: str,
    keywords: list[str] | None = None,
    max_price: int | None = None,
    template_path: str | None = None,
    drafts_path: str = "drafts.txt",
    drafts_json_path: str = "drafts.json",
) -> None:
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

    template = load_template(template_path) if template_path else None
    for listing in new_listings:
        print(f"  - {listing['title']}")
        print(f"    {listing['link']}")
        if template and listing_matches(listing, keywords, max_price):
            write_draft(drafts_path, drafts_json_path, template, listing)


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
        "--draft-replies",
        action="store_true",
        help="For listings that match --keywords/--max-price, write a ready-to-send draft "
        "message into drafts.txt using reply_template.txt. Nothing is ever sent automatically - "
        "you always have to open the listing and send it yourself.",
    )
    parser.add_argument("--keywords", nargs="+", default=None, help="Only draft a reply if the title contains one of these words")
    parser.add_argument("--max-price", type=int, default=None, help="Only draft a reply if the price in the title is at or below this")
    parser.add_argument("--template", default="reply_template.txt", help="File with your reply wording")
    parser.add_argument("--drafts-output", default="drafts.txt", help="File where drafted replies get saved")
    parser.add_argument("--drafts-json", default="drafts.json", help="Structured draft data used to build the review page")
    parser.add_argument(
        "--review-page",
        default="review.html",
        help="Local web page you open in a browser to click through drafts one by one "
        "(Open listing -> reply yourself -> Sent it, Next)",
    )
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
            scan_city(
                source,
                city,
                args.category,
                args.output,
                keywords=args.keywords,
                max_price=args.max_price,
                template_path=args.template if args.draft_replies else None,
                drafts_path=args.drafts_output,
                drafts_json_path=args.drafts_json,
            )
            if index < len(jobs) - 1:
                time.sleep(SECONDS_BETWEEN_REQUESTS)

        if args.draft_replies:
            build_review_page(args.drafts_json, args.review_page)

        if not args.loop:
            break

        print(f"Sleeping {args.interval} seconds until next scan... (Ctrl+C to stop)")
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
