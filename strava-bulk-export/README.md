# Load a strava dump

Parse a strava bulk export file into a sqlite database

call it like: `python load_dump.py export_12345678.zip`

it will result in a `strava.db` sqlite3 file in your cwd

The contents of my strava dump are:

```console
activities/
activities.csv
applications.csv
bikes.csv
blocks.csv
categories_of_personal_information_we_collect.pdf
clubs/
clubs.csv
comments.csv
components.csv
connected_apps.csv
contacts.csv
email_preferences.csv
events.csv
export_15819875.zip
favorites.csv
flags.csv
followers.csv
following.csv
general_preferences.csv
global_challenges.csv
goals.csv
group_challenges.csv
information_we_disclose_for_a_business_purpose.pdf
kudos.csv
local_legend_segments.csv
logins.csv
memberships.csv
metering.csv
mobile_device_identifiers.csv
monthly_recap_achievements.csv
orders.csv
partner_opt_outs.csv
photos/
photos.csv
posts.csv
privacy_zones.csv
profile.csv
profile.jpg
routes/
routes.csv
segment_feedback.csv
segments.csv
shoes.csv
social_settings.csv
starred_routes.csv
starred_segments.csv
support_tickets.csv
visibility_settings.csv
```
