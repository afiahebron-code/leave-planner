/* Leave Planner — all logic runs in the browser. No backend, no build step.
 * Holiday data: https://date.nager.at (free, no API key, CORS-enabled). */

const API_BASE = "https://date.nager.at/api/v3";
const STORAGE_KEY = "leave-planner:settings";

const FALLBACK_COUNTRIES = [
  ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"],
  ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"],
  ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"],
  ["NL", "Netherlands"], ["PT", "Portugal"], ["BE", "Belgium"],
  ["CH", "Switzerland"], ["AT", "Austria"], ["SE", "Sweden"],
  ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["PL", "Poland"],
  ["ZA", "South Africa"], ["NG", "Nigeria"], ["KE", "Kenya"],
  ["IN", "India"], ["SG", "Singapore"], ["JP", "Japan"], ["BR", "Brazil"],
  ["MX", "Mexico"], ["AR", "Argentina"], ["AE", "United Arab Emirates"],
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  els.country = document.getElementById("country");
  els.countryHint = document.getElementById("country-hint");
  els.year = document.getElementById("year");
  els.leaveDays = document.getElementById("leave-days");
  els.alreadyUsed = document.getElementById("already-used");
  els.carryoverLimit = document.getElementById("carryover-limit");
  els.maxBridge = document.getElementById("max-bridge");
  els.weekendDays = document.getElementById("weekend-days");
  els.sickDays = document.getElementById("sick-days");
  els.personalDays = document.getElementById("personal-days");
  els.otherDays = document.getElementById("other-days");
  els.includeOptional = document.getElementById("include-optional");
  els.form = document.getElementById("setup-form");
  els.status = document.getElementById("status");
  els.summaryCard = document.getElementById("summary-card");
  els.summaryGrid = document.getElementById("summary-grid");
  els.planCard = document.getElementById("plan-card");
  els.planList = document.getElementById("plan-list");
  els.holidaysCard = document.getElementById("holidays-card");
  els.holidaysYearLabel = document.getElementById("holidays-year-label");
  els.holidaysTableBody = document.querySelector("#holidays-table tbody");
  els.regionalNote = document.getElementById("regional-note");

  populateYears();
  populateWeekendDays();
  populateCountries();
  restoreSettings();

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    runPlan();
  });
}

function populateYears() {
  const now = new Date();
  const currentYear = now.getFullYear();
  els.year.innerHTML = "";
  for (let y = currentYear; y <= currentYear + 2; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === currentYear + (now.getMonth() >= 9 ? 1 : 0)) opt.selected = true;
    els.year.appendChild(opt);
  }
}

function populateWeekendDays() {
  els.weekendDays.innerHTML = "";
  WEEKDAY_NAMES.forEach((name, idx) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(idx);
    input.checked = idx === 0 || idx === 6;
    input.dataset.role = "weekend-day";
    label.appendChild(input);
    label.appendChild(document.createTextNode(name));
    els.weekendDays.appendChild(label);
  });
}

async function populateCountries() {
  let countries = FALLBACK_COUNTRIES;
  try {
    const res = await fetch(`${API_BASE}/AvailableCountries`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        countries = data.map((c) => [c.countryCode, c.name]).sort((a, b) => a[1].localeCompare(b[1]));
      }
    }
  } catch (err) {
    els.countryHint.textContent = "Couldn't reach the holiday API to load the full country list — showing a shorter list.";
  }
  els.country.innerHTML = "";
  countries.forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    els.country.appendChild(opt);
  });
  const saved = readSettings();
  if (saved && countries.some(([code]) => code === saved.country)) {
    els.country.value = saved.country;
  } else {
    els.country.value = "US";
  }
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function restoreSettings() {
  const s = readSettings();
  if (!s) return;
  if (s.year) els.year.value = String(s.year);
  if (s.leaveDays != null) els.leaveDays.value = s.leaveDays;
  if (s.alreadyUsed != null) els.alreadyUsed.value = s.alreadyUsed;
  if (s.carryoverLimit != null) els.carryoverLimit.value = s.carryoverLimit;
  if (s.maxBridge != null) els.maxBridge.value = s.maxBridge;
  if (s.sickDays != null) els.sickDays.value = s.sickDays;
  if (s.personalDays != null) els.personalDays.value = s.personalDays;
  if (s.otherDays != null) els.otherDays.value = s.otherDays;
  if (s.includeOptional != null) els.includeOptional.checked = s.includeOptional;
  if (Array.isArray(s.weekend)) {
    document.querySelectorAll('[data-role="weekend-day"]').forEach((cb) => {
      cb.checked = s.weekend.includes(Number(cb.value));
    });
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    /* ignore — private browsing etc. */
  }
}

