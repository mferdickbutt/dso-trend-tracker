/**
 * DSO (Days Sales Outstanding) calculations.
 *
 * Formula:
 *   DSO = arEnding / (revenue / daysInPeriod)
 *       = arEnding * daysInPeriod / revenue
 *
 * `revenue` is credit sales for the period (cash sales never enter AR).
 * Zero, missing, or non-finite revenue → null (never NaN or Infinity).
 *
 * Works in the browser (global `DSO`) and in Node (`module.exports`).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DSO = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FORMULA = "arEnding / (revenue / daysInPeriod)";
  var FLAT_EPS = 0.05;

  function isFiniteNumber(n) {
    return typeof n === "number" && isFinite(n);
  }

  function round1(n) {
    if (!isFiniteNumber(n)) return null;
    return Math.round(n * 10) / 10;
  }

  /**
   * Calendar days in YYYY-MM. Uses UTC so timezone does not shift the month.
   */
  function daysInPeriod(monthKey) {
    if (typeof monthKey !== "string" || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return null;
    }
    var parts = monthKey.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!isFiniteNumber(year) || !isFiniteNumber(month) || month < 1 || month > 12) {
      return null;
    }
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Per-month DSO. Returns null when the ratio is undefined.
   */
  function computeDso(arEnding, revenue, days) {
    if (!isFiniteNumber(revenue) || revenue === 0) return null;
    if (!isFiniteNumber(arEnding)) return null;
    if (!isFiniteNumber(days) || days <= 0) return null;
    var dso = arEnding / (revenue / days);
    if (!isFinite(dso)) return null;
    return round1(dso);
  }

  function trendFrom(previousDso, currentDso) {
    if (previousDso == null || currentDso == null) return null;
    if (!isFiniteNumber(previousDso) || !isFiniteNumber(currentDso)) return null;
    var delta = round1(currentDso - previousDso);
    if (delta == null) return null;
    var direction = "flat";
    if (delta > FLAT_EPS) direction = "up";
    else if (delta < -FLAT_EPS) direction = "down";
    return { delta: delta, direction: direction };
  }

  function vsTarget(dso, target) {
    if (dso == null || !isFiniteNumber(dso)) return null;
    if (!isFiniteNumber(target)) return null;
    if (dso > target) return "over";
    if (dso < target) return "under";
    return "on";
  }

  function analyze(input) {
    var data = input && typeof input === "object" ? input : {};
    var monthsIn = Array.isArray(data.months) ? data.months : [];
    var target = isFiniteNumber(data.dsoTargetDays) ? data.dsoTargetDays : null;

    var months = [];
    var i;
    for (i = 0; i < monthsIn.length; i++) {
      var row = monthsIn[i] || {};
      var key = typeof row.month === "string" ? row.month : null;
      var days =
        isFiniteNumber(row.daysInPeriod) && row.daysInPeriod > 0
          ? row.daysInPeriod
          : daysInPeriod(key);
      var dso = computeDso(row.arEnding, row.revenue, days);
      var prev = i > 0 ? months[i - 1] : null;
      var trend = trendFrom(prev ? prev.dso : null, dso);
      var vs = vsTarget(dso, target);

      months.push({
        month: key,
        label: typeof row.label === "string" ? row.label : key,
        arEnding: isFiniteNumber(row.arEnding) ? row.arEnding : null,
        revenue: isFiniteNumber(row.revenue) ? row.revenue : null,
        daysInPeriod: days,
        dso: dso,
        trend: trend,
        vsTarget: vs,
        aboveTarget: vs === "over",
        belowTarget: vs === "under",
        onTarget: vs === "on",
      });
    }

    var ranked = [];
    for (i = 0; i < months.length; i++) {
      if (months[i].dso != null) ranked.push(months[i]);
    }

    var best = null;
    var worst = null;
    for (i = 0; i < ranked.length; i++) {
      if (best == null || ranked[i].dso < best.dso) best = ranked[i];
      if (worst == null || ranked[i].dso > worst.dso) worst = ranked[i];
    }

    var latest = months.length ? months[months.length - 1] : null;

    return {
      formula: FORMULA,
      dsoTargetDays: target,
      months: months,
      best: best,
      worst: worst,
      latest: latest,
    };
  }

  return {
    FORMULA: FORMULA,
    daysInPeriod: daysInPeriod,
    computeDso: computeDso,
    trendFrom: trendFrom,
    vsTarget: vsTarget,
    round1: round1,
    analyze: analyze,
  };
});
