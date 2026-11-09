/* Finance Second Brain: local-first, no dependencies.
   All data lives in this browser (localStorage). Use Settings > Export to back up. */
(function () {
  "use strict";

  const KEY = "fsb.v1";
  const EXPENSE_CATS = ["Housing", "Food", "Transport", "Health", "Family", "Travel", "Lifestyle", "Subscriptions", "Taxes", "Giving", "Other"];
  const INCOME_CATS = ["Salary", "Advisory fees", "Dividends", "Interest", "Rental", "Exit / carry", "Other income"];
  const ACCOUNT_TYPES = ["Cash", "Investment", "Retirement", "Private / Angel", "Real estate", "Crypto", "Debt"];
  const NOTE_TYPES = ["Principle", "Decision", "Lesson", "Idea", "Monthly review"];
  const LENSES = [
    ["contrarian", "Contrarian", "What will fail? What am I not seeing?"],
    ["first", "First principles", "Strip it down. What must be true?"],
    ["expansion", "Expansionist", "Where is the upside if this works?"],
    ["outsider", "Outsider", "How would someone outside finance see this?"],
    ["executor", "Executor", "What is the Monday morning next step?"],
  ];

  // ---------- state ----------
  const blank = () => ({
    settings: { currency: "MXN", emergencyMonths: 6 },
    transactions: [], accounts: [], goals: [], notes: [], snapshots: [],
    income: incomeSeed(), v: 2,
  });

  // Your income structure. Streams and destinations are editable in the app.
  function incomeSeed() {
    const groups = [
      ["Interests", true, ["FinH", "Aplazo", "Podemos Progresar"]],
      ["Cash cows", true, ["Exitus & Exitus Optiserv", "Calidris", "TEU", "Altavista", "Luel", "Human", "Alakart", "JNS"]],
      ["Dividends", true, ["FinH", "Podemos", "Bitline"]],
      ["Deal building", false, ["Maslow", "Proyecto Pásalo", "Disel"]],
    ];
    const streams = []; let n = 0;
    groups.forEach(([group, recurring, names]) => names.forEach((name) => streams.push({ id: "st" + ++n, name, group, recurring, status: "Live" })));
    const destinations = [
      ["d1", "Salary · BBVA", ""], ["d2", "TRF · daily expenses", ""], ["d3", "Fácil card · online shopping", ""],
      ["d4", "Cash", ""], ["d5", "Regina · TRF", "Regina"], ["d6", "Regina · Cash", "Regina"], ["d7", "PR", ""],
    ].map(([id, name, parent]) => ({ id, name, parent }));
    return { goal: 5500000, goalDate: "", streams, destinations, entries: {}, allocations: {} };
  }
  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const st = Object.assign(blank(), JSON.parse(raw));
        if (!st.v) { st.v = 2; if (st.isSample) { st.regenSample = true; } }
        return st;
      }
    } catch (e) { /* storage unavailable */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    if (typeof cloudPush === "function") cloudPush();
  }
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, compact) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency", currency: S.settings.currency,
        maximumFractionDigits: compact || Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2,
        ...(compact ? { notation: "compact", maximumSignificantDigits: 3 } : {}),
      }).format(n || 0);
    } catch (e) { return (n || 0).toFixed(0); }
  };
  const pct = (n) => (isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
  const ym = (d) => String(d).slice(0, 7);
  const today = () => new Date().toISOString().slice(0, 10);
  const monthLabel = (k) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  };
  function lastMonths(n) {
    const out = []; const d = new Date(); d.setDate(1);
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"));
    }
    return out;
  }
  const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);

  // ---------- metrics ----------
  function monthFlows(key) {
    const tx = S.transactions.filter((t) => ym(t.date) === key);
    // The Income module is the source of truth for any month it has entries for.
    const inc = incomeTotal(key);
    const income = inc.has ? inc.total : sum(tx.filter((t) => t.kind === "income"), (t) => +t.amount);
    const expense = sum(tx.filter((t) => t.kind === "expense"), (t) => +t.amount);
    return { income, expense, net: income - expense };
  }
  function netWorth() {
    return sum(S.accounts, (a) => (a.type === "Debt" ? -1 : 1) * +a.value);
  }
  function liquid() {
    return sum(S.accounts.filter((a) => a.type === "Cash"), (a) => +a.value);
  }
  function avgExpense(n = 3) {
    const ks = lastMonths(n + 1).slice(0, n); // completed months
    const vals = ks.map((k) => monthFlows(k).expense).filter((v) => v > 0);
    return vals.length ? sum(vals) / vals.length : monthFlows(lastMonths(1)[0]).expense;
  }
  function goalProgress(g) {
    const linked = g.accountId ? S.accounts.find((a) => a.id === g.accountId) : null;
    const current = linked ? +linked.value : +g.current || 0;
    const target = +g.target || 0;
    const monthsLeft = g.deadline ? Math.max(0, monthsBetween(today(), g.deadline)) : null;
    const remaining = Math.max(0, target - current);
    const needed = monthsLeft ? remaining / monthsLeft : remaining;
    const onTrack = !g.deadline || remaining === 0 || (+g.monthly || 0) >= needed;
    return { current, target, ratio: target ? Math.min(1, current / target) : 0, monthsLeft, needed, onTrack, remaining };
  }
  function monthsBetween(a, b) {
    const A = new Date(a), B = new Date(b);
    return (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
  }

  // ---------- tooltip ----------
  const tip = $("#tip");
  function bindTips(root) {
    root.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        tip.innerHTML = el.getAttribute("data-tip");
        tip.hidden = false;
        const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + "px"; tip.style.top = e.clientY + 14 + "px";
      });
      el.addEventListener("mouseleave", () => (tip.hidden = true));
    });
  }

  // ---------- charts (hand-built SVG) ----------
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].map((m) => m * p).find((m) => m >= v);
  }
  function roundedTopBar(x, y, w, h, r) {
    if (h <= 0) return "";
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function cashflowChart(months) {
    const data = months.map((k) => ({ k, ...monthFlows(k) }));
    const W = 720, H = 240, L = 52, B = 26, T = 8;
    const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
    const plotH = H - B - T, plotW = W - L;
    const step = plotW / data.length, bw = Math.min(18, (step - 10) / 2);
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = T + plotH - (v / max) * plotH;
      g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--${i ? "grid" : "axis"})" stroke-width="1"/>`;
      g += `<text x="${L - 8}" y="${y + 4}" text-anchor="end">${esc(money(v, true))}</text>`;
    }
    data.forEach((d, i) => {
      const cx = L + step * i + step / 2;
      const hi = (d.income / max) * plotH, he = (d.expense / max) * plotH;
      g += `<path d="${roundedTopBar(cx - bw - 1, T + plotH - hi, bw, hi, 4)}" fill="var(--s1)"/>`;
      g += `<path d="${roundedTopBar(cx + 1, T + plotH - he, bw, he, 4)}" fill="var(--s2)"/>`;
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(monthLabel(d.k))}</text>`;
      const rate = d.income ? (d.net / d.income) : NaN;
      g += `<rect x="${cx - step / 2}" y="${T}" width="${step}" height="${plotH}" fill="transparent"
        data-tip="<b>${esc(monthLabel(d.k))}</b><br>Income ${esc(money(d.income))}<br>Spending ${esc(money(d.expense))}<br>Net ${esc(money(d.net))} · saved ${pct(rate)}"/>`;
    });
    return `<div class="legend"><span><i style="background:var(--s1)"></i>Income</span><span><i style="background:var(--s2)"></i>Spending</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income and spending">${g}</svg>`;
  }
  function lineChart(points, label) {
    if (points.length < 2) return `<p class="empty">Net worth history appears after two monthly snapshots. Take one in Investments &amp; Accounts.</p>`;
    const W = 720, H = 200, L = 52, B = 26, T = 10;
    const vals = points.map((p) => p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad;
    const x = (i) => L + ((W - L - 10) * i) / (points.length - 1);
    const y = (v) => T + (H - B - T) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (let i = 0; i <= 3; i++) {
      const v = lo + ((hi - lo) / 3) * i;
      g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(money(v, true))}</text>`;
    }
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join("");
    g += `<path d="${d}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
    points.forEach((p, i) => {
      if (i === 0 || i === points.length - 1 || points.length <= 8) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
      g += `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/>`;
      g += `<circle cx="${x(i)}" cy="${y(p.v)}" r="14" fill="transparent" data-tip="<b>${esc(p.label)}</b><br>${esc(money(p.v))}"/>`;
    });
    const last = points[points.length - 1];
    g += `<text x="${x(points.length - 1) - 6}" y="${y(last.v) - 10}" text-anchor="end" style="fill:var(--ink);font-weight:600">${esc(money(last.v, true))}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
  }
  function barList(rows, total) {
    if (!rows.length) return `<p class="empty">Nothing here yet.</p>`;
    const max = Math.max(...rows.map((r) => r.v));
    return `<div class="bars">${rows.map((r) => `
      <div class="bar-row" data-tip="<b>${esc(r.k)}</b><br>${esc(money(r.v))}${total ? " · " + pct(r.v / total) : ""}">
        <span class="name">${esc(r.k)}</span>
        <div class="track"><div class="fill" style="width:${(r.v / max) * 100}%${r.c ? ";background:" + r.c : ""}"></div></div>
        <span class="amt">${total ? (r.v / total < 0.001 ? "<0.1%" : pct(r.v / total)) : esc(money(r.v, true))}</span>
      </div>`).join("")}</div>`;
  }

  // ---------- insights (the "advisor" layer) ----------
  function insights() {
    const out = [];
    const cur = lastMonths(1)[0];
    const prev = lastMonths(2)[0];
    const f = monthFlows(cur), p = monthFlows(prev);
    const burn = avgExpense();
    const runway = burn ? liquid() / burn : Infinity;
    const target = S.settings.emergencyMonths || 6;
    if (S.accounts.length && burn) {
      if (runway < target) out.push(["warn", `Cash covers ${runway.toFixed(1)} months of spending. Your floor is ${target}. Close the gap of ${money(burn * target - liquid())} before adding risk.`]);
      else if (runway > target * 2) out.push(["", `You hold ${runway.toFixed(1)} months of cash, more than twice your ${target}-month floor. About ${money(liquid() - burn * target * 1.5)} could be put to work.`]);
    }
    if (p.income && f.income) {
      const r1 = f.net / f.income, r0 = p.net / p.income;
      if (r1 < r0 - 0.05) out.push(["warn", `Savings rate fell from ${pct(r0)} to ${pct(r1)} this month.`]);
    }
    // category spike vs 3-month average
    const ks = lastMonths(4).slice(0, 3);
    EXPENSE_CATS.forEach((c) => {
      const now = sum(S.transactions.filter((t) => t.kind === "expense" && t.category === c && ym(t.date) === cur), (t) => +t.amount);
      const avg = sum(S.transactions.filter((t) => t.kind === "expense" && t.category === c && ks.includes(ym(t.date))), (t) => +t.amount) / 3;
      if (avg > 0 && now > avg * 1.4 && now - avg > 200) out.push(["warn", `${c} is running ${pct(now / avg - 1)} above its 3-month average (${money(now)} vs ${money(avg)}).`]);
    });
    // concentration
    const inv = S.accounts.filter((a) => !["Debt", "Cash", "Real estate"].includes(a.type));
    const invTotal = sum(inv, (a) => +a.value);
    inv.forEach((a) => { if (invTotal && a.value / invTotal > 0.4 && inv.length > 1) out.push(["warn", `${a.name} is ${pct(a.value / invTotal)} of invested assets. Is that concentration a decision or an accident?`]); });
    S.goals.forEach((g) => { const gp = goalProgress(g); if (!gp.onTrack) out.push(["warn", `${g.name} needs ${money(gp.needed)}/month to hit its deadline. You plan ${money(+g.monthly || 0)}.`]); });
    const lastReview = S.notes.filter((n) => n.type === "Monthly review").sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!lastReview || monthsBetween(lastReview.date, today()) >= 1) out.push(["", `No monthly review logged for ${monthLabel(prev)} yet. Second Brain has a template that pre-fills your numbers.`]);
    return out;
  }

  // ---------- views ----------
  const views = {};

  views.dashboard = () => {
    const months = lastMonths(12);
    const cur = monthFlows(months[11]);
    const ytdKeys = months.filter((k) => k.startsWith(String(new Date().getFullYear())));
    const ytd = ytdKeys.reduce((a, k) => { const f = monthFlows(k); a.i += f.income; a.e += f.expense; return a; }, { i: 0, e: 0 });
    const burn = avgExpense();
    const runway = burn ? liquid() / burn : 0;
    const nw = netWorth();
    const snaps = [...S.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const prevSnap = snaps.filter((s) => ym(s.date) < months[11]).pop();
    const nwDelta = prevSnap ? nw - prevSnap.value : null;

    const cats = {};
    S.transactions.filter((t) => t.kind === "expense" && ym(t.date) >= months[9]).forEach((t) => (cats[t.category] = (cats[t.category] || 0) + +t.amount));
    const catRows = Object.entries(cats).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    const alloc = {};
    S.accounts.filter((a) => a.type !== "Debt").forEach((a) => (alloc[a.type] = (alloc[a.type] || 0) + +a.value));
    const allocRows = Object.entries(alloc).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);

    const tiles = [
      ["Net worth", money(nw), nwDelta == null ? "Assets minus debt" : `${nwDelta >= 0 ? "+" : ""}${money(nwDelta)} vs last snapshot`, nwDelta == null ? "" : nwDelta >= 0 ? "pos" : "neg"],
      ["This month net", money(cur.net), `${money(cur.income)} in · ${money(cur.expense)} out`, cur.net >= 0 ? "pos" : "neg"],
      ["Savings rate YTD", pct(ytd.i ? (ytd.i - ytd.e) / ytd.i : NaN), `${money(ytd.i - ytd.e)} kept of ${money(ytd.i)}`, ""],
      ["Cash runway", burn ? runway.toFixed(1) + " mo" : "–", `Avg burn ${money(burn)}/mo`, runway && runway < S.settings.emergencyMonths ? "neg" : ""],
    ];
    const hasTx = S.transactions.length > 0, hasAcc = S.accounts.length > 0, hasGoals = S.goals.length > 0;
    const ins = hasTx || hasAcc || hasGoals ? insights() : [];

    // Income first: the headline is the last full month, the current month shows as "so far".
    const I = S.income, goal = +I.goal || 0, curK = months[11];
    const fullK = [...months].reverse().find((k) => k < curK && incomeTotal(k).has) || months[10];
    const full = incomeTotal(fullK), now = incomeTotal(curK), prevFull = incomeTotal(shiftMonth(fullK, -1));
    const ratio = goal ? Math.min(1, full.total / goal) : 0;
    const chg = prevFull.total ? full.total / prevFull.total - 1 : NaN;
    const groupRows = GROUPS.map((g) => ({ k: g, v: full.groups[g] || 0, c: GROUP_COLOR[g] })).filter((r) => r.v > 0);
    const streamRows = I.streams.map((st) => ({ k: st.name + (I.streams.filter((x) => x.name === st.name).length > 1 ? ` (${st.group})` : ""), v: streamVal(fullK, st.id), c: GROUP_COLOR[st.group] }))
      .filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
    const hero = `
      <div class="card span-12 hero">
        <div class="hero-top">
          <div><div class="label">Monthly income · ${esc(monthLabel(fullK))}</div>
            <div class="hero-value">${esc(money(full.total))}</div>
            <div class="hint">${isFinite(chg) ? `<span class="${chg >= 0 ? "pos" : "neg"}">${chg >= 0 ? "+" : ""}${pct(chg)}</span> vs ${esc(monthLabel(shiftMonth(fullK, -1)))} · ` : ""}Goal ${esc(money(goal))}/mo</div></div>
          <div class="hero-side"><div class="label">${esc(monthLabel(curK))} so far</div><div class="side-value">${esc(money(now.total))}</div>
            <a href="#income" class="hint">Update income ›</a></div>
        </div>
        <div class="hero-bar" data-tip="${esc(money(full.total))} of ${esc(money(goal))}"><div style="width:${ratio * 100}%"></div><span style="${ratio > 0.25 ? "" : `left:calc(${ratio * 100}% + 8px);color:var(--ink)`}">${pct(goal ? full.total / goal : NaN)} of goal</span></div>
        <div class="hint">Gap to goal: ${esc(money(Math.max(0, goal - full.total)))}</div>
      </div>`;
    return `
      <h1>Dashboard</h1>
      <p class="sub">Income against your MXN 5.5M monthly goal. More sections appear here as you fill in the other tabs.</p>
      <div class="grid">
        ${hero}
        <div class="card span-12"><h2>Income by month</h2>${incomeChart(curK)}</div>
        <div class="card span-6"><h2>By group · ${esc(monthLabel(fullK))}</h2>${barList(groupRows, full.total)}</div>
        <div class="card span-6"><h2>Top streams · ${esc(monthLabel(fullK))}</h2>${barList(streamRows, full.total)}</div>
        ${hasTx || hasAcc ? tiles.map(([l, v, h, c]) => `<div class="card tile span-3"><div class="label">${l}</div><div class="value">${v}</div><div class="hint ${c}">${h}</div></div>`).join("") : ""}
        ${hasTx ? `<div class="card span-8"><h2>Cash flow, last 12 months</h2>${cashflowChart(months)}</div>` : ""}
        ${ins.length ? `<div class="card span-4"><h2>Needs attention</h2>${ins.map(([c, t]) => `<div class="insight ${c}">${esc(t)}</div>`).join("")}</div>` : ""}
        ${snaps.length ? `<div class="card span-8"><h2>Net worth over time</h2>${lineChart(snaps.map((s) => ({ v: s.value, label: monthLabel(ym(s.date)) })), "Net worth over time")}</div>` : ""}
        ${hasGoals ? `<div class="card span-4"><h2>Goals</h2>${goalsList(true)}</div>` : ""}
        ${catRows.length ? `<div class="card span-6"><h2>Spending by category, last 3 months</h2>${barList(catRows, sum(catRows, (r) => r.v))}</div>` : ""}
        ${allocRows.length ? `<div class="card span-6"><h2>Asset allocation</h2>${barList(allocRows, sum(allocRows, (r) => r.v))}</div>` : ""}
      </div>`;
  };

  let flowMonth = "all";
  views.flows = () => {
    const months = [...new Set(S.transactions.map((t) => ym(t.date)))].sort().reverse();
    const list = S.transactions.filter((t) => flowMonth === "all" || ym(t.date) === flowMonth).sort((a, b) => b.date.localeCompare(a.date));
    const inc = sum(list.filter((t) => t.kind === "income"), (t) => +t.amount);
    const exp = sum(list.filter((t) => t.kind === "expense"), (t) => +t.amount);
    return `
      <h1>Transactions</h1>
      <p class="sub">Log what comes in and what goes out. Import a bank CSV to save time.</p>
      <div class="card">
        <form class="row" id="txForm">
          <label class="f">Type<select name="kind" id="kindSel"><option value="expense">Spending</option><option value="income">Income</option></select></label>
          <label class="f">Date<input type="date" name="date" value="${today()}" required></label>
          <label class="f">Description<input name="desc" placeholder="e.g. Rent" required></label>
          <label class="f">Category<select name="category" id="catSel">${EXPENSE_CATS.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label class="f">Amount<input type="number" step="0.01" min="0" name="amount" required></label>
          <label class="f">Recurring<select name="recurring"><option value="">No</option><option value="monthly">Monthly</option></select></label>
          <button class="primary">Add</button>
        </form>
        <details><summary>Import CSV (date, description, amount, category)</summary>
          <p class="sub">Negative amounts are spending, positive are income. Header row optional.</p>
          <input type="file" id="csvIn" accept=".csv,text/csv">
        </details>
        <div class="chips">
          <button class="chip ${flowMonth === "all" ? "on" : ""}" data-m="all">All</button>
          ${months.slice(0, 12).map((m) => `<button class="chip ${flowMonth === m ? "on" : ""}" data-m="${m}">${monthLabel(m)}</button>`).join("")}
        </div>
        <p class="sub">In ${money(inc)} · Out ${money(exp)} · Net <span class="${inc - exp >= 0 ? "pos" : "neg"}">${money(inc - exp)}</span></p>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${list.map((t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.desc)}${t.recurring ? ' <span class="tag">monthly</span>' : ""}</td><td>${esc(t.category)}</td>
            <td class="num ${t.kind === "income" ? "pos" : ""}">${t.kind === "income" ? "+" : "−"}${esc(money(+t.amount))}</td>
            <td><button class="link" data-del-tx="${t.id}" aria-label="Delete">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No transactions yet.</td></tr>`}</tbody>
        </table></div>
      </div>`;
  };

  views.wealth = () => {
    const assets = S.accounts.filter((a) => a.type !== "Debt");
    const debts = S.accounts.filter((a) => a.type === "Debt");
    const row = (a) => {
      const gain = a.cost ? +a.value - +a.cost : null;
      return `<tr><td>${esc(a.name)}${a.note ? `<div class="hint" style="color:var(--muted);font-size:12px">${esc(a.note)}</div>` : ""}</td><td>${esc(a.type)}</td>
        <td class="num">${esc(money(+a.value))}</td>
        <td class="num">${a.cost ? esc(money(+a.cost)) : "–"}</td>
        <td class="num ${gain == null ? "" : gain >= 0 ? "pos" : "neg"}">${gain == null ? "–" : `${gain >= 0 ? "+" : ""}${esc(money(gain))} (${pct(gain / +a.cost)})`}</td>
        <td><button class="link" data-edit-acc="${a.id}">Update</button><button class="link" data-del-acc="${a.id}" aria-label="Delete">✕</button></td></tr>`;
    };
    const invested = S.accounts.filter((a) => a.cost);
    const totCost = sum(invested, (a) => +a.cost), totVal = sum(invested, (a) => +a.value);
    return `
      <h1>Investments &amp; Accounts</h1>
      <p class="sub">Every account, holding and debt. Update values monthly, then take a snapshot to build your net worth history.</p>
      <div class="grid">
        <div class="card tile span-4"><div class="label">Net worth</div><div class="value">${money(netWorth())}</div></div>
        <div class="card tile span-4"><div class="label">Invested (with cost basis)</div><div class="value">${money(totVal)}</div><div class="hint ${totVal - totCost >= 0 ? "pos" : "neg"}">${totCost ? `${money(totVal - totCost)} unrealized · ${pct((totVal - totCost) / totCost)}` : "Add cost basis to track returns"}</div></div>
        <div class="card tile span-4"><div class="label">Debt</div><div class="value">${money(sum(debts, (a) => +a.value))}</div><div class="hint"><button id="snapBtn">Take net worth snapshot</button></div></div>
        <div class="card span-12">
          <form class="row" id="accForm">
            <input type="hidden" name="id">
            <label class="f">Name<input name="name" placeholder="e.g. Brokerage, Startup X SAFE" required></label>
            <label class="f">Type<select name="type">${ACCOUNT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></label>
            <label class="f">Current value<input type="number" step="0.01" name="value" required></label>
            <label class="f">Cost basis (optional)<input type="number" step="0.01" name="cost"></label>
            <label class="f">Note<input name="note" placeholder="thesis, terms, maturity…"></label>
            <button class="primary">Save</button>
          </form>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th>Type</th><th class="num">Value</th><th class="num">Cost</th><th class="num">Gain</th><th></th></tr></thead>
            <tbody>${assets.map(row).join("")}${debts.map(row).join("") || ""}${S.accounts.length ? "" : `<tr><td colspan="6" class="empty">Add your first account.</td></tr>`}</tbody>
          </table></div>
        </div>
        <div class="card span-12"><h2>Snapshots</h2>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Net worth</th><th></th></tr></thead>
          <tbody>${[...S.snapshots].sort((a, b) => b.date.localeCompare(a.date)).map((s) => `<tr><td>${esc(s.date)}</td><td class="num">${esc(money(s.value))}</td><td><button class="link" data-del-snap="${s.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty">No snapshots yet.</td></tr>`}</tbody></table></div>
        </div>
      </div>`;
  };

  function goalsList(compact) {
    if (!S.goals.length) return `<p class="empty">No goals yet. Money without a target drifts.</p>`;
    return S.goals.map((g) => {
      const p = goalProgress(g);
      return `<div class="goal">
        <div class="top-line"><span>${esc(g.name)}</span><span class="status ${p.onTrack ? "ok" : "behind"}">${p.remaining === 0 ? "✓ Done" : p.onTrack ? "✓ On track" : "▲ Behind"}</span></div>
        <div class="bars"><div class="track" style="margin-top:6px" data-tip="${esc(money(p.current))} of ${esc(money(p.target))}"><div class="fill" style="width:${p.ratio * 100}%"></div></div></div>
        <div class="meta">${money(p.current)} of ${money(p.target)} · ${pct(p.ratio)}${g.deadline ? ` · by ${esc(g.deadline)}` : ""}${!compact && g.deadline && p.remaining ? ` · needs ${money(p.needed)}/mo, planned ${money(+g.monthly || 0)}/mo` : ""}</div>
        ${compact ? "" : `${g.why ? `<div class="meta">Why: ${esc(g.why)}</div>` : ""}<button class="link" data-edit-goal="${g.id}">Edit</button><button class="link" data-del-goal="${g.id}">Delete</button>`}
      </div>`;
    }).join("");
  }

  views.goals = () => `
    <h1>Goals</h1>
    <p class="sub">Each goal gets a number, a date and a reason. Link it to an account and progress updates itself.</p>
    <div class="grid">
      <div class="card span-6">
        <form id="goalForm">
          <input type="hidden" name="id">
          <div class="form row">
            <label class="f">Goal<input name="name" placeholder="e.g. Freedom fund" required></label>
            <label class="f">Target<input type="number" name="target" required></label>
            <label class="f">Deadline<input type="date" name="deadline"></label>
          </div>
          <div class="row form" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">
            <label class="f">Linked account<select name="accountId"><option value="">None (enter manually)</option>${S.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label>
            <label class="f">Current (if not linked)<input type="number" name="current"></label>
            <label class="f">Planned per month<input type="number" name="monthly"></label>
          </div>
          <label class="f">Why it matters<textarea name="why" placeholder="What changes in your life when this is done?"></textarea></label>
          <p><button class="primary">Save goal</button></p>
        </form>
      </div>
      <div class="card span-6"><h2>Progress</h2>${goalsList(false)}</div>
    </div>`;

  let brainFilter = "All", brainQuery = "";
  views.brain = () => {
    const q = brainQuery.toLowerCase();
    const notes = S.notes
      .filter((n) => brainFilter === "All" || n.type === brainFilter)
      .filter((n) => !q || JSON.stringify(n).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
    return `
      <h1>Second Brain</h1>
      <p class="sub">Principles you invest by, decisions you made and why, lessons you paid for. Searchable, so future you can learn from past you.</p>
      <div class="grid">
        <div class="card span-6">
          <form id="noteForm">
            <input type="hidden" name="id">
            <div class="row" style="display:flex;flex-wrap:wrap;gap:8px">
              <label class="f">Type<select name="type" id="noteType">${NOTE_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></label>
              <label class="f" style="flex:1">Title<input name="title" required></label>
              <label class="f">Date<input type="date" name="date" value="${today()}"></label>
            </div>
            <label class="f" style="margin-top:8px">Notes<textarea name="body" id="noteBody"></textarea></label>
            <div id="lensFields" hidden>
              <p class="sub" style="margin:10px 0 4px">Run it past your advisory council before you commit.</p>
              ${LENSES.map(([k, n, h]) => `<label class="f" style="margin-top:6px">${n}<textarea name="lens_${k}" placeholder="${h}" style="min-height:50px"></textarea></label>`).join("")}
              <div class="row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                <label class="f">Amount at stake<input type="number" name="stake"></label>
                <label class="f">Review on<input type="date" name="reviewOn"></label>
                <label class="f">Confidence<select name="confidence"><option></option><option>Low</option><option>Medium</option><option>High</option></select></label>
              </div>
            </div>
            <label class="f" style="margin-top:8px">Tags (comma separated)<input name="tags" placeholder="angel, tax, family"></label>
            <p style="display:flex;gap:8px"><button class="primary">Save</button><button type="button" id="reviewTpl">Start monthly review</button></p>
          </form>
        </div>
        <div class="card span-6">
          <input id="brainSearch" placeholder="Search notes, tags, decisions…" value="${esc(brainQuery)}" style="width:100%;margin-bottom:10px">
          <div class="chips">${["All", ...NOTE_TYPES].map((t) => `<button class="chip ${brainFilter === t ? "on" : ""}" data-nt="${t}">${t}</button>`).join("")}</div>
          ${notes.map(noteHtml).join("") || `<p class="empty">Nothing yet. Start with three principles you would never break.</p>`}
        </div>
      </div>`;
  };
  function noteHtml(n) {
    const due = n.reviewOn && n.reviewOn <= today();
    const lens = LENSES.filter(([k]) => n["lens_" + k]);
    return `<div class="note">
      <div class="when">${esc(n.type)} · ${esc(n.date)}${n.stake ? ` · ${esc(money(+n.stake))} at stake` : ""}${n.confidence ? ` · ${esc(n.confidence)} confidence` : ""}${due ? ` · <b class="neg">review due</b>` : n.reviewOn ? ` · review ${esc(n.reviewOn)}` : ""}</div>
      <h3>${esc(n.title)}</h3>
      ${n.body ? `<div class="body">${esc(n.body)}</div>` : ""}
      ${lens.length ? `<div class="lens">${lens.map(([k, nm]) => `<div><b>${nm}</b>${esc(n["lens_" + k])}</div>`).join("")}</div>` : ""}
      <div style="margin-top:6px">${(n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
        <button class="link" data-edit-note="${n.id}">Edit</button><button class="link" data-del-note="${n.id}">Delete</button></div>
    </div>`;
  }
  function reviewTemplate() {
    const k = lastMonths(2)[0];
    const f = monthFlows(k);
    const cats = {};
    S.transactions.filter((t) => t.kind === "expense" && ym(t.date) === k).forEach((t) => (cats[t.category] = (cats[t.category] || 0) + +t.amount));
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${money(v)}`).join(", ");
    return {
      title: `Monthly review: ${monthLabel(k)}`,
      body: `NUMBERS
Income ${money(f.income)} · Spending ${money(f.expense)} · Net ${money(f.net)} · Savings rate ${pct(f.income ? f.net / f.income : NaN)}
Net worth ${money(netWorth())}
Top spend: ${top || "–"}

WHAT WENT WELL


WHAT SURPRISED ME (good or bad)


SPENDING I REGRET / SPENDING THAT WAS WORTH EVERY CENT


GOALS: on track? what changes?
${S.goals.map((g) => { const p = goalProgress(g); return `- ${g.name}: ${pct(p.ratio)} ${p.onTrack ? "on track" : "BEHIND"}`; }).join("\n")}

ONE DECISION FOR NEXT MONTH
`,
    };
  }

  views.settings = () => `
    <h1>Settings</h1>
    <p class="sub">Your data stays in this browser. Nothing is sent anywhere. Export regularly as a backup.</p>
    <div class="grid">
      <div class="card span-6"><h2>Preferences</h2>
        <form class="row" id="setForm">
          <label class="f">Currency<select name="currency">${["USD", "EUR", "CHF", "GBP", "BRL", "CAD", "AUD", "JPY", "MXN"].map((c) => `<option ${S.settings.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          <label class="f">Emergency fund (months)<input type="number" name="emergencyMonths" value="${S.settings.emergencyMonths}"></label>
          <label class="f">Theme<select name="theme"><option value="">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <button class="primary">Save</button>
        </form>
      </div>
      <div class="card span-6"><h2>Data</h2>
        <p style="display:flex;flex-wrap:wrap;gap:8px">
          <button id="exportBtn">Export JSON backup</button>
          <label class="chip" style="cursor:pointer">Import JSON<input type="file" id="importIn" accept=".json" hidden></label>
          <button id="sampleBtn">Load sample data</button>
          <button id="clearBtn">Erase everything</button>
        </p>
      </div>
    </div>`;

  // ---------- income module ----------
  const GROUPS = ["Interests", "Cash cows", "Dividends", "Deal building"];
  const GROUP_COLOR = { "Interests": "var(--s1)", "Cash cows": "var(--s2)", "Dividends": "var(--s3)", "Deal building": "var(--s4)" };
  const STATUSES = ["Live", "Building", "Idea", "Paused"];
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; };
  const fmtInput = (n) => (n ? (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");
  let incMonth = lastMonths(1)[0];
  let proposals = null; // photo-read results awaiting confirmation

  function shiftMonth(k, d) {
    const [y, m] = k.split("-").map(Number); const x = new Date(y, m - 1 + d, 1);
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0");
  }
  function incomeTotal(k) {
    const e = (S.income && S.income.entries[k]) || {};
    const ids = Object.keys(e).filter((id) => +e[id]);
    const by = { total: 0, recurring: 0, has: ids.length > 0, groups: {} };
    GROUPS.forEach((g) => (by.groups[g] = 0));
    ids.forEach((id) => {
      const st = S.income.streams.find((x) => x.id === id); if (!st) return;
      by.total += +e[id]; by.groups[st.group] = (by.groups[st.group] || 0) + +e[id];
      if (st.recurring) by.recurring += +e[id];
    });
    return by;
  }
  function streamVal(k, id) { return +((S.income.entries[k] || {})[id] || 0); }
  function growth(endKey) {
    // compound monthly growth over the last up-to-6 months with income
    const ks = []; for (let i = 5; i >= 0; i--) ks.push(shiftMonth(endKey, -i));
    const pts = ks.map((k) => incomeTotal(k).total).map((v, i) => [i, v]).filter(([, v]) => v > 0);
    if (pts.length < 2) return null;
    const [i0, v0] = pts[0], [i1, v1] = pts[pts.length - 1];
    return Math.pow(v1 / v0, 1 / (i1 - i0)) - 1;
  }

  function incomeChart(endKey) {
    // Start at the first month with income (at least 6 months shown); fewer months on a phone.
    const narrow = window.innerWidth < 640, maxN = narrow ? 6 : 12;
    let n = 6;
    for (let i = maxN - 1; i >= 0; i--) if (incomeTotal(shiftMonth(endKey, -i)).has) { n = Math.max(6, i + 1); break; }
    const ks = []; for (let i = n - 1; i >= 0; i--) ks.push(shiftMonth(endKey, -i));
    const data = ks.map((k) => ({ k, ...incomeTotal(k) }));
    const goal = +S.income.goal || 0;
    const W = narrow ? 380 : 1040, H = narrow ? 240 : 280, L = narrow ? 54 : 70, B = 26, T = 18;
    const max = niceMax(Math.max(goal, ...data.map((d) => d.total)) * 1.05);
    const plotH = H - B - T, plotW = W - L, step = plotW / ks.length, bw = Math.min(30, step - 12);
    const y = (v) => T + plotH - (v / max) * plotH;
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--${i ? "grid" : "axis"})"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(money(v, true))}</text>`;
    }
    data.forEach((d, i) => {
      const x = L + step * i + (step - bw) / 2;
      let base = 0; const segs = GROUPS.filter((gr) => d.groups[gr] > 0);
      segs.forEach((gr, si) => {
        const v = d.groups[gr], top = si === segs.length - 1;
        const y0 = y(base), y1 = y(base + v); const h = y0 - y1 - (si ? 2 : 0);
        if (h > 0) g += top ? `<path d="${roundedTopBar(x, y1, bw, h, 4)}" fill="${GROUP_COLOR[gr]}"/>` : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${GROUP_COLOR[gr]}"/>`;
        base += v;
      });
      if (d.k === endKey && d.total) g += `<text x="${x + bw / 2}" y="${y(d.total) - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${esc(money(d.total, true))}</text>`;
      g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" ${d.k === endKey ? 'style="fill:var(--ink)"' : ""}>${esc(monthLabel(d.k))}</text>`;
      const rows = GROUPS.map((gr) => `${gr}: ${esc(money(d.groups[gr]))}`).join("<br>");
      g += `<rect x="${L + step * i}" y="${T}" width="${step}" height="${plotH}" fill="transparent" data-tip="<b>${esc(monthLabel(d.k))}</b> · ${esc(money(d.total))}<br>${rows}<br>${goal ? pct(d.total / goal) + " of goal" : ""}"/>`;
    });
    if (goal) g += `<line x1="${L}" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--ink)" stroke-dasharray="4 4" stroke-width="1"/><text x="${W}" y="${y(goal) - 6}" text-anchor="end" style="fill:var(--ink)">Goal ${esc(money(goal, true))}/mo</text>`;
    return `<div class="legend" style="flex-wrap:wrap">${GROUPS.map((gr) => `<span><i style="background:${GROUP_COLOR[gr]}"></i>${gr}</span>`).join("")}</div>
      <div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income by group against goal">${g}</svg></div>`;
  }

  views.income = () => {
    const I = S.income, k = incomeMonthSafe(), prevK = shiftMonth(k, -1);
    const cur = incomeTotal(k), prev = incomeTotal(prevK);
    const goal = +I.goal || 0, gap = Math.max(0, goal - cur.total);
    const inProgress = k === lastMonths(1)[0];
    const gr = growth(inProgress ? prevK : k);
    let proj = "Needs two months of data";
    if (gr != null && cur.total >= goal) proj = "Goal reached";
    else if (gr != null && gr > 0 && cur.total > 0) { const n = Math.ceil(Math.log(goal / cur.total) / Math.log(1 + gr)); proj = `${monthLabel(shiftMonth(k, n))} (${n} mo)`; }
    else if (gr != null) proj = "Not at this pace";
    let need = "";
    if (I.goalDate && cur.total > 0 && cur.total < goal) {
      const n = Math.max(1, monthsBetween(k + "-01", I.goalDate));
      const req = Math.pow(goal / cur.total, 1 / n) - 1;
      need = `To hit it by ${esc(I.goalDate)} you need ${pct(req)} growth every month${gr != null ? `, you are doing ${pct(gr)}` : ""}.`;
    }
    const mom = prev.total ? cur.total / prev.total - 1 : NaN;
    const pipeline = I.streams.filter((s) => s.status === "Building" || s.status === "Idea");
    const tiles = [
      ["Income " + monthLabel(k) + (inProgress ? " so far" : ""), money(cur.total), inProgress ? `${money(prev.total)} in ${monthLabel(prevK)}` : isFinite(mom) ? `${mom >= 0 ? "+" : ""}${pct(mom)} vs ${monthLabel(prevK)}` : "No prior month", !inProgress && isFinite(mom) ? (mom >= 0 ? "pos" : "neg") : ""],
      ["Progress to goal", pct(goal ? cur.total / goal : NaN), `Gap ${money(gap)}`, ""],
      ["Monthly growth", gr == null ? "–" : pct(gr), gr == null ? "Needs two full months" : `Goal reached: ${proj}`, gr != null && gr < 0 ? "neg" : ""],
    ];

    const groupRows = GROUPS.map((g) => {
      const list = I.streams.filter((s) => s.group === g && s.status !== "Archived");
      const gt = cur.groups[g] || 0, gp = prev.groups[g] || 0;
      return `<tbody class="grp">
        <tr class="grp-head"><th><i class="dot" style="background:${GROUP_COLOR[g]}"></i>${g} <span class="muted">${list[0] && !list[0].recurring ? "· one-off" : ""}</span></th>
          <th class="num">${esc(money(gt))}</th><th class="num prevcol muted">${gp ? esc(money(gp, true)) : ""}</th><th class="num ${gt >= gp ? "pos" : "neg"}">${gp ? (gt >= gp ? "+" : "") + pct(gt / gp - 1) : ""}</th></tr>
        ${list.map((s) => {
          const v = streamVal(k, s.id), pv = streamVal(prevK, s.id), ch = pv ? v / pv - 1 : NaN;
          const nt = ((I.notes || {})[k] || {})[s.id];
          return `<tr><td>${esc(s.name)}${s.status !== "Live" ? ` <span class="tag">${esc(s.status)}</span>` : ""}${nt ? `<div class="row-note">${esc(nt)}</div>` : ""}</td>
            <td class="num"><input class="amt-in" inputmode="decimal" data-stream="${s.id}" value="${fmtInput(v)}" placeholder="0"></td>
            <td class="num muted prevcol">${pv ? esc(money(pv, true)) : "–"}</td>
            <td class="num ${isFinite(ch) ? (ch >= 0 ? "pos" : "neg") : ""}">${isFinite(ch) ? (ch >= 0 ? "+" : "") + pct(ch) : ""}</td></tr>`;
        }).join("")}
      </tbody>`;
    }).join("");

    const alloc = I.allocations[k] || {};
    const allocTotal = sum(Object.values(alloc), (v) => +v || 0);
    const unassigned = cur.total - allocTotal;
    const destRows = I.destinations.map((d) => `<tr><td>${esc(d.name)}</td>
      <td class="num"><input class="amt-in" inputmode="decimal" data-dest="${d.id}" value="${fmtInput(+alloc[d.id] || 0)}" placeholder="0"></td>
      <td class="num muted">${cur.total && alloc[d.id] ? pct(+alloc[d.id] / cur.total) : ""}</td>
      <td><button class="link" data-del-dest="${d.id}" aria-label="Remove">✕</button></td></tr>`).join("");
    const regina = sum(I.destinations.filter((d) => d.parent === "Regina"), (d) => +alloc[d.id] || 0);

    return `
      <h1>Income</h1>
      <p class="sub">Every stream, every month, against a ${esc(money(goal))} monthly target. Grow the live ones, build new ones.</p>
      <div class="month-nav">
        <button data-mshift="-1" aria-label="Previous month">‹</button>
        <input type="month" id="incMonth" value="${k}">
        <button data-mshift="1" aria-label="Next month">›</button>
      </div>
      <div class="grid">
        ${tiles.map(([l, v, h, c]) => `<div class="card tile span-4"><div class="label">${l}</div><div class="value">${v}</div><div class="hint ${c}">${h}</div></div>`).join("")}
        <div class="card span-12"><h2>Monthly income vs goal</h2>${incomeChart(k)}
          <div class="goal" style="margin-bottom:0"><div class="bars"><div class="track" style="height:12px" data-tip="${esc(money(cur.total))} of ${esc(money(goal))}"><div class="fill" style="width:${goal ? Math.min(100, (cur.total / goal) * 100) : 0}%"></div></div></div>
          <div class="meta">${esc(money(cur.total))} of ${esc(money(goal))} in ${esc(monthLabel(k))}. ${need}</div></div>
        </div>
        <details class="card span-12 fold" ${proposals ? "open" : ""}><summary><h2>Add from photos</h2></summary>
          <p class="sub" style="margin-bottom:10px">Upload screenshots or photos of statements, transfer receipts or WhatsApp confirmations. Claude reads them and proposes entries. Nothing is saved until you confirm.</p>
          <div id="photoBox"><p class="empty">Photo reading works when this page is opened on claude.ai.</p></div>
          <div id="proposals">${proposalsHtml()}</div>
        </details>
        <div class="card span-12"><div class="card-head"><h2>Streams · ${esc(monthLabel(k))}</h2>
            <span><button id="copyPrev">Copy ${esc(monthLabel(prevK))}</button> <button class="primary" id="saveInc">Save month</button></span></div>
          <div class="table-wrap"><table class="inc-table">
            <thead><tr><th>Stream</th><th class="num">${esc(monthLabel(k))}</th><th class="num prevcol">${esc(monthLabel(prevK))}</th><th class="num">Change</th></tr></thead>
            ${groupRows}
            <tfoot><tr><th>Total</th><th class="num" id="incTotal">${esc(money(cur.total))}</th><th class="num prevcol">${esc(money(prev.total))}</th><th class="num">${isFinite(mom) ? pct(mom) : ""}</th></tr></tfoot>
          </table></div>
          <p class="saved-note" id="incDirty" hidden>Unsaved changes</p>
        </div>
        <details class="card span-12 fold"><summary><h2>Distribution · ${esc(monthLabel(k))} <span class="muted" style="font-weight:400">${esc(money(allocTotal))} of ${esc(money(cur.total))}</span></h2></summary>
          <div class="table-wrap"><table>${destRows}
            <tfoot>
              <tr><th>Distributed</th><th class="num" id="allocTotal">${esc(money(allocTotal))}</th><th></th><th></th></tr>
              <tr><th>Unassigned</th><th class="num ${unassigned < 0 ? "neg" : ""}" id="allocLeft">${esc(money(unassigned))}</th><th></th><th></th></tr>
              ${regina ? `<tr><td class="muted">Regina total</td><td class="num muted">${esc(money(regina))}</td><td></td><td></td></tr>` : ""}
            </tfoot></table></div>
          <form class="row" id="destForm" style="margin-top:12px">
            <label class="f" style="flex:1">New destination<input name="name" placeholder="e.g. Savings · GBM" required></label>
            <button>Add</button>
          </form>
          <p><button class="primary" id="saveAlloc">Save distribution</button></p>
        </details>
        <details class="card span-12 fold"><summary><h2>Manage streams &amp; goal</h2></summary>
          <p class="sub" style="margin-bottom:10px">${I.streams.filter((s) => s.status === "Live").length} live · ${pipeline.length} being built. Mark one-off streams so they don't inflate your recurring number.</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Stream</th><th>Group</th><th>Status</th><th>Recurring</th><th class="num">3-mo avg</th><th></th></tr></thead>
            <tbody>${I.streams.filter((s) => s.status !== "Archived").map((s) => {
              const avg = (streamVal(k, s.id) + streamVal(prevK, s.id) + streamVal(shiftMonth(k, -2), s.id)) / 3;
              return `<tr><td>${esc(s.name)}</td><td>${esc(s.group)}</td>
                <td><select data-st-status="${s.id}">${STATUSES.map((x) => `<option ${s.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
                <td><input type="checkbox" data-st-rec="${s.id}" ${s.recurring ? "checked" : ""} aria-label="Recurring"></td>
                <td class="num">${avg ? esc(money(avg, true)) : "–"}</td>
                <td><button class="link" data-archive="${s.id}" aria-label="Archive">✕</button></td></tr>`;
            }).join("")}</tbody></table></div>
          <form class="row" id="streamForm" style="margin-top:12px">
            <label class="f">New stream<input name="name" placeholder="Name" required></label>
            <label class="f">Group<select name="group">${GROUPS.map((g) => `<option>${g}</option>`).join("")}</select></label>
            <label class="f">Status<select name="status">${STATUSES.map((x) => `<option ${x === "Building" ? "selected" : ""}>${x}</option>`).join("")}</select></label>
            <button>Add stream</button>
          </form>
          <form class="row" id="goalForm">
            <label class="f">Monthly income goal<input name="goal" inputmode="decimal" value="${goal}"></label>
            <label class="f">Reach it by<input type="date" name="goalDate" value="${esc(I.goalDate || "")}"></label>
            <button>Update goal</button>
          </form>
        </details>
      </div>`;
  };
  function incomeMonthSafe() { return /^\d{4}-\d{2}$/.test(incMonth) ? incMonth : lastMonths(1)[0]; }

  function proposalsHtml() {
    if (!proposals) return "";
    if (proposals.error) return `<div class="insight warn">${esc(proposals.error)}</div>`;
    if (!proposals.items.length) return `<p class="empty">No amounts found in those images.</p>`;
    const opts = (sel) => `<option value="">Skip</option>
      <optgroup label="Income stream">${S.income.streams.filter((s) => s.status !== "Archived").map((s) => `<option value="s:${s.id}" ${sel === "s:" + s.id ? "selected" : ""}>${esc(s.group)} · ${esc(s.name)}</option>`).join("")}</optgroup>
      <optgroup label="Distribution">${S.income.destinations.map((d) => `<option value="d:${d.id}" ${sel === "d:" + d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</optgroup>`;
    return `<div class="prop-list">${proposals.items.map((p, i) => `
      <div class="prop">
        <div class="muted" style="font-size:12px">${esc(p.date || "")} ${esc(p.label || "")}${p.note ? " · " + esc(p.note) : ""}</div>
        <div class="prop-row"><select data-prop-map="${i}">${opts(p.map)}</select>
        <input class="amt-in" inputmode="decimal" data-prop-amt="${i}" value="${fmtInput(p.amount)}"></div>
      </div>`).join("")}
      <p class="muted" style="font-size:12px">Amounts are added to ${esc(monthLabel(incomeMonthSafe()))}${proposals.month && proposals.month !== incomeMonthSafe() ? `. The images look like ${esc(monthLabel(proposals.month))}: <button class="link" id="propMonth" style="color:var(--s1)">switch month</button>` : ""}.</p>
      <p style="display:flex;gap:8px"><button class="primary" id="propApply">Add to month</button><button id="propClear">Discard</button></p></div>`;
  }

  let samplePromise = null;
  function getSample() {
    if (!samplePromise) samplePromise = (window.claude && window.claude.use ? window.claude.use("sample") : Promise.resolve(null)).catch(() => null);
    return samplePromise;
  }
  async function mountPhotoBox() {
    const box = $("#photoBox"); if (!box) return;
    const sample = await getSample();
    const caps = sample ? await sample.limits().catch(() => null) : null;
    if (!$("#photoBox")) return;
    if (!sample || !caps || !caps.images) return;
    $("#photoBox").innerHTML = `
      <label class="drop"><input type="file" id="photoIn" accept="${esc(caps.images.mediaTypes.join(","))}" multiple hidden>
        <span>Choose photos or screenshots</span><small id="photoCount">Up to ${caps.images.maxCount} at a time</small></label>
      <p style="display:flex;gap:8px;align-items:center"><button class="primary" id="photoRead" disabled>Read with Claude</button><button id="photoStop" hidden>Stop</button><span class="muted" id="photoStatus"></span></p>`;
    const inp = $("#photoIn"), btn = $("#photoRead");
    inp.onchange = () => { $("#photoCount").textContent = inp.files.length ? `${inp.files.length} selected` : ""; btn.disabled = !inp.files.length; };
    let ctl = null;
    $("#photoStop").onclick = () => ctl && ctl.abort();
    btn.onclick = async () => {
      const files = [...inp.files].slice(0, caps.images.maxCount);
      if (!files.length) return;
      ctl = new AbortController();
      btn.disabled = true; $("#photoStop").hidden = false; $("#photoStatus").textContent = "Reading…";
      const streams = S.income.streams.filter((s) => s.status !== "Archived").map((s) => `${s.id}: ${s.group} / ${s.name}`).join("\n");
      const dests = S.income.destinations.map((d) => `${d.id}: ${d.name}`).join("\n");
      const prompt = `These images are bank statements, transfer receipts or payment confirmations (Mexico, amounts in ${S.settings.currency}).
Extract every money movement you can read. Classify each as:
- "income": money received from one of the income streams below, or
- "distribution": money sent from the owner to one of the destinations below.
Match by company or person name, bank concept or reference. If unsure, set match_id to null.

Income streams:
${streams}

Distribution destinations:
${dests}

Reply with only JSON in this shape:
{"month":"YYYY-MM or null","items":[{"type":"income|distribution","match_id":"st3 or d2 or null","label":"name or concept as written","amount":12345.67,"date":"YYYY-MM-DD or null","note":"short, e.g. bank or reference"}]}
Amounts are positive numbers without currency symbols. Do not invent items you cannot read.`;
      try {
        const out = await sample.json(prompt, { images: files, signal: ctl.signal });
        const items = (out && Array.isArray(out.items) ? out.items : []).map((x) => {
          const id = x && x.match_id ? String(x.match_id) : "";
          const map = S.income.streams.some((s) => s.id === id) ? "s:" + id : S.income.destinations.some((d) => d.id === id) ? "d:" + id : "";
          return { map, amount: num(x && x.amount), label: String((x && x.label) || ""), date: String((x && x.date) || ""), note: String((x && x.note) || "") };
        }).filter((x) => x.amount > 0);
        proposals = { items, month: out && /^\d{4}-\d{2}$/.test(out.month || "") ? out.month : null };
      } catch (e) {
        const msg = {
          cancelled: null, not_granted: "Claude access was not allowed for this page.", rate_limited: "Too many requests right now. Try again in a minute.",
          image_rejected: "One of the images could not be read. Try a clearer photo or a screenshot.", invalid_json: "Claude's answer could not be read. Try again.",
          refused: "Claude declined to read these images.", session_expired: "Sign in to claude.ai again.",
        }[e && e.code];
        proposals = msg === null ? null : { error: msg || "Something went wrong reading the images. Try again." };
      }
      render();
    };
  }

  let incAbort = null;
  function wireIncome() {
    if (incAbort) incAbort.abort();
    incAbort = new AbortController();
    const sig = { signal: incAbort.signal };
    const I = S.income, k = incomeMonthSafe();
    let dirtyInc = false, dirtyAlloc = false;
    $("#incMonth").onchange = (e) => { if (e.target.value) { incMonth = e.target.value; render(); } };
    const totalIn = () => sum([...document.querySelectorAll("[data-stream]")], (el) => num(el.value));
    const allocIn = () => sum([...document.querySelectorAll("[data-dest]")], (el) => num(el.value));
    $("#view").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.stream) {
        dirtyInc = true; $("#incDirty").hidden = false;
        $("#incTotal").textContent = money(totalIn());
        $("#allocLeft").textContent = money(totalIn() - allocIn());
      }
      if (t.dataset.dest) { dirtyAlloc = true; $("#allocTotal").textContent = money(allocIn()); $("#allocLeft").textContent = money(totalIn() - allocIn()); }
    }, sig);
    const saveInc = () => {
      const e = {}; document.querySelectorAll("[data-stream]").forEach((el) => { const v = num(el.value); if (v) e[el.dataset.stream] = v; });
      I.entries[k] = e; dirtyInc = false;
    };
    const saveAlloc = () => {
      const a = {}; document.querySelectorAll("[data-dest]").forEach((el) => { const v = num(el.value); if (v) a[el.dataset.dest] = v; });
      I.allocations[k] = a; dirtyAlloc = false;
    };
    // keep unsaved typing when another action re-renders
    const keep = () => { if (dirtyInc) saveInc(); if (dirtyAlloc) saveAlloc(); };
    $("#saveInc").onclick = () => { saveInc(); commit(); };
    $("#saveAlloc").onclick = () => { saveAlloc(); commit(); };
    $("#copyPrev").onclick = () => {
      const p = I.entries[shiftMonth(k, -1)] || {};
      document.querySelectorAll("[data-stream]").forEach((el) => { if (!num(el.value) && p[el.dataset.stream]) el.value = fmtInput(p[el.dataset.stream]); });
      dirtyInc = true; $("#incDirty").hidden = false; $("#incTotal").textContent = money(totalIn());
    };
    $("#view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mshift],[data-archive],[data-del-dest],#propApply,#propClear,#propMonth"); if (!b) return;
      if (b.dataset.mshift) { keep(); save(); incMonth = shiftMonth(k, +b.dataset.mshift); render(); }
      if (b.dataset.archive && confirm("Archive this stream? Its history is kept.")) { keep(); I.streams.find((s) => s.id === b.dataset.archive).status = "Archived"; commit(); }
      if (b.dataset.delDest && confirm("Remove this destination?")) { keep(); I.destinations = I.destinations.filter((d) => d.id !== b.dataset.delDest); commit(); }
      if (b.id === "propMonth") { keep(); save(); incMonth = proposals.month; render(); }
      if (b.id === "propClear") { proposals = null; render(); }
      if (b.id === "propApply") {
        keep();
        const e2 = I.entries[k] = I.entries[k] || {}, a2 = I.allocations[k] = I.allocations[k] || {};
        proposals.items.forEach((p, i) => {
          const map = $(`[data-prop-map="${i}"]`).value, amt = num($(`[data-prop-amt="${i}"]`).value);
          if (!map || !amt) return;
          const [t, id] = map.split(":");
          if (t === "s") e2[id] = (+e2[id] || 0) + amt; else a2[id] = (+a2[id] || 0) + amt;
        });
        proposals = null; commit();
      }
    }, sig);
    $("#view").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.stStatus) { keep(); I.streams.find((s) => s.id === t.dataset.stStatus).status = t.value; commit(); }
      if (t.dataset.stRec) { keep(); I.streams.find((s) => s.id === t.dataset.stRec).recurring = t.checked; commit(); }
    }, sig);
    $("#streamForm").onsubmit = (e) => {
      e.preventDefault(); keep(); const x = formData(e.target);
      I.streams.push({ id: "st" + uid(), name: x.name, group: x.group, status: x.status, recurring: x.group !== "Deal building" });
      commit();
    };
    $("#destForm").onsubmit = (e) => { e.preventDefault(); keep(); I.destinations.push({ id: "d" + uid(), name: formData(e.target).name, parent: "" }); commit(); };
    $("#goalForm").onsubmit = (e) => { e.preventDefault(); keep(); const x = formData(e.target); I.goal = num(x.goal) || I.goal; I.goalDate = x.goalDate; commit(); };
    window.onbeforeunload = () => { if (dirtyInc || dirtyAlloc) { keep(); save(); } };
    mountPhotoBox();
  }

  // ---------- render + events ----------
  function render() {
    const route = (location.hash || "#dashboard").slice(1);
    const fn = views[route] || views.dashboard;
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + route));
    const banner = S.isSample ? `<div class="insight">You are looking at sample data. Erase it in <a href="#settings">Settings</a> and start with your own accounts.</div>` : "";
    $("#view").innerHTML = banner + fn();
    tip.hidden = true;
    bindTips($("#view"));
    wire(route);
  }
  const formData = (form) => Object.fromEntries(new FormData(form).entries());
  const commit = () => { save(); render(); };

  function wire(route) {
    if (incAbort && route !== "income") { incAbort.abort(); incAbort = null; window.onbeforeunload = null; }
    const v = $("#view");
    v.onclick = (e) => {
      const b = e.target.closest("button, [data-m], [data-nt]"); if (!b) return;
      const d = b.dataset;
      if (d.m) { flowMonth = d.m; render(); }
      if (d.nt) { brainFilter = d.nt; render(); }
      if (d.delTx && confirm("Delete this transaction?")) { S.transactions = S.transactions.filter((t) => t.id !== d.delTx); commit(); }
      if (d.delAcc && confirm("Delete this account?")) { S.accounts = S.accounts.filter((t) => t.id !== d.delAcc); commit(); }
      if (d.delSnap) { S.snapshots = S.snapshots.filter((t) => t.id !== d.delSnap); commit(); }
      if (d.delGoal && confirm("Delete this goal?")) { S.goals = S.goals.filter((t) => t.id !== d.delGoal); commit(); }
      if (d.delNote && confirm("Delete this note?")) { S.notes = S.notes.filter((t) => t.id !== d.delNote); commit(); }
      if (d.editAcc) fill($("#accForm"), S.accounts.find((a) => a.id === d.editAcc));
      if (d.editGoal) fill($("#goalForm"), S.goals.find((a) => a.id === d.editGoal));
      if (d.editNote) { const n = S.notes.find((a) => a.id === d.editNote); fill($("#noteForm"), { ...n, tags: (n.tags || []).join(", ") }); toggleLens(); }
    };

    if (route === "income") wireIncome();
    if (route === "flows") {
      const kind = $("#kindSel"), cat = $("#catSel");
      kind.onchange = () => (cat.innerHTML = (kind.value === "income" ? INCOME_CATS : EXPENSE_CATS).map((c) => `<option>${c}</option>`).join(""));
      $("#txForm").onsubmit = (e) => { e.preventDefault(); const x = formData(e.target); S.transactions.push({ id: uid(), ...x, amount: +x.amount }); commit(); };
      $("#csvIn").onchange = (e) => readFile(e.target.files[0], importCsv);
    }
    if (route === "wealth") {
      $("#accForm").onsubmit = (e) => {
        e.preventDefault(); const x = formData(e.target);
        const rec = { ...x, value: +x.value, cost: x.cost ? +x.cost : null };
        if (x.id) Object.assign(S.accounts.find((a) => a.id === x.id), rec); else S.accounts.push({ ...rec, id: uid() });
        commit();
      };
      $("#snapBtn").onclick = () => {
        const key = ym(today());
        S.snapshots = S.snapshots.filter((s) => ym(s.date) !== key);
        S.snapshots.push({ id: uid(), date: today(), value: netWorth() });
        commit();
      };
    }
    if (route === "goals") {
      $("#goalForm").onsubmit = (e) => {
        e.preventDefault(); const x = formData(e.target);
        const rec = { ...x, target: +x.target, current: +x.current || 0, monthly: +x.monthly || 0 };
        if (x.id) Object.assign(S.goals.find((g) => g.id === x.id), rec); else S.goals.push({ ...rec, id: uid() });
        commit();
      };
    }
    if (route === "brain") {
      $("#noteType").onchange = toggleLens; toggleLens();
      $("#noteForm").onsubmit = (e) => {
        e.preventDefault(); const x = formData(e.target);
        const rec = { ...x, tags: x.tags.split(",").map((t) => t.trim()).filter(Boolean), date: x.date || today() };
        if (x.id) Object.assign(S.notes.find((n) => n.id === x.id), rec); else S.notes.push({ ...rec, id: uid() });
        commit();
      };
      $("#reviewTpl").onclick = () => { const t = reviewTemplate(); fill($("#noteForm"), { type: "Monthly review", ...t, date: today(), tags: "review" }); toggleLens(); };
      const s = $("#brainSearch");
      s.oninput = () => { brainQuery = s.value; const pos = s.selectionStart; render(); const n = $("#brainSearch"); n.focus(); n.setSelectionRange(pos, pos); };
    }
    if (route === "settings") {
      try { $("#setForm").theme.value = localStorage.getItem("fsb.theme") || ""; } catch (e) { /* ignore */ }
      $("#setForm").onsubmit = (e) => {
        e.preventDefault(); const x = formData(e.target);
        S.settings.currency = x.currency; S.settings.emergencyMonths = +x.emergencyMonths || 6;
        applyTheme(x.theme); try { localStorage.setItem("fsb.theme", x.theme); } catch (err) { /* ignore */ }
        commit();
      };
      $("#exportBtn").onclick = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
        a.download = `finance-second-brain-${today()}.json`; a.click();
      };
      $("#importIn").onchange = (e) => readFile(e.target.files[0], (txt) => {
        try { S = Object.assign(blank(), JSON.parse(txt)); commit(); alert("Imported."); } catch (err) { alert("That file is not a valid backup."); }
      });
      $("#sampleBtn").onclick = () => { if (confirm("Replace current data with sample data?")) { S = sample(); commit(); location.hash = "#dashboard"; } };
      $("#clearBtn").onclick = () => { if (confirm("Erase all data in this browser? Export first if unsure.")) { S = blank(); commit(); } };
    }
  }
  function toggleLens() { const t = $("#noteType"); if (t) $("#lensFields").hidden = t.value !== "Decision"; }
  function fill(form, obj) {
    if (!form || !obj) return;
    [...form.elements].forEach((el) => { if (el.name && obj[el.name] != null) el.value = obj[el.name]; });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function readFile(file, cb) { if (!file) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsText(file); }
  function importCsv(txt) {
    const rows = txt.trim().split(/\r?\n/).map(splitCsv);
    let n = 0;
    rows.forEach((r) => {
      const [date, desc, amt, cat] = r; const a = parseFloat(String(amt).replace(/[^0-9.\-]/g, ""));
      if (!/^\d{4}-\d{2}-\d{2}/.test(date) || isNaN(a)) return;
      const kind = a < 0 ? "expense" : "income";
      S.transactions.push({ id: uid(), date: date.slice(0, 10), desc, amount: Math.abs(a), kind, category: cat || (kind === "income" ? "Other income" : "Other") });
      n++;
    });
    commit(); alert(`Imported ${n} transactions.`);
  }
  function splitCsv(line) {
    const out = []; let cur = "", q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; }
    out.push(cur.trim()); return out;
  }
  function applyTheme(t) { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }

  // ---------- sample data ----------
  function sample() {
    const s = blank();
    const months = lastMonths(12);
    months.forEach((k, i) => {
      const d = (day) => `${k}-${String(day).padStart(2, "0")}`;
      const add = (kind, day, desc, category, amount, recurring) => s.transactions.push({ id: uid(), kind, date: d(day), desc, category, amount: Math.round(amount), recurring });
      add("income", 1, "Retainer: portfolio advisory", "Advisory fees", 14000, "monthly");
      if (i % 3 === 2) add("income", 15, "Board seat fee", "Advisory fees", 6000);
      if (i % 3 === 0) add("income", 20, "Dividends", "Dividends", 900 + i * 40);
      add("expense", 2, "Rent", "Housing", 4200, "monthly");
      add("expense", 5, "Groceries & dining", "Food", 1300 + (i % 4) * 120);
      add("expense", 8, "Car & transport", "Transport", 450);
      add("expense", 10, "Health insurance", "Health", 680, "monthly");
      add("expense", 12, "Software & subscriptions", "Subscriptions", 240, "monthly");
      add("expense", 18, "Family", "Family", 900);
      add("expense", 22, "Lifestyle", "Lifestyle", 700 + (i === 11 ? 1400 : 0));
      if (i === 6) add("expense", 14, "Summer trip", "Travel", 5200);
      if (i % 3 === 1) add("expense", 25, "Quarterly tax estimate", "Taxes", 7500);
    });
    s.accounts = [
      { id: "a1", name: "Operating checking", type: "Cash", value: 38000 },
      { id: "a2", name: "High-yield savings", type: "Cash", value: 52000 },
      { id: "a3", name: "Brokerage: index core", type: "Investment", value: 410000, cost: 300000, note: "70/30 global equity / bonds" },
      { id: "a4", name: "Retirement account", type: "Retirement", value: 265000, cost: 190000 },
      { id: "a5", name: "Angel portfolio (9 cos.)", type: "Private / Angel", value: 180000, cost: 145000, note: "Marked at last round" },
      { id: "a6", name: "Apartment equity", type: "Real estate", value: 320000 },
      { id: "a7", name: "Mortgage", type: "Debt", value: 210000 },
    ];
    months.slice(0, 11).forEach((k, i) => s.snapshots.push({ id: uid(), date: k + "-28", value: Math.round(905000 + i * 12500 + Math.sin(i * 1.3) * 14000) }));
    s.goals = [
      { id: uid(), name: "Freedom fund (5 yrs expenses)", target: 600000, accountId: "a3", deadline: new Date().getFullYear() + 3 + "-12-31", monthly: 5500, why: "Choose which founders to work with, never take a deal for the fee." },
      { id: uid(), name: "Emergency fund", target: 75000, accountId: "a2", deadline: new Date().getFullYear() + 1 + "-12-31", monthly: 2000, why: "Sleep well." },
      { id: uid(), name: "Next angel fund allocation", target: 100000, current: 30000, deadline: new Date().getFullYear() + 1 + "-12-31", monthly: 3000, why: "Back 5 founders with conviction, not 20 with hope." },
    ];
    s.notes = [
      { id: uid(), type: "Principle", date: months[0] + "-03", title: "Never more than 15% of net worth in private deals", body: "Illiquid risk compounds quietly. If the angel book grows past 15%, new checks stop until it rebalances.", tags: ["angel", "risk"] },
      { id: uid(), type: "Principle", date: months[0] + "-03", title: "Pay myself first, automatically", body: "Savings transfer on the 2nd of each month, before discretionary spending exists.", tags: ["habit"] },
      { id: uid(), type: "Decision", date: months[8] + "-11", title: "Follow-on in Seed portfolio company", body: "Pro-rata in their Series A.", stake: 25000, confidence: "Medium", reviewOn: months[11] + "-01", tags: ["angel", "follow-on"],
        lens_contrarian: "Round is led by an insider. No new lead validated price.", lens_first: "Is revenue retention above 110%? That is the only number that matters at this stage.", lens_expansion: "If they own the category, this is a 20x position.", lens_outsider: "Why put more into one bet when you already have nine?", lens_executor: "Ask founder for cohort data by Friday, decide by the 20th." },
      { id: uid(), type: "Lesson", date: months[5] + "-20", title: "Selling winners early cost me more than losers", body: "Trimmed my best performer at 3x for 'discipline'. It went to 9x. Rebalance by rules, not by nerves.", tags: ["behavior"] },
    ];
    const FX = 18; // sample written in USD-sized amounts, shown in pesos
    s.transactions.forEach((t) => (t.amount *= FX));
    s.accounts.forEach((a) => { a.value *= FX; if (a.cost) a.cost *= FX; });
    s.snapshots.forEach((x) => (x.value *= FX));
    s.goals.forEach((g) => { g.target *= FX; g.current = (g.current || 0) * FX; g.monthly *= FX; });
    s.notes.forEach((x) => { if (x.stake) x.stake *= FX; });
    return s;
  }

  // ---------- private sync (claude.ai db, owner-only) ----------
  // Two documents: fsb/income (income module) and fsb/core (everything else).
  let cloud = null, pushTimer = null, pendingRender = false;
  const cloudReady = { core: false, income: false }, lastJSON = { core: null, income: null }, chain = { core: Promise.resolve(), income: Promise.resolve() };
  const parts = () => { const { income, ...core } = S; delete core.isSample; delete core.regenSample; return { core, income }; };
  function setSync(t) { const el = $("#sync"); if (el) el.textContent = t; }
  function cloudPush() {
    if (!cloud) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const p = parts();
      ["core", "income"].forEach((name) => {
        if (!cloudReady[name]) return;
        const j = JSON.stringify(p[name]);
        if (j === lastJSON[name]) return;
        lastJSON[name] = j;
        chain[name] = chain[name].then(() => cloud.doc("fsb/" + name).set(JSON.parse(j)))
          .then(() => setSync("Synced"), () => setSync("Not synced. Changes saved on this device."));
      });
    }, 600);
  }
  function busyEditing() {
    const a = document.activeElement;
    return (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $("#view").contains(a)) || ($("#incDirty") && !$("#incDirty").hidden);
  }
  function applyRemote(name, snap) {
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    if (!snap.exists) {
      if (snap.metadata && snap.metadata.fromCache) return;
      cloudReady[name] = true;
      if (name === "core" && S.isSample) { const inc = S.income; S = blank(); S.income = inc; render(); }
      save(); return;
    }
    cloudReady[name] = true;
    const j = JSON.stringify(snap.data());
    if (j === lastJSON[name]) return;
    lastJSON[name] = j;
    const d = JSON.parse(j);
    if (name === "income") S.income = Object.assign(incomeSeed(), d);
    else { const inc = S.income; S = Object.assign(blank(), d); S.income = inc; }
    lastJSON[name] = JSON.stringify(parts()[name]); // normalized, so an unchanged doc is never rewritten
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    setSync("Synced");
    if (busyEditing()) pendingRender = true; else render();
  }
  async function connectCloud() {
    if (!window.claude || !window.claude.use) return;
    let db = null; try { db = await window.claude.use("db"); } catch (e) { db = null; }
    if (!db) return;
    cloud = db; setSync("Connecting…");
    const t = setTimeout(() => setSync("Offline. Changes saved on this device."), 10000);
    ["core", "income"].forEach((name) => db.doc("fsb/" + name).onSnapshot(
      (snap) => { if (!snap.metadata || !snap.metadata.fromCache) clearTimeout(t); applyRemote(name, snap); },
      () => { clearTimeout(t); setSync("Not synced. Changes saved on this device."); }
    ));
  }
  document.addEventListener("focusout", () => setTimeout(() => { if (pendingRender && !busyEditing()) { pendingRender = false; render(); } }, 50));

  // boot
  try { applyTheme(localStorage.getItem("fsb.theme") || ""); } catch (e) { /* ignore */ }
  window.addEventListener("hashchange", render);
  if (S.regenSample) { S = sample(); S.isSample = true; save(); }
  if (!S.transactions.length && !S.accounts.length && !S.notes.length && !S.goals.length) {
    // first visit: show sample so the dashboard is not empty; erase in Settings
    S = sample(); S.isSample = true; save();
  }
  render();
  connectCloud();
})();
