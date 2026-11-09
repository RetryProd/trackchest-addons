// TrackChest add-on: Réveil Jeton Pirate.
// The add-on sandbox can only modify the overlay; it cannot create Windows notifications
// or change the game's real drop probability.

function overlay(view, data) {
  var now = new Date();
  var day = now.getDay(); // 0 = Sunday, 6 = Saturday
  var minutes = now.getHours() * 60 + now.getMinutes();
  var multiplier = 1;
  var period = "";

  if (day === 6 && minutes >= 20 * 60 && minutes < 22 * 60) {
    multiplier = 1.5;
    period = "Samedi 20h–22h";
  } else if (day === 0 && minutes >= 3 * 60 && minutes < 5 * 60) {
    multiplier = 2;
    period = "Dimanche 3h–5h";
  }

  if (!Array.isArray(view.rows)) view.rows = [];

  // Find the existing Jeton pirate percentage, if TrackChest exposes it in the overlay.
  var pirateRow = null;
  for (var i = 0; i < view.rows.length; i++) {
    var label = String(view.rows[i].label || "").toLowerCase();
    if (label.indexOf("jeton pirate") !== -1) {
      pirateRow = view.rows[i];
      break;
    }
  }

  // Only adjust a displayed percentage when its original value is available.
  // The underlying game probability is not modified by an overlay add-on.
  if (multiplier > 1 && pirateRow) {
    var original = String(pirateRow.value == null ? "" : pirateRow.value);
    var match = original.match(/-?\d+(?:[.,]\d+)?\s*%/);
    if (match) {
      var baseValue = parseFloat(match[0].replace("%", "").replace(",", "."));
      var adjusted = baseValue * multiplier;
      var formatted = (Math.round(adjusted * 100) / 100).toLocaleString("fr-FR") + " %";
      pirateRow.value = original.replace(match[0], formatted);
      pirateRow.detail = (pirateRow.detail ? String(pirateRow.detail) + " · " : "") +
        "Taux affiché ×" + String(multiplier).replace(".", ",") + " (" + period + ")";
    }
  }

  // Always show the current schedule state, so the player can see when the bonus is active.
  var status = multiplier > 1
    ? "×" + String(multiplier).replace(".", ",") + " · " + period
    : "Aucun bonus actif";
  view.rows.push({
    label: "Bonus Jeton Pirate",
    value: status,
    detail: "Sam. 20h–22h : ×1,5 · Dim. 3h–5h : ×2",
    color: multiplier > 1 ? "#55D68B" : "#A9A9B5"
  });

  return view;
}
