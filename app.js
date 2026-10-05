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
const D = { posts: [], stats: [], requests: [], photos: [], conversations: [], alerts: [], leads: [], events: [] };
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
    alerts: sb("li_alerts?select=*&order=id.desc&limit=20"),
    leads: sb("li_outreach_leads?select=*&order=lead_score.desc.nullslast,created_at.desc&limit=1000"),
    events: sb("li_outreach_events?select=*&order=happened_on.desc,id.desc&limit=2000")
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
  if (waiting > 0) items.push({ t: `${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for a freebie. Open Freebies in the menu.` });
  const ready = D.photos.filter((p) => !p.used_at).length;
  if (ready === 0) items.push({ t: "Photo vault is empty. Add photos from the Photos page in the menu so personal posts keep coming." });
  const weekAgo = addDays(brisDateStr(new Date()), -7);
  const silence = D.alerts.find((a) => a.kind === "silence" && a.ref >= weekAgo);
  if (silence) items.push({ t: `A scheduled post may have been missed on ${esc(silence.ref)}.` });
  // Outreach: what needs a human today
  const due = dueItems();
  const replies = due.filter((d) => d.lead.stage === "replied").length;
  const steps = due.length - replies;
  if (replies > 0) items.push({ t: `${replies} ${replies === 1 ? "reply is" : "replies are"} waiting for your answer.`, g: "due" });
  if (steps > 0) items.push({ t: `${steps} outreach ${steps === 1 ? "step is" : "steps are"} due today.`, g: "due" });
  const st = safetyStatus();
  if (st.label === "Stop") items.push({ t: `Outreach safety says STOP: ${st.why}`, g: "safety" });
  const box = $("attention");
  if (!items.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<h2><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 L45 40 H3 Z" fill="#E8A8A8" stroke="#1A1A2E" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="19" width="4.5" height="11" fill="#1A1A2E"/><circle cx="24.2" cy="35" r="2.4" fill="#1A1A2E"/></svg>Needs your attention</h2><ul>${items.map((i) => `<li${i.g ? ` data-goto="${i.g}" role="button" tabindex="0"` : ""}>${i.t}</li>`).join("")}</ul>`;
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
    $("runway").textContent = "Photos ready: 0. Add some from the Photos page in the menu.";
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

// ---- OUTREACH ----
const TERMINAL_STAGES = ["won", "not_now", "closed"];
const STAGE_LABELS = { new: "New lead", followed: "Followed, warming up", invited: "Invite sent", accepted: "Accepted", msg1_sent: "Message 1 sent", replied: "They replied", chatting: "Chatting", fu1_sent: "Follow-up 1 sent", fu2_sent: "Follow-up 2 sent", call_booked: "Call booked", won: "Won", not_now: "Not now", closed: "Closed" };
let currentDue = [];

function leadName(l) { return [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.business || "Unnamed lead"; }
function last7Set() { const today = brisDateStr(new Date()); const set = new Set(); for (let i = 0; i < 7; i++) set.add(addDays(today, -i)); return set; }
function weekInvites() { const set = last7Set(); return D.leads.filter((l) => l.invite_sent_on && set.has(l.invite_sent_on)); }
function yesRate() { const inv = weekInvites(); const acc = inv.filter((l) => l.accepted_on).length; return { sent: inv.length, acc, rate: inv.length ? acc / inv.length : null }; }

function safetyStatus() {
  const { sent, rate } = yesRate();
  if (sent >= 100) return { label: "Stop", why: "the weekly invite budget is used up." };
  if (sent >= 20 && rate !== null && rate < 0.25) return { label: "Stop", why: "yes-rate is under 25% in the last 7 days. Pause and fix the list or the note." };
  if (sent >= 20 && rate !== null && rate < 0.30) return { label: "Pause", why: "yes-rate is under the 30% target. Slow down and warm leads up more." };
  return { label: "Safe", why: sent < 20 ? "Early days. The yes-rate judges itself once 20 invites are out." : "Yes-rate is holding at or above 30%." };
}
function statusChip(st) {
  if (st.label === "Safe") return `<span class="chip chip-sent">Safe</span>`;
  if (st.label === "Pause") return `<span class="chip chip-waiting">Pause</span>`;
  return `<span class="chip chip-stop">Stop</span>`;
}

function dueItems() {
  const today = brisDateStr(new Date());
  const out = [];
  for (const l of D.leads) {
    if (TERMINAL_STAGES.includes(l.stage)) continue;
    if (l.stage === "replied") out.push({ lead: l, label: "Reply waiting for your answer", action: "Mark answered", patch: { stage: "chatting" } });
    else if (l.accepted_on && !l.msg1_on) out.push({ lead: l, label: "Accepted you. Message 1 is due", action: "Mark message 1 sent", patch: { stage: "msg1_sent", msg1_on: today } });
    else if (l.msg1_on && !l.fu1_on && today >= addDays(l.msg1_on, 3)) out.push({ lead: l, label: "Follow-up 1 is due", action: "Mark follow-up 1 sent", patch: { stage: "fu1_sent", fu1_on: today } });
    else if (l.fu1_on && !l.fu2_on && l.msg1_on && today >= addDays(l.msg1_on, 8)) out.push({ lead: l, label: "Follow-up 2 is due. The offer one, then stop", action: "Mark follow-up 2 sent", patch: { stage: "fu2_sent", fu2_on: today } });
  }
  currentDue = out;
  return out;
}

function oldPending() {
  const cutoff = addDays(brisDateStr(new Date()), -21);
  return D.leads.filter((l) => l.invite_sent_on && !l.accepted_on && l.invite_sent_on <= cutoff && !TERMINAL_STAGES.includes(l.stage));
}

function nextStepLabel(l) {
  const d = currentDue.find((x) => x.lead.id === l.id);
  if (d) return d.label;
  if (TERMINAL_STAGES.includes(l.stage)) return STAGE_LABELS[l.stage] || "Done";
  if (l.stage === "new") return "Follow and warm up first";
  if (l.stage === "followed") return "Send the invite on its scheduled day";
  if (l.stage === "invited") return "Waiting for their answer";
  if (l.stage === "accepted") return "Send message 1";
  if (l.stage === "chatting") return "Keep the chat warm. Offer the call when it fits";
  if (l.msg1_on && !l.fu1_on) return `Follow-up 1 on ${fmtDate(addDays(l.msg1_on, 3))}`;
  if (l.fu1_on && !l.fu2_on && l.msg1_on) return `Follow-up 2 on ${fmtDate(addDays(l.msg1_on, 8))}`;
  return STAGE_LABELS[l.stage] || "On track";
}

function renderOutreachHome() {
  const box = $("outreach-summary");
  if (!box) return;
  const { sent, acc, rate } = yesRate();
  const st = safetyStatus();
  const due = currentDue;
  $("outreach-budget-fill").style.width = `${Math.min(100, sent)}%`;
  $("outreach-budget-label").textContent = sent >= 100 ? "Weekly invite budget used. Sending pauses until Monday." : `Weekly invite budget: ${sent} of 100 used.`;
  const badge = $("outreach-badge");
  if (badge) { badge.hidden = due.length === 0; badge.textContent = due.length; }
  if (!D.leads.length) {
    box.innerHTML = `<p class="muted">No outreach leads yet. The first approved batch lands here, with invites, yes-rate and what is due today.</p>`;
    return;
  }
  const calls = D.leads.filter((l) => l.call_on).length;
  box.innerHTML = `<p class="status-line">${statusChip(st)}<span>${acc} accepted in the last 7 days${rate !== null ? ` &middot; yes-rate ${Math.round(rate * 100)}%` : ""}</span></p>
    <p class="muted" style="margin-top:6px">${due.length ? `${due.length} ${due.length === 1 ? "step" : "steps"} due today.` : "Nothing due today."} ${calls} ${calls === 1 ? "call" : "calls"} booked so far.</p>`;
}

function dueRow(d, i) {
  const l = d.lead;
  return `<div class="waiting-row">
    <div><p class="waiting-who">${esc(leadName(l))}</p>
    <p class="waiting-when">${esc(l.business || l.segment || "")} &middot; ${esc(d.label)}</p></div>
    <button class="btn btn-small" type="button" data-due="${i}">${esc(d.action)}</button>
  </div>`;
}

function renderOutreach() {
  dueItems();
  renderOutreachHome();
  const { sent, acc } = yesRate();
  const st = safetyStatus();
  const calls = D.leads.filter((l) => l.call_on).length;
  const chats = D.leads.filter((l) => l.accepted_on).length;
  $("ov-status").innerHTML = D.leads.length
    ? `<p class="status-line">${statusChip(st)}<span>${esc(st.why)}</span></p>`
    : `<p class="muted">No leads yet. Add the first approved batch in Leads.</p>`;
  $("ov-funnel").innerHTML = `
    <div class="funnel-step"><span class="n">${sent}</span><span class="l">Invited, last 7 days</span></div>
    <div class="funnel-step"><span class="n">${acc}</span><span class="l">Accepted</span></div>
    <div class="funnel-step"><span class="n">${chats}</span><span class="l">Chats open</span></div>
    <div class="funnel-step"><span class="n">${calls}</span><span class="l">Calls booked</span></div>`;
  const due = currentDue;
  $("ov-due").innerHTML = due.length
    ? due.slice(0, 3).map((d, i) => dueRow(d, i)).join("") + (due.length > 3 ? `<p class="fineprint">Plus ${due.length - 3} more in Due Today.</p>` : "")
    : `<p class="muted">Nothing due. New accepts and follow-ups land here on their day.</p>`;
  renderLeads();
  renderDue();
  renderChats();
  renderTemplates();
  renderSafety();
}

function renderLeads() {
  $("leads-count").textContent = D.leads.length;
  const list = $("leads-list");
  if (!D.leads.length) {
    list.innerHTML = `<div class="card"><p class="muted">No leads yet. The first approved batch of 50 lands here, best at the top.</p></div>`;
    return;
  }
  const rows = [...D.leads].sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
  list.innerHTML = rows.map((l) => {
    const chips = [];
    if (l.segment) chips.push(`<span class="chip">${esc(l.segment)}</span>`);
    if (l.lead_tier) chips.push(`<span class="chip chip-above">Batch ${esc(l.lead_tier)}</span>`);
    chips.push(`<span class="chip">${esc(STAGE_LABELS[l.stage] || l.stage)}</span>`);
    const bits = [l.business, l.location].filter(Boolean).map(esc).join(" &middot; ");
    const prob = l.problem ? `<p class="lead-meta">Problem: ${esc(l.problem)}${l.confidence ? ` (${esc(l.confidence)})` : ""}</p>` : "";
    const fix = l.fix ? `<p class="lead-meta">Fix: ${esc(l.fix)}</p>` : "";
    const link = l.profile_url ? `<p class="lead-meta"><a href="${esc(l.profile_url)}" target="_blank" rel="noopener">Open LinkedIn profile</a></p>` : "";
    return `<article class="card">
      <p class="person-email" style="cursor:default">${esc(leadName(l))}${typeof l.lead_score === "number" ? ` <span class="count-pill">${l.lead_score}</span>` : ""}</p>
      ${bits ? `<p class="lead-meta">${bits}</p>` : ""}
      <div class="post-meta">${chips.join("")}</div>
      ${prob}${fix}
      <p class="lead-meta">Next: ${esc(nextStepLabel(l))}</p>
      ${link}
    </article>`;
  }).join("");
}

function renderDue() {
  const list = $("due-list");
  list.innerHTML = currentDue.length
    ? `<div class="card">${currentDue.map((d, i) => dueRow(d, i)).join("")}</div>`
    : `<div class="card"><p class="muted">Nothing due today. Replies, new accepts and follow-ups appear here on their day.</p></div>`;
}

function renderChats() {
  const list = $("chats-list");
  const chats = D.leads.filter((l) => l.accepted_on || ["msg1_sent", "replied", "chatting", "fu1_sent", "fu2_sent", "call_booked"].includes(l.stage));
  if (!chats.length) {
    list.innerHTML = `<div class="card"><p class="muted">No chats yet. Accepted connections appear here with their next step.</p></div>`;
    return;
  }
  list.innerHTML = chats.map((l) => {
    const ev = D.events.find((e) => e.lead_id === l.id);
    const last = ev ? `<p class="lead-meta">Last touch: ${esc(ev.kind || "note")} &middot; ${fmtDate(ev.happened_on)}</p>` : "";
    return `<article class="card">
      <p class="person-email" style="cursor:default">${esc(leadName(l))}</p>
      ${l.business ? `<p class="lead-meta">${esc(l.business)}</p>` : ""}
      <div class="post-meta"><span class="chip">${esc(STAGE_LABELS[l.stage] || l.stage)}</span></div>
      ${last}
      <p class="lead-meta">Next: ${esc(nextStepLabel(l))}</p>
    </article>`;
  }).join("");
}

const TEMPLATES = [
  ["Note N1 · after they engaged with your content", "Hi [Name], your post about [topic] made me smile, so I had to say hi properly :) I help Aussie business owners get their time back with websites and clever systems. Would love to connect."],
  ["Note N2 · same-world tradie", "Hi [Name], fellow Aussie business owner here. I follow a few [trade] legends and your name keeps popping up :) I share simple ways owners win their evenings back. Keen to connect?"],
  ["Note N3 · local", "Hi [Name], Gold Coast local here too. I help local owners stop missing calls and chasing paperwork. Always keen to know more good locals :) Connect?"],
  ["Message 1 · tradies", "Thanks for connecting, [Name]! Quick question, no pitch hiding in it :) When a call comes in while you are on the tools, where does it go? I ask every [trade] owner I meet, and the answers are gold."],
  ["Message 1 · booking-based services", "Thanks for connecting, [Name] :) Genuine question: when the phone rings at 7pm and nobody can grab it, what happens to that booking? I collect answers from owners like you."],
  ["Message 1 · website prospects", "Thanks for connecting, [Name]! Curious about one thing: if I searched for a [service] in [suburb] tonight, would your website be the one that wins me? No wrong answer, I just love hearing how owners see it :)"],
  ["Follow-up 1 · the freebie gift", "Floating this back up, [Name] :) I made a tiny free scorecard that shows why Google hides some local businesses. Happy to send it over if you want a look, no strings."],
  ["Follow-up 1 · the after-hours truth", "Tiny thought from my week, [Name]: the owners I chat with lose most jobs after hours, not during the day. The fix is boring and small. Want me to share what I mean?"],
  ["Follow-up 2 · the receptionist demo", "Last one from me, [Name], I do not chase :) I built a demo receptionist that answers calls at any hour and books the job in. It is live and free to test. Want the link to try it on your own business?"],
  ["Follow-up 2 · the free prototype", "Closing the loop, [Name] :) My thing is simple: I build you a working website prototype first, free, and you only pay if you love it. If that ever sounds handy, I am one message away. Either way, glad we connected."],
  ["Reply starter · price question", "Fair question :) Websites start with a free prototype, so you see yours before you pay a cent. The systems start at A$1,497 set up, with care plans from A$199 a month. Want me to look at your setup and quote it properly?"]
];

function renderTemplates() {
  $("templates-list").innerHTML = TEMPLATES.map(([t, b]) => `
    <div class="card">
      <h2>${esc(t)}</h2>
      <p class="template-body">${esc(b)}</p>
    </div>`).join("");
}

function renderSafety() {
  const { sent, acc, rate } = yesRate();
  const st = safetyStatus();
  $("safety-main").innerHTML = `
    <p class="status-line">${statusChip(st)}<span>${esc(st.why)}</span></p>
    <div class="budget-bar"><div id="safety-budget-fill" style="width:${Math.min(100, sent)}%"></div></div>
    <p class="lead-meta" style="margin-top:8px">Invites, last 7 days: ${sent} of 100 &middot; Accepted: ${acc}${rate !== null ? ` &middot; Yes-rate: ${Math.round(rate * 100)}% (target 30% or more, stop under 25%)` : ""}</p>
    <p class="lead-meta">Personalised invite notes are precious on a free account, about 3 a month. Spend them on batch A only.</p>`;
  const pend = oldPending();
  $("safety-pending").innerHTML = pend.length
    ? pend.slice(0, 10).map((l) => `<div class="past-row"><span>${esc(leadName(l))}</span><span class="waiting-when">invited ${fmtDate(l.invite_sent_on)}</span></div>`).join("") + (pend.length > 10 ? `<p class="fineprint">Plus ${pend.length - 10} more.</p>` : "")
    : `<p class="muted">None. Invites older than 21 days with no answer show up here, ready to withdraw.</p>`;
}

async function patchLead(id, patch, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
  try {
    await sb(`li_outreach_leads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: patch });
    const row = D.leads.find((l) => l.id === id);
    if (row) Object.assign(row, patch);
    try { await sb("li_outreach_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: { lead_id: id, kind: patch.stage || "update", happened_on: brisDateStr(new Date()) } }); } catch (e) {}
    renderOutreach();
    renderAttention();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Try again"; }
  }
}

async function addLead(ev) {
  ev.preventDefault();
  const status = $("o-add-status");
  const first = $("o-first").value.trim();
  if (!first) { status.textContent = "Add at least a first name."; return; }
  const scoreRaw = $("o-score").value.trim();
  const score = scoreRaw === "" ? null : Math.max(0, Math.min(100, parseInt(scoreRaw, 10) || 0));
  const tier = score === null ? null : score >= 70 ? "A" : score >= 50 ? "B" : "C";
  try {
    await sb("li_outreach_leads", { method: "POST", headers: { Prefer: "return=minimal" }, body: {
      first_name: first,
      last_name: $("o-last").value.trim() || null,
      business: $("o-business").value.trim() || null,
      segment: $("o-segment").value.trim() || null,
      lead_score: score, lead_tier: tier,
      problem: $("o-problem").value.trim() || null,
      profile_url: $("o-url").value.trim() || null,
      stage: "new"
    } });
    status.textContent = `Added ${first}. They are in the Leads list.`;
    ev.target.reset();
    await refreshData();
    switchOSub("leads");
  } catch (e) {
    status.textContent = "Could not save that lead. Try again in a moment.";
  }
}

function switchOSub(name) {
  document.querySelectorAll(".osub").forEach((p) => {
    const on = p.id === `osub-${name}`;
    p.hidden = !on;
    p.classList.toggle("active", on);
  });
  document.querySelectorAll("[data-osub]").forEach((b) => b.classList.toggle("active", b.dataset.osub === name));
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
  document.querySelectorAll(".view").forEach((v) => {
    const on = v.id === `view-${name}`;
    v.hidden = !on;
    v.classList.toggle("active", on);
  });
  document.querySelectorAll(".side-item").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $("outreach-subs").hidden = name !== "outreach";
  closeSidebar();
  window.scrollTo({ top: 0 });
}

async function refreshData() {
  const errBox = $("load-error");
  try {
    await loadAll();
    if (errBox) errBox.remove();
    renderHome(); renderPosts(); renderFreebies(); renderPeople(); renderPhotos(); renderOutreach();
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
  document.querySelectorAll(".side-sub, .otoggle").forEach((b) => b.addEventListener("click", () => { switchView("outreach"); switchOSub(b.dataset.osub); }));
  $("btn-open-outreach").addEventListener("click", () => { switchView("outreach"); switchOSub("overview"); });
  $("attention").addEventListener("click", (ev) => {
    const li = ev.target.closest("[data-goto]");
    if (li) { switchView("outreach"); switchOSub(li.dataset.goto); }
  });
  const dueClick = (ev) => {
    const btn = ev.target.closest("[data-due]");
    if (!btn) return;
    const item = currentDue[Number(btn.dataset.due)];
    if (item) patchLead(item.lead.id, item.patch, btn);
  };
  $("due-list").addEventListener("click", dueClick);
  $("ov-due").addEventListener("click", dueClick);
  $("o-add-form").addEventListener("submit", addLead);

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
