/* Leave Planner — all logic runs in the browser. No backend, no build step.
 * Holiday data: Google's public "Holidays in <Country>" calendar, plus
 * whatever you add yourself. */

const STORAGE_KEY = "leave-planner:settings";
const CUSTOM_HOLIDAYS_KEY = "leave-planner:customHolidays";

// Google publishes a public "Holidays in <Country>" calendar per country as
// an .ics feed, but it doesn't send CORS headers — a browser can't fetch it
// directly from a page on another origin. Routed through a free public CORS
// relay instead. This is best-effort: if the relay or the calendar is
// unavailable for a given country, the app says so and you can add holidays
// yourself below in the meantime.
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

const COUNTRIES = [
  ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"],
  ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"],
  ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"],
  ["NL", "Netherlands"], ["PT", "Portugal"], ["BE", "Belgium"],
  ["CH", "Switzerland"], ["AT", "Austria"], ["SE", "Sweden"],
  ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["PL", "Poland"],
  ["ZA", "South Africa"], ["NG", "Nigeria"], ["KE", "Kenya"], ["GH", "Ghana"],
  ["EG", "Egypt"], ["MA", "Morocco"], ["ET", "Ethiopia"],
  ["IN", "India"], ["SG", "Singapore"], ["JP", "Japan"], ["BR", "Brazil"],
  ["MX", "Mexico"], ["AR", "Argentina"], ["AE", "United Arab Emirates"],
  ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["TR", "Turkey"],
  ["PK", "Pakistan"], ["BD", "Bangladesh"], ["ID", "Indonesia"], ["MY", "Malaysia"],
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const els = {};
let lastResult = null;
let lastWeekendSet = null;
let lastHolidayEntries = null;
let selectedDates = new Set();
let lastClickedDate = null;

document.addEventListener("DOMContentLoaded", init);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function readCustomHolidays() {
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function saveCustomHolidays(list) {
  try {
    localStorage.setItem(CUSTOM_HOLIDAYS_KEY, JSON.stringify(list));
  } catch (err) {
    /* ignore — private browsing etc. */
  }
}

function renderCustomHolidayList() {
  const list = readCustomHolidays().sort((a, b) => a.date.localeCompare(b.date));
  els.customHolidayList.innerHTML = "";
  list.forEach((h, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${fmtDateShort(h.date)} — ${h.name}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${h.name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      const current = readCustomHolidays();
      current.splice(current.findIndex((c) => c.date === h.date && c.name === h.name), 1);
      saveCustomHolidays(current);
      renderCustomHolidayList();
    });
    li.appendChild(removeBtn);
    els.customHolidayList.appendChild(li);
  });
}

function init() {
  els.country = document.getElementById("country");
  els.year = document.getElementById("year");
  els.leaveDays = document.getElementById("leave-days");
  els.alreadyUsed = document.getElementById("already-used");
  els.carryoverLimit = document.getElementById("carryover-limit");
  els.maxBridge = document.getElementById("max-bridge");
  els.maxBreakWorkdays = document.getElementById("max-break-workdays");
  els.weekendDays = document.getElementById("weekend-days");
  els.sickDays = document.getElementById("sick-days");
  els.personalDays = document.getElementById("personal-days");
  els.otherDays = document.getElementById("other-days");
  els.form = document.getElementById("setup-form");
  els.status = document.getElementById("status");
  els.summaryCard = document.getElementById("summary-card");
  els.summaryGrid = document.getElementById("summary-grid");
  els.planCard = document.getElementById("plan-card");
  els.planList = document.getElementById("plan-list");
  els.holidaysCard = document.getElementById("holidays-card");
  els.holidaysYearLabel = document.getElementById("holidays-year-label");
  els.holidaysTableBody = document.querySelector("#holidays-table tbody");
  els.googleCalendarIframe = document.getElementById("google-calendar-iframe");
  els.customHolidayForm = document.getElementById("custom-holiday-form");
  els.customHolidayDate = document.getElementById("custom-holiday-date");
  els.customHolidayName = document.getElementById("custom-holiday-name");
  els.customHolidayList = document.getElementById("custom-holiday-list");
  els.calendarCard = document.getElementById("calendar-card");
  els.calendarGrid = document.getElementById("calendar-grid");
  els.calendarSelectionSummary = document.getElementById("calendar-selection-summary");
  els.calendarClear = document.getElementById("calendar-clear");
  els.calendarAdvise = document.getElementById("calendar-advise");
  els.adviceCard = document.getElementById("advice-card");
  els.adviceList = document.getElementById("advice-list");

  populateYears();
  populateWeekendDays();
  populateCountries();
  restoreSettings();
  renderCustomHolidayList();

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    runPlan();
  });

  els.customHolidayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = els.customHolidayDate.value;
    const name = els.customHolidayName.value.trim();
    if (!date || !name) return;
    const list = readCustomHolidays();
    list.push({ date, name });
    saveCustomHolidays(list);
    renderCustomHolidayList();
    els.customHolidayForm.reset();
  });

  els.calendarClear.addEventListener("click", () => {
    selectedDates.clear();
    lastClickedDate = null;
    updateCalendarSelectionUI();
  });

  els.calendarAdvise.addEventListener("click", adviseForSelection);
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

