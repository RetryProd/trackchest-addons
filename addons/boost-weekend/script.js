// Add-on TrackChest : Boost Hebdo (Samedi 20h-22h x1.5, Dimanche 3h-5h x2)
// Ne modifie pas le nombre de coffres affiches et n'elargit pas l'overlay.

var DROP_DENOMINATOR = 137500;
var DOT = "\u00B7";
var BULLET = "\u25CF";

function boostForDate(d) {
  if (!d || isNaN(d.getTime())) return 1;
  var day = d.getDay(); // 0 = dimanche, 6 = samedi
  var hour = d.getHours();
  if (day === 6 && hour >= 20 && hour < 22) return 1.5;
  if (day === 0 && hour >= 3 && hour < 5) return 2;
  return 1;
}

function parseStart(s) {
  if (!s || typeof s !== "string") return null;
  var iso = /[Z+\-]\d*$/.test(s) ? s : s + "Z";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(s) : d;
}

function matchBoostedOpened(m, liveMult) {
  var start = parseStart(m && m.start);
  var totalOpened = (m && m.opened) || 0;
  var fallbackMult = liveMult && liveMult > 1 ? liveMult : 1;

  if (!start) return totalOpened * fallbackMult;

  var list = m.chestList;
  if (Array.isArray(list) && list.length > 0) {
    var bOpened = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.destroyed) continue;
      var t = new Date(start.getTime() + (c.time || 0) * 1000);
      var mult = boostForDate(t);
      if (mult === 1 && fallbackMult > 1) mult = fallbackMult;
      bOpened += mult;
    }
    return bOpened;
  }

  var mult0 = boostForDate(start);
  if (mult0 === 1 && fallbackMult > 1) mult0 = fallbackMult;
  return totalOpened * mult0;
}

function fmtOdds(openedEff, lang) {
  var chance = 1 - Math.pow(1 - 1 / DROP_DENOMINATOR, Math.max(0, openedEff));
  var pct = chance * 100;
  var dec = lang === "en" ? "." : ",";
  if (chance >= 0.99995) return ">99" + dec + "99 %";
  if (chance > 0 && chance < 0.0001) return pct.toFixed(5).replace(".", dec) + " %";
  return pct.toFixed(2).replace(".", dec) + " %";
}

function nextBoostStatus(now) {
  var active = boostForDate(now);
  var day = now.getDay();
  var h = now.getHours();
  var m = now.getMinutes();

  if (active > 1) {
    var endHour = day === 6 ? 22 : 5;
    var remMin = (endHour - h - 1) * 60 + (60 - m);
    var rh = Math.floor(remMin / 60);
    var rm = remMin % 60;
    var remTxt = rh > 0 ? rh + "h" + (rm < 10 ? "0" : "") + rm : rm + " min";
    return {
      active: active,
      value: active === 2 ? "x2" : "x1,5",
      detail: DOT + " reste " + remTxt,
      color: active === 2 ? "#FF6B6B" : "#FFC860"
    };
  }

  var nextSat = new Date(now.getTime());
  var daysToSat = (6 - day + 7) % 7;
  nextSat.setDate(now.getDate() + daysToSat);
  nextSat.setHours(20, 0, 0, 0);
  if (nextSat <= now) nextSat.setDate(nextSat.getDate() + 7);

  var nextSun = new Date(now.getTime());
  var daysToSun = (0 - day + 7) % 7;
  nextSun.setDate(now.getDate() + daysToSun);
  nextSun.setHours(3, 0, 0, 0);
  if (nextSun <= now) nextSun.setDate(nextSun.getDate() + 7);

  var isSatNext = nextSat < nextSun;
  var target = isSatNext ? nextSat : nextSun;
  var diffMin = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
  var dDays = Math.floor(diffMin / 1440);
  var dHours = Math.floor((diffMin % 1440) / 60);
  var dMins = diffMin % 60;

  var countdown = "";
  if (dDays > 0) countdown = "dans " + dDays + "j " + dHours + "h";
  else if (dHours > 0) countdown = "dans " + dHours + "h" + (dMins < 10 ? "0" : "") + dMins;
  else countdown = "dans " + dMins + " min";

  return {
    active: 1,
    value: isSatNext ? "x1,5" : "x2",
    detail: DOT + " " + countdown,
    color: null
  };
}

function overlay(view, data) {
  var lang = (data && data.language) || "fr";
  var matches = (data && data.matches) || [];
  var now = new Date();
  var status = nextBoostStatus(now);

  var baseTotalOpened = (data && data.total && data.total.opened) || 0;
  var sumMatchesOpened = 0;
  var boostedMatchesOpened = 0;

  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var liveMult = (status.active > 1 && (i === 0 || m.inSession)) ? status.active : 1;
    sumMatchesOpened += (m.opened || 0);
    boostedMatchesOpened += matchBoostedOpened(m, liveMult);
  }

  var olderOpened = Math.max(0, baseTotalOpened - sumMatchesOpened);
  var finalTotalOpened = olderOpened + boostedMatchesOpened;

  if (status.active > 1 && !data.inProgress) {
    view.badge = BULLET + " BOOST x" + String(status.active).replace(".", ",");
  }

  var rows = Array.isArray(view.rows) ? view.rows : [];
  var hasSeparator = false;
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (row.separator) hasSeparator = true;
    if (row.icon === "Pirate_Token.png" || row.label === "Jeton pirate" || row.label === "Pirate token") {
      row.value = fmtOdds(finalTotalOpened, lang);
    }
  }

  if (rows.length < 16) {
    rows.push({
      label: "Boost Hebdo",
      value: status.value,
      detail: status.detail,
      color: status.color,
      icon: "Pirate_Token.png",
      separator: !hasSeparator
    });
  }

  view.rows = rows;
  return view;
}