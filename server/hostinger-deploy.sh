#!/bin/sh
# Pulls the built Leadcrystal site (the `deploy` branch of Keegshaumann/lead-crystal) into
# public_html. Run by an hPanel cron job every 5 minutes. Logs only changes and errors.
# If the website's folder changes (e.g. leadcrystal.co replaces the temporary domain), update ROOT.
ROOT=/home/u531579581/domains/plum-raccoon-497791.hostingersite.com
REPO=https://github.com/Keegshaumann/lead-crystal.git
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/home/u531579581
LOG="$ROOT/leadcrystal-private/deploy.log"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
g() { git -c safe.directory='*' "$@"; }

cd "$ROOT/public_html" || { echo "$(now) cannot cd to public_html" >> "$LOG"; exit 1; }
before=$(g rev-parse HEAD 2>&1)
if ! out=$(g fetch --quiet --depth 1 "$REPO" deploy 2>&1); then
  echo "$(now) fetch failed: $out" >> "$LOG"; exit 1
fi
after=$(g rev-parse FETCH_HEAD 2>&1)
[ "$before" = "$after" ] && exit 0
if out=$(g reset --quiet --hard FETCH_HEAD 2>&1); then
  echo "$(now) deployed $after (was $before)" >> "$LOG"
else
  echo "$(now) reset failed: $out" >> "$LOG"; exit 1
fi
