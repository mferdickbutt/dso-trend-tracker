# DSO trend tracker

Public **Days Sales Outstanding** trend page. First paint is static HTML: `curl -sL` of `index.html` already contains the monthly table (month labels, DSO, AR, credit sales, MoM trend). JavaScript only adds a filter bar.

## Formula

```
DSO = AR_ending / (credit_sales / days_in_period)
    = AR_ending × days_in_period / credit_sales
```

Implemented in `js/dso.js` as `computeDso(arEnding, revenue, daysInPeriod)`.

- **AR ending** is gross trade receivables at month-end.
- **Revenue** in this dataset is **monthly credit sales**, not cash sales and not total recognized revenue. Cash sales never sit in AR; including them would understate DSO.
- **days_in_period** is the calendar length of the month (stored on each row; also derived from `YYYY-MM`).
- Zero, missing, or non-finite revenue → `null` (never `NaN` or `Infinity`).
- **Trend** is month-over-month DSO delta and direction (`up` / `down` / `flat`). The first month, and any month whose current or prior DSO is null, has `trend: null`.
- **vs target**: `over` (worse), `under` (better), or `on`. Lower DSO is favorable.
- **Best / worst** months are the lowest and highest finite DSO values.

## Data schema (`data/dso.json`)

```json
{
  "entity": "string",
  "currency": "USD",
  "revenueType": "credit_sales",
  "dsoTargetDays": 45,
  "notes": { "revenue": "...", "arEnding": "...", "formula": "..." },
  "months": [
    {
      "month": "YYYY-MM",
      "label": "Mon YYYY",
      "arEnding": 0,
      "revenue": 0,
      "daysInPeriod": 31
    }
  ]
}
```

Sample file: **18 months** (Mar 2025–Aug 2026), target **45 days**.

## How to re-render

After editing `data/dso.json` or `js/dso.js`:

```bash
node scripts/render-static.js
```

That rewrites `index.html` with the table baked into the markup. Do not replace the table with a “Loading…” shell.

```bash
bash scripts/test.sh
```

## Layout

| Path | Role |
| --- | --- |
| `data/dso.json` | Sample AR + credit sales + target |
| `js/dso.js` | Browser + Node module (`DSO` / `module.exports`) |
| `scripts/render-static.js` | Static HTML generator |
| `index.html` | First-paint table (no JS required) |
| `css/style.css` | Minimal layout |
| `.nojekyll` | GitHub Pages: serve files as-is |
| `scripts/test.sh` | Fixtures, edge cases, static-HTML check |

## Suggested next improvements

- Rolling 90-day DSO alongside calendar-month DSO.
- AR aging buckets (current / 30 / 60 / 90+) next to the trend.
- Customer concentration and disputed-invoice flags as DSO drivers.
- Connect a live GL/AR export instead of the sample JSON.
- Optional constant-30-day variant (`AR / (revenue / 30)`) as a second column for comparability with some ERP reports.
