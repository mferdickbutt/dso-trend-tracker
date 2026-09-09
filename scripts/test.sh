#!/usr/bin/env bash
# DSO trend tracker tests. Run from repo root or this file's directory.
# Prints one PASS/FAIL line per check, then: Summary: N passed, M failed
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $*"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $*"
  FAIL=$((FAIL + 1))
}

# --- unit: js/dso.js via Node ---
unit() {
  local name="$1"
  local code="$2"
  if node -e "
    const DSO = require('./js/dso.js');
    function assert(cond, msg) { if (!cond) { console.error(msg || 'assert failed'); process.exit(1); } }
    ${code}
  "; then
    pass "$name"
  else
    fail "$name"
  fi
}

unit "DSO formula AR/(revenue/days) = 45" '
  assert(DSO.computeDso(3000000, 2000000, 30) === 45);
  assert(DSO.FORMULA.indexOf("arEnding") !== -1);
'

unit "zero revenue returns null not NaN/Infinity" '
  const v = DSO.computeDso(1000, 0, 30);
  assert(v === null, "expected null, got " + v);
  assert(Number.isNaN(v) === false);
  assert(v !== Infinity && v !== -Infinity);
'

unit "empty series is safe (null best/worst, no NaN)" '
  const r = DSO.analyze({ dsoTargetDays: 45, months: [] });
  assert(Array.isArray(r.months) && r.months.length === 0);
  assert(r.best === null && r.worst === null);
  assert(r.latest === null);
'

unit "missing months array treated as empty" '
  const r = DSO.analyze({});
  assert(r.months.length === 0);
  assert(r.best === null && r.worst === null);
'

unit "null/non-finite inputs yield null DSO" '
  assert(DSO.computeDso(null, 100, 30) === null);
  assert(DSO.computeDso(100, null, 30) === null);
  assert(DSO.computeDso(100, 50, 0) === null);
  assert(DSO.computeDso(Infinity, 50, 30) === null);
  assert(DSO.computeDso(100, Infinity, 30) === null);
'

unit "best and worst months on fixture" '
  const r = DSO.analyze({
    dsoTargetDays: 45,
    months: [
      { month: "2026-01", label: "Jan", arEnding: 900, revenue: 100, daysInPeriod: 31 },
      { month: "2026-02", label: "Feb", arEnding: 100, revenue: 100, daysInPeriod: 28 },
      { month: "2026-03", label: "Mar", arEnding: 450, revenue: 100, daysInPeriod: 31 }
    ]
  });
  assert(r.best && r.best.label === "Feb", "best should be Feb");
  assert(r.worst && r.worst.label === "Jan", "worst should be Jan");
'

unit "target flags over / under / on" '
  assert(DSO.vsTarget(50, 45) === "over");
  assert(DSO.vsTarget(40, 45) === "under");
  assert(DSO.vsTarget(45, 45) === "on");
  assert(DSO.vsTarget(null, 45) === null);
  const r = DSO.analyze({
    dsoTargetDays: 45,
    months: [
      { month: "2026-01", arEnding: 50, revenue: 31, daysInPeriod: 31 },
      { month: "2026-02", arEnding: 40, revenue: 31, daysInPeriod: 31 },
      { month: "2026-03", arEnding: 45, revenue: 31, daysInPeriod: 31 }
    ]
  });
  assert(r.months[0].aboveTarget === true && r.months[0].vsTarget === "over");
  assert(r.months[1].belowTarget === true && r.months[1].vsTarget === "under");
  assert(r.months[2].onTarget === true && r.months[2].vsTarget === "on");
'

unit "MoM trend up / down / first-month null" '
  const up = DSO.trendFrom(40, 50);
  assert(up && up.direction === "up" && up.delta === 10);
  const down = DSO.trendFrom(50, 40);
  assert(down && down.direction === "down" && down.delta === -10);
  assert(DSO.trendFrom(null, 40) === null);
  const r = DSO.analyze({
    dsoTargetDays: 45,
    months: [
      { month: "2026-01", arEnding: 40, revenue: 31, daysInPeriod: 31 },
      { month: "2026-02", arEnding: 50, revenue: 31, daysInPeriod: 31 }
    ]
  });
  assert(r.months[0].trend === null, "first month has no MoM trend");
  assert(r.months[1].trend && r.months[1].trend.direction === "up");
'

