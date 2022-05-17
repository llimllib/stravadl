# Parse a strava bulk export file into a sqlite database
#
# call it like: python load_dump.py export_12345678.zip
#
# it will result in a `strava.db` file in your cwd
import argparse
import csv
import io
from time import strptime, mktime
import re
import sqlite3
import subprocess
from typing import Iterable, List
from zipfile import ZipFile

# TODO:
# * Load the gpx files and .fit files from the activities directory of the zip
#     and do something with them?
# $ ls activities/ | head -n3
# 1057627580.fit.gz
# 1065965007.gpx
# 1071640857.fit.gz
# * do something with clubs, photos or routes too
# * currently it's loading all fields as text - not sure why that is happening

DB = sqlite3.connect("strava.db")


def query(sql: str, *params: List[str]):
    c = DB.cursor()
    c.execute(sql, params)
    rows = c.fetchall()
    c.close()
    DB.commit()
    return rows


def strip_tags(text: str) -> str:
    """remove anything from text between <> tags"""
    return re.sub("<[^<]+?>", "", text)


def sanitize(text: str) -> str:
    # none of our headers actually contain quotes
    text = strip_tags(text).strip().strip('"')
    text = re.sub(r"\s", "_", text).lower()
    # verify our assumptions
    assert '"' not in text, text
    assert "," not in text, text
    return text


def dedupe(headers: Iterable[str]) -> List[str]:
    vals = set()
    deduped = []
    for header in headers:
        if header in vals:
            for i in map(str, range(1, 10)):
                uniq = f"{header}_{i}"
                if uniq not in deduped:
                    deduped.append(uniq)
                    vals.add(uniq)
                    break
        else:
            deduped.append(header)
            vals.add(header)
    return deduped


def clean_activities(activities: Iterable[str]):
    inc = csv.reader(activities)
    headers = dedupe(map(sanitize, next(inc)))
    # sqlite doesn't support date types, so to ease sorting, parse the activity
    # date and stick it in a column
    headers.insert(1, "activity_date_unix")
    outc = csv.writer(open("activities_clean.csv", "w"))
    outc.writerow(headers)
    for row in inc:
        # parse the activity date and add it to the row as a new column
        row.insert(1, str(mktime(strptime(row[1], "%b %d, %Y, %I:%M:%S %p"))))
        outc.writerow(row)


def main(args):
    with ZipFile(args.strava_dump) as z:
        with z.open("activities.csv", "r") as activities_csv:
            clean_activities(io.TextIOWrapper(activities_csv))

    subprocess.run(
        [
            "sqlite3",
            "strava.db",
            "-cmd",
            ".mode csv",
            ".import activities_clean.csv activities",
        ],
        capture_output=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process a strava data dump")
    parser.add_argument("strava_dump", help="name of the dump file")
    args = parser.parse_args()
    main(args)
