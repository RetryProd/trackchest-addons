# Catalogue d'add-ons TrackChest

Ce dossier est le modèle du dépôt public qui héberge les add-ons, gratuitement et sans serveur à gérer.
Copie-le dans un nouveau dépôt GitHub public (par exemple `trackchest-addons`).

## Ce qu'est un add-on

Un add-on est un dossier `addons/<id>/` avec un `manifest.json` qui déclare

- des **compteurs** pour l'overlay (une ligne avec une statistique : coffres cassés, canons à butin, cartes Wanted…) ;
- et/ou un **thème** (les couleurs de l'overlay) ;
- et/ou un **script** : un fichier `script.js` dont la fonction `overlay(view, data)` peut modifier, ajouter ou
  supprimer tout ce qu'affiche l'overlay.

TrackChest lit et valide lui-même ces fichiers. Les scripts tournent dans un bac à sable : ils ne peuvent ni exécuter
un programme, ni lire des fichiers, ni utiliser Internet. Un add-on ne peut utiliser que ce qu'il déclare dans
`permissions` :

| Permission | Ce qu'elle permet |
|---|---|
| `stats.read` | lire les statistiques (coffres, parties, trésors) pour un compteur ou un script |
| `overlay.rows` | ajouter des lignes à l'overlay |
| `overlay.theme` | changer les couleurs de l'overlay |
| `overlay.script` | exécuter `script.js`, qui peut tout changer dans l'overlay |

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
6. **Avant l'installation** : TrackChest affiche le nom, la version, le niveau de confiance et les permissions.

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

## Proposer un add-on (créateurs)

Le point d'entrée est le site du catalogue (<https://trackchest-addons.pages.dev/>), **sans compte** :

- **Créer un add-on** (`creer.html`) construit et vérifie l'add-on, puis le télécharge en `.zip` ou le poste ;
- **Poster un add-on** (`poster.html`) reçoit un `.zip` fait ailleurs (par exemple avec `addon.ps1 empaqueter`).

Le site vérifie le `.zip`, puis la fonction `functions/api/proposer.js` crée elle-même la proposition (pull request) sur
ce dépôt, avec le jeton GitHub du site (voir [Envoi sans compte](#envoi-sans-compte-configuration)). Le créateur reçoit
le lien de sa proposition.

Pour travailler sur son PC, la commande `addon.ps1` fait le reste :

```powershell
.\scripts\addon.ps1 nouveau mon-addon      # crée addons\mon-addon\manifest.json à remplir
.\scripts\addon.ps1 verifier mon-addon     # affiche toutes les erreurs
.\scripts\addon.ps1 empaqueter mon-addon   # crée dist\mon-addon-1.0.0.zip, à essayer dans TrackChest
```

Le nom du dossier est égal à `id`, et le dossier ne contient que `manifest.json` (UTF-8 **sans BOM**), `script.js`
pour un add-on à script, éventuellement un `README.md`. Ensuite, poster le `.zip` sur le site (ou ouvrir une pull
request soi-même, pour qui a un compte GitHub).

## Envoi sans compte (configuration)

La fonction `functions/api/proposer.js` est publiée avec le site par `wrangler pages deploy` (elle tourne sur
Cloudflare, gratuitement). Elle a besoin d'un **jeton GitHub**, que toi seul crées et donnes à Cloudflare :

1. Sur GitHub : **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Repository access** : *Only select repositories* → `trackchest-addons` uniquement.
   - **Permissions** : *Contents* → **Read and write** ; *Pull requests* → **Read and write**. Rien d'autre.
   - Une date d'expiration (par exemple un an) : il faudra le renouveler.
2. Donne-le à Cloudflare (la commande te demande de le coller, il n'apparaît nulle part ailleurs) :

   ```powershell
   npx wrangler pages secret put GITHUB_TOKEN --project-name trackchest-addons
   ```

3. Republie le site (`.\scripts\addon.ps1 publier ...`) : la page **Poster** fonctionne.

Tant que le jeton n'est pas configuré, la page répond « L'envoi d'add-ons n'est pas encore configuré ».

**Protection** : le `.zip` est vérifié avant tout envoi (64 Ko maximum, mêmes règles que TrackChest), les envois venant
d'un autre site sont refusés et un champ piège écarte les robots simples. Toute proposition reste une pull request :
rien n'est publié sans ta relecture. Si le site reçoit trop de propositions indésirables, on peut ajouter Cloudflare
Turnstile (anti-robot gratuit). Si le jeton fuit, révoque-le sur GitHub et crées-en un autre.

## Checklist de relecture (mainteneur)

- [ ] Les contrôles automatiques passent.
- [ ] Le nom, la description et les libellés sont honnêtes (pas de lien, pas d'usurpation, pas de contenu choquant).
- [ ] Les permissions correspondent à ce que l'add-on fait vraiment (les contrôles l'imposent déjà).
- [ ] L'`id` n'imite pas un autre add-on ou un nom de marque.
- [ ] Pour un thème : les couleurs restent lisibles (texte clair sur fond sombre ou l'inverse).
- [ ] Pour un script : lis **tout** `script.js`. Il ne doit afficher que des informations vraies, ne rien cacher
      d'important de façon trompeuse, et rester lisible (pas de code obfusqué ou minifié : refuse-le). Teste-le avec
      `.\scripts\addon.ps1 empaqueter <id> -Exe ...TrackChest.exe` puis dans TrackChest. Le contrôle automatique
      GitHub ne compile pas le script : c'est cette étape qui le fait.
- [ ] Seulement après tout cela, ajoute l'`id` à `registry.json` → `verified`.

## Limites

Aucun système n'offre une sécurité absolue. Ici le risque est réduit par construction (compteurs et thèmes sans code,
scripts dans un bac à sable sans accès au PC), la signature et les empreintes protègent le transport et l'hébergement,
et la relecture protège contre le contenu trompeur. Un add-on malveillant ne peut au pire qu'afficher des chiffres ou
des couleurs trompeurs dans l'overlay, et la révocation permet de le retirer.

## Guide pour les développeurs d'add-ons

Le site est dans `site-src/` et `Build-Index.ps1` copie tout son contenu à la racine du site :

| Fichier | Rôle |
|---|---|
| `index.html` | catalogue : tous les add-ons de `index.json`, recherche, téléchargement |
| `creer.html` | formulaire de création (compteurs, thème, script), téléchargement du `.zip`, envoi |
| `poster.html` | envoi d'un `.zip` |
| `addon-rules.js` | règles de validation, lecture et création de `.zip` ; utilisé par les pages **et** par la fonction d'envoi |
| `style.css` | style commun |
| `addon.schema.json` | schéma pour l'autocomplétion dans VS Code |

Le bouton **Créer un add-on** de la fenêtre Add-on de TrackChest ouvre ce site. Le guide complet (champs, permissions,
compteurs, thème, scripts, exemples) est dans la documentation :
<https://retryprod.gitbook.io/retryprod-docs/add-ons/creer-un-addon>.

Si une règle de validation change, mets à jour ensemble : `src/ChestCounter/Addons.cs`, `scripts/Validate-Addon.ps1`,
`site-src/addon-rules.js` et `site-src/addon.schema.json`.
