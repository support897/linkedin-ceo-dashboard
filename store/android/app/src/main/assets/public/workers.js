// Workers tracking module (additive, 2026-10-10).
// Loaded after app.js. Reads ONLY the worker_* contract tables plus
// li_freebies / li_freebie_requests for the campaign card, all from the
// same linkedin-dashboard Supabase project through the app's own sb().
// It adds new views and never touches the existing ones: existing
// rendering, labels and data paths in app.js are unchanged.
(function () {
  "use strict";

  var WORKERS = [
    { slug: "linkedin-content", key: "content", prefix: "wc" },
    { slug: "linkedin-outreach", key: "outreach", prefix: "wo" }
  ];

  var W = { workers: {}, status: {}, experiments: {}, rollups: {}, deliverables: {}, freebies: [] };
  var lastLoad = 0;

  function bySlug(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (!map[r.worker_slug]) map[r.worker_slug] = [];
      map[r.worker_slug].push(r);
    });
    return map;
  }

  async function wLoad() {
    var jobs = {
      workers: sb("workers?select=*&division=eq.linkedin"),
      status: sb("worker_status?select=*"),
      experiments: sb("worker_experiments?select=*&order=check_date.asc.nullslast,id.asc"),
      rollups: sb("worker_rollups?select=*&order=week.desc"),
      deliverables: sb("worker_deliverables?select=*&order=item_date.desc.nullslast,id.desc"),
      freebies: sb("li_freebies?select=name,keyword,goes_live_on&order=goes_live_on.asc")
    };
    var keys = Object.keys(jobs);
    var results = await Promise.allSettled(keys.map(function (k) { return jobs[k]; }));
    results.forEach(function (r, i) {
      if (r.status !== "fulfilled" || !Array.isArray(r.value)) return;
      var k = keys[i];
      if (k === "workers") {
        W.workers = {};
        r.value.forEach(function (row) { W.workers[row.worker_slug] = row; });
      } else if (k === "status") {
        W.status = {};
        r.value.forEach(function (row) { W.status[row.worker_slug] = row; });
      } else if (k === "freebies") {
        W.freebies = r.value;
      } else {
        W[k] = bySlug(r.value);
      }
    });
    lastLoad = Date.now();
    renderStrip();
    WORKERS.forEach(renderWorker);
  }

  // ---- shared bits ----
  function dotClass(st) {
    if (!st) return "w-dot-off";
    var upd = st.updated_at ? brisDateStr(new Date(st.updated_at)) : "";
    if (st.scan_done && upd === brisDateStr(new Date())) return "w-dot-on";
    if (st.scan_done) return "w-dot-stale";
    return "w-dot-off";
  }

  function scanLine(st) {
    if (!st) return "No scan logged yet.";
    var upd = st.updated_at ? brisDateStr(new Date(st.updated_at)) : "";
    var when = upd ? fmtDate(upd, { weekday: "short", day: "numeric", month: "short" }) : "";
    if (st.scan_done && upd === brisDateStr(new Date())) return "Scan done today.";
    if (st.scan_done) return "Last scan logged " + when + ". Nothing logged today yet.";
    return "No scan logged today" + (when ? " (last update " + when + ")" : "") + ".";
  }

  function verdictChip(verdict) {
    if (!verdict) return "";
    var v = String(verdict).toUpperCase();
    var cls = "w-verdict-open";
    if (v.indexOf("PASS") !== -1 || v === "KEEP") cls = "w-verdict-pass";
    if (v.indexOf("FAIL") !== -1 || v === "REVERT") cls = "w-verdict-fail";
    return ' <span class="chip ' + cls + '">' + esc(verdict) + "</span>";
  }

  function fmtDay(dateStr) {
    return dateStr ? fmtDate(dateStr, { weekday: "short", day: "numeric", month: "short" }) : "";
  }

  // ---- HOME strip ----
  function renderStrip() {
    var box = $("workers-strip");
    if (!box) return;
    box.innerHTML = WORKERS.map(function (w) {
      var meta = W.workers[w.slug];
      var st = W.status[w.slug];
      var name = meta ? meta.display_name : w.slug;
      var line = st && st.finding_line ? st.finding_line : "No finding logged yet.";
      return '<div class="w-strip-item">' +
        '<div class="w-strip-head"><span class="w-dot ' + dotClass(st) + '"></span>' +
        '<span class="w-strip-name">' + esc(name) + "</span></div>" +
        '<p class="w-strip-line">' + esc(line) + "</p>" +
        '<button class="btn btn-small" type="button" data-open-worker="' + w.key + '">Open</button></div>';
    }).join("");

    var line = $("supervisor-line");
    if (line) {
      var gated = [];
      WORKERS.forEach(function (w) {
        (W.deliverables[w.slug] || []).forEach(function (d) {
          if (d.verdict) gated.push({ w: w, d: d });
        });
      });
      gated.sort(function (a, b) { return String(b.d.item_date || "").localeCompare(String(a.d.item_date || "")); });
      if (gated.length) {
        var g = gated[0];
        var wname = W.workers[g.w.slug] ? W.workers[g.w.slug].display_name : g.w.slug;
        line.textContent = "Quality Supervisor: latest verdict " + g.d.verdict + " — " + g.d.title + " (" + wname + (g.d.item_date ? ", " + fmtDay(g.d.item_date) : "") + ").";
      } else {
        line.textContent = "Quality Supervisor: no gated verdicts recorded yet.";
      }
    }
  }

  // ---- Worker pages ----
  function renderWorker(w) {
    var p = w.prefix;
    var meta = W.workers[w.slug];
    var st = W.status[w.slug];

    var statusBox = $(p + "-status");
    if (statusBox) {
      var finding = st && st.finding_line
        ? '<p class="w-finding">' + esc(st.finding_line) + "</p>"
        : '<p class="muted">No finding logged yet. Findings land here from the daily scan.</p>';
      statusBox.innerHTML =
        '<p class="status-line"><span class="w-dot ' + dotClass(st) + '"></span><span>' + esc(scanLine(st)) + "</span></p>" + finding;
    }

    var latestBox = $(p + "-latest");
    if (latestBox) {
      var ds = W.deliverables[w.slug] || [];
      if (ds.length) {
        var d = ds[0];
        latestBox.innerHTML =
          '<p class="best-text">' + esc(d.title) + "</p>" +
          '<p class="best-meta">' + (d.item_date ? fmtDay(d.item_date) : "") + verdictChip(d.verdict) + "</p>" +
          (d.verdict ? "" : '<p class="fineprint">No Supervisor verdict on this one. Verdicts appear here when a deliverable is gated.</p>');
      } else {
        latestBox.innerHTML = '<p class="muted">No deliverables logged yet.</p>';
      }
    }

    var repoBox = $(p + "-repo");
    if (repoBox) {
      if (meta && meta.repo_url) {
        repoBox.innerHTML =
          '<p class="muted">This worker\'s rules, research and learnings live in its own GitHub repo, so it can be reinstalled anywhere.</p>' +
          '<div class="w-apps"><a class="btn btn-small" href="' + esc(meta.repo_url) + '" target="_blank" rel="noopener">Open the worker repo</a></div>';
      } else {
        repoBox.innerHTML = '<p class="muted">This worker\'s GitHub repo is being created. The link lands here the day it exists.</p>';
      }
    }

    var researchBox = $(p + "-research");
    if (researchBox) {
      if (st && st.finding_line) {
        var logLink = meta && meta.repo_url
          ? '<div class="w-apps"><a class="btn btn-small" href="' + esc(meta.repo_url) + '/blob/main/RESEARCH-LOG.md" target="_blank" rel="noopener">Read the full research log</a></div>'
          : "";
        researchBox.innerHTML =
          '<p class="w-finding">' + esc(st.finding_line) + "</p>" +
          '<p class="fineprint">' + esc(scanLine(st)) + " One sourced finding a day from the worker's beat scan; no source, no finding.</p>" + logLink;
      } else {
        researchBox.innerHTML = '<p class="muted">No research finding logged yet. The daily scan writes one sourced finding here.</p>';
      }
    }

    var expBox = $(p + "-experiments");
    if (expBox) {
      var exps = W.experiments[w.slug] || [];
      if (exps.length) {
        expBox.innerHTML = exps.map(function (e) {
          return '<div class="card"><h2>' + esc(e.title) + "</h2>" +
            (e.hypothesis ? '<p class="w-kv"><strong>Hypothesis:</strong> ' + esc(e.hypothesis) + "</p>" : "") +
            (e.metric ? '<p class="w-kv"><strong>Judged on:</strong> ' + esc(e.metric) + "</p>" : "") +
            '<p class="w-kv"><strong>Check date:</strong> ' + (e.check_date ? fmtDay(e.check_date) : "not set") + verdictChip(e.verdict) + "</p></div>";
        }).join("");
      } else {
        expBox.innerHTML = '<div class="card"><p class="muted">No live experiments right now. Changes from research run as experiments: a hypothesis, a metric, a check date, then a verdict.</p></div>';
      }
    }

    var weekBox = $(p + "-week");
    if (weekBox) {
      var rs = W.rollups[w.slug] || [];
      if (rs.length) {
        var r = rs[0];
        function row(label, val) {
          return val ? '<p class="w-kv"><strong>' + label + ":</strong> " + esc(val) + "</p>" : "";
        }
        weekBox.innerHTML =
          '<p class="muted">Week of ' + fmtDay(r.week) + "</p>" +
          row("Numbers", r.numbers) + row("Learning", r.learning) + row("Experiment", r.experiment) + row("Ask", r.ask);
      } else {
        weekBox.innerHTML = '<p class="muted">No roll-up logged yet. Each worker sends HQ a four-line roll-up on Wednesdays: numbers, one learning, one experiment, one ask.</p>';
      }
    }

    if (w.key === "content") renderCampaign();
  }

  async function renderCampaign() {
    var box = $("wc-campaign");
    if (!box) return;
    if (!W.freebies.length) {
      box.innerHTML = '<p class="muted">No freebie campaign announced yet.</p>';
      return;
    }
    var today = brisDateStr(new Date());
    var upcoming = W.freebies.filter(function (f) { return f.goes_live_on && f.goes_live_on >= today; });
    var cur = upcoming.length ? upcoming[0] : W.freebies[W.freebies.length - 1];
    var state;
    if (cur.goes_live_on > today) state = "Goes live " + fmtDay(cur.goes_live_on) + ".";
    else if (cur.goes_live_on === today) state = "Goes live today.";
    else state = "Live since " + fmtDay(cur.goes_live_on) + ".";
    var counts = "";
    try {
      var reqs = await sb("li_freebie_requests?select=sent&freebie_name=eq." + encodeURIComponent(cur.name));
      if (Array.isArray(reqs)) {
        var waiting = reqs.filter(function (r) { return !r.sent; }).length;
        counts = "<br>" + reqs.length + " " + (reqs.length === 1 ? "request" : "requests") + " so far" + (waiting ? ", " + waiting + " waiting" : "") + ".";
      }
    } catch (e) { /* counts are a bonus; the campaign line stands without them */ }
    box.innerHTML =
      '<p class="best-text"><strong>' + esc(cur.name) + "</strong></p>" +
      '<p class="muted">Keyword: <strong>' + esc(cur.keyword || "-") + "</strong><br>" + state + counts + "</p>";
  }

  // ---- Sub-view switching (own namespace; app.js handlers untouched) ----
  function switchWSub(key, name) {
    document.querySelectorAll(".wsub-panel").forEach(function (panel) {
      var on = panel.id === "wsub-" + key + "-" + name;
      panel.hidden = !on;
      panel.classList.toggle("active", on);
    });
    document.querySelectorAll("[data-wsub]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.wsub === key + ":" + name);
    });
  }

  function openWorker(key, name) {
    switchView("worker-" + key);
    switchWSub(key, name || "overview");
    if (Date.now() - lastLoad > 30000) wLoad();
  }

  function syncSubs(view) {
    var c = $("worker-content-subs");
    var o = $("worker-outreach-subs");
    if (c) c.hidden = view !== "worker-content";
    if (o) o.hidden = view !== "worker-outreach";
  }

  function initWorkers() {
    document.querySelectorAll("[data-wsub]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.dataset.wsub.split(":");
        openWorker(parts[0], parts[1]);
      });
    });
    document.querySelectorAll(".side-item").forEach(function (t) {
      t.addEventListener("click", function () { syncSubs(t.dataset.view); });
    });
    var strip = $("workers-strip");
    if (strip) {
      strip.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-open-worker]");
        if (btn) openWorker(btn.dataset.openWorker, "overview");
      });
    }
    wLoad();
  }

  document.addEventListener("DOMContentLoaded", initWorkers);
})();