unit "zero-revenue month in a series stays null and does not poison trend" '
  const r = DSO.analyze({
    dsoTargetDays: 45,
    months: [
      { month: "2026-01", label: "Jan", arEnding: 3100, revenue: 3100, daysInPeriod: 31 },
      { month: "2026-02", label: "Feb", arEnding: 2800, revenue: 0, daysInPeriod: 28 },
      { month: "2026-03", label: "Mar", arEnding: 3100, revenue: 3100, daysInPeriod: 31 }
    ]
  });
  assert(r.months[1].dso === null);
  assert(r.months[1].trend === null);
  assert(r.months[2].dso === 31);
  assert(r.months[2].trend === null, "cannot trend off a null prior DSO");
  const dump = JSON.stringify(r);
  assert(dump.indexOf("NaN") === -1 && dump.indexOf("Infinity") === -1);
'

unit "sample data has at least 12 months and analyzes cleanly" '
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync("data/dso.json", "utf8"));
  assert(Array.isArray(data.months) && data.months.length >= 12, "need >=12 months");
  assert(data.revenueType === "credit_sales");
  assert(typeof data.dsoTargetDays === "number");
  const r = DSO.analyze(data);
  assert(r.months.length === data.months.length);
  assert(r.best && r.worst && r.best.dso <= r.worst.dso);
  r.months.forEach(function (m) {
    assert(m.dso === null || Number.isFinite(m.dso));
  });
'

unit "daysInPeriod from YYYY-MM (Feb 2026 = 28)" '
  assert(DSO.daysInPeriod("2026-02") === 28);
  assert(DSO.daysInPeriod("2025-03") === 31);
  assert(DSO.daysInPeriod("2025-04") === 30);
  assert(DSO.daysInPeriod("bad") === null);
'

unit "sample best is Oct 2025 and worst is Jul 2025" '
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync("data/dso.json", "utf8"));
  const r = DSO.analyze(data);
  assert(r.best && r.best.month === "2025-10", "best " + (r.best && r.best.month));
  assert(r.worst && r.worst.month === "2025-07", "worst " + (r.worst && r.worst.month));
'

# --- static HTML first-paint ---
HTML="index.html"

if [[ -f "$HTML" ]]; then
  pass "index.html exists"
else
  fail "index.html exists"
fi

if [[ -f "$HTML" ]]; then
  if grep -Eiq '>(Loading…|Loading\.\.\.|Loading)<' "$HTML" && ! grep -E -q '[0-9]+\.[0-9]' "$HTML"; then
    fail "index.html is not Loading-only"
  else
    pass "index.html is not Loading-only"
  fi

  if grep -E -q "Mar 2025|Apr 2025|Oct 2025|Aug 2026" "$HTML"; then
    pass "index.html contains month labels"
  else
    fail "index.html contains month labels"
  fi

  if grep -E -q "<td[^>]*>[0-9]+\.[0-9]</td>" "$HTML"; then
    pass "index.html contains numeric DSO cells"
  else
    fail "index.html contains numeric DSO cells"
  fi

  if grep -E -q "\\\$[0-9,]+" "$HTML"; then
    pass "index.html contains AR/revenue money amounts"
  else
    fail "index.html contains AR/revenue money amounts"
  fi

  if grep -E -q "[+-]?[0-9]+\\.[0-9] [↑↓→]" "$HTML"; then
    pass "index.html contains numeric MoM trend cells"
  else
    fail "index.html contains numeric MoM trend cells"
  fi

  ROW_COUNT="$(grep -c 'data-month=' "$HTML" || true)"
  if [[ "${ROW_COUNT}" -ge 12 ]]; then
    pass "index.html has >=12 month rows (${ROW_COUNT})"
  else
    fail "index.html has >=12 month rows (${ROW_COUNT})"
  fi

  if grep -q "AR ending" "$HTML" && grep -q "Credit sales" "$HTML" && grep -q "DSO" "$HTML"; then
    pass "index.html table headers include AR, credit sales, DSO"
  else
    fail "index.html table headers include AR, credit sales, DSO"
  fi

  # curl -sL of a file URL is equivalent to reading the baked markup
  CURL_BODY="$(curl -sL "file://${ROOT}/index.html" 2>/dev/null || cat "$HTML")"
  if echo "$CURL_BODY" | grep -q "Mar 2025" && echo "$CURL_BODY" | grep -E -q "[0-9]+\.[0-9]"; then
    pass "curl/static fetch shows month labels and DSO numbers without JS"
  else
    fail "curl/static fetch shows month labels and DSO numbers without JS"
  fi

  if grep -q "first-paint: static DSO table" "$HTML"; then
    pass "index.html documents static first-paint bake"
  else
    fail "index.html documents static first-paint bake"
  fi
fi

if [[ -f .nojekyll ]]; then
  pass ".nojekyll present for GitHub Pages"
else
  fail ".nojekyll present for GitHub Pages"
fi

if [[ -f css/style.css ]]; then
  pass "minimal CSS stylesheet present"
else
  fail "minimal CSS stylesheet present"
fi

echo "Summary: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -eq 0 ]]; then
  exit 0
fi
exit 1
