// TrackChest add-on : Réveil Jeton Pirate.
// L'heure est lue sur l'horloge locale du PC à chaque exécution de overlay().
// Important : TrackChest doit rappeler overlay() pour que l'affichage change.

function overlay(view, data) {
  var now = new Date(); // heure/date Windows locale du PC
  var day = now.getDay(); // 0 = dimanche, 6 = samedi
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

  // Retire l'ancienne ligne de statut si TrackChest réutilise la même vue.
  view.rows = view.rows.filter(function (row) {
    return String(row.label || "") !== "Bonus Jeton Pirate";
  });

  // Repère le taux pirate existant dans les lignes de l'overlay.
  var pirateRow = null;
  for (var i = 0; i < view.rows.length; i++) {
    var label = String(view.rows[i].label || "").toLowerCase();
    if (label.indexOf("jeton pirate") !== -1) {
      pirateRow = view.rows[i];
      break;
    }
  }

  // Ne multiplie pas une valeur déjà majorée par une exécution précédente.
  // La valeur d'origine est conservée dans une propriété interne de la ligne.
  if (pirateRow) {
    if (typeof pirateRow._pirateBaseValue === "undefined") {
      pirateRow._pirateBaseValue = pirateRow.value;
    }
    var original = String(pirateRow._pirateBaseValue == null ? "" : pirateRow._pirateBaseValue);
    var match = original.match(/-?\d+(?:[.,]\d+)?\s*%/);
    if (match) {
      if (multiplier > 1) {
        var baseValue = parseFloat(match[0].replace("%", "").replace(",", "."));
        var adjusted = baseValue * multiplier;
        var formatted = (Math.round(adjusted * 100) / 100).toLocaleString("fr-FR") + " %";
        pirateRow.value = original.replace(match[0], formatted);
        pirateRow.detail = (pirateRow.detail ? String(pirateRow.detail).split(" · Taux affiché ×")[0] + " · " : "") +
          "Taux affiché ×" + String(multiplier).replace(".", ",") + " (" + period + ")";
      } else {
        pirateRow.value = pirateRow._pirateBaseValue;
      }
    }
  }

  var status = multiplier > 1
    ? "×" + String(multiplier).replace(".", ",") + " · " + period
    : "Aucun bonus actif";

  view.rows.push({
    label: "Bonus Jeton Pirate",
    value: status,
    detail: "Sam. 20h–22h : ×1,5 · Dim. 3h–5h : ×2 · Horloge locale du PC",
    color: multiplier > 1 ? "#55D68B" : "#A9A9B5"
  });

  return view;
}
