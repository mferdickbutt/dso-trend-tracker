#!/usr/bin/env node
/**
 * Bake the monthly DSO table into index.html so first paint needs no JavaScript.
 *
 *   node scripts/render-static.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var dataPath = path.join(root, "data", "dso.json");
var outPath = path.join(root, "index.html");
var DSO = require(path.join(root, "js", "dso.js"));

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  if (n == null || !isFinite(n)) return "—";
  return (
    "$" +
    Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 })
  );
}

function dsoCell(n) {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(1);
}

function trendLabel(trend) {
  if (!trend) return "—";
  var sign = trend.delta > 0 ? "+" : "";
  var arrow = trend.direction === "up" ? " ↑" : trend.direction === "down" ? " ↓" : " →";
  return sign + trend.delta.toFixed(1) + arrow;
}

function vsLabel(vs) {
  if (vs === "over") return "over";
  if (vs === "under") return "under";
  if (vs === "on") return "on target";
  return "—";
}

var raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
var report = DSO.analyze(raw);
var target = report.dsoTargetDays;
var latest = report.latest;
var best = report.best;
var worst = report.worst;

var rows = report.months
  .map(function (m) {
    var vsClass =
      m.vsTarget === "over"
        ? "vs-over"
        : m.vsTarget === "under"
          ? "vs-under"
          : m.vsTarget === "on"
            ? "vs-on"
            : "na";
    var trClass =
      m.trend && m.trend.direction === "up"
        ? "trend-up"
        : m.trend && m.trend.direction === "down"
          ? "trend-down"
          : m.trend
            ? "trend-flat"
            : "na";
    return [
      "<tr data-month=\"" +
        esc(m.month || "") +
        "\" data-vs=\"" +
        esc(m.vsTarget || "na") +
        "\">",
      "<td class=\"month\">" + esc(m.label || m.month || "") + "</td>",
      "<td>" + money(m.arEnding) + "</td>",
      "<td>" + money(m.revenue) + "</td>",
      "<td>" + (m.daysInPeriod != null ? String(m.daysInPeriod) : "—") + "</td>",
      "<td class=\"" + vsClass + "\">" + dsoCell(m.dso) + "</td>",
      "<td>" + (target != null ? String(target) : "—") + "</td>",
      "<td class=\"" + vsClass + "\">" + vsLabel(m.vsTarget) + "</td>",
      "<td class=\"" + trClass + "\">" + trendLabel(m.trend) + "</td>",
      "</tr>",
    ].join("");
  })
  .join("\n");

var latestDso = latest && latest.dso != null ? latest.dso.toFixed(1) : "—";
var latestVs = latest ? latest.vsTarget : null;
var gap =
  latest && latest.dso != null && target != null
    ? DSO.round1(latest.dso - target)
    : null;
var gapText =
  gap == null ? "—" : (gap > 0 ? "+" : "") + gap.toFixed(1) + " vs target";
var gapClass = latestVs === "over" ? "bad" : latestVs === "under" ? "good" : "";

var html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DSO trend — ${esc(raw.entity || "Days Sales Outstanding")}</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- first-paint: static DSO table baked by scripts/render-static.js; table is in the markup -->
  <div class="wrap">
    <header>
      <h1>Days Sales Outstanding</h1>
      <p class="lede">${esc(raw.entity || "Sample")} · ${esc(raw.currency || "USD")} · revenue is <strong>monthly credit sales</strong> · target ${target != null ? target + " days" : "n/a"}</p>
    </header>

    <section class="cards" aria-label="DSO summary">
      <div class="card">
        <span class="k">Latest DSO</span>
        <span class="v ${esc(gapClass)}">${esc(latestDso)}</span>
      </div>
      <div class="card">
        <span class="k">Target</span>
        <span class="v">${target != null ? esc(String(target)) : "—"}</span>
      </div>
      <div class="card">
        <span class="k">Gap</span>
        <span class="v ${esc(gapClass)}">${esc(gapText)}</span>
      </div>
      <div class="card">
        <span class="k">Best (lowest)</span>
        <span class="v good">${best ? esc(best.label + " · " + best.dso.toFixed(1)) : "—"}</span>
      </div>
      <div class="card">
        <span class="k">Worst (highest)</span>
        <span class="v bad">${worst ? esc(worst.label + " · " + worst.dso.toFixed(1)) : "—"}</span>
      </div>
    </section>

    <div class="filters" id="filters" hidden>
      <button type="button" data-filter="all" aria-pressed="true">All months</button>
      <button type="button" data-filter="over">Over target</button>
      <button type="button" data-filter="under">Under target</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">AR ending</th>
            <th scope="col">Credit sales</th>
            <th scope="col">Days</th>
            <th scope="col">DSO</th>
            <th scope="col">Target</th>
            <th scope="col">vs target</th>
            <th scope="col">MoM trend</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>

    <p class="formula">Formula: DSO = AR ending / (credit sales / days in period). Under target is favorable. MoM trend is the change in DSO versus the prior month.</p>
    <p class="foot">${report.months.length} months · static first paint (no JavaScript required) · regenerate with <code>node scripts/render-static.js</code></p>
  </div>
  <script src="js/dso.js"></script>
  <script>
    (function () {
      document.body.classList.add("js");
      var bar = document.getElementById("filters");
      if (!bar) return;
      bar.hidden = false;
      var buttons = bar.querySelectorAll("button[data-filter]");
      var rows = document.querySelectorAll("tbody tr");
      bar.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-filter]");
        if (!btn) return;
        var f = btn.getAttribute("data-filter");
        buttons.forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        rows.forEach(function (tr) {
          var vs = tr.getAttribute("data-vs");
          tr.classList.toggle("is-hidden", f !== "all" && vs !== f);
        });
      });
    })();
  </script>
</body>
</html>
`;

fs.writeFileSync(outPath, html);
process.stdout.write("Wrote " + outPath + " (" + report.months.length + " months)\n");
