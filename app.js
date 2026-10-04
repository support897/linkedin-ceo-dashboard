// LinkedIn CEO Dashboard - app logic.
// Data comes from the linkedin-dashboard Supabase project via its REST API
// with the public anon key. RLS keeps this read-mostly and safe.
const SUPABASE_URL = "https://osvnmauvvtjfawvyuzdv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zdm5tYXV2dnRqZmF3dnl1emR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTA2ODcsImV4cCI6MjEwNjU4NjY4N30.q2oVDQRh4TForckQ7CSn1DzuyqGVY5tnGaKMOUlo-gE";
const VAPID_PUBLIC_KEY = "BJTjY5gxcO5ugpaeTMN6KdcSHppAl3-EpXu4h6xT13VcSZ51P-M_O5OirXQ2kMefNfpT-o6KK5m8PYAaeQoQaYo";
const TZ = "Australia/Brisbane";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---- Brisbane date helpers (all week maths happens in AEST/AEDT) ----
function brisDateStr(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(dateStr, n) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// Set of YYYY-MM-DD strings for the Mon-Sun week `weeksAgo` weeks before this week.
function weekSet(weeksAgo) {
  const today = brisDateStr(new Date());
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  const monday = addDays(today, -((dow + 6) % 7) - weeksAgo * 7);
  const set = new Set();
  for (let i = 0; i < 7; i++) set.add(addDays(monday, i));
  return set;
}
function fmtDate(dateStr, style) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...(style || { day: "numeric", month: "short" }) }).format(new Date(`${dateStr}T12:00:00Z`));
}
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ---- State ----
const D = { posts: [], stats: [], requests: [], photos: [], conversations: [], alerts: [] };
let latestStats = {}; // urn -> newest snapshot
let sortMode = "newest";

function rebuildLatestStats() {
  latestStats = {};
  for (const s of D.stats) { // stats arrive newest first
    if (!latestStats[s.urn]) latestStats[s.urn] = s;
  }
}

async function loadAll() {
  const jobs = {
    posts: sb("li_posts?select=*&order=posted_at.desc&limit=300"),
    stats: sb("li_post_stats?select=*&order=captured_at.desc&limit=2000"),
    requests: sb("li_freebie_requests?select=*&order=id.desc&limit=500"),
    photos: sb("li_vault_photos?select=*&order=uploaded_at.asc&limit=500"),
    conversations: sb("li_conversations?select=*&order=logged_on.desc&limit=500"),
    alerts: sb("li_alerts?select=*&order=id.desc&limit=20")
  };
  const keys = Object.keys(jobs);
  const results = await Promise.allSettled(keys.map((k) => jobs[k]));
  let okCount = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && Array.isArray(r.value)) { D[keys[i]] = r.value; okCount++; }
  });
  if (okCount === 0) throw new Error("Could not load any dashboard data.");
  rebuildLatestStats();
  const t = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit", weekday: "short", day: "numeric", month: "short" }).format(new Date());
  $("last-updated").textContent = `Last updated: ${t}`;
}

// ---- Shared measures ----
function postsInWeek(weeksAgo) {
  const set = weekSet(weeksAgo);
  return D.posts.filter((p) => set.has(brisDateStr(new Date(p.posted_at))));
}
function weeklySum(weeksAgo, field) {
  let sum = 0, any = false;
  for (const p of postsInWeek(weeksAgo)) {
    const s = latestStats[p.urn];
    if (s && typeof s[field] === "number") { sum += s[field]; any = true; }
  }
  return { sum, any };
}
function avg4(weeklyFn) {
  const vals = [1, 2, 3, 4].map(weeklyFn);
  return vals.reduce((a, b) => a + b, 0) / 4;
}
function compareLine(cur, avg) {
  if (avg === 0 && cur === 0) return `<span class="flat">No 4-week average yet</span>`;
  if (cur > avg) return `<span class="up">&#9650; above your 4-week average (${fmtNum(avg)})</span>`;
  if (cur < avg) return `<span class="down">&#9660; below your 4-week average (${fmtNum(avg)})</span>`;
  return `<span class="flat">&#8594; right on your 4-week average</span>`;
}