function getWeekendSet() {
  const set = new Set();
  document.querySelectorAll('[data-role="weekend-day"]').forEach((cb) => {
    if (cb.checked) set.add(Number(cb.value));
  });
  return set;
}

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

async function runPlan() {
  const country = els.country.value;
  const year = Number(els.year.value);
  const leaveDays = Math.max(0, Number(els.leaveDays.value) || 0);
  const alreadyUsed = Math.max(0, Number(els.alreadyUsed.value) || 0);
  const carryoverLimit = Math.max(0, Number(els.carryoverLimit.value) || 0);
  const maxBridge = Number(els.maxBridge.value);
  const weekend = Array.from(getWeekendSet());
  const includeOptional = els.includeOptional.checked;

  saveSettings({
    country, year, leaveDays, alreadyUsed, carryoverLimit, maxBridge, weekend,
    sickDays: Number(els.sickDays.value) || 0,
    personalDays: Number(els.personalDays.value) || 0,
    otherDays: Number(els.otherDays.value) || 0,
    includeOptional,
  });

  const budget = Math.max(0, leaveDays - alreadyUsed);

  setStatus("Fetching public holidays…");
  els.summaryCard.hidden = true;
  els.planCard.hidden = true;
  els.holidaysCard.hidden = true;

  let holidaysY, holidaysY1;
  try {
    [holidaysY, holidaysY1] = await Promise.all([
      fetchHolidays(year, country),
      fetchHolidays(year + 1, country),
    ]);
  } catch (err) {
    setStatus(`Couldn't load public holidays for ${country} ${year}: ${err.message}`, true);
    return;
  }

  const weekendSet = new Set(weekend);
  const result = buildPlan({
    year, holidaysY, holidaysY1, weekendSet, budget, maxBridge, includeOptional,
  });

  renderSummary({ leaveDays, alreadyUsed, budget, result, carryoverLimit });
  renderPlan(result, country, year);
  renderHolidays(result.nationwideHolidays, result.regionalHolidays, year, includeOptional);

  setStatus(`Done — ${result.nationwideHolidays.length} public holiday(s) found for ${country} ${year}.`);
}

async function fetchHolidays(year, countryCode) {
  const res = await fetch(`${API_BASE}/PublicHolidays/${year}/${countryCode}`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`API returned ${res.status}`);
  }
  return res.json();
}

function isCountedHoliday(h, includeOptional) {
  if (!h.types || !h.types.length) return true;
  const counted = includeOptional
    ? h.types
    : h.types.filter((t) => t === "Public" || t === "Bank");
  return counted.length > 0;
}

/**
 * Build a day-off plan.
 * Free days (weekends + counted, nationwide holidays) don't cost leave.
 * A "gap" is a run of consecutive non-free workdays, entirely inside `year`,
 * sitting between two free runs. Taking leave on the whole gap merges the
 * two free runs into one long break.
 */
