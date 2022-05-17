from glob import glob
import os.path
import sqlite3
from typing import Any, Dict, List

import gpxpy as gpx

DB = sqlite3.connect("runs.db")


def query(sql, *params):
    c = DB.cursor()
    c.execute(sql, params)
    rows = c.fetchall()
    c.close()
    DB.commit()
    return rows


try:
    query("DROP TABLE runs")
except sqlite3.OperationalError:
    pass
query(
    """CREATE TABLE runs(
    activity_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    distance REAL, -- meters
    distance3d REAL, -- meters
    start_time REAL,
    finish_time REAL,
    moving_duration INTEGER,
    stopped_duration INTEGER,
    max_speed REAL,
    avg_speed REAL,
    uphill REAL,
    downhill REAL
)
"""
)
for fname in glob("gpxdata/*.gpx"):
    # usage cribbed from:
    # https://github.com/tkrajina/gpx-cmd-tools/blob/master/gpxtools/gpxinfo.py
    g = gpx.parse(open(fname))
    activity_id, _ = os.path.splitext(os.path.basename(fname))

    try:
        name = g.tracks[0].name
    except IndexError:
        print(f"No first track? for {activity_id}")
        continue

    md = g.get_moving_data()
    if not md:
        raise ValueError(activity_id)

    start, finish = g.get_time_bounds()
    uphill, downhill = g.get_uphill_downhill()

    query(
        "INSERT INTO runs VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        activity_id,
        name,
        g.length_2d(),
        g.length_3d(),
        start.timestamp() if start else None,
        finish.timestamp() if finish else None,
        md.moving_time,
        md.stopped_time,
        md.max_speed,
        md.moving_distance / md.moving_time,
        uphill,
        downhill,
    )