function populateCountries() {
  els.country.innerHTML = "";
  COUNTRIES.forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    els.country.appendChild(opt);
  });
  const saved = readSettings();
  if (saved && COUNTRIES.some(([code]) => code === saved.country)) {
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
  if (s.maxBreakWorkdays != null) els.maxBreakWorkdays.value = s.maxBreakWorkdays;
  if (s.sickDays != null) els.sickDays.value = s.sickDays;
  if (s.personalDays != null) els.personalDays.value = s.personalDays;
  if (s.otherDays != null) els.otherDays.value = s.otherDays;
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
  const maxBreakWorkdays = Math.max(1, Number(els.maxBreakWorkdays.value) || 10);
  const weekend = Array.from(getWeekendSet());

  saveSettings({
    country, year, leaveDays, alreadyUsed, carryoverLimit, maxBridge, maxBreakWorkdays, weekend,
    sickDays: Number(els.sickDays.value) || 0,
    personalDays: Number(els.personalDays.value) || 0,
    otherDays: Number(els.otherDays.value) || 0,
  });

  const budget = Math.max(0, leaveDays - alreadyUsed);
  const todayStr = todayIso();
  const jan1 = `${year}-01-01`;
  const effectiveStartIso = todayStr > jan1 ? todayStr : jan1;
  const windowEndIso = `${year + 1}-01-31`;

  setStatus("Fetching Google's public holiday calendar…");
  els.summaryCard.hidden = true;
  els.planCard.hidden = true;
  els.holidaysCard.hidden = true;
  els.calendarCard.hidden = true;
  els.adviceCard.hidden = true;
  selectedDates.clear();
  lastClickedDate = null;

  const googleHolidays = await fetchGoogleHolidayCalendar(country, effectiveStartIso, windowEndIso);

  const weekendSet = new Set(weekend);
  const customHolidays = readCustomHolidays();
  const result = buildPlan({
    year, googleHolidays, weekendSet, budget, maxBridge, maxBreakWorkdays, customHolidays, todayIso: todayStr,
  });

  lastResult = result;
  lastWeekendSet = weekendSet;
  lastHolidayEntries = result.allHolidaysInWindow;

  renderSummary({ leaveDays, alreadyUsed, budget, result, carryoverLimit });
  renderPlan(result, country, year);
  renderHolidays(result.allHolidays, year, result.effectiveStartIso, country);
  renderCalendar(result);
  updateCalendarSelectionUI();

  if (!googleHolidays.length) {
    setStatus(`Couldn't find Google's holiday calendar for ${country} right now — the relay may be temporarily down, or this country may not have one. Add your own holidays below in the meantime.`, true);
  } else {
    setStatus(`Done — ${result.allHolidays.length} holiday(s) found for ${country} ${year}.`);
  }
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function unescapeIcsText(text) {
  return text.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseIcsHolidays(icsText, startIso, endIso) {
  // Unfold RFC 5545 folded lines: a continuation line starts with a single
  // space or tab, which (together with the line break before it) is removed.
  const unfolded = icsText.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const results = [];
  blocks.forEach((block) => {
    const dateMatch = block.match(/\nDTSTART[^:\n]*:(\d{8})/);
    const nameMatch = block.match(/\nSUMMARY:(.+)/);
    if (!dateMatch || !nameMatch) return;
    const raw = dateMatch[1];
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (date >= startIso && date <= endIso) {
      results.push({ date, name: unescapeIcsText(nameMatch[1]) });
    }
  });
  return results;
}

async function fetchGoogleHolidayCalendar(countryCode, startIso, endIso) {
  try {
    const googleUrl = `https://calendar.google.com/calendar/ical/en.${countryCode.toLowerCase()}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(googleUrl));
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes("BEGIN:VEVENT")) return [];
    return parseIcsHolidays(text, startIso, endIso);
  } catch (err) {
    return [];
  }
}

/**
 * Greedily accept the most efficient opportunities first, but two chosen
 * breaks must never touch — if they shared a free-day anchor (e.g. one
 * opportunity's trailing weekend is the next one's leading weekend) taking
 * both would merge them into one long continuous absence that could blow
 * past the "longest single break" cap each was checked against individually.
 * `opportunities` must already be sorted best-first.
 */
function selectOpportunities(opportunities, budget) {
  let remaining = budget;
  const claimed = new Set();
  const chosen = [];
  for (const opp of opportunities) {
    if (opp.leaveDaysNeeded > remaining) continue;
    if (opp.spanDates.some((d) => claimed.has(d))) continue;
    chosen.push(opp);
    remaining -= opp.leaveDaysNeeded;
    opp.spanDates.forEach((d) => claimed.add(d));
  }
  chosen.sort((a, b) => a.rangeStart.localeCompare(b.rangeStart));
  return { chosen, leaveDaysUsed: budget - remaining, remaining };
}

/**
 * Build a day-off plan.
 * Free days (weekends + holidays) don't cost leave. A "gap" is a run of
 * consecutive non-free workdays, entirely inside `year`, sitting between
 * two free runs. Taking leave on the whole gap merges the two free runs
 * into one long break.
 */
function buildPlan({ year, googleHolidays, weekendSet, budget, maxBridge, maxBreakWorkdays, customHolidays, todayIso }) {
  // Never plan or list days before today — only look forward.
  const jan1 = `${year}-01-01`;
  const effectiveStartIso = todayIso > jan1 ? todayIso : jan1;
  const windowEndIso = `${year + 1}-01-31`;

  // Google's calendar is the base layer; anything you add yourself always
  // wins on a same-date collision, since you typed it deliberately.
  const googleTagged = (googleHolidays || []).map((h) => ({ ...h, source: "google" }));
  const customTagged = (customHolidays || [])
    .filter((h) => h.date >= effectiveStartIso && h.date <= windowEndIso)
    .map((h) => ({ date: h.date, name: h.name, source: "custom" }));
  // One entry per date — custom overwrites google if they land on the same day.
  const holidayMap = new Map();
  [...googleTagged, ...customTagged].forEach((h) => holidayMap.set(h.date, h));
  const allHolidays = Array.from(holidayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const start = new Date(effectiveStartIso + "T12:00:00Z");
  const end = new Date(windowEndIso + "T12:00:00Z");
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
      holidayName: holiday ? holiday.name : null,
    });
  }

  // Find opportunities: runs of non-free, in-year workdays flanked by free days.
  // The window itself starts today, so a gap touching index 0 (i.e. today is a
  // workday) has no leading free run to look back on — that's fine, it's just
  // treated as 0 leading free days rather than being thrown out.
  const opportunities = [];
  let i = 0;
  while (i < days.length) {
    if (days[i].free) { i++; continue; }
    let j = i;
    while (j < days.length && !days[j].free) j++;
    const gap = days.slice(i, j);
    const gapAllInYear = gap.every((d) => d.inYear);
    const hasTrailingFree = j < days.length;
    if (gapAllInYear && gap.length <= maxBridge && hasTrailingFree) {
      let leadStart = i;
      if (i > 0) {
        leadStart = i - 1;
        while (leadStart - 1 >= 0 && days[leadStart - 1].free) leadStart--;
      }
      let trailEnd = j;
      while (trailEnd < days.length && days[trailEnd].free) trailEnd++;
      const leadFree = days.slice(leadStart, i);
      const trailFree = days.slice(j, trailEnd);
      const fullSpan = [...leadFree, ...gap, ...trailFree];
      const workdaysAway = fullSpan.filter((d) => !weekendSet.has(d.weekday)).length;
      if (workdaysAway > maxBreakWorkdays) { i = j; continue; }
      const totalOff = fullSpan.length;
      opportunities.push({
        gapDates: gap.map((d) => d.date),
        spanDates: fullSpan.map((d) => d.date),
        rangeStart: fullSpan[0].date,
        rangeEnd: fullSpan[fullSpan.length - 1].date,
        leaveDaysNeeded: gap.length,
        totalDaysOff: totalOff,
        workdaysAway,
        efficiency: totalOff / gap.length,
        holidayNames: fullSpan
          .map((d) => d.holidayName)
          .filter(Boolean),
      });
    }
    i = j;
  }

  opportunities.sort((a, b) => b.efficiency - a.efficiency || b.totalDaysOff - a.totalDaysOff || a.rangeStart.localeCompare(b.rangeStart));

  const { chosen, leaveDaysUsed, remaining } = selectOpportunities(opportunities, budget);

  return {
    allHolidays: allHolidays.filter((h) => h.date >= effectiveStartIso && h.date.slice(0, 4) === String(year)),
    allHolidaysInWindow: allHolidays.filter((h) => h.date >= effectiveStartIso),
    opportunities,
    chosen,
    budget,
    leaveDaysUsed,
    remaining,
    effectiveStartIso,
    windowEndIso,
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

function renderOpportunityCard(opp, country) {
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
    <p class="anchors">${label}${label ? " · " : ""}${opp.workdaysAway} working day${opp.workdaysAway > 1 ? "s" : ""} away from the office</p>
    <div class="actions"><button type="button" class="secondary" data-ics-single>Add to calendar (.ics)</button></div>
  `;
  div.querySelector("[data-ics-single]").addEventListener("click", () => {
    downloadIcs(`leave-${opp.rangeStart}.ics`, [opp], country);
  });
  return div;
}

function renderPlan(result, country, year) {
  els.planList.innerHTML = "";
  if (!result.chosen.length) {
    els.planList.innerHTML = `<p class="hint">No leave days to recommend — either you have no budget left, or there are no worthwhile gaps between your weekends and ${year}'s holidays within the bridge length you chose.</p>`;
  } else {
    result.chosen.forEach((opp) => els.planList.appendChild(renderOpportunityCard(opp, country)));

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "secondary";
    allBtn.textContent = "Add all recommended leave days to calendar (.ics)";
    allBtn.addEventListener("click", () => downloadIcs(`leave-plan-${year}.ics`, result.chosen, country));
    els.planList.appendChild(allBtn);
  }
  els.planCard.hidden = false;
}

const SOURCE_LABELS = { google: "Google Calendar", custom: "Added by you" };

function renderHolidays(allHolidays, year, effectiveStartIso, country) {
  const fromToday = effectiveStartIso > `${year}-01-01`;
  els.holidaysYearLabel.textContent = fromToday ? `(${fmtDateShort(effectiveStartIso)} onward)` : `(${year})`;
  els.holidaysTableBody.innerHTML = "";
  els.googleCalendarIframe.src = `https://calendar.google.com/calendar/embed?src=en.${country.toLowerCase()}%23holiday%40group.v.calendar.google.com&mode=AGENDA`;
  allHolidays.forEach((h) => {
    const d = new Date(h.date + "T12:00:00Z");
    const tr = document.createElement("tr");
    const wd = d.getUTCDay();
    if (wd === 5 || wd === 1) tr.classList.add("long-weekend");
    tr.innerHTML = `<td>${h.date}</td><td>${WEEKDAY_NAMES[wd]}</td><td>${h.name}</td><td>${SOURCE_LABELS[h.source] || ""}</td>`;
    els.holidaysTableBody.appendChild(tr);
  });
  if (!allHolidays.length) {
    els.holidaysTableBody.innerHTML = `<tr><td colspan="4">No holidays found yet — add your own below, or check the Google Calendar panel underneath.</td></tr>`;
  }
  els.holidaysCard.hidden = false;
}

function renderCalendar(result) {
  const holidayByDate = new Map(lastHolidayEntries.map((h) => [h.date, h.name]));
  const startIso = result.effectiveStartIso;
  const endIso = result.windowEndIso;
  const todayStr = todayIso();

  els.calendarGrid.innerHTML = "";
  let cursor = new Date(startIso.slice(0, 8) + "01T12:00:00Z"); // first of the start month
  const end = new Date(endIso + "T12:00:00Z");

  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const monthEl = document.createElement("div");
    monthEl.className = "month";
    monthEl.innerHTML = `<p class="month-title">${MONTH_NAMES[m]} ${y}</p>`;
    const daysGrid = document.createElement("div");
    daysGrid.className = "month-days";
    WEEKDAY_NAMES.forEach((w) => {
      const label = document.createElement("div");
      label.className = "weekday-label";
      label.textContent = w[0];
      daysGrid.appendChild(label);
    });

    const firstOfMonth = new Date(Date.UTC(y, m, 1));
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let pad = 0; pad < firstOfMonth.getUTCDay(); pad++) {
      const padCell = document.createElement("div");
      padCell.className = "day-cell pad";
      daysGrid.appendChild(padCell);
    }
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const iso = `${y}-${pad2(m + 1)}-${pad2(dnum)}`;
      const cell = document.createElement("div");
      if (iso < startIso || iso > endIso) {
        cell.className = "day-cell pad";
      } else {
        cell.className = "day-cell";
        cell.dataset.date = iso;
        cell.textContent = String(dnum);
        const weekday = new Date(iso + "T12:00:00Z").getUTCDay();
        if (lastWeekendSet.has(weekday)) cell.classList.add("weekend");
        if (holidayByDate.has(iso)) {
          cell.classList.add("holiday");
          cell.title = holidayByDate.get(iso);
        }
        if (iso === todayStr) cell.classList.add("today");
        cell.addEventListener("click", (e) => onDayCellClick(iso, e.shiftKey));
      }
      daysGrid.appendChild(cell);
    }

    monthEl.appendChild(daysGrid);
    els.calendarGrid.appendChild(monthEl);
    cursor = new Date(Date.UTC(y, m + 1, 1, 12));
  }

  els.calendarCard.hidden = false;
}