function buildPlan({ year, holidaysY, holidaysY1, weekendSet, budget, maxBridge, includeOptional }) {
  const nationwideHolidays = [...holidaysY, ...holidaysY1]
    .filter((h) => !h.counties || h.counties.length === 0)
    .filter((h) => isCountedHoliday(h, includeOptional));
  const regionalHolidays = [...holidaysY, ...holidaysY1]
    .filter((h) => h.counties && h.counties.length > 0)
    .filter((h) => isCountedHoliday(h, includeOptional))
    .filter((h) => new Date(h.date + "T12:00:00Z").getUTCFullYear() === year);

  const holidayMap = new Map(nationwideHolidays.map((h) => [h.date, h]));

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 31));
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    const holiday = holidayMap.get(iso);
    days.push({
      date: iso,
      weekday,
      inYear: d.getUTCFullYear() === year,
      free: weekendSet.has(weekday) || !!holiday,
      holidayName: holiday ? (holiday.localName || holiday.name) : null,
    });
  }

  // Find opportunities: runs of non-free, in-year days flanked by free days.
  const opportunities = [];
  let i = 0;
  while (i < days.length) {
    if (days[i].free) { i++; continue; }
    let j = i;
    while (j < days.length && !days[j].free) j++;
    const gap = days.slice(i, j);
    const gapAllInYear = gap.every((d) => d.inYear);
    const hasLeadingFree = i > 0;
    const hasTrailingFree = j < days.length;
    if (gapAllInYear && gap.length <= maxBridge && hasLeadingFree && hasTrailingFree) {
      let leadStart = i - 1;
      while (leadStart - 1 >= 0 && days[leadStart - 1].free) leadStart--;
      let trailEnd = j;
      while (trailEnd < days.length && days[trailEnd].free) trailEnd++;
      const leadFree = days.slice(leadStart, i);
      const trailFree = days.slice(j, trailEnd);
      const totalOff = leadFree.length + gap.length + trailFree.length;
      opportunities.push({
        gapDates: gap.map((d) => d.date),
        rangeStart: leadFree[0].date,
        rangeEnd: trailFree[trailFree.length - 1].date,
        leaveDaysNeeded: gap.length,
        totalDaysOff: totalOff,
        efficiency: totalOff / gap.length,
        holidayNames: [...leadFree, ...gap, ...trailFree]
          .map((d) => d.holidayName)
          .filter(Boolean),
      });
    }
    i = j;
  }

  opportunities.sort((a, b) => b.efficiency - a.efficiency || b.totalDaysOff - a.totalDaysOff || a.rangeStart.localeCompare(b.rangeStart));

  let remaining = budget;
  const chosen = [];
  for (const opp of opportunities) {
    if (opp.leaveDaysNeeded <= remaining) {
      chosen.push(opp);
      remaining -= opp.leaveDaysNeeded;
    }
  }
  chosen.sort((a, b) => a.rangeStart.localeCompare(b.rangeStart));

  const leaveDaysUsed = budget - remaining;

  return {
    nationwideHolidays: nationwideHolidays
      .filter((h) => new Date(h.date + "T12:00:00Z").getUTCFullYear() === year)
      .sort((a, b) => a.date.localeCompare(b.date)),
    regionalHolidays: regionalHolidays.sort((a, b) => a.date.localeCompare(b.date)),
    opportunities,
    chosen,
    budget,
    leaveDaysUsed,
    remaining,
  };
}

