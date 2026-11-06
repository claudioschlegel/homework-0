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
    settings: { currency: "USD", emergencyMonths: 6 },
    transactions: [], accounts: [], goals: [], notes: [], snapshots: [],
  });
  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(blank(), JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
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
    const income = sum(tx.filter((t) => t.kind === "income"), (t) => +t.amount);
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
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
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
        <div class="track"><div class="fill" style="width:${(r.v / max) * 100}%"></div></div>
        <span class="amt">${total ? pct(r.v / total) : esc(money(r.v, true))}</span>
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
    const ins = insights();
    return `
      <h1>Dashboard</h1>
      <p class="sub">Where you stand, where the money goes, and what needs a decision.</p>
      <div class="grid">
        ${tiles.map(([l, v, h, c]) => `<div class="card tile span-3"><div class="label">${l}</div><div class="value">${v}</div><div class="hint ${c}">${h}</div></div>`).join("")}
        <div class="card span-8"><h2>Cash flow, last 12 months</h2>${cashflowChart(months)}</div>
        <div class="card span-4"><h2>Needs attention</h2>${ins.length ? ins.map(([c, t]) => `<div class="insight ${c}">${esc(t)}</div>`).join("") : `<p class="empty">Nothing flagged. Good month.</p>`}</div>
        <div class="card span-8"><h2>Net worth over time</h2>${lineChart(snaps.map((s) => ({ v: s.value, label: monthLabel(ym(s.date)) })), "Net worth over time")}</div>
        <div class="card span-4"><h2>Goals</h2>${goalsList(true)}</div>
        <div class="card span-6"><h2>Spending by category, last 3 months</h2>${barList(catRows, sum(catRows, (r) => r.v))}</div>
        <div class="card span-6"><h2>Asset allocation</h2>${barList(allocRows, sum(allocRows, (r) => r.v))}</div>
      </div>`;
  };

  let flowMonth = "all";
  views.flows = () => {
    const months = [...new Set(S.transactions.map((t) => ym(t.date)))].sort().reverse();
    const list = S.transactions.filter((t) => flowMonth === "all" || ym(t.date) === flowMonth).sort((a, b) => b.date.localeCompare(a.date));
    const inc = sum(list.filter((t) => t.kind === "income"), (t) => +t.amount);
    const exp = sum(list.filter((t) => t.kind === "expense"), (t) => +t.amount);
    return `
      <h1>Income &amp; Spending</h1>
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
    return s;
  }

  // boot
  try { applyTheme(localStorage.getItem("fsb.theme") || ""); } catch (e) { /* ignore */ }
  window.addEventListener("hashchange", render);
  if (!S.transactions.length && !S.accounts.length && !S.notes.length && !S.goals.length) {
    // first visit: show sample so the dashboard is not empty; erase in Settings
    S = sample(); S.isSample = true; save();
  }
  render();
})();