function onDayCellClick(iso, shiftKey) {
  if (shiftKey && lastClickedDate) {
    const [from, to] = iso >= lastClickedDate ? [lastClickedDate, iso] : [iso, lastClickedDate];
    let d = new Date(from + "T12:00:00Z");
    const toDate = new Date(to + "T12:00:00Z");
    while (d <= toDate) {
      selectedDates.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (selectedDates.has(iso)) {
    selectedDates.delete(iso);
  } else {
    selectedDates.add(iso);
  }
  lastClickedDate = iso;
  updateCalendarSelectionUI();
}

function updateCalendarSelectionUI() {
  document.querySelectorAll(".day-cell[data-date]").forEach((cell) => {
    cell.classList.toggle("selected", selectedDates.has(cell.dataset.date));
  });
  if (!selectedDates.size) {
    els.calendarSelectionSummary.textContent = "No dates selected yet.";
  } else {
    const sorted = Array.from(selectedDates).sort();
    els.calendarSelectionSummary.textContent = sorted.length === 1
      ? `1 date selected: ${fmtDateShort(sorted[0])}.`
      : `${sorted.length} date(s) selected, spanning ${fmtDateShort(sorted[0])} – ${fmtDateShort(sorted[sorted.length - 1])}.`;
  }
  els.calendarAdvise.disabled = selectedDates.size === 0;
}

function adviseForSelection() {
  if (!lastResult || !selectedDates.size) return;
  const selected = selectedDates;
  const touching = lastResult.opportunities.filter((opp) => opp.spanDates.some((d) => selected.has(d)));
  touching.sort((a, b) => b.efficiency - a.efficiency || b.totalDaysOff - a.totalDaysOff || a.rangeStart.localeCompare(b.rangeStart));
  const { chosen } = selectOpportunities(touching, lastResult.budget);

  els.adviceList.innerHTML = "";
  if (chosen.length) {
    chosen.forEach((opp) => els.adviceList.appendChild(renderOpportunityCard(opp, els.country.value)));
  } else {
    const allSelectedAreFree = Array.from(selected).every((d) => {
      const weekday = new Date(d + "T12:00:00Z").getUTCDay();
      return lastWeekendSet.has(weekday) || lastHolidayEntries.some((h) => h.date === d);
    });
    els.adviceList.innerHTML = allSelectedAreFree
      ? `<p class="hint">Good news — the date(s) you picked are already a weekend or holiday, no leave needed.</p>`
      : `<p class="hint">No bridge touching your selected date(s) fits within your budget and "longest gap worth bridging" setting. Try selecting dates closer to a weekend or public holiday, or loosen that setting above.</p>`;
  }
  els.adviceCard.hidden = false;
  els.adviceCard.scrollIntoView({ behavior: "smooth", block: "start" });
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
