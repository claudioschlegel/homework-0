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
    return { goal: 5500000, interestGoal: 1500000, goalDate: "", streams, destinations: allocSeed(), entries: {}, allocations: {}, savings: {}, yearEnd: { low: 8000000, high: 9000000, date: "2026-12-31", purpose: "Send to the Swiss bank or invest" },
      plan: { date: "2027-01-31", ch: 12500000, monthSavings: 3000000, saldo: 1500000, trfcs: 350000, bbva: 1600000 } };
  }

  // Where each month's income goes. "budget" is the monthly plan; actuals live in income.allocations[month][id].
  function allocSeed() {
    return [
      ["a1", "Salary 1", "Bank · BBVA", "Monthly salary to BBVA", 1250000],
      ["a2", "Salary 2", "Bank · BBVA", "Monthly salary to BBVA", 1200000],
      ["a3", "Salary 3", "Bank · BBVA", "Monthly salary to BBVA", 450000],
      ["a4", "Bonus", "Bank · BBVA", "Paid some months", 0],
      ["a5", "TRF · CS", "TRF cards", "Daily expenses, not tax deductible", 0],
      ["a6", "TRF · RV", "TRF cards", "My wife's monthly expenses", 0],
      ["a7", "Cash", "Cash", "", 0],
      ["a8", "José Andrés", "Payments", "Chief of staff", 25000],
      ["a9", "PR", "Payments", "", 20000],
      ["a10", "LinkedIn media", "Payments", "Personal brand strategy", 19000],
      ["a11", "Red media", "Payments", "Video footage (starting soon)", 0],
      ["a12", "Costo social", "Operating costs", "Social security cost of the salaries", 0],
      ["a13", "Bitline interest", "Operating costs", "Covers interest of the Bitline operation", 20000],
      ["a14", "Saldo · Quantamex", "Savings", "Money moved to your Saldo balance", 0],
    ].map(([id, name, group, purpose, budget]) => ({ id, name, group, purpose, budget }));
  }
  function normalizeIncome(inc) {
    const out = Object.assign(incomeSeed(), inc || {});
    if (!out.destinations.length || !out.destinations[0].group) out.destinations = allocSeed(); // old flat list, never used
    allocSeed().forEach((d) => { if (!out.destinations.some((x) => x.id === d.id) && d.id === "a14") out.destinations.push(d); });
    return out;
  }
  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const st = Object.assign(blank(), JSON.parse(raw));
        st.income = normalizeIncome(st.income);
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
  const ALLOC_GROUPS = ["Bank · BBVA", "TRF cards", "Cash", "Payments", "Operating costs", "Savings"];
  const ALLOC_NOTE = {
    "Bank · BBVA": "Salaries and bonuses. Dividends from Podemos Progresar also arrive here via Loggia (tracked in Income).",
    "TRF cards": "Day-to-day spending that is not tax deductible.",
    "Payments": "Team and service providers.",
    "Operating costs": "Costs of running the structure.",
    "Savings": "Money moved straight to your Saldo balance.",
  };
  // Where an expense was paid from. "budget" maps each source to the allocation lines that fund it.
  const SOURCES = [
    { id: "bbva", name: "BBVA", groups: ["Bank · BBVA"] },
    { id: "trfcs", name: "TRF · CS", lines: ["a5"] },
    { id: "trfrv", name: "TRF · RV", lines: ["a6"] },
    { id: "cash", name: "Cash", groups: ["Cash"] },
    { id: "loggia", name: "Loggia", groups: ["Payments", "Operating costs"] },
    { id: "saldo", name: "Saldo" },
    { id: "other", name: "Other" },
  ];
  const PLACES = [
    { id: "loggia", name: "Loggia", hint: "Cash held in the holding company." },
    { id: "bbva", name: "BBVA", hint: "Available balance in your BBVA account." },
    { id: "patrimonial", name: "BBVA Patrimonial", hint: "Short-term liquidity funds, about 6.5% a year. Invested, but can be withdrawn quickly.", tag: "invested · 6.5%" },
    { id: "saldo", name: "Saldo", hint: "Your running Saldo balance (Quantamex ledger)." },
    { id: "loans", name: "Loans out", hint: "Money lent that will be paid back. Still yours, just not available.", locked: true },
    { id: "trfcs", name: "TRF · CS", hint: "Card for daily expenses. Enter the card balance; until then it is estimated.", spend: "trfcs" },
    { id: "trfrv", name: "TRF · RV", hint: "Regina's card. Enter the card balance; until then it is estimated.", spend: "trfrv" },
    { id: "cash", name: "Cash", hint: "Cash on hand. Enter it; until then it is estimated.", spend: "cash" },
  ];
  // Balance of a place: what was entered, or for cards and cash an estimate (sent this month − logged spending).
  function placeValue(k, pl) {
    const r = ((S.income.savings || {})[k] || {})[pl.id] || {};
    if (+r.left) return { v: +r.left, est: false, note: r.note || "" };
    if (pl.spend) { const v = (allocatedBy(k).sources[pl.spend] || 0) - (monthSpend(k).sources[pl.spend] || 0); return { v: Math.max(0, v), est: true, note: "" }; }
    return { v: 0, est: false, note: r.note || "" };
  }
  const CAT_SUGGEST = ["Household", "Food & dining", "Family", "Health", "Transport", "Travel", "Shopping", "Team", "Services", "Taxes", "Interest & fees", "Giving", "Other"];
  const expMonth = (t) => t.month || ym(t.date);
  const sourceLines = (src) => S.income.destinations.filter((d) => (src.groups || []).includes(d.group) || (src.lines || []).includes(d.id));
  function monthSpend(k) {
    const list = S.transactions.filter((t) => t.kind === "expense" && expMonth(t) === k);
    const by = { total: 0, cats: {}, sources: {}, has: list.length > 0, list };
    list.forEach((t) => { const v = +t.amount || 0; by.total += v; const c = t.category || "Uncategorized"; by.cats[c] = (by.cats[c] || 0) + v; const f = t.from || "other"; by.sources[f] = (by.sources[f] || 0) + v; });
    return by;
  }
  // Money sent to cards, cash and payments counts as spent. Logged expenses from those channels replace the estimate.
  const SPEND_CHANNELS = ["trfcs", "trfrv", "cash", "loggia"];
  function spendFull(k) {
    const sp = monthSpend(k), al = allocatedBy(k);
    const cats = Object.assign({}, sp.cats), pending = [];
    SPEND_CHANNELS.forEach((id) => {
      const src = SOURCES.find((x) => x.id === id); let gap = (al.sources[id] || 0) - (sp.sources[id] || 0);
      if (gap <= 0) return;
      if (id === "loggia") {
        // payments and operating costs: the line itself is the expense
        sourceLines(src).forEach((d) => { const v = +al.lines[d.id] || 0; if (v && gap > 0) { const use = Math.min(v, gap); cats[d.name] = (cats[d.name] || 0) + use; pending.push({ name: d.name, v: use, kind: "payment" }); gap -= use; } });
      } else { const nm = `${src.name} (no detail yet)`; cats[nm] = (cats[nm] || 0) + gap; pending.push({ name: nm, v: gap, kind: "card" }); }
    });
    const total = sum(Object.values(cats));
    return { total, cats, pending, logged: sp.total, list: sp.list, sources: sp.sources };
  }
  function allocatedBy(k) {
    const a = (S.income.allocations || {})[k] || {};
    const by = { total: 0, groups: {}, lines: a, sources: {} };
    S.income.destinations.forEach((d) => { const v = +a[d.id] || 0; by.groups[d.group] = (by.groups[d.group] || 0) + v; by.total += v; });
    SOURCES.forEach((src) => (by.sources[src.id] = sum(sourceLines(src), (d) => +a[d.id] || 0)));
    return by;
  }
  function sourceBudget(src) { return sum(sourceLines(src), (d) => +d.budget || 0); }
  // What should be left in each place, from income, money sent and money spent.
  function expectedLeft(k) {
    const inc = incomeTotal(k).total, al = allocatedBy(k), sp = monthSpend(k).sources;
    const left = (id) => (al.sources[id] || 0) - (sp[id] || 0);
    return {
      loggia: inc - al.total + left("loggia"),
      bbva: left("bbva"),
      saldo: left("trfcs") + left("trfrv") + left("cash") - (sp.saldo || 0),
    };
  }
  function savingsOf(k) {
    const sv = ((S.income.savings || {})[k]) || {};
    const out = { left: 0, reinvested: 0, places: {}, has: false };
    PLACES.forEach((pl) => { const r = sv[pl.id] || {}; out.places[pl.id] = r; out.left += +r.left || 0; out.reinvested += +r.reinvested || 0; if (r.left || r.reinvested) out.has = true; });
    return out;
  }
  function budgetBy() {
    const by = { total: 0, groups: {} };
    S.income.destinations.forEach((d) => { by.groups[d.group] = (by.groups[d.group] || 0) + (+d.budget || 0); by.total += +d.budget || 0; });
    return by;
  }
  function monthFlows(key) {
    const tx = S.transactions.filter((t) => ym(t.date) === key);
    // The Income module is the source of truth for any month it has entries for.
    const inc = incomeTotal(key);
    const income = inc.has ? inc.total : sum(tx.filter((t) => t.kind === "income"), (t) => +t.amount);
    const expense = monthSpend(key).total;
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
    if (!lastReview || monthsBetween(lastReview.date, today()) >= 1) out.push(["", `No monthly review logged for ${monthLabel(prev)} yet. The Journal has a template that pre-fills your numbers.`]);
    return out;
  }

  // ---------- views ----------
  const views = {};

  views.dashboard = () => {
    const k = incomeMonthSafe(), I = S.income;
    const inc = incomeTotal(k), al = allocatedBy(k), sp = spendFull(k), goal = +I.goal || 0;
    // 1. where the money sits: Bank = BBVA account + Patrimonial; Saldo = available + loans it funded
    const pv = (id) => placeValue(k, PLACES.find((p) => p.id === id));
    const bbva = pv("bbva").v, patri = pv("patrimonial").v, saldoAv = pv("saldo").v, loans = pv("loans").v, loggia = pv("loggia").v;
    const est = ["trfcs", "trfrv", "cash"].map((id) => ({ id, name: PLACES.find((p) => p.id === id).name, ...pv(id) }));
    const total = bbva + patri + saldoAv + loans + loggia + sum(est.filter((x) => !x.est), (x) => x.v);
    const estimated = sum(est.filter((x) => x.est), (x) => x.v);
    const available = total - loans;
    const Y = I.yearEnd || {};
    const tileHtml = (name, v, hint, tilde) => `<div class="place"><div class="label">${esc(name)}</div><div class="pv">${tilde && v ? "~" : ""}${esc(money(v))}</div><div class="hint">${hint}</div></div>`;
    const placeTiles = tileHtml("Bank · BBVA", bbva + patri, `Available ${esc(money(bbva, true))} · Patrimonial ${esc(money(patri, true))} (6.5%)`)
      + tileHtml("Saldo", saldoAv + loans, `Available ${esc(money(saldoAv, true))}${loans ? ` · Loans out ${esc(money(loans, true))}` : ""}`)
      + est.map((x) => tileHtml(x.name, x.v, x.est ? (x.v ? "estimate · no balance yet" : "no balance yet") : "balance entered", x.est)).join("")
      + (loggia ? tileHtml("Loggia", loggia, "holding company") : "");
    // 2. income
    const groups = GROUPS.filter((g) => inc.groups[g]).map((g) => `<div class="kv"><span><i class="dot" style="background:${GROUP_COLOR[g]}"></i>${esc(g)}</span><b>${esc(money(inc.groups[g]))}</b></div>`).join("");
    // 3. expenses: top categories
    const pend = new Set(sp.pending.filter((x) => x.kind === "card").map((x) => x.name));
    const cats = Object.entries(sp.cats).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 5), rest = sum(cats.slice(5), (c) => c[1]);
    const catRows = top.map(([c, v]) => `<div class="kv"><span class="${pend.has(c) ? "muted" : ""}">${esc(c)}</span><b>${esc(money(v))}</b></div>`).join("")
      + (rest ? `<div class="kv"><span class="muted">${cats.length - 5} more</span><b>${esc(money(rest))}</b></div>` : "");
    // 4. allocation
    const AC = { "Bank · BBVA": "var(--s1)", "TRF cards": "var(--s2)", "Cash": "var(--s4)", "Payments": "var(--s5)", "Operating costs": "#6250d6", "Savings": "var(--s3)" };
    const allocRows = Object.keys(al.groups).filter((g) => al.groups[g] > 0).sort((a, b) => al.groups[b] - al.groups[a]);
    const unalloc = inc.total - al.total;
    const allocList = allocRows.map((g) => `<div class="kv"><span><i class="dot" style="background:${AC[g] || "var(--s1)"}"></i>${esc(g === "Savings" ? "To Saldo" : g)}</span><b>${esc(money(al.groups[g]))}</b></div>`).join("")
      + (Math.abs(unalloc) > 1 ? `<div class="kv"><span><i class="dot" style="background:var(--grid)"></i>Not allocated yet</span><b class="${unalloc < 0 ? "neg" : ""}">${esc(money(unalloc))}</b></div>` : "");
    const box = (title, big, sub, body, link) => `<div class="card span-4 sum-box"><div class="card-head"><h2>${title}</h2>${link}</div><div class="big">${big}</div><div class="hint">${sub}</div>${body}</div>`;
    return `
      <div class="dash-head"><h1>Dashboard</h1>
        <div class="month-nav"><button data-dshift="-1" aria-label="Previous month">‹</button><input type="month" id="dashMonth" value="${k}"><button data-dshift="1" aria-label="Next month">›</button></div></div>
      <div class="grid">
        <div class="card span-12">
          <div class="card-head"><h2>Where your money is</h2><a class="hint" href="#savings">Update balances ›</a></div>
          <div class="places">${placeTiles}</div>
          <div class="totals">
            <div><div class="label">Total you have</div><div class="big">${esc(money(total))}</div>${estimated ? `<div class="hint">+ ~${esc(money(estimated))} on cards and cash (estimate)</div>` : ""}</div>
            <div><div class="label">Available</div><div class="tv">${esc(money(available))}</div><div class="hint">Bank + Saldo, without loans</div></div>
            <div><div class="label">Loans coming in</div><div class="tv">${esc(money(loans))}</div><div class="hint">Lent from Saldo, to be repaid</div></div>
            ${Y.low ? `<div><div class="label">Year-end target</div><div class="tv ${total >= Y.low ? "pos" : ""}">${esc(money(Y.low, true))}–${esc(money(Y.high, true))}</div><div class="hint">${total >= Y.low ? `Reached ${esc(money(Y.low, true))} · ${esc(money(Math.max(0, Y.high - total)))} to ${esc(money(Y.high, true))}` : `${esc(money(Y.low - total))} to go`}</div></div>` : ""}
          </div>
        </div>
        ${box("Income", esc(money(inc.total)), `${pct(goal ? inc.total / goal : NaN)} of the ${esc(money(goal, true))} goal · interest ${pct(I.interestGoal ? (inc.groups["Interests"] || 0) / I.interestGoal : NaN)} of ${esc(money(I.interestGoal || 0, true))}`,
          `<div class="mini-bar"><div style="width:${goal ? Math.min(100, (inc.total / goal) * 100) : 0}%"></div></div>${groups}`, '<a class="hint" href="#income">Details ›</a>')}
        ${box("Expenses", esc(money(sp.total)), `${pct(inc.total ? sp.total / inc.total : NaN)} of income${sp.pending.some((x) => x.kind === "card") ? " · cards counted as spent until statements" : ""}`,
          catRows || '<p class="empty">No expenses yet.</p>', '<a class="hint" href="#expenses">Details ›</a>')}
        ${box("Allocation", esc(money(al.total)), "Where the income was sent", allocList || '<p class="empty">Nothing allocated yet.</p>', '<a class="hint" href="#allocation">Details ›</a>')}
        ${planCard(k)}
        <details class="card span-12 fold"><summary><h2>Monthly checklist</h2></summary>${checklist(k)}</details>
      </div>`;
  };

  // January plan: money sent to CH plus minimum balances by the plan date.
  function planCard(k) {
    const P = S.income.plan; if (!P || !P.ch) return "";
    const pv = (id) => placeValue(k, PLACES.find((p) => p.id === id));
    const bbva = pv("bbva").v, patri = pv("patrimonial").v, saldo = pv("saldo").v, loans = pv("loans").v, trf = pv("trfcs");
    const have = bbva + patri + saldo + loans + (trf.est ? 0 : trf.v);
    const needed = P.ch + P.saldo + P.trfcs + P.bbva;
    const gap = Math.max(0, needed - have);
    const cur = lastMonths(1)[0], endK = P.date.slice(0, 7);
    let months = 0; for (let m = shiftMonth(cur, 1); m <= endK; m = shiftMonth(m, 1)) months++;
    const per = months ? gap / months : gap;
    const left = incomeTotal(cur).total - spendFull(cur).total;
    const planK = endK, inPlan = k === planK;
    const pSave = inPlan ? incomeTotal(planK).total - spendFull(planK).total : NaN;
    const row = (label, now, target, note, est) => {
      const ok = now >= target, r = target ? Math.min(1, now / target) : 0;
      return `<div class="plan-row"><div class="bva-top"><span>${label}</span><span><b>${est ? "~" : ""}${esc(money(now))}</b> <span class="muted">of ${esc(money(target))}</span> <b class="status ${ok ? "ok" : "behind"}">${ok ? "✓" : "○"}</b></span></div>
        <div class="track"><div class="fill" style="width:${r * 100}%;background:${ok ? "var(--good)" : "var(--s1)"}"></div></div>${note ? `<div class="hint">${note}</div>` : ""}</div>`;
    };
    return `<div class="card span-12 dash-sec"><div class="card-head"><h2>January goals · by ${esc(P.date)}</h2><span class="hint">Edit in Savings</span></div>
      <div class="plan-grid">
        <div>
          ${row("Send to Switzerland", Math.max(0, have - P.saldo - P.trfcs - P.bbva), P.ch, "What is left for CH after keeping the minimum balances below. Includes the Bitline loans.")}
          ${row(`Save in ${esc(monthLabel(planK))}`, isFinite(pSave) ? Math.max(0, pSave) : 0, P.monthSavings, inPlan ? "Income minus expenses this month" : `Starts in ${esc(monthLabel(planK))}`)}
        </div>
        <div>
          ${row("Saldo at least", saldo, P.saldo, "")}
          ${row("TRF · CS", trf.v, P.trfcs, trf.est ? "Estimate until you enter the card balance" : "", trf.est)}
          ${row("BBVA after expenses", bbva, P.bbva, "Account •4332, without Patrimonial")}
        </div>
      </div>
      <div class="totals">
        <div><div class="label">Needed by ${esc(P.date)}</div><div class="tv">${esc(money(needed))}</div><div class="hint">CH ${esc(money(P.ch, true))} + Saldo + TRF + BBVA</div></div>
        <div><div class="label">Have now</div><div class="tv">${esc(money(have))}</div><div class="hint">incl. ${esc(money(loans, true))} Bitline owes you</div></div>
        <div><div class="label">Gap</div><div class="tv ${gap ? "neg" : "pos"}">${esc(money(gap))}</div><div class="hint">${months ? `${esc(money(per))} to keep per month (${months} months)` : ""}</div></div>
        <div><div class="label">Kept in ${esc(monthLabel(cur))}</div><div class="tv">${esc(money(left))}</div><div class="hint">Income − expenses so far</div></div>
      </div></div>`;
  }

  // Liquid money by the target date: balances now + what each remaining month should leave.
  function yearEndCard(k) {
    const Y = S.income.yearEnd || {}; if (!Y.low) return '<p class="empty">Set a target in Savings.</p>';
    const sv = savingsOf(k), have = sv.left, cur = lastMonths(1)[0];
    const end = Y.date || (k.slice(0, 4) + "-12-31"), endK = end.slice(0, 7);
    let monthsAfter = 0; for (let m = shiftMonth(cur, 1); m <= endK; m = shiftMonth(m, 1)) monthsAfter++;
    const done = lastMonths(6).filter((m) => m <= cur && incomeTotal(m).has);
    const avgLeft = done.length ? sum(done, (m) => incomeTotal(m).total - spendFull(m).total) / done.length : 0;
    const proj = have + monthsAfter * avgLeft;
    const unalloc = Math.max(0, incomeTotal(cur).total - allocatedBy(cur).total);
    const gapLow = Math.max(0, Y.low - have), gapHigh = Math.max(0, Y.high - have);
    const need = monthsAfter ? gapLow / monthsAfter : gapLow;
    const r = Math.min(1, have / Y.high), rl = Math.min(1, Y.low / Y.high), rp = Math.min(1, proj / Y.high);
    return `<div class="hint">${esc(money(Y.low, true))}–${esc(money(Y.high, true))} liquid by ${esc(end)} · ${esc(Y.purpose || "")} · <a href="#savings">Edit ›</a></div>
      <div class="ye-bar" data-tip="Now ${esc(money(have))} · projected ${esc(money(proj))}">
        <div class="ye-proj" style="width:${rp * 100}%"></div><div class="ye-now" style="width:${r * 100}%"></div>
        <i style="left:${rl * 100}%"></i><span style="left:${rl * 100}%">${esc(money(Y.low, true))}</span><span style="left:100%;transform:translateX(-100%)">${esc(money(Y.high, true))}</span>
      </div>
      <div class="legend" style="margin-top:22px"><span><i style="background:var(--s3)"></i>Have now</span><span><i style="background:var(--accent-soft)"></i>Projected</span></div>
      <div class="kv"><span>Have now (all places, incl. loan to be repaid)</span><b>${esc(money(have))}</b></div>
      <div class="kv"><span>Gap to ${esc(money(Y.low, true))} / ${esc(money(Y.high, true))}</span><b>${esc(money(gapLow))} / ${esc(money(gapHigh))}</b></div>
      <div class="kv"><span>Needed per month (${monthsAfter} month${monthsAfter === 1 ? "" : "s"} left after ${esc(monthLabel(cur))})</span><b>${esc(money(need))}</b></div>
      <div class="kv"><span>Left to invest per month so far</span><b>${esc(money(avgLeft))}</b></div>
      <div class="kv"><span>Projected at that pace</span><b class="${proj >= Y.low ? "pos" : "neg"}">${esc(money(proj))}</b></div>
      ${unalloc ? `<div class="kv"><span>Income not yet placed in any balance</span><b class="muted">+${esc(money(unalloc))}</b></div>` : ""}`;
  }

  // What to upload each month and whether it has arrived. Income for a month is reported early the next month.
  function checklist(k) {
    const I = S.income, e = I.entries[k] || {}, [y, m] = k.split("-").map(Number);
    const firstMon = (() => { const d = new Date(y, m - 1, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d.getDate(); })();
    const has = (ids) => ids.every((id) => +e[id]);
    const some = (ids) => ids.filter((id) => +e[id]).length;
    const saldo = (savingsOf(k).places.saldo || {});
    const bb = (savingsOf(k).places.bbva || {});
    const cardsLogged = monthSpend(k).list.some((t) => t.from === "trfcs" || t.from === "trfrv");
    const due = (day) => `${day} ${new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short" })}`;
    const rows = [
      [firstMon, due(firstMon) + " (1st Monday)", "Cash cows: Exitus, Optiserv, Calidris, TEU, Luel, Alakart, JNS", has(["st4"]) && some(["st4", "st5", "st6", "st8", "st10", "st11"]) >= 3],
      [5, due(5), "Interests: Aplazo / Troi (Inbursa) · Saldo Excel updated", +e.st2 > 0 && !/pending/i.test(saldo.note || "") && +saldo.left > 0],
      [10, due(10), "Cash cows: Human, Altavista", +e.st7 > 0 && +e.st9 > 0],
      [15, due(15), "Bank statements: BBVA and TRF cards (CS, RV)", +bb.left > 0 && !/estimate/i.test(bb.note || "") && cardsLogged],
      [99, "As they come", "Payment receipts (transfers, payroll, providers)", monthSpend(k).list.length > 0 || allocatedBy(k).total > 0],
    ].sort((a, b) => a[0] - b[0]);
    return `<div class="hint">For ${esc(monthLabel(k))}. Send each file in the Finance HQ conversation with Claude.</div>
      ${rows.map(([, when, what, ok]) => `<div class="kv check"><span><b class="status ${ok ? "ok" : ""}">${ok ? "✓" : "○"}</b> ${esc(what)}</span><span class="muted">${esc(when)}</span></div>`).join("")}`;
  }
  function bva(label, act, plan, word) {
    return `<div class="bva"><div class="bva-top"><span>${esc(label)}</span><span><b>${esc(money(act))}</b> <span class="muted">${plan ? `of ${esc(money(plan))} ${word || ""}` : "no budget"}</span></span></div>
      <div class="track"><div class="fill" style="width:${plan ? Math.min(100, (act / plan) * 100) : act ? 100 : 0}%;background:${plan && act > plan ? "var(--critical)" : "var(--s2)"}"></div></div></div>`;
  }

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
      <h1>Net worth</h1>
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
  views.journal = () => {
    const q = brainQuery.toLowerCase();
    const notes = S.notes
      .filter((n) => brainFilter === "All" || n.type === brainFilter)
      .filter((n) => !q || JSON.stringify(n).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
    return `
      <h1>Journal</h1>
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
    if (goal) g += `<line x1="${L}" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--ink)" stroke-dasharray="4 4" stroke-width="1"/><text x="${L + 6}" y="${y(goal) - 6}" text-anchor="start" style="fill:var(--ink)">Goal ${esc(money(goal, true))}/mo</text>`;
    const ig = +S.income.interestGoal || 0;
    if (ig) g += `<line x1="${L}" x2="${W}" y1="${y(ig)}" y2="${y(ig)}" stroke="var(--s1)" stroke-dasharray="2 4" stroke-width="1.5"/><text x="${L + 6}" y="${y(ig) - 6}" text-anchor="start" style="fill:var(--ink-2)">Interest goal ${esc(money(ig, true))}/mo</text>`;
    return `<div class="legend" style="flex-wrap:wrap">${GROUPS.map((gr) => `<span><i style="background:${GROUP_COLOR[gr]}"></i>${gr}</span>`).join("")}</div>
      <div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income by group against goal">${g}</svg></div>`;
  }

  function goalBar(label, v, goal, color) {
    if (!goal) return "";
    const r = Math.min(1, v / goal);
    return `<div class="goal-row">
      <div class="goal-row-top"><span>${esc(label)}</span><span><b>${esc(money(v))}</b> <span class="muted">of ${esc(money(goal))}</span></span></div>
      <div class="hero-bar" data-tip="${esc(money(v))} of ${esc(money(goal))} · gap ${esc(money(Math.max(0, goal - v)))}"><div style="width:${r * 100}%;background:${color}"></div><span style="${r > 0.25 ? "" : `left:calc(${r * 100}% + 8px);color:var(--ink)`}">${pct(v / goal)}</span></div>
      <div class="hint">Gap ${esc(money(Math.max(0, goal - v)))}</div></div>`;
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
      ["Interest vs goal", pct(I.interestGoal ? (cur.groups["Interests"] || 0) / I.interestGoal : NaN), `${money(cur.groups["Interests"] || 0)} of ${money(I.interestGoal || 0)}`, ""],
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

    return `
      <h1>Income</h1>
      <p class="sub">Every stream, every month, against a ${esc(money(goal))} monthly target. Grow the live ones, build new ones.</p>
      <div class="month-nav">
        <button data-mshift="-1" aria-label="Previous month">‹</button>
        <input type="month" id="incMonth" value="${k}">
        <button data-mshift="1" aria-label="Next month">›</button>
      </div>
      <div class="grid">
        ${tiles.map(([l, v, h, c]) => `<div class="card tile span-3"><div class="label">${l}</div><div class="value">${v}</div><div class="hint ${c}">${h}</div></div>`).join("")}
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
            <label class="f">Monthly interest goal<input name="interestGoal" inputmode="decimal" value="${I.interestGoal || ""}"></label>
            <label class="f">Reach it by<input type="date" name="goalDate" value="${esc(I.goalDate || "")}"></label>
            <button>Update goal</button>
          </form>
        </details>
      </div>`;
  };
  function incomeMonthSafe() {
    if (/^\d{4}-\d{2}$/.test(incMonth)) return incMonth;
    const cur = lastMonths(1)[0], prev = shiftMonth(cur, -1);
    return incomeTotal(cur).has || monthSpend(cur).has || !(incomeTotal(prev).has || monthSpend(prev).has) ? cur : prev;
  }
  const monthNav = (id) => `<div class="month-nav"><button data-mnav="-1" aria-label="Previous month">‹</button><input type="month" class="mnav-in" value="${incomeMonthSafe()}"><button data-mnav="1" aria-label="Next month">›</button></div>`;

  views.allocation = () => {
    const I = S.income, k = incomeMonthSafe(), inc = incomeTotal(k), spend = monthSpend(k), bud = budgetBy();
    const a = I.allocations[k] || {};
    const allocated = allocatedBy(k).total, left = inc.total - allocated;
    const groups = ALLOC_GROUPS.concat([...new Set(I.destinations.map((d) => d.group))].filter((g) => !ALLOC_GROUPS.includes(g)));
    const rows = groups.map((g) => {
      const list = I.destinations.filter((d) => d.group === g); if (!list.length) return "";
      return `<tbody>
        <tr class="grp-head"><th>${esc(g)}${ALLOC_NOTE[g] ? `<div class="row-note" style="font-weight:400">${esc(ALLOC_NOTE[g])}</div>` : ""}</th>
          <th class="num muted">${bud.groups[g] ? esc(money(bud.groups[g])) : ""}</th><th class="num" data-gsum="${esc(g)}">${esc(money(allocatedBy(k).groups[g] || 0))}</th></tr>
        ${list.map((d) => { const an = ((I.allocNotes || {})[k] || {})[d.id]; return `<tr><td>${esc(d.name)}${d.purpose ? `<div class="row-note">${esc(d.purpose)}</div>` : ""}${an ? `<div class="row-note">${esc(an)}</div>` : ""}</td>
          <td class="num muted">${d.budget ? esc(money(+d.budget)) : "–"}</td>
          <td class="num"><input class="amt-in" inputmode="decimal" data-act="${d.id}" value="${fmtInput(+a[d.id] || 0)}" placeholder="0"></td></tr>`; }).join("")}
      </tbody>`;
    }).join("");
    const planRows = I.destinations.map((d) => `<tr>
      <td><input data-pl-name="${d.id}" value="${esc(d.name)}"></td>
      <td><select data-pl-group="${d.id}">${groups.map((g) => `<option ${g === d.group ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></td>
      <td><input data-pl-purpose="${d.id}" value="${esc(d.purpose || "")}"></td>
      <td class="num"><input class="amt-in" inputmode="decimal" data-pl-budget="${d.id}" value="${fmtInput(+d.budget || 0)}" placeholder="0"></td>
      <td><button class="link" data-pl-del="${d.id}" aria-label="Remove">✕</button></td></tr>`).join("");
    return `
      <h1>Allocation</h1>
      <p class="sub">Where each month's income is sent and why. The plan is your monthly budget. Enter what was actually sent.</p>
      ${monthNav()}
      <div class="grid">
        <div class="card tile span-4"><div class="label">Income ${esc(monthLabel(k))}</div><div class="value">${esc(money(inc.total))}</div><div class="hint"><a href="#income">From Income ›</a></div></div>
        <div class="card tile span-4"><div class="label">Allocated</div><div class="value" id="alTotal">${esc(money(allocated))}</div><div class="hint">Plan ${esc(money(bud.total))} per month</div></div>
        <div class="card tile span-4"><div class="label">Not yet allocated</div><div class="value ${left < 0 ? "neg" : ""}" id="alLeft">${esc(money(left))}</div><div class="hint">Income not sent anywhere yet</div></div>
        <div class="card span-12"><div class="card-head"><h2>${esc(monthLabel(k))}</h2><span><button id="alCopy">Use plan amounts</button> <button class="primary" id="alSave">Save month</button></span></div>
          <div class="table-wrap"><table class="inc-table">
            <thead><tr><th>Line</th><th class="num">Plan</th><th class="num">Actual</th></tr></thead>
            ${rows}
            <tfoot><tr><th>Total</th><th class="num">${esc(money(bud.total))}</th><th class="num" id="alFoot">${esc(money(allocated))}</th></tr></tfoot>
          </table></div>
          <p class="saved-note" id="alDirty" hidden>Unsaved changes</p>
        </div>
        <details class="card span-12 fold"><summary><h2>Edit plan</h2></summary>
          <div class="table-wrap"><table class="plan-table">
            <thead><tr><th>Line</th><th>Group</th><th>Purpose</th><th class="num">Monthly plan</th><th></th></tr></thead>
            <tbody>${planRows}</tbody></table></div>
          <p><button class="primary" id="plSave">Save plan</button></p>
          <form class="row" id="plAdd">
            <label class="f">New line<input name="name" required placeholder="e.g. Red media"></label>
            <label class="f">Group<input name="group" list="plGroups" value="Payments" required><datalist id="plGroups">${groups.map((g) => `<option value="${esc(g)}">`).join("")}</datalist></label>
            <label class="f">Purpose<input name="purpose"></label>
            <label class="f">Monthly plan<input name="budget" inputmode="decimal"></label>
            <button>Add line</button>
          </form>
        </details>
      </div>`;
  };

  let alAbort = null;
  function wireAllocation() {
    if (alAbort) alAbort.abort(); alAbort = new AbortController();
    const sig = { signal: alAbort.signal }, I = S.income, k = incomeMonthSafe();
    let dirty = false;
    const inc = incomeTotal(k).total;
    const totalIn = () => sum([...document.querySelectorAll("[data-act]")], (el) => num(el.value));
    const refresh = () => { const t = totalIn(); $("#alTotal").textContent = money(t); $("#alFoot").textContent = money(t); $("#alLeft").textContent = money(inc - t); };
    const saveAct = () => { const a = {}; document.querySelectorAll("[data-act]").forEach((el) => { const v = num(el.value); if (v) a[el.dataset.act] = v; }); I.allocations[k] = a; dirty = false; };
    $("#view").addEventListener("input", (e) => { if (e.target.dataset.act) { dirty = true; $("#alDirty").hidden = false; refresh(); } }, sig);
    $("#alSave").onclick = () => { saveAct(); commit(); };
    $("#alCopy").onclick = () => {
      document.querySelectorAll("[data-act]").forEach((el) => { const d = I.destinations.find((x) => x.id === el.dataset.act); if (!num(el.value) && d && +d.budget) el.value = fmtInput(+d.budget); });
      dirty = true; $("#alDirty").hidden = false; refresh();
    };
    $("#plSave").onclick = () => {
      if (dirty) saveAct();
      I.destinations.forEach((d) => {
        const v = (attr) => { const el = $(`[data-pl-${attr}="${d.id}"]`); return el ? el.value : null; };
        d.name = v("name") || d.name; d.group = v("group") || d.group; d.purpose = v("purpose") || ""; d.budget = num(v("budget"));
      });
      commit();
    };
    $("#plAdd").onsubmit = (e) => {
      e.preventDefault(); if (dirty) saveAct(); const x = formData(e.target);
      I.destinations.push({ id: "a" + uid(), name: x.name, group: x.group.trim() || "Payments", purpose: x.purpose, budget: num(x.budget) });
      commit();
    };
    $("#view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pl-del]"); if (!b) return;
      if (confirm("Remove this line? Amounts already logged for it stop counting.")) { if (dirty) saveAct(); I.destinations = I.destinations.filter((d) => d.id !== b.dataset.plDel); commit(); }
    }, sig);
    window.onbeforeunload = () => { if (dirty) { saveAct(); save(); } };
  }

  views.expenses = () => {
    const k = incomeMonthSafe(), spend = monthSpend(k), bud = budgetBy(), al = allocatedBy(k);
    const cats = [...new Set(S.transactions.filter((t) => t.kind === "expense").map((t) => t.category).filter(Boolean).concat(CAT_SUGGEST))];
    const catRows = Object.entries(spend.cats).map(([c, v]) => ({ k: c, v, c: "var(--s2)" })).sort((a, b) => b.v - a.v);
    const srcRows = SOURCES.filter((src) => (spend.sources[src.id] || 0) || sourceBudget(src) || al.sources[src.id]).map((src) => bva(src.name, spend.sources[src.id] || 0, al.sources[src.id] || sourceBudget(src), al.sources[src.id] ? "sent" : "planned")).join("");
    const srcName = (id) => (SOURCES.find((x) => x.id === id) || { name: id || "Other" }).name;
    const list = [...spend.list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const defDate = today().slice(0, 7) === k ? today() : k + "-01";
    return `
      <h1>Expenses</h1>
      <p class="sub">Log each expense as it arrives: where it was paid, which account paid it, and a category. Categories grow as you add them.</p>
      ${monthNav()}
      <div class="grid">
        <div class="card tile span-4"><div class="label">Spent ${esc(monthLabel(k))}</div><div class="value">${esc(money(spend.total))}</div><div class="hint">${list.length} expenses logged</div></div>
        <div class="card tile span-4"><div class="label">Monthly plan</div><div class="value">${esc(money(bud.total))}</div><div class="hint">${pct(bud.total ? spend.total / bud.total : NaN)} used · <a href="#allocation">Plan ›</a></div></div>
        <div class="card tile span-4"><div class="label">Biggest category</div><div class="value" style="font-size:20px">${catRows[0] ? esc(catRows[0].k) : "–"}</div><div class="hint">${catRows[0] ? esc(money(catRows[0].v)) : "Nothing logged yet"}</div></div>
        <div class="card span-12"><h2>Add expense · counts for ${esc(monthLabel(k))}</h2>
          <form class="row" id="exForm">
            <label class="f">Date<input type="date" name="date" value="${defDate}" required></label>
            <label class="f" style="flex:1;min-width:180px">Paid to / what<input name="desc" placeholder="e.g. Liverpool, school, dinner" required></label>
            <label class="f">Amount<input name="amount" inputmode="decimal" required placeholder="0"></label>
            <label class="f">Paid from<select name="from">${SOURCES.map((src) => `<option value="${src.id}">${esc(src.name)}</option>`).join("")}</select></label>
            <label class="f">Category<input name="category" list="catList" placeholder="Pick or type new" required><datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
            <button class="primary">Add</button>
          </form>
        </div>
        <div class="card span-6"><h2>By category</h2>${catRows.length ? barList(catRows, spend.total) : '<p class="empty">No expenses yet.</p>'}</div>
        <div class="card span-6"><h2>By account: spent vs sent</h2>${srcRows || '<p class="empty">No budgets yet.</p>'}</div>
        <div class="card span-12"><h2>${esc(monthLabel(k))} expenses</h2>
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Paid to</th><th>Category</th><th>From</th><th class="num">Amount</th><th></th></tr></thead>
            <tbody>${list.map((t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.desc)}${t.note ? `<div class="row-note">${esc(t.note)}</div>` : ""}</td><td>${esc(t.category)}</td><td>${esc(srcName(t.from))}</td>
              <td class="num">${esc(money(+t.amount))}</td><td><button class="link" data-del-tx="${t.id}" aria-label="Delete">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nothing logged for ${esc(monthLabel(k))} yet.</td></tr>`}</tbody>
          </table></div>
          <details><summary>Import CSV (date, paid to, amount, category, from)</summary>
            <p class="sub">One expense per row. Header row optional. Amounts can be negative or positive. Rows count for ${esc(monthLabel(k))}.</p>
            <input type="file" id="csvIn" accept=".csv,text/csv">
          </details>
        </div>
      </div>`;
  };

  views.savings = () => {
    const k = incomeMonthSafe(), prevK = shiftMonth(k, -1), inc = incomeTotal(k).total, spend = spendFull(k).total, left = inc - spend;
    const sv = savingsOf(k), pv = savingsOf(prevK);
    const rows = PLACES.map((pl) => { const r = sv.places[pl.id] || {}, pr = pv.places[pl.id] || {}; const ch = pv.has ? (+r.left || 0) - (+pr.left || 0) : NaN; return `<tr>
      <td>${esc(pl.name)}<div class="row-note">${esc(pl.hint)}</div>${r.note ? `<div class="row-note">${esc(r.note)}</div>` : ""}</td>
      <td class="num muted prevcol">${pv.has ? esc(money(+pr.left || 0)) : "–"}</td>
      <td class="num"><input class="amt-in" inputmode="decimal" data-sv-left="${pl.id}" value="${fmtInput(+r.left || 0)}" placeholder="0"></td>
      <td class="num ${isFinite(ch) ? (ch >= 0 ? "pos" : "neg") : ""}">${isFinite(ch) ? (ch >= 0 ? "+" : "") + esc(money(ch)) : ""}</td>
      <td class="num"><input class="amt-in" inputmode="decimal" data-sv-re="${pl.id}" value="${fmtInput(+r.reinvested || 0)}" placeholder="0"></td>
      <td><input data-sv-note="${pl.id}" value="${esc(r.note || "")}" placeholder="Note"></td></tr>`; }).join("");
    const saved = pv.has ? sv.left - pv.left + sv.reinvested : NaN;
    const gap = left - saved;
    return `
      <h1>Savings</h1>
      <p class="sub">What is left after all expenses, where it sits (Loggia, BBVA, Saldo) and how much of it gets reinvested. Enter each place's balance at month end.</p>
      ${monthNav()}
      <div class="grid">
        <div class="card tile span-3"><div class="label">Left after expenses</div><div class="value ${left < 0 ? "neg" : ""}">${esc(money(left))}</div><div class="hint">${esc(money(inc))} income − ${esc(money(spend))} expenses and payments</div></div>
        <div class="card tile span-3"><div class="label">Total balance</div><div class="value" id="svLeft0">${esc(money(sv.left))}</div><div class="hint">Loggia + BBVA + Saldo at month end</div></div>
        <div class="card tile span-3"><div class="label">Reinvested</div><div class="value" id="svRe">${esc(money(sv.reinvested))}</div><div class="hint">${pct(left > 0 ? sv.reinvested / left : NaN)} of what was left</div></div>
        <div class="card tile span-3"><div class="label">Saved this month</div><div class="value">${isFinite(saved) ? esc(money(saved)) : "–"}</div><div class="hint">${isFinite(saved) ? "Balance change + reinvested" : `Needs ${esc(monthLabel(prevK))} balances`}</div></div>
        <div class="card span-12"><div class="card-head"><h2>${esc(monthLabel(k))} · balances and reinvestment</h2><span><button class="primary" id="svSave">Save month</button></span></div>
          <div class="table-wrap"><table class="inc-table sv-table">
            <thead><tr><th>Place</th><th class="num prevcol">${esc(monthLabel(prevK))}</th><th class="num">Balance</th><th class="num">Change</th><th class="num">Reinvested</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><th>Total</th><th class="num prevcol">${pv.has ? esc(money(pv.left)) : "–"}</th><th class="num" id="svLeft">${esc(money(sv.left))}</th><th class="num">${pv.has ? esc(money(sv.left - pv.left)) : ""}</th><th class="num" id="svRe2">${esc(money(sv.reinvested))}</th><th></th></tr></tfoot>
          </table></div>
          ${isFinite(saved) && Math.abs(gap) > 1000 ? `<p class="sub" style="margin:10px 0 0"><b>${esc(money(Math.abs(gap)))} ${gap > 0 ? "of what was left after expenses does not show up in the balances or reinvestment. Likely an expense not logged yet." : "more saved than income minus expenses. Likely income not logged yet."}</b></p>` : ""}
          <p class="saved-note" id="svDirty" hidden>Unsaved changes</p>
        </div>
        <details class="card span-12 fold"><summary><h2>Year-end target</h2></summary>
          <form class="row" id="yeForm">
            <label class="f">Low<input name="low" inputmode="decimal" value="${fmtInput((S.income.yearEnd || {}).low || 0)}"></label>
            <label class="f">High<input name="high" inputmode="decimal" value="${fmtInput((S.income.yearEnd || {}).high || 0)}"></label>
            <label class="f">By<input type="date" name="date" value="${esc((S.income.yearEnd || {}).date || "")}"></label>
            <label class="f" style="flex:1">Purpose<input name="purpose" value="${esc((S.income.yearEnd || {}).purpose || "")}"></label>
            <button>Save target</button>
          </form>
        </details>
      </div>`;
  };

  let svAbort = null;
  function wireSavings() {
    if (svAbort) svAbort.abort(); svAbort = new AbortController();
    const sig = { signal: svAbort.signal }, I = S.income, k = incomeMonthSafe();
    let dirty = false;
    const tot = (attr) => sum([...document.querySelectorAll(`[data-sv-${attr}]`)], (el) => num(el.value));
    const refresh = () => { $("#svLeft").textContent = money(tot("left")); $("#svLeft0").textContent = money(tot("left")); $("#svRe2").textContent = money(tot("re")); $("#svRe").textContent = money(tot("re")); };
    const saveSv = () => {
      I.savings = I.savings || {}; const m = {};
      PLACES.forEach((pl) => { m[pl.id] = { left: num($(`[data-sv-left="${pl.id}"]`).value), reinvested: num($(`[data-sv-re="${pl.id}"]`).value), note: $(`[data-sv-note="${pl.id}"]`).value }; });
      I.savings[k] = m; dirty = false;
    };
    $("#view").addEventListener("input", (e) => { const d = e.target.dataset; if (d.svLeft || d.svRe || d.svNote) { dirty = true; $("#svDirty").hidden = false; refresh(); } }, sig);
    $("#svSave").onclick = () => { saveSv(); commit(); };
    $("#yeForm").onsubmit = (e) => { e.preventDefault(); if (dirty) saveSv(); const x = formData(e.target); I.yearEnd = { low: num(x.low), high: num(x.high) || num(x.low), date: x.date, purpose: x.purpose }; commit(); };
    window.onbeforeunload = () => { if (dirty) { saveSv(); save(); } };
  }

  function proposalsHtml() {
    if (!proposals) return "";
    if (proposals.error) return `<div class="insight warn">${esc(proposals.error)}</div>`;
    if (!proposals.items.length) return `<p class="empty">No amounts found in those images.</p>`;
    const opts = (sel) => `<option value="">Skip</option>
      <optgroup label="Income stream">${S.income.streams.filter((s) => s.status !== "Archived").map((s) => `<option value="s:${s.id}" ${sel === "s:" + s.id ? "selected" : ""}>${esc(s.group)} · ${esc(s.name)}</option>`).join("")}</optgroup>
      <optgroup label="Allocation">${S.income.destinations.map((d) => `<option value="d:${d.id}" ${sel === "d:" + d.id ? "selected" : ""}>${esc(d.group)} · ${esc(d.name)}</option>`).join("")}</optgroup>`;
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
      const dests = S.income.destinations.map((d) => `${d.id}: ${d.group} / ${d.name}${d.purpose ? " (" + d.purpose + ")" : ""}`).join("\n");
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
    let dirtyInc = false;
    $("#incMonth").onchange = (e) => { if (e.target.value) { incMonth = e.target.value; render(); } };
    const totalIn = () => sum([...document.querySelectorAll("[data-stream]")], (el) => num(el.value));
    $("#view").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.stream) {
        dirtyInc = true; $("#incDirty").hidden = false;
        $("#incTotal").textContent = money(totalIn());
      }
    }, sig);
    const saveInc = () => {
      const e = {}; document.querySelectorAll("[data-stream]").forEach((el) => { const v = num(el.value); if (v) e[el.dataset.stream] = v; });
      I.entries[k] = e; dirtyInc = false;
    };
    // keep unsaved typing when another action re-renders
    const keep = () => { if (dirtyInc) saveInc(); };
    $("#saveInc").onclick = () => { saveInc(); commit(); };
    $("#copyPrev").onclick = () => {
      const p = I.entries[shiftMonth(k, -1)] || {};
      document.querySelectorAll("[data-stream]").forEach((el) => { if (!num(el.value) && p[el.dataset.stream]) el.value = fmtInput(p[el.dataset.stream]); });
      dirtyInc = true; $("#incDirty").hidden = false; $("#incTotal").textContent = money(totalIn());
    };
    $("#view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mshift],[data-archive],[data-del-dest],#propApply,#propClear,#propMonth"); if (!b) return;
      if (b.dataset.mshift) { keep(); save(); incMonth = shiftMonth(k, +b.dataset.mshift); render(); }
      if (b.dataset.archive && confirm("Archive this stream? Its history is kept.")) { keep(); I.streams.find((s) => s.id === b.dataset.archive).status = "Archived"; commit(); }
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
    $("#goalForm").onsubmit = (e) => { e.preventDefault(); keep(); const x = formData(e.target); I.goal = num(x.goal) || I.goal; I.interestGoal = num(x.interestGoal); I.goalDate = x.goalDate; commit(); };
    window.onbeforeunload = () => { if (dirtyInc) { keep(); save(); } };
    mountPhotoBox();
  }

  // ---------- render + events ----------
  function render() {
    let route = (location.hash || "#dashboard").slice(1);
    route = { flows: "expenses", brain: "journal", wealth: "savings" }[route] || route;
    if (!views[route]) route = "dashboard";
    const fn = views[route];
    document.querySelectorAll("#nav a, #nav2 a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + route));
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
    if (alAbort && route !== "allocation") { alAbort.abort(); alAbort = null; window.onbeforeunload = null; }
    if (svAbort && route !== "savings") { svAbort.abort(); svAbort = null; window.onbeforeunload = null; }
    const v = $("#view");
    // shared month navigation (dashboard, allocation, expenses)
    v.querySelectorAll("[data-mnav],[data-dshift]").forEach((b) => b.addEventListener("click", () => { incMonth = shiftMonth(incomeMonthSafe(), +(b.dataset.mnav || b.dataset.dshift)); render(); }));
    v.querySelectorAll(".mnav-in,#dashMonth").forEach((el) => (el.onchange = () => { if (el.value) { incMonth = el.value; render(); } }));
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
    if (route === "allocation") wireAllocation();
    if (route === "savings") wireSavings();
    if (route === "expenses") {
      $("#exForm").onsubmit = (e) => {
        e.preventDefault(); const x = formData(e.target); const amount = num(x.amount); if (!amount) return;
        S.transactions.push({ id: uid(), kind: "expense", date: x.date, month: incomeMonthSafe(), desc: x.desc.trim(), amount, from: x.from, category: x.category.trim() });
        commit();
        const f = $("#exForm"); if (f) { f.from.value = x.from; f.date.value = x.date; f.desc.focus(); }
      };
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
      const [date, desc, amt, cat, from] = r; const a = parseFloat(String(amt).replace(/[^0-9.\-]/g, ""));
      if (!/^\d{4}-\d{2}-\d{2}/.test(date) || isNaN(a) || !a) return;
      const src = SOURCES.find((x) => x.name.toLowerCase() === String(from || "").toLowerCase() || x.id === String(from || "").toLowerCase());
      S.transactions.push({ id: uid(), kind: "expense", date: date.slice(0, 10), month: incomeMonthSafe(), desc, amount: Math.abs(a), category: cat || "Uncategorized", from: src ? src.id : "other" });
      n++;
    });
    commit(); alert(`Imported ${n} expenses.`);
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
    if (name === "income") S.income = normalizeIncome(d);
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
