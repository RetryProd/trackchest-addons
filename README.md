# Catalogue d'add-ons TrackChest

Ce dossier est le modèle du dépôt public qui héberge les add-ons, gratuitement et sans serveur à gérer.
Copie-le dans un nouveau dépôt GitHub public (par exemple `trackchest-addons`).

## Ce qu'est un add-on

Un add-on est **un fichier de données, jamais du code** : un `manifest.json` qui déclare

- des **compteurs** pour l'overlay (une ligne avec une statistique : coffres cassés, canons à butin, cartes Wanted…) ;
- et/ou un **thème** (les couleurs de l'overlay).

TrackChest lit et valide lui-même ce fichier. Un add-on ne peut donc ni exécuter un programme, ni lire des fichiers, ni
utiliser Internet. Il ne peut utiliser que ce qu'il déclare dans `permissions` :

| Permission | Ce qu'elle permet |
|---|---|
| `stats.read` | lire les statistiques (coffres, parties, trésors) pour calculer un compteur |
| `overlay.rows` | ajouter des lignes à l'overlay |
| `overlay.theme` | changer les couleurs de l'overlay |

Les valeurs possibles sont fixées par TrackChest : `metric` = `chests`, `opened`, `destroyed`, `sprites`, `wanted`,
`cannons`, `treasures`, `matches` ; `scope` = `total`, `session`, `last`. Regarde `addons/stats-detail` et
`addons/theme-nuit` pour des exemples complets.

## Comment la confiance est établie

1. **Relecture** : un add-on arrive par *pull request*. Les contrôles automatiques
   (`.github/workflows/validate.yml`, qui lance `scripts/Validate-Addon.ps1`) vérifient le format, les limites et les
   fichiers interdits. Un mainteneur relit ensuite le manifeste (il est court) puis accepte ou refuse.
2. **Niveaux** : les add-ons listés dans `registry.json` → `verified` sont ceux que tu as relus ; les autres sont
   publiés comme `community` (contrôlés automatiquement seulement) et TrackChest affiche un avertissement.
3. **Signature** : le catalogue (`index.json`) est signé avec ta **clé privée** (ECDSA P-256). TrackChest embarque la
   **clé publique** et refuse tout catalogue dont la signature ne correspond pas. Si quelqu'un modifie un fichier sur
   l'hébergement, rien n'est utilisé.
4. **Empreintes** : le catalogue contient le SHA-256 et la taille de chaque add-on. TrackChest vérifie le fichier
   téléchargé, puis que son contenu correspond à la fiche (identifiant, version, permissions).
5. **Révocation** : ajoute un add-on dans `registry.json` → `revoked` (`"id"` ou `"id@1.0.0"`), republie : TrackChest le
   désactive chez tous les joueurs à la prochaine ouverture du catalogue.
6. **Avant l'installation** : TrackChest affiche l'auteur, la version, le niveau de confiance et les permissions.

Rien de tout cela ne dépend d'un serveur : tout est des fichiers statiques.

## Mise en place (une seule fois)

1. **Crée les clés** (sur ton PC, jamais dans le dépôt) :

   ```powershell
   .\TrackChest.exe --addon-keygen C:\Cles\trackchest
   ```

   - `addon-private.key` : **secrète**. Sauvegarde-la (gestionnaire de mots de passe, clé USB) et ne la publie jamais.
     Le `.gitignore` de ce dossier bloque les fichiers `*.key`. Si elle fuit, un attaquant peut signer de faux catalogues :
     il faut alors refaire une paire de clés et publier une nouvelle version de TrackChest.
   - `addon-public.key` : publique. Copie-la dans `assets\addon-public.key` du projet TrackChest.
2. **Choisis l'adresse du catalogue** et écris-la dans `assets\addon-catalog.txt` du projet TrackChest, par exemple
   `https://trackchest-addons.pages.dev/index.json`. Un joueur peut aussi la changer dans `config.json`
   (`AddonCatalogUrl`), mais seul un catalogue signé par ta clé est accepté.
3. **Recompile TrackChest** (`Construire.ps1`) : la clé publique et l'adresse sont intégrées à l'exe.
4. **Héberge le dossier `site/`** gratuitement : GitHub Pages ou Cloudflare Pages, en publiant le dossier `site`.

## Publier ou mettre à jour des add-ons

```powershell
# 1. Contrôles + construction de site/ (un .zip par add-on et index.json)
.\scripts\Build-Index.ps1 -BaseUrl https://trackchest-addons.pages.dev

# 2. Signature du catalogue (crée site\index.json.sig)
.\TrackChest.exe --addon-sign site\index.json C:\Cles\trackchest\addon-private.key

# 3. Publication : commit + push du dossier site/
```

Les trois étapes (construction, signature, publication sur Cloudflare) sont regroupées dans une commande :

```powershell
.\scripts\addon.ps1 publier -Exe C:\chemin\vers\TrackChest.exe
```

Elle contrôle les add-ons, demande confirmation, construit le catalogue, le signe avec
`%USERPROFILE%\TrackChest-cles\addon-private.key` (option `-Cle` pour un autre emplacement), vérifie la signature,
puis publie le dossier `site` avec `wrangler`. Il faut être connecté à Cloudflare (`npx wrangler login`).

Vérifie quand tu veux un add-on ou une signature :

```powershell
.\TrackChest.exe --addon-check site\theme-nuit-1.0.0.zip
.\TrackChest.exe --addon-verify site\index.json C:\Cles\trackchest\addon-public.key
```

Pour changer un add-on déjà publié, **augmente sa `version`** (sinon les joueurs ne verront pas de mise à jour).

## Proposer un add-on (auteurs)

Le point d'entrée est le site du catalogue (<https://trackchest-addons.pages.dev/>) : son **générateur** construit et
vérifie le `manifest.json`, puis le bouton **Proposer sur GitHub** ouvre une page GitHub avec le fichier prérempli.
GitHub propose de copier le dépôt (« fork ») et d'ouvrir la pull request.

Pour travailler sur son PC, la commande `addon.ps1` fait le reste :

```powershell
.\scripts\addon.ps1 nouveau mon-addon      # crée addons\mon-addon\manifest.json à remplir
.\scripts\addon.ps1 verifier mon-addon     # affiche toutes les erreurs
.\scripts\addon.ps1 empaqueter mon-addon   # crée dist\mon-addon-1.0.0.zip, à essayer dans TrackChest
```

Le nom du dossier est égal à `id`, et le dossier ne contient que `manifest.json` (UTF-8 **sans BOM**), éventuellement
un `README.md`. Ensuite, ouvrir une pull request.

## Checklist de relecture (mainteneur)

- [ ] Les contrôles automatiques passent.
- [ ] Le nom, la description et les libellés sont honnêtes (pas de lien, pas d'usurpation, pas de contenu choquant).
- [ ] Les permissions correspondent à ce que l'add-on fait vraiment (les contrôles l'imposent déjà).
- [ ] L'`id` n'imite pas un autre add-on ou un nom de marque.
- [ ] Pour un thème : les couleurs restent lisibles (texte clair sur fond sombre ou l'inverse).
- [ ] Seulement après tout cela, ajoute l'`id` à `registry.json` → `verified`.

## Limites

Aucun système n'offre une sécurité absolue. Ici le risque est réduit par construction (pas de code), la signature et
les empreintes protègent le transport et l'hébergement, et la relecture protège contre le contenu trompeur. Un add-on
malveillant ne peut au pire qu'afficher des chiffres ou des couleurs trompeurs, et la révocation permet de le retirer.

## Guide pour les développeurs d'add-ons

Le guide complet (champs, permissions, compteurs, thème, exemples) et le **générateur de manifeste** forment la page
`site-src/index.html`. `Build-Index.ps1` la publie à la racine du site, avec le schéma `addon.schema.json` pour
l'autocomplétion dans VS Code. Le bouton **Créer un add-on** de la fenêtre Add-on de TrackChest ouvre cette page.

Le bouton **Proposer sur GitHub** du générateur utilise l'adresse du dépôt donnée à `Build-Index.ps1` (`-RepoUrl`, par
défaut `https://github.com/RetryProd/trackchest-addons`). Ce dépôt doit être **public** pour que d'autres puissent le
copier (« fork ») et proposer des add-ons.

Si une règle de validation change, mets à jour ensemble : `src/ChestCounter/Addons.cs`, `scripts/Validate-Addon.ps1`,
le générateur de `site-src/index.html` (fonction `validate`) et `site-src/addon.schema.json`.
