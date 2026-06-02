# Design — Flèches de lien Gantt (SP2b)

> Date : 2026-06-02 · Branche `feature/gantt-link-arrows` · Moteur d'ordonnancement niveau phase. SP1/SP2/SP3/SP4 livrés. **Mode autonome** (décisions déléguées).

## 1. Objectif

Dessiner les **dépendances entre phases** comme des **flèches** reliant les barres de la `TimelineView` (Gantt), du **prédécesseur** vers le **successeur**, colorées selon le **chemin critique** (SP2). Purement visuel : aucune modification du modèle ni du scheduler.

## 2. Approche — mesure du DOM (robuste)

La colonne de nom est responsive (`w-20 sm:w-36`) et les barres sont positionnées en `%` dans des pistes flex par ligne. Un calcul purement géométrique (% × hauteurs) serait fragile. On **mesure le DOM rendu** (façon frappe-gantt) :

- Chaque barre reçoit un `ref` indexé par `phase.id` (`barRefs` = `useRef(Map)`).
- Le conteneur des lignes reçoit `containerRef` + `position: relative`.
- Un overlay `<svg>` `absolute inset-0 pointer-events-none` couvre le conteneur.
- `useLayoutEffect` calcule, pour chaque lien, les coordonnées **relatives au conteneur** via `getBoundingClientRect` : départ = bord **droit**, centre vertical de la barre prédécesseur ; arrivée = bord **gauche**, centre vertical de la barre successeur. Chemin = **Bézier cubique** (tolérant à toutes les positions relatives, y compris successeur démarrant avant la fin du prédécesseur en SS/SF) + tête de flèche (`marker-end`).
- Recalcul sur `ResizeObserver(container)` (gardé : `typeof ResizeObserver !== 'undefined'`).
- **Garde jsdom** : `getBoundingClientRect` renvoie 0 en test → coordonnées dégénérées, aucun crash ; si une barre manque, le lien est ignoré.

## 3. Découpage

- **Helper pur** `src/lib/dependencyLinks.js` → `getDependencyLinks(project)` : pour chaque phase (successeur) et chacune de ses dépendances normalisées (`normalizeDependency`), produit `{ fromId, toId, type, critical }`. `critical` = les **deux** extrémités sont sur le chemin critique (`calculateCriticalPath`). Testable.
- **Composant** `src/components/DependencyArrows.jsx` : overlay SVG basé sur la mesure ; props `{ links, barRefs, containerRef }`. Deux `marker` (critique = `--prism-error`, sinon `--muted-foreground`). État local `paths` recalculé en `useLayoutEffect` + `ResizeObserver`.
- **Intégration** `TimelineView.jsx` : `barRefs`/`containerRef`, `ref` sur chaque barre, conteneur des lignes `relative`, rendu de `<DependencyArrows>` dans ce conteneur.

## 4. i18n

Aucune chaîne nouvelle requise (purement graphique). Légende existante du chemin critique réutilisée.

## 5. Tests (TDD)

`getDependencyLinks` (pur) : phase avec dépendance → 1 lien `fromId`=dépendance, `toId`=phase, `type` ; dépendance forme **chaîne** normalisée → `type` `'FS'` ; lien **critique** quand les deux extrémités sont critiques, sinon `false` ; aucune dépendance → `[]`. Composant : build + lint + non-crash (rendu jsdom). Visuel : **vérification manuelle** (overlay au pixel non vérifiable en autonome).

## 6. Rétro-compat & portée

Additif : 1 lib pure + 1 composant overlay + refs dans `TimelineView`. L'overlay est `pointer-events-none` (aucun blocage des tooltips de jalons) et se place **sous** les jalons (`z-10`). **Hors périmètre** : flèches interactives (survol/édition par glisser), styles de lien par type (FS/SS/FF/SF identiques visuellement), réglage esthétique fin (à itérer avec retour visuel).
