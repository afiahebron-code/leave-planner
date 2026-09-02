# 🌴 Leave Planner

A small static web app that plans your annual leave around public holidays,
so you spend the fewest leave days for the longest breaks.

**[Open the live app →](#)** *(link filled in after the first deploy — see below)*

## What it does

1. You enter your country, the year you're planning, how many annual/PTO
   days you have (minus anything already used), and how many days you're
   allowed to carry into next year.
2. It fetches that country's holidays from Google's own public "Holidays in
   `<Country>`" calendar.
3. It finds every gap between a weekend/holiday and the next weekend/holiday,
   ranks each gap by "days off gained per leave day spent," and greedily
   spends your leave budget on the best gaps first — so a single day off
   that turns a public holiday into a 4-day weekend gets used before a big
   5-day gap that only buys you a couple of extra days.
4. It shows you exactly which dates to book, the resulting break dates,
   how many leave days are left over, and how many of those carry into next
   year versus how many are at risk of being forfeited under your carryover
   limit.
5. You can export any recommended break (or the whole plan) as an `.ics`
   file to drop into your calendar.
6. You can also click dates directly on a calendar view (shift-click for a
   range) and ask for advice scoped to just those dates, instead of the
   whole-year plan.

Everything runs client-side — your settings are saved only in your own
browser's `localStorage`. Nothing is sent to a server; there is no backend.

## Holiday coverage

Two sources, in priority order (the second wins on a same-date collision):

1. **Google's public "Holidays in `<Country>`" calendar** — fetched as its
   `.ics` feed through a free public CORS relay
   ([allorigins.win](https://allorigins.win)), since Google doesn't send the
   CORS headers a browser needs to fetch it directly from another site.
   Best-effort: if the relay or that country's calendar is ever unavailable,
   the app says so and the plan just has no holidays until you add your own.
   The same calendar is also embedded directly (an iframe straight from
   google.com) under the holiday table, purely as a visual way to
   cross-check dates yourself — a page can't read data out of another
   site's iframe, so that embed is display-only and isn't part of the data
   pipeline above.
2. **Holidays you add yourself** — for anything Google's calendar is missing
   or gets wrong (a specific Eid date once it's confirmed locally, a company
   day, a regional observance). Saved in your browser, always counted, and
   always wins over Google's calendar for the same date.

## Running it locally

It's plain HTML/CSS/JS with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deployment

Pushing to `main` deploys automatically to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