function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtDateShort(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

function renderSummary({ leaveDays, alreadyUsed, budget, result, carryoverLimit }) {
  const carried = Math.min(result.remaining, carryoverLimit);
  const forfeited = Math.max(0, result.remaining - carryoverLimit);
  const stats = [
    [leaveDays, "Total annual leave"],
    [alreadyUsed, "Already used"],
    [budget, "Available to plan"],
    [result.leaveDaysUsed, "Recommended to book"],
    [result.chosen.length, "Extended breaks created"],
    [carried, "Carries over next year"],
  ];
  els.summaryGrid.innerHTML = "";
  stats.forEach(([num, label]) => {
    const div = document.createElement("div");
    div.className = "stat";
    div.innerHTML = `<span class="num">${num}</span><span class="label">${label}</span>`;
    els.summaryGrid.appendChild(div);
  });
  if (forfeited > 0) {
    const div = document.createElement("div");
    div.className = "stat warn";
    div.innerHTML = `<span class="num">${forfeited}</span><span class="label">Over your carryover limit — check your policy</span>`;
    els.summaryGrid.appendChild(div);
  }
  els.summaryCard.hidden = false;
}

function renderPlan(result, country, year) {
  els.planList.innerHTML = "";
  if (!result.chosen.length) {
    els.planList.innerHTML = `<p class="hint">No leave days to recommend — either you have no budget left, or there are no worthwhile gaps between your weekends and ${year}'s holidays within the bridge length you chose.</p>`;
  } else {
    result.chosen.forEach((opp) => {
      const div = document.createElement("div");
      div.className = "plan-item";
      const label = opp.holidayNames.length
        ? `around ${[...new Set(opp.holidayNames)].join(", ")}`
        : "";
      div.innerHTML = `
        <div class="plan-header">
          <span class="range">${fmtDateShort(opp.rangeStart)} – ${fmtDateShort(opp.rangeEnd)}</span>
          <span class="badge">${opp.totalDaysOff} days off for ${opp.leaveDaysNeeded} leave day${opp.leaveDaysNeeded > 1 ? "s" : ""}</span>
        </div>
        <p class="take"><strong>Book off:</strong> ${opp.gapDates.map(fmtDate).join(", ")}</p>
        <p class="anchors">${label}</p>
        <div class="actions"><button type="button" class="secondary" data-ics-single>Add to calendar (.ics)</button></div>
      `;
      div.querySelector("[data-ics-single]").addEventListener("click", () => {
        downloadIcs(`leave-${opp.rangeStart}.ics`, [opp], country);
      });
      els.planList.appendChild(div);
    });

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "secondary";
    allBtn.textContent = "Add all recommended leave days to calendar (.ics)";
    allBtn.addEventListener("click", () => downloadIcs(`leave-plan-${year}.ics`, result.chosen, country));
    els.planList.appendChild(allBtn);
  }
  els.planCard.hidden = false;
}

function renderHolidays(nationwide, regional, year, includeOptional) {
  els.holidaysYearLabel.textContent = `(${year})`;
  els.holidaysTableBody.innerHTML = "";
  nationwide.forEach((h) => {
    const d = new Date(h.date + "T12:00:00Z");
    const tr = document.createElement("tr");
    const wd = d.getUTCDay();
    if (wd === 5 || wd === 1) tr.classList.add("long-weekend");
    tr.innerHTML = `<td>${h.date}</td><td>${WEEKDAY_NAMES[wd]}</td><td>${h.localName || h.name}${h.name && h.localName && h.name !== h.localName ? ` <span class="hint-inline">(${h.name})</span>` : ""}</td><td></td>`;
    els.holidaysTableBody.appendChild(tr);
  });
  if (!nationwide.length) {
    els.holidaysTableBody.innerHTML = `<tr><td colspan="4">No ${includeOptional ? "" : "public/bank "}holidays found for this country and year.</td></tr>`;
  }
  if (regional.length) {
    els.regionalNote.hidden = false;
    els.regionalNote.textContent = `${regional.length} region-only holiday(s) not counted in the plan above (they don't apply nationwide): ${regional.map((h) => `${h.localName || h.name} (${h.date})`).join(", ")}.`;
  } else {
    els.regionalNote.hidden = true;
  }
  els.holidaysCard.hidden = false;
}

function icsEscape(text) {
  return String(text).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}

function toIcsDate(iso) {
  return iso.replace(/-/g, "");
}

function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function downloadIcs(filename, opportunities, country) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Leave Planner//EN",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  opportunities.forEach((opp, idx) => {
    opp.gapDates.forEach((date, dIdx) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:leave-planner-${country}-${date}-${idx}-${dIdx}@leave-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(date)}`,
        `DTEND;VALUE=DATE:${toIcsDate(addDaysIso(date, 1))}`,
        `SUMMARY:${icsEscape("Leave day (planned)")}`,
        `DESCRIPTION:${icsEscape(`Part of a planned break from ${opp.rangeStart} to ${opp.rangeEnd}.`)}`,
        "END:VEVENT"
      );
    });
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