// ---- HOME ----
function renderAttention() {
  const items = [];
  const waiting = D.requests.filter((r) => !r.sent).length;
  if (waiting > 0) items.push(`${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for a freebie. Open Freebies in the menu.`);
  const ready = D.photos.filter((p) => !p.used_at).length;
  if (ready === 0) items.push("Photo vault is empty. Add photos in the Photos tab so personal posts keep coming.");
  const weekAgo = addDays(brisDateStr(new Date()), -7);
  const silence = D.alerts.find((a) => a.kind === "silence" && a.ref >= weekAgo);
  if (silence) items.push(`A scheduled post may have been missed on ${esc(silence.ref)}.`);
  const box = $("attention");
  if (!items.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<h2><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 L45 40 H3 Z" fill="#E8A8A8" stroke="#1A1A2E" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="19" width="4.5" height="11" fill="#1A1A2E"/><circle cx="24.2" cy="35" r="2.4" fill="#1A1A2E"/></svg>Needs your attention</h2><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function kpiCard(id, label, valueHtml, subHtml, extra = "") {
  $(id).innerHTML = `<p class="kpi-label">${label}</p><p class="kpi-value">${valueHtml}</p><p class="kpi-sub">${subHtml}</p>${extra}`;
}

function renderHome() {
  renderAttention();

  // This Week
  const thisWeek = postsInWeek(0);
  $("this-week-count").textContent = D.posts.length === 0 && thisWeek.length === 0 ? "No posts yet" : `${thisWeek.length} of 3 posts out`;
  $("this-week-sub").textContent = thisWeek.length
    ? `Posted: ${thisWeek.map((p) => fmtDate(brisDateStr(new Date(p.posted_at)), { weekday: "short" })).join(", ")}.`
    : "Posts go out Mon, Wed and Fri at 10am.";

  const hasPosts = D.posts.length > 0;

  // Comments KPI (top row)
  const cNow = weeklySum(0, "comments");
  const cAvg = avg4((w) => weeklySum(w, "comments").sum);
  kpiCard("kpi-comments", "Comments this week",
    hasPosts ? String(cNow.sum) : "No data yet",
    hasPosts ? compareLine(cNow.sum, cAvg) : "Your first posts will land here.");

  // Keyword requests KPI (top row)
  const reqNow = D.requests.filter((r) => weekSet(0).has(r.requested_on)).length;
  const reqAvg = avg4((w) => D.requests.filter((r) => weekSet(w).has(r.requested_on)).length);
  kpiCard("kpi-requests", "Keyword requests",
    String(reqNow),
    compareLine(reqNow, reqAvg));

  // Conversations KPI + one-tap log button
  const convNow = D.conversations.filter((c) => weekSet(0).has(c.logged_on)).length;
  const convAvg = avg4((w) => D.conversations.filter((c) => weekSet(w).has(c.logged_on)).length);
  kpiCard("kpi-conversations", "Conversations started",
    String(D.conversations.length),
    `${convNow} this week<br>${compareLine(convNow, convAvg)}`,
    `<button class="btn btn-small" id="btn-conv" type="button">+1 conversation</button><span class="fineprint" id="conv-status"></span>`);
  $("btn-conv").addEventListener("click", logConversation);

  // Likes KPI (demoted, smaller)
  const lNow = weeklySum(0, "likes");
  const lAvg = avg4((w) => weeklySum(w, "likes").sum);
  kpiCard("kpi-likes", "Likes this week",
    hasPosts ? String(lNow.sum) : "No data yet",
    hasPosts ? compareLine(lNow.sum, lAvg) : "Applause, not customers.");

  // Photo runway
  const ready = D.photos.filter((p) => !p.used_at).length;
  if (ready > 0) {
    const until = new Date(Date.now() + ready * 14 * 24 * 60 * 60 * 1000);
    const untilStr = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(until);
    $("runway").textContent = `Photos ready: ${ready}, enough until about ${untilStr}.`;
  } else {
    $("runway").textContent = "Photos ready: 0. Add some in the Photos tab.";
  }

  renderChart();
  renderBestPost();
  renderFreebieCard();
}

function renderChart() {
  const wrap = $("chart-wrap");
  // For each of the last 8 weeks: per post, its newest snapshot captured
  // inside that week; sum the comments. Weeks with no snapshots are gaps.
  const points = [];
  for (let w = 7; w >= 0; w--) {
    const set = weekSet(w);
    const perUrn = {};
    for (const s of D.stats) { // newest first: first hit per urn in this week wins
      if (set.has(brisDateStr(new Date(s.captured_at))) && !perUrn[s.urn]) perUrn[s.urn] = s;
    }
    const urns = Object.keys(perUrn);
    if (!urns.length) { points.push(null); continue; }
    let sum = 0, any = false;
    for (const u of urns) { if (typeof perUrn[u].comments === "number") { sum += perUrn[u].comments; any = true; } }
    points.push(any ? sum : null);
  }
  const have = points.filter((p) => p !== null);
  if (!have.length) {
    wrap.innerHTML = `<p class="muted">No data yet. Your chart starts once your posts collect their first counts.</p>`;
    return;
  }
  const W = 340, H = 150, PADL = 26, PADB = 20, PADT = 12;
  const max = Math.max(...have, 1);
  const x = (i) => PADL + (i * (W - PADL - 8)) / 7;
  const y = (v) => PADT + (1 - v / max) * (H - PADT - PADB);
  let path = "", started = false, dots = "", labels = "";
  points.forEach((v, i) => {
    if (v === null) { started = false; return; }
    path += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    started = true;
    dots += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#9BD3AC" stroke="#1A1A2E" stroke-width="1.6"/><text x="${x(i)}" y="${y(v) - 9}" text-anchor="middle" font-size="11" font-weight="800" fill="#1A1A2E">${v}</text>`;
  });
  for (let i = 0; i < 8; i++) {
    const monday = [...weekSet(7 - i)][0];
    labels += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="rgba(26,26,46,.55)">${fmtDate(monday)}</text>`;
  }
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comments per week, last 8 weeks">
    <line x1="${PADL}" y1="${H - PADB}" x2="${W - 6}" y2="${H - PADB}" stroke="#C8D8E8" stroke-width="2"/>
    <text x="2" y="${y(max) + 4}" font-size="10.5" font-weight="700" fill="rgba(26,26,46,.55)">${max}</text>
    <path d="${path}" fill="none" stroke="#E8A8A8" stroke-width="3.4" stroke-linecap="round"/>
    ${dots}${labels}</svg>
    <p class="chart-note">Total comments on your posts, week by week.</p>`;
}

function renderBestPost() {
  const box = $("best-post");
  const candidates = postsInWeek(0).filter((p) => latestStats[p.urn]);
  if (!candidates.length) {
    box.innerHTML = `<p class="muted">${D.posts.length ? "No counts yet for this week's posts. Check back after the next engine run." : "No data yet. Your best post will shine here."}</p>`;
    return;
  }
  const ranked = [...candidates].sort((a, b) => {
    const sa = latestStats[a.urn], sbv = latestStats[b.urn];
    return (sbv.comments || 0) - (sa.comments || 0) || (sbv.likes || 0) - (sa.likes || 0);
  });
  const best = ranked[0], s = latestStats[best.urn];
  box.innerHTML = `<p class="best-text">${esc(best.text.length > 280 ? best.text.slice(0, 280) + "..." : best.text)}</p>
    <p class="best-meta">${s.comments || 0} comments &middot; ${s.likes || 0} likes &middot; ${fmtDate(brisDateStr(new Date(best.posted_at)), { weekday: "short", day: "numeric", month: "short" })}</p>`;
}

function currentFreebieName() {
  const offer = D.posts.find((p) => p.is_offer && p.freebie_name);
  if (offer) return { name: offer.freebie_name, keyword: offer.keyword || "" };
  if (D.requests.length && D.requests[0].freebie_name) return { name: D.requests[0].freebie_name, keyword: D.requests[0].keyword || "" };
  return null;
}

function renderFreebieCard() {
  const box = $("freebie-summary");
  const cur = currentFreebieName();
  if (!cur) {
    box.innerHTML = `<p class="muted">No freebie offered yet. Friday offer posts will appear here.</p>`;
    return;
  }
  const waiting = D.requests.filter((r) => r.freebie_name === cur.name && !r.sent).length;
  box.innerHTML = `<p class="best-text"><strong>${esc(cur.name)}</strong></p>
    <p class="muted">Keyword: <strong>${esc(cur.keyword || "-")}</strong>${waiting ? `<br>${waiting} ${waiting === 1 ? "person" : "people"} waiting. See the waiting list below.` : "<br>Nobody waiting right now."}</p>`;
}

async function logConversation() {
  const status = $("conv-status");
  const btn = $("btn-conv");
  btn.disabled = true;
  try {
    await sb("li_conversations", { method: "POST", headers: { Prefer: "return=minimal" }, body: { logged_on: brisDateStr(new Date()) } });
    D.conversations.unshift({ logged_on: brisDateStr(new Date()) });
    renderHome();
  } catch (e) {
    if (status) status.textContent = "Could not save. Try again in a moment.";
    btn.disabled = false;
  }
}

// ---- POSTS ----
function shortPillar(name) {
  const m = String(name).match(/pillar\s*(\d)/i);
  return m ? `Pillar ${m[1]}` : name;
}

function renderPosts() {
  const list = $("posts-list");
  if (!D.posts.length) {
    list.innerHTML = `<div class="card"><p class="muted">No posts yet. When the engine posts to LinkedIn, they show up here with their counts.</p></div>`;
    return;
  }
  // Average comments per post across the previous 4 weeks.
  let avgC = null;
  {
    let sum = 0, n = 0;
    for (const w of [1, 2, 3, 4]) for (const p of postsInWeek(w)) {
      const s = latestStats[p.urn];
      if (s && typeof s.comments === "number") { sum += s.comments; n++; }
    }
    if (n) avgC = sum / n;
  }
  const posts = [...D.posts];
  if (sortMode === "best") {
    const key = (p) => { const s = latestStats[p.urn]; return s ? [s.comments || 0, s.likes || 0] : [-1, -1]; };
    posts.sort((a, b) => { const ka = key(a), kb = key(b); return kb[0] - ka[0] || kb[1] - ka[1]; });
  }
  list.innerHTML = posts.map((p, i) => {
    const s = latestStats[p.urn];
    const chips = [];
    if (p.is_offer) chips.push(`<span class="chip chip-freebie">Freebie${p.keyword ? ": " + esc(p.keyword) : ""}</span>`);
    else if (p.pillar) chips.push(`<span class="chip">${esc(shortPillar(p.pillar))}</span>`);
    if (s && avgC !== null && typeof s.comments === "number") {
      if (s.comments > avgC) chips.push(`<span class="chip chip-above">Above average</span>`);
      else if (s.comments < avgC) chips.push(`<span class="chip chip-below">Below average</span>`);
    }
    const star = sortMode === "best" && i < 3 && s ? `<span class="star" title="Top post">&#9733;</span>` : "";
    const nums = s ? `${s.comments || 0} comments &middot; ${s.likes || 0} likes` : "No counts yet";
    const text = p.text.length > 320 ? p.text.slice(0, 320) + "..." : p.text;
    return `<article class="card post-card">
      <div class="post-head"><span class="post-date">${fmtDate(brisDateStr(new Date(p.posted_at)), { weekday: "short", day: "numeric", month: "short" })}</span>${star}</div>
      <p class="post-text">${esc(text)}</p>
      <div class="post-meta"><span class="post-nums">${nums}</span>${chips.join("")}</div>
    </article>`;
  }).join("");
}

// ---- FREEBIES ----
function renderFreebies() {
  const cur = currentFreebieName();
  $("fb-current-name").textContent = cur ? cur.name : "Current freebie";
  $("fb-current-keyword").textContent = cur
    ? (cur.keyword ? `People comment the word: ${cur.keyword}` : "")
    : "No freebie offered yet. Friday offer posts will appear here.";
  const rows = cur ? D.requests.filter((r) => r.freebie_name === cur.name) : [];
  const sent = rows.filter((r) => r.sent).length;
  const waitingRows = D.requests.filter((r) => !r.sent);
  $("fb-funnel").innerHTML = `
    <div class="funnel-step"><span class="n">${rows.length}</span><span class="l">Requests</span></div>
    <div class="funnel-step"><span class="n">${sent}</span><span class="l">Sent</span></div>
    <div class="funnel-step"><span class="n">${waitingRows.filter((r) => cur && r.freebie_name === cur.name).length}</span><span class="l">Waiting</span></div>`;

  const waiting = $("fb-waiting");
  if (!waitingRows.length) {
    waiting.innerHTML = `<p class="muted">Nobody is waiting. When someone comments the keyword, add them below and tap Mark sent once you have sent it.</p>`;
  } else {
    waiting.innerHTML = waitingRows.map((r) => `
      <div class="waiting-row">
        <div><p class="waiting-who">${esc(r.person_name)}</p>
        <p class="waiting-when">${esc(r.freebie_name || "")} &middot; asked ${fmtDate(r.requested_on)}</p></div>
        <button class="btn btn-small" type="button" data-mark-sent="${r.id}">Mark sent</button>
      </div>`).join("");
  }

  if (!$("fb-name").dataset.touched) {
    $("fb-name").value = cur ? cur.name : "";
    $("fb-keyword").value = cur ? cur.keyword : "";
  }

  const groups = {};
  for (const r of D.requests) {
    const name = r.freebie_name || "Unnamed freebie";
    if (cur && name === cur.name) continue;
    groups[name] = groups[name] || { total: 0, sent: 0 };
    groups[name].total++;
    if (r.sent) groups[name].sent++;
  }
  const names = Object.keys(groups);
  $("fb-past").innerHTML = names.length
    ? names.map((n) => `<div class="past-row"><span>${esc(n)}</span><span class="waiting-when">${groups[n].total} requests &middot; ${groups[n].sent} sent</span></div>`).join("")
    : `<p class="muted">No past freebies yet.</p>`;
}

async function markSent(id, btn) {
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    await sb(`li_freebie_requests?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { sent: true, sent_at: new Date().toISOString() } });
    const row = D.requests.find((r) => r.id === id);
    if (row) { row.sent = true; row.sent_at = new Date().toISOString(); }
    renderFreebies();
    renderHome();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Mark sent";
  }
}

async function addRequest(ev) {
  ev.preventDefault();
  const status = $("fb-add-status");
  const person = $("fb-person").value.trim();
  const name = $("fb-name").value.trim();
  const keyword = $("fb-keyword").value.trim();
  if (!person || !name) { status.textContent = "Add the person's name and the freebie."; return; }
  try {
    await sb("li_freebie_requests", { method: "POST", headers: { Prefer: "return=minimal" }, body: { person_name: person, freebie_name: name, keyword: keyword || null, requested_on: brisDateStr(new Date()), sent: false } });
    $("fb-person").value = "";
    status.textContent = `Added. ${person} is on the waiting list.`;
    await refreshData();
  } catch (e) {
    status.textContent = "Could not save that request. Try again in a moment.";
  }
}

// ---- PEOPLE ----
const EMAIL_RE = /\S+@\S+\.\S+/;

function renderPeople() {
  const rows = [...D.requests].sort((a, b) => {
    if (a.requested_on !== b.requested_on) return String(a.requested_on) < String(b.requested_on) ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  });
  const emails = new Set(
    rows.map((r) => String(r.person_name || "").trim().toLowerCase()).filter((v) => EMAIL_RE.test(v))
  );
  $("people-summary").textContent = `People: ${rows.length} requests \u00B7 ${emails.size} email addresses`;
  const list = $("people-list");
  if (!rows.length) {
    list.innerHTML = `<div class="card"><p class="muted">No people yet. Emails land here the moment someone grabs a freebie.</p></div>`;
    return;
  }
  list.innerHTML = rows.map((r) => {
    const name = r.person_name || "";
    const status = r.sent
      ? `<span class="chip chip-sent">Sent${r.sent_at ? " " + esc(fmtDate(brisDateStr(new Date(r.sent_at)))) : ""}</span>`
      : `<span class="chip chip-waiting">Waiting</span>`;
    const kw = r.keyword ? `<span class="chip">${esc(r.keyword)}</span>` : "";
    const website = r.website ? `<p class="person-line">Website: ${esc(r.website)}</p>` : "";
    const consent = r.consent ? `<p class="person-line">Weekly tips: yes</p>` : "";
    return `<article class="card person-card">
      <p class="person-email" data-copy="${esc(name)}" role="button" tabindex="0" title="Tap to copy">${esc(name)}<span class="copied-tag" hidden>Copied</span></p>
      <div class="post-meta"><span class="post-nums">${esc(r.freebie_name || "Freebie")}</span>${kw}${status}</div>
      <p class="person-line">Asked ${esc(fmtDate(r.requested_on))}</p>
      ${website}${consent}
    </article>`;
  }).join("");
}

async function copyPersonName(text, el) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    ta.remove();
  }
  if (ok && el) {
    const tag = el.querySelector(".copied-tag");
    if (tag) { tag.hidden = false; setTimeout(() => { tag.hidden = true; }, 1200); }
  }
}

// ---- PHOTOS ----
function fileToJpegBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not process that image"))), "image/jpeg", 0.85);
      } catch (err) { reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("could not read that file")); };
    img.src = url;
  });
}

async function uploadPhoto(blob, note) {
  const name = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vault/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "image/jpeg" },
    body: blob
  });
  if (!res.ok) throw new Error(`upload HTTP ${res.status}`);
  await sb("li_vault_photos", { method: "POST", headers: { Prefer: "return=minimal" }, body: { storage_path: name, note: note || null } });
}

async function handleFiles(fileList) {
  const status = $("photo-status");
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) { status.textContent = "No image files there. Pick photos of you."; return; }
  const note = $("photo-note").value.trim();
  let done = 0;
  for (const f of files) {
    status.textContent = `Uploading photo ${done + 1} of ${files.length}...`;
    try { await uploadPhoto(await fileToJpegBlob(f), note); done++; }
    catch (e) { status.textContent = `One photo did not upload (${e.message}). Carrying on...`; }
  }
  $("photo-note").value = "";
  status.textContent = done ? `Done. ${done} photo${done > 1 ? "s" : ""} ready to use.` : "Uploads failed. Check your connection and try again.";
  if (done) await refreshData();
}

function photoCell(p) {
  const sub = p.used_at
    ? `<p class="photo-used-date">Used ${fmtDate(brisDateStr(new Date(p.used_at)))}</p>`
    : `<p class="photo-note">${p.note ? esc(p.note) : "&nbsp;"}</p>`;
  return `<div class="photo-cell"><img alt="A photo you added" data-path="${esc(p.storage_path)}">${sub}</div>`;
}

function renderPhotos() {
  const ready = D.photos.filter((p) => !p.used_at);
  const used = D.photos.filter((p) => p.used_at).sort((a, b) => new Date(b.used_at) - new Date(a.used_at));
  $("ready-count").textContent = ready.length;
  $("ready-shelf").innerHTML = ready.length ? ready.map(photoCell).join("") : `<p class="muted">No photos ready. Add some above.</p>`;
  $("used-shelf").innerHTML = used.length ? used.map(photoCell).join("") : `<p class="muted">None used yet. Used photos retire here with their date.</p>`;
  loadThumbs();
}

async function loadThumbs() {
  for (const img of document.querySelectorAll("img[data-path]")) {
    try {
      const path = img.dataset.path.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vault/${path}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!res.ok) continue;
      img.src = URL.createObjectURL(await res.blob());
    } catch (e) { /* the pastel placeholder stays */ }
  }
}

// ---- REMINDERS (subscription groundwork; sending comes later) ----
function urlB64ToUint8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function enableReminders() {
  const status = $("reminder-status");
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      status.textContent = "This browser cannot do reminders. On iPhone, add the app to your Home Screen from Safari first, then tap again.";
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { status.textContent = "Reminders are off. You can allow them in your browser settings any time."; return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY) });
    const json = sub.toJSON();
    await sb("li_push_subscriptions", { method: "POST", headers: { Prefer: "return=minimal" }, body: { endpoint: json.endpoint, subscription: json } });
    status.textContent = "Reminders are on for this device.";
  } catch (e) {
    status.textContent = `Could not turn reminders on (${e.message}).`;
  }
}

// ---- App shell: side menu, refresh, pull-to-refresh ----
function setSidebar(open) {
  document.body.classList.toggle("menu-open", open);
  $("sidebar").classList.toggle("open", open);
  $("sidebar-backdrop").hidden = !open;
  $("menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
}
function closeSidebar() { setSidebar(false); }

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  document.querySelectorAll(".side-item").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  closeSidebar();
  window.scrollTo({ top: 0 });
}

async function refreshData() {
  const errBox = $("load-error");
  try {
    await loadAll();
    if (errBox) errBox.remove();
    renderHome(); renderPosts(); renderFreebies(); renderPeople(); renderPhotos();
  } catch (e) {
    $("last-updated").textContent = "Could not load. Pull down to try again.";
    if (!errBox) {
      const div = document.createElement("div");
      div.className = "error-box"; div.id = "load-error";
      div.textContent = "The dashboard could not load its data. Check your connection, then pull down to refresh.";
      $("main").prepend(div);
    }
  }
}

function init() {
  document.querySelectorAll(".side-item").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  $("menu-btn").addEventListener("click", () => setSidebar(!$("sidebar").classList.contains("open")));
  $("sidebar-backdrop").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });
  $("people-list").addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-copy]");
    if (el) copyPersonName(el.dataset.copy, el);
  });
  $("people-list").addEventListener("keydown", (ev) => {
    const el = ev.target.closest("[data-copy]");
    if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); copyPersonName(el.dataset.copy, el); }
  });
  $("sort-newest").addEventListener("click", () => { sortMode = "newest"; $("sort-newest").classList.add("active"); $("sort-best").classList.remove("active"); renderPosts(); });
  $("sort-best").addEventListener("click", () => { sortMode = "best"; $("sort-best").classList.add("active"); $("sort-newest").classList.remove("active"); renderPosts(); });
  $("fb-waiting").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-mark-sent]");
    if (btn) markSent(Number(btn.dataset.markSent), btn);
  });
  $("fb-add-form").addEventListener("submit", addRequest);
  ["fb-name", "fb-keyword"].forEach((id) => $(id).addEventListener("input", () => { $(id).dataset.touched = "1"; }));
  $("btn-reminders").addEventListener("click", enableReminders);

  const dz = $("dropzone"), input = $("photo-input");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { if (input.files.length) handleFiles(input.files); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  // Pull to refresh
  let startY = null;
  document.addEventListener("touchstart", (e) => { startY = window.scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    $("pull-hint").hidden = !(e.touches[0].clientY - startY > 50);
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    $("pull-hint").hidden = true;
    startY = null;
    if (dy > 90 && window.scrollY <= 0) refreshData();
  }, { passive: true });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  refreshData();
}

document.addEventListener("DOMContentLoaded", init);
