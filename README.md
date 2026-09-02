# 🌴 Leave Planner

A small static web app that plans your annual leave around public holidays,
so you spend the fewest leave days for the longest breaks.

**[Open the live app →](#)** *(link filled in after the first deploy — see below)*

## What it does

1. You enter your country, the year you're planning, how many annual/PTO
   days you have (minus anything already used), and how many days you're
   allowed to carry into next year.
2. It fetches that country's public holidays for the year from the free
   [Nager.Date](https://date.nager.at) API.
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

The Nager.Date API tags many moving-date religious holidays — including most
Islamic ones — as "Optional" rather than "Public," so the app includes those
by default (toggle-able). On top of that:

- You can add any holiday the API is missing yourself (a confirmed Eid date,
  a company day, a regional observance) — it's saved in your browser and
  always counted.
- There's an opt-in estimated Islamic calendar (Ramadan start, both Eids,
  Islamic New Year, Ashura, Mawlid), computed from the tabular Hijri
  calendar. It's a fixed arithmetic approximation, not a moon-sighting
  authority, so treat it as accurate to within about ±1–2 days and confirm
  locally before booking anything against it.

## Running it locally

It's plain HTML/CSS/JS with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deployment

Pushing to `main` deploys automatically to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
