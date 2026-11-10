// TrackChest add-on : Réveil Jeton Pirate.
// L'add-on ne s'affiche que de 20h à 22h (heure locale du PC). En dehors de
// cette plage, il ne change rien à l'overlay : aucune ligne ajoutée, taux normal.
// L'heure est relue à chaque exécution de overlay().

// --- Réglages -------------------------------------------------------------
var HEURE_DEBUT = 20;   // affichage à partir de 20h00
var HEURE_FIN = 22;     // plus rien à partir de 22h00
var MULTIPLICATEUR = 1.5;
// Jours concernés (0 = dimanche … 6 = samedi). Tous les jours par défaut ;
// mettre [6] pour n'afficher que le samedi.
var JOURS = [0, 1, 2, 3, 4, 5, 6];
// ---------------------------------------------------------------------------

var NOMS_JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function overlay(view, data) {
  var now = new Date(); // heure/date Windows locale du PC
  var minutes = now.getHours() * 60 + now.getMinutes();
  var actif = JOURS.indexOf(now.getDay()) !== -1 &&
    minutes >= HEURE_DEBUT * 60 && minutes < HEURE_FIN * 60;

  // Hors de la plage horaire : l'add-on n'affiche rien.
  if (!actif) return view;

  if (!Array.isArray(view.rows)) view.rows = [];
  var periode = (JOURS.length === 7 ? "" : NOMS_JOURS[now.getDay()] + " ") + HEURE_DEBUT + "h–" + HEURE_FIN + "h";
  var mult = String(MULTIPLICATEUR).replace(".", ",");

  // Applique le multiplicateur au taux de la ligne « Jeton pirate ».
  // TrackChest reconstruit la vue à chaque mise à jour : la valeur reçue est
  // toujours la valeur d'origine, elle n'est donc jamais multipliée deux fois.
  for (var i = 0; i < view.rows.length; i++) {
    var row = view.rows[i];
    if (String(row.label || "").toLowerCase().indexOf("jeton pirate") === -1) continue;
    var original = String(row.value == null ? "" : row.value);
    var match = original.match(/-?\d+(?:[.,]\d+)?\s*%/);
    if (match) {
      var base = parseFloat(match[0].replace("%", "").replace(",", "."));
      var ajuste = Math.round(base * MULTIPLICATEUR * 100) / 100;
      row.value = original.replace(match[0], ajuste.toLocaleString("fr-FR") + " %");
      row.detail = (row.detail ? String(row.detail) + " · " : "") + "Taux ×" + mult;
    }
    break;
  }

  view.rows.push({
    label: "Bonus Jeton Pirate",
    value: "×" + mult + " · " + periode,
    detail: "Actif de " + HEURE_DEBUT + "h à " + HEURE_FIN + "h · horloge du PC",
    color: "#55D68B"
  });

  return view;
}
