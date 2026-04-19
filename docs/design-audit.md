# Audit UX/Design — project-cost-calculator

**Date** : 2026-04-19
**Portée** : Tous les écrans React de l'app + composants partagés + identité visuelle
**Objectif** : Identifier les frictions avant une refonte visuelle complète
**Méthode** : Lecture statique du JSX + inférence des classes Tailwind + simulation mentale mobile/tablette

---

## Résumé exécutif

- **Pas de mobile.** Aucun écran n'est conçu pour fonctionner correctement sous 768 px. Le Gantt (grille CSS à colonnes fixes 200 px + 12 × 1fr) est cassé sous 1100 px. Les tables de RiskRegister, NonLabourCosts, TransitionPlanner sont des `<table>` non-scrollables. PhaseEditor a une grille 6 colonnes qui déborde.
- **Dark mode incomplet.** Le design system définit correctement les tokens CSS (`--card`, `--background`, etc.) mais de nombreux composants hardcodent `bg-white`, `bg-gray-50`, `bg-gray-800`, `bg-gray-100` en dehors du système de tokens — les modals (TemplateManager, ShareDialog) et ResourceForm en sont les cas les plus visibles.
- **Hiérarchie visuelle plate.** Sur presque tous les écrans, les h1/h2/h3 se confondent. Dashboard utilise `text-2xl font-bold` pour le titre de section mais les cards projets utilisent aussi `text-xl font-semibold` pour les noms de projets. ProjectView, CapacityView et ProfileView utilisent tous `text-2xl font-bold` pour leur h1 sans différenciation contextuelle — tout a le même poids visuel.
- **États de chargement absents ou inconsistants.** ResourcePool affiche "Loading…" texte brut. La plupart des autres composants n'ont aucun skeleton, aucun spinner visible. Les erreurs API sont soit silencieuses (console.error), soit des `alert()` natifs du browser (ResourcePool : conflicts 409, suppressions), soit des textes inline sans style d'erreur dédié.
- **Accessibilité insuffisante.** ThemeToggle n'a pas d'aria-label (seulement `title`). GanttBar cliquable n'a pas de rôle button ni d'aria-label. Les boutons icon-only (Trash2, Pencil dans ResourcePool/RiskRegister) n'ont pas d'aria-label. Les tables n'ont pas de `<caption>`. Pas de focus-ring visible audit­é dans le code (le `input-field` en a un, mais les `<button>` raw dans les modals non).
- **Nom produit et identité inexistants.** Le header de l'app affiche "Project Cost Calculator" en texte plat — pas de logo, pas de marque, pas de wordmark. Pour un repo public multi-utilisateurs, c'est une occasion manquée de première impression.

---

## 1. Observations transversales

### 1.1 Système de design actuel

**Tokens bien définis :**
`tailwind.config.js` + `index.css` définissent un système de tokens HSL complet via variables CSS : `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`. Le dark mode toggle via `.dark` sur `<html>` est correctement branché.

**Problèmes de cohérence :**

- `--primary` = indigo (243 75% 59%) est bien utilisé via `bg-primary` / `text-primary` dans les composants ui/button. Mais de nombreux composants utilisent des couleurs brutes Tailwind (`bg-amber-50`, `text-green-600`, `bg-red-50`, `bg-blue-100`) sans passer par des tokens sémantiques. Cela rend le changement de palette difficile.
- `bg-white` et `bg-gray-*` sont utilisés directement dans les modals (TemplateManager, ShareDialog : `bg-white dark:bg-gray-800`), ResourceForm (`bg-gray-50 dark:bg-gray-900`), et plusieurs états de hover dans les boutons custom des modals (`hover:bg-gray-100 dark:hover:bg-gray-700`). Ces couleurs cassent en dark mode si on change l'echelle de gris.
- `.input-field` et `.select-field` dans `index.css` hardcodent `bg-white dark:bg-gray-900` au lieu d'utiliser `bg-background`.
- `--muted` est absent de Tailwind config mais `text-muted-foreground` fonctionne via le token CSS direct — c'est fragile.

**Primitives shadcn utilisées :**
`Button`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Label`, `Switch` (Radix), `AlertDialog` (Radix, présent en dépendance mais non utilisé dans les composants UI actuels). Manquent notamment : `Dialog`, `Popover`, `Sheet`, `Table`, `Tabs`, `Select`, `Badge`, `Skeleton`, `Toast/Sonner`, `Command`, `Tooltip`.

**Conséquence pratique :** Les modals sont construites à la main avec `fixed inset-0 bg-black/50` + div custom au lieu d'utiliser `Dialog` de Radix (accessibilité focus-trap manquante). Les popovers (QuickTransition) sont des div positionnées manuellement. Les tabs dans ProjectView, CapacityView, TemplateManager sont des `<button>` raw avec classes Tailwind custom — inconsistances de style entre les 3 implémentations.

### 1.2 Typographie

- **Font :** Inter via `font-family: 'Inter', system-ui` dans `index.css`. Pas de `@import` ni de `next/font` — Inter est probablement servi depuis le système ou une CDN non déclarée explicitement. À vérifier en prod.
- **Échelle :** Défaut Tailwind non étendu. Utilisé dans le code : `text-xs` (10-11px), `text-sm` (14px), `text-base` (implicite), `text-xl`, `text-2xl`, `text-3xl`. Aucune échelle typographique documentée ou intentionnelle.
- **Hiérarchie h1/h2/h3 :** Pas de balises sémantiques h2/h3 utilisées. Tout est des `<div>` avec classes Tailwind. Seuls les h1 apparaissent (`<h1 className="text-2xl font-bold">`) dans Dashboard, ProjectView, CapacityView, ProfileView. Les sections internes utilisent `CardTitle` (lui-même un `<h3>` dans l'implémentation ui/card) ou des `<h4>` dans quelques endroits (BudgetTracker, RiskRegister). La hiérarchie sémantique est cassée.
- **Font weights :** `font-bold` pour les h1, `font-semibold` pour les CardTitle et certains labels, `font-medium` pour les sous-labels. C'est raisonnable mais non documenté.
- **Body text :** `text-sm` (14px) est la taille dominante dans les tables et formulaires. Acceptable sur desktop, trop petit sur mobile sans zoom.

### 1.3 Layout & spacing

- **Conteneur max-width :** `max-w-5xl mx-auto` (CapacityView, ProfileView) et `container` Tailwind avec `max-w-[1400px]` (App global). Dashboard n'a pas de max-width propre — il hérite du container App. ProjectView non plus.
- **Espacement :** Scale Tailwind standard (`gap-2`, `gap-4`, `gap-6`, `mb-8`, `space-y-4`, `space-y-6`). Globalement cohérent dans les composants récents, moins dans les plus anciens (PhaseEditor mélange `gap-2`, `gap-3`, `gap-4` sans logique apparente).
- **Densité :** Élevée. Les tables (RiskRegister, NonLabourCosts, TransitionPlanner) ont `p-2` sur les cellules — très serré sur desktop, inutilisable sur mobile. PhaseEditor est le composant le plus dense de l'app.
- **Grille App :** L'application n'a pas de layout shell (pas de sidebar, pas de navigation permanente). La nav est une top-bar avec 3 boutons icône (Dashboard, Capacity, User) + ThemeToggle + SaveIndicator + locale switcher. Fonctionnel mais visuellement générique.

### 1.4 États & feedback

| Composant         | Loading                  | Empty               | Error                               | Success                  |
| ----------------- | ------------------------ | ------------------- | ----------------------------------- | ------------------------ |
| ResourcePool      | Texte "Loading…" brut    | ✅ message localisé | `alert()` natif browser             | Aucun (liste se refresh) |
| Dashboard         | Aucun                    | ✅ OnboardingGuide  | Aucun visible                       | Aucun                    |
| CapacityGantt     | Aucun                    | ✅ texte centré     | `previewError` booléen sans message | Aucun                    |
| TransitionPlanner | Aucun                    | —                   | `alert()` natif                     | Aucun                    |
| ApiKeysView       | Probable texte brut      | Probable            | Console.error                       | Aucun toast              |
| AuthPage          | Probable disabled button | —                   | Inline text (probable)              | Redirect                 |
| SaveIndicator     | ✅ Loader2 spinner       | —                   | ✅ AlertCircle                      | ✅ Check + fade          |

**Bilan :** SaveIndicator est le seul composant avec une gestion d'états complète et propre. Les `alert()` et `confirm()` natifs du browser (ResourcePool × 2, TransitionPlanner probable) sont à remplacer impérativement — ils bloquent le thread, cassent le dark mode, et sont inaccessibles.

### 1.5 Responsive

**Aucun écran n'est mobile-first.** Voici le diagnostic par taille :

| Composant            | 320px                                   | 768px (tablet)  | 1440px   |
| -------------------- | --------------------------------------- | --------------- | -------- |
| Dashboard            | Cassé (cards en flex row)               | Utilisable      | ✅       |
| ProjectView (tabs)   | Tabs overflow horizontal non scrollable | Partiel         | ✅       |
| PhaseEditor          | Grille 6-col cassée                     | Cassée aussi    | ✅ dense |
| CapacityGantt        | Inutilisable (200px col fixe)           | Inutilisable    | ✅       |
| RiskRegister table   | Overflow non géré                       | Scroll manquant | ✅       |
| NonLabourCosts table | Overflow non géré                       | Scroll manquant | ✅       |
| TransitionPlanner    | Inutilisable                            | Difficile       | ✅       |
| AuthPage             | Probable OK (form simple)               | OK              | ✅       |
| CapacityView tabs    | `overflow-x-auto` ✅                    | OK              | ✅       |

**Touch targets :** Les boutons icon-only Trash2/Pencil dans ResourcePool et RiskRegister ont `h-7 w-7` (28px) — en dessous des 44px recommandés par Apple/Google pour le touch.

**Bilan responsive :** Seule la CapacityView barre de tabs a `overflow-x-auto`. Le reste est desktop-only. Le Gantt est fondamentalement un composant desktop (grille 12 colonnes fixes) — une stratégie mobile distincte sera nécessaire (ex: vue liste par mois, scroll horizontal natif avec width min fixe).

### 1.6 Accessibilité

- **ARIA sur boutons icon-only :** ThemeToggle (`title="Toggle theme"` uniquement — `title` n'est pas lu par tous les screen readers), Trash2/Pencil dans ResourcePool/RiskRegister (aucun `aria-label`), bouton X de fermeture dans TemplateManager/ShareDialog (aucun `aria-label`).
- **GanttBar cliquable :** `<div onClick>` sans `role="button"` ni `aria-label` ni `tabIndex`. Non atteignable au clavier.
- **Focus states :** `input-field` a `focus:ring-2 focus:ring-primary/20` — visible mais subtil (20% opacité). Les `<button>` raw dans les modals ont `hover:bg-gray-100` mais aucun `focus:` déclaré. Les boutons via ui/button héritent du focus Radix — OK.
- **Contraste :** `text-muted-foreground` en dark mode = HSL(215 20% 55%) sur fond HSL(224 10% 10%) — ratio approximatif ~3.8:1, sous le seuil WCAG AA de 4.5:1 pour le texte normal. À vérifier avec un outil précis.
- **Tables :** Aucune `<caption>`, aucun `scope` sur les `<th>`. Les tables inline de RiskRegister et NonLabourCosts ne sont pas accessibles en navigation clavier/screen reader.
- **Modals :** Pas de `role="dialog"`, pas de `aria-modal="true"`, pas de focus-trap (clic sur overlay ferme mais Tab peut sortir du modal). AlertDialog Radix est installé en dépendance mais non utilisé.
- **Navigation :** Hash router fonctionnel mais pas de `<nav>` sémantique sur la top-bar. Les boutons de navigation (`LayoutDashboard`, `BarChart3`, `User`) n'ont pas d'`aria-label` — seulement des icônes.

---

## 2. Écrans un par un

### 2.1 Dashboard.jsx

**Rôle :** Page d'accueil — liste des projets de l'utilisateur avec stats agrégées, création/duplication/suppression, import/export, et mode comparaison.

**Flow utilisateur :** Arrive depuis l'auth ou le bouton retour de ProjectView/CapacityView → voit la liste des projets → clique pour ouvrir un projet, ou crée/duplique/compare.

**Visual inventory :**

- Structure : top stats row (3 métriques) + liste de cards projets en flex-col + boutons d'action inline par card
- Hiérarchie : titre de section `text-2xl font-bold` en haut, cards projets avec `text-xl font-semibold` pour le nom — ecart insuffisant
- Composants : `Card`, `CardContent`, `Button`, icônes Lucide

**Problèmes identifiés :**

- 🔴 Pas de header visuel de marque — l'app démarre directement sur une liste sans identité. Premier écran vu par tout nouvel utilisateur.
- 🔴 Les stats row (total cost, avg duration, members) n'ont pas de squelette de chargement — elles apparaissent/disparaissent selon que `projects` est vide ou non, créant un layout shift.
- 🟠 Le mode "compare" (checkbox par card) n'est pas découvrable — rien n'indique que cette feature existe avant que l'utilisateur clique sur "Compare" dans la toolbar.
- 🟠 Actions destructives (Delete, sans confirmation dialog) utilisent probablement un confirm() natif — à vérifier (le handler `deleteProject` est dans projectStore, pas de modal custom visible).
- 🟠 Sur mobile : le flex-row des stats et le layout des card actions (boutons inline droite) cassent sur 320px.
- 🟡 `text-muted-foreground` pour les dates de dernière modification — lisibilité faible en dark mode.
- 🟡 L'icône `FolderOpen` utilisée pour "Ouvrir projet" et `GitCompare` pour compare — cohérente avec Lucide mais manque de label textuel sur les petits écrans.

**Opportunités :**

- Ajouter un header hero minimal avec logo/wordmark + tagline pour les nouveaux utilisateurs.
- Remplacer le confirm() par AlertDialog Radix pour la suppression.
- Cards projets → pointer vers un pattern "project card" plus riche : statut budget (pastille verte/rouge), progression, équipe en avatars.
- **Mobile :** Empiler les actions en menu contextuel (…) par card, stat row en grille 1×3 scrollable.

---

### 2.2 OnboardingGuide.jsx

**Rôle :** Guide 4 étapes affiché au-dessus de la Dashboard quand aucun projet n'existe encore (ou que certaines étapes ne sont pas complétées).

**Flow utilisateur :** Affiché automatiquement → l'utilisateur suit les 4 steps → chaque step est un lien vers une section de l'app.

**Visual inventory :**

- Structure : 4 cards horizontales en grid avec icône, numéro, titre, description, bouton CTA
- Utilise `Card`, `Button`, icônes Lucide

**Problèmes identifiés :**

- 🔴 Le guide est affiché par-dessus ou à côté de la Dashboard (App.jsx le monte avant Dashboard dans le JSX) — la hiérarchie et le positionnement exact méritent vérification sur petit écran où les 4 cards côte à côte cassent.
- 🟠 Pas de persistance de progression — si l'utilisateur complète l'étape 2 et revient, le guide recommence depuis 0. L'état "complété" devrait être sauvegardé (localStorage ou user preferences).
- 🟠 La grille 4-colonnes est non responsive — sur tablet elle passera probablement en 2×2 si `md:grid-cols-4` est utilisé, mais pas spécifié dans l'audit de code (inféré).
- 🟡 Les numéros d'étape (1, 2, 3, 4) dans des cercles — pas d'indication visuelle de step actif vs complété.

**Opportunités :**

- Transformer en stepper horizontal avec état complété/actif/futur.
- Persister le completion state par step en localStorage.
- **Mobile :** Carousel horizontal ou accordion vertical.

---

### 2.3 ProjectView.jsx

**Rôle :** Éditeur principal d'un projet — onglets Résumé, Phases, Budget, Non-Labour, Risques, Graphiques, Timeline.

**Flow utilisateur :** Clique sur un projet dans Dashboard → arrive sur ProjectView → navigue entre les onglets.

**Visual inventory :**

- Structure : header projet (nom + dates + monnaie) + barre de tabs + contenu de l'onglet actif
- Header avec actions (Share, History, Templates, Print, Export)
- Tabs : custom `<button>` avec `border-b-2` active state

**Problèmes identifiés :**

- 🔴 La barre de tabs horizontale (~7 onglets) n'a pas `overflow-x-auto` ni gestion de scroll horizontal sur mobile. Sur 320px, les onglets débordent et sont invisibles.
- 🟠 Les actions de header (Share, History, Templates, Print, Export) sont 5+ boutons en flex-row — sur tablette elles se chevauchent ou se tronquent.
- 🟠 Le nom de projet en mode édition (input inline) n'a pas de visual feedback clair de l'état "en édition" vs "en affichage".
- 🟠 `text-2xl font-bold` pour le titre est identique à Dashboard et CapacityView — pas de différenciation contextuelle (on est dans un projet, pas au niveau racine).
- 🟡 Les onglets utilisent des icônes + labels — bon. Mais l'onglet actif est seulement indiqué par `border-b-2 border-primary` — peu visible, surtout en dark mode où le contraste de la primary sur fond sombre est subtil.
- 🟡 Pas de `overflow-x-auto` sur l'onglet actif pour les sous-contenus larges.

**Opportunités :**

- Tabs avec `overflow-x-auto` + `scrollbar-none` + `scroll-smooth`.
- Actions de header → `DropdownMenu` pour les actions secondaires (History, Templates, Print, Export), garder seulement Share comme action primaire visible.
- **Mobile :** Tabs → `<select>` ou Sheet bottom navigation.

---

### 2.4 PhaseEditor.jsx

**Rôle :** Éditeur d'une phase de projet — nom, dates, dépendances, équipe (rôles, niveaux, allocations, quantités).

**Flow utilisateur :** Depuis l'onglet Phases de ProjectView → expand une phase → édite ses membres d'équipe.

**Visual inventory :**

- Structure : header phase (collapse/expand) + grille 6 colonnes pour les membres d'équipe (rôle, niveau, allocation %, quantité, coût, actions)
- Grille CSS grid-cols avec inputs inline

**Problèmes identifiés :**

- 🔴 La grille 6-colonnes des membres d'équipe n'a pas de breakpoints — sur 768px elle est déjà serrée, sur 320px elle déborde hors écran. Pas d'`overflow-x-auto` sur le conteneur de la grille.
- 🔴 Les labels de colonnes (Rôle, Niveau, Allocation, Quantité, Coût/sem, Actions) sont probablement absents ou implicites — audit de code suggère une grille sans header de colonnes visible, les inputs sont self-labelled par placeholder uniquement. Problème d'accessibilité et de compréhension pour les nouveaux utilisateurs.
- 🟠 `select-field` et `input-field` custom dans la grille — pas de `<label>` associé, seulement placeholder. Sur mobile avec un clavier virtuel, les inputs sont inaccessibles dans une grille compressée.
- 🟠 Ajout de membre d'équipe avec bouton PlusCircle — feedback d'ajout immédiat, mais pas de validation inline visible (qu'arrive-t-il si allocation > 100% ?).
- 🟡 L'info-bulle de coût (`calculatePhaseTotalCost`) est recalculée à chaque render — pas de problème UX mais implique que l'affichage du coût est dans la même grille que les inputs, ce qui surcharge visuellement la ligne.

**Opportunités :**

- Sur mobile : transformer la grille de membres en cards empilées avec label/valeur explicites.
- Ajouter des headers de colonnes même sur desktop pour la lisibilité.
- Validation inline avec message d'erreur si allocation > 100%.
- **Mobile :** Sheet (bottom drawer) pour éditer un membre individuel.

---

### 2.5 ProjectSummary.jsx

**Rôle :** Tableau de bord financier du projet — coûts totaux, par phase, avec contingence et taxes optionnelles.

**Flow utilisateur :** Onglet "Résumé" de ProjectView → vue d'ensemble des coûts.

**Visual inventory :**

- Structure : grid de cards métriques + tableau de phases + toggles (contingence, taxes)
- Utilise `Card`, `CardHeader`, `CardTitle`, `CardContent`

**Problèmes identifiés :**

- 🟠 Le grid de métriques numériques utilise probablement `grid-cols-2 md:grid-cols-4` — sur 320px les chiffres monétaires longs (6-7 caractères) sont tronqués ou en ligne.
- 🟠 Le tableau de phases par coût n'a pas d'`overflow-x-auto` — même risque de débordement que les autres tables.
- 🟡 Les toggles (contingence, taxes) sont des `<Switch>` Radix — bien, mais leur placement exact dans le layout (en haut ? en bas ?) n'est pas immédiatement compréhensible sans contexte — ils affectent tous les chiffres affichés.
- 🟡 Pas de total "grand total" mis en valeur visuellement — noyé parmi les autres métriques avec le même poids visuel.

**Opportunités :**

- Mettre le grand total en typographie `text-3xl font-bold` avec couleur primaire.
- Barre de répartition visuelle labour vs non-labour (analogue à BudgetTracker).
- **Mobile :** Métriques en liste verticale avec label/valeur sur 2 colonnes au lieu de grid 4-col.

---

### 2.6 TimelineView.jsx

**Rôle :** Timeline visuelle des phases du projet avec barres proportionnelles par semaine.

**Flow utilisateur :** Onglet "Timeline" → vue Gantt simplifiée des phases.

**Visual inventory :**

- Structure : header avec légende + div conteneur de barres positionnées en `relative`/`absolute` avec `left` et `width` calculés en %
- Marqueurs de semaines, barre de progression par phase

**Problèmes identifiés :**

- 🔴 Le positionnement `absolute` avec `left/width` en pourcentage implique une largeur min du conteneur pour être lisible. Sur mobile (320px) les barres sont trop fines pour afficher les labels de phases.
- 🟠 Pas de scroll horizontal ni de zoom — si le projet fait 52 semaines, chaque semaine fait ~0.5% de la largeur sur mobile.
- 🟠 Les marqueurs de semaines (`weekMarkers`) génèrent 1 label par semaine — sur mobile tout se superpose.
- 🟡 Les phases dépendantes (calcul de `calculateProjectDurationWithDependencies`) sont représentées mais les flèches de dépendances ne sont pas visualisées.

**Opportunités :**

- Wrapping dans `overflow-x-auto` avec largeur min fixe (ex: 800px) permettant un scroll horizontal natif.
- Sur mobile : n'afficher que les mois plutôt que les semaines comme unité.
- Ajouter un export image/PNG de la timeline.
- **Mobile :** Vue liste des phases avec dates en mode condensé par défaut, timeline en mode "avancé".

---

### 2.7 BudgetTracker.jsx

**Rôle :** Barre de santé budgétaire avec alertes de seuil et breakdown labour/non-labour.

**Flow utilisateur :** Onglet Budget de ProjectView → vue du burn rate et de l'état budgétaire.

**Visual inventory :**

- Barre de progression colorée (vert/amber/rouge) + grid de métriques (`grid-cols-2 md:grid-cols-4`) + alerte threshold + breakdown mini-barres

**Problèmes identifiés :**

- 🟠 `border-amber-300 bg-amber-50 text-amber-800` sur le panel d'alerte — utilise des couleurs sémantiques hardcodées Tailwind plutôt que le token `--destructive` ou un token `--warning`. En dark mode, `bg-amber-50` sur fond sombre est potentiellement invisible.
- 🟠 Sur mobile : `grid-cols-2` (fallback mobile) affiche 2 métriques par ligne avec des grands chiffres monétaires — potentiellement tronqués.
- 🟡 La barre de progression `h-3` — correcte mais peu distinctive visuellement vs les mini-barres du breakdown qui sont `h-2`.

**Opportunités :**

- Remplacer `bg-amber-50` par `bg-warning/10` une fois un token `--warning` défini.
- Barre de progression animée à l'entrée (entrée en vue ou mount).
- **Mobile :** Stack les métriques en liste plutôt qu'en grille 2-col.

---

### 2.8 NonLabourCosts.jsx

**Rôle :** Table éditable de coûts non-labour (infrastructure, licences, SaaS, travel, etc.) avec formulaire d'ajout inline.

**Flow utilisateur :** Onglet "Non-Labour" de ProjectView → ajoute/édite/supprime des lignes de coût.

**Visual inventory :**

- Formulaire d'ajout en `grid-cols-3` + `<table>` d'édition inline + breakdown par catégorie

**Problèmes identifiés :**

- 🔴 La `<table>` d'édition n'a pas de `overflow-x-auto` — sur mobile elle déborde.
- 🔴 Le formulaire d'ajout en `grid-cols-3` (Nom | Catégorie | Montant) est trop serré sur mobile — les 3 champs en colonne à 33% sont illisibles sur 320px.
- 🟠 Les inputs inline dans la table (Nom, Montant) n'ont pas de `<label>` associé — uniquement identifiés par leur position dans la colonne.
- 🟠 Le bouton Trash2 inline (`h-7 w-7`, 28px) est en dessous des recommandations touch (44px).
- 🟡 Pas de confirmation avant suppression d'une ligne de coût.
- 🟡 L'état vide affiche `t('nonLabour.empty')` — bien, mais sans CTA pour ajouter (le bouton Add est dans le header de la Card — pas évident que c'est le même flow).

**Opportunités :**

- `overflow-x-auto` sur le wrapper de table.
- Formulaire d'ajout en layout vertical sur mobile.
- Bouton suppression avec AlertDialog Radix ou au moins une confirmation inline.
- **Mobile :** Passer de table à liste de cards par ligne.

---

### 2.9 RiskRegister.jsx

**Rôle :** Registre des risques avec table éditable et matrice de chaleur 5×5 (probabilité × impact).

**Flow utilisateur :** Onglet Risques → ajoute des risques, visualise leur score, consulte la matrice.

**Visual inventory :**

- RiskMatrix : grid inline `w-10` × 5 colonnes × 5 lignes — largeur fixe ~50-60px × 5 = ~250-300px minimum
- Table de risques : 6 colonnes (Risk, Description, Prob, Impact, Score, Mitigation, Actions)

**Problèmes identifiés :**

- 🔴 La `RiskMatrix` utilise des `w-10` (40px) × 5 colonnes = 200px minimum + labels = ~280px total. Sur 320px ça passe à peine, mais les inputs textarea en dessous ne passent pas.
- 🔴 La table des risques est la plus large de l'app (6-7 colonnes avec textarea) — totalement inutilisable sur mobile sans `overflow-x-auto`.
- 🟠 Boutons Trash2 de suppression : `h-7 w-7 p-0` (28px) — sous les 44px recommandés.
- 🟠 Les `<select>` de probabilité/impact dans la table (1-5) n'ont pas de `<label>` — seulement position.
- 🟡 La matrice de chaleur est une feature puissante mais son explication ("Probability × Impact") n'est pas présente dans l'UI pour les nouveaux utilisateurs.
- 🟡 Le score calculé (`prob × impact`) s'affiche comme badge coloré — bien conçu, mais le mapping de couleur (≤6 vert, ≤15 amber, >15 rouge) n'est pas légendé.

**Opportunités :**

- `overflow-x-auto` sur la table.
- Ajouter une légende "Score : 1-6 Faible / 7-15 Moyen / 16-25 Élevé" sous la matrice.
- Sur mobile : édition des risques dans un Sheet bottom-drawer plutôt qu'inline dans une table.
- **Mobile :** Matrice → gardée (elle rentre à ~280px) ; table → liste de cards accordion.

---

### 2.10 CostCharts.jsx

**Rôle :** Visualisation des coûts en 3 vues switchables : par rôle, par phase, par catégorie — pie chart SVG + bar chart horizontal.

**Flow utilisateur :** Onglet Graphiques de ProjectView → sélectionne une vue de décomposition des coûts.

**Visual inventory :**

- Toggle 3 boutons (By Role / By Phase / By Category) + PieChart SVG 200×200 + BarChart horizontal

**Problèmes identifiés :**

- 🔴 `flex items-center gap-8` pour le layout PieChart + légende — sur 320px le flex row colle le pie (200px) et la légende, ne laissant que 120px pour la légende. Légendes tronquées garanties.
- 🟠 SVG pie chart sans `aria-label` ni `<title>` SVG — invisible aux screen readers.
- 🟠 Le hover state sur les slices du pie (`setHovered`) ne fonctionne pas sur touch (pas d'equivalent `onTouchStart`).
- 🟠 Pas de chart library — le SVG custom est bien pour l'indépendance, mais les couleurs hardcodées dans `CHART_COLORS` ne respectent pas les tokens du design system.
- 🟡 Le toggle "By Role / By Phase / By Category" est en haut à droite du CardHeader — placement peu conventionnel (on attendrait ces tabs sous le titre, pas en ligne avec lui).
- 🟡 Quand `!hasData`, le composant ne rend rien visible (les charts renvoient `null`) — l'espace reste vide sans message explicatif.

**Opportunités :**

- `flex-col sm:flex-row` pour le layout pie + légende.
- Ajouter un état vide "Aucune donnée de coût disponible — ajoutez des phases avec des membres d'équipe."
- `<title>` SVG + `aria-describedby` pour l'accessibilité.
- **Mobile :** Pie + légende en colonne, BarChart reste lisible.

---

### 2.11 CapacityView.jsx

**Rôle :** Container parent de la section Capacité — 4 onglets : Resources, Gantt, Transitions, Rates.

**Flow utilisateur :** Bouton "Capacity" dans la top-bar → vue 4 onglets avec back button vers Dashboard.

**Visual inventory :**

- Header avec back button + `<h1>` + barre de tabs avec `overflow-x-auto`
- `max-w-5xl mx-auto` comme conteneur

**Problèmes identifiés :**

- 🟠 `h1 className="text-2xl font-bold"` identique au Dashboard et ProjectView — aucune différenciation contextuelle dans la hiérarchie de navigation.
- 🟠 Le sélecteur de plan de preview Gantt (`<select>` + label) est rendu dans le wrapper de CapacityView avant le Gantt — son existence révèle une feature (preview mode) qui n'est pas intuitive pour les nouveaux utilisateurs.
- 🟡 `max-w-5xl` (1024px) force une colonne centrale — bien intentionné mais peut sembler "étroit" sur un 1440px avec beaucoup de contenu Gantt.
- 🟡 Le `back button` est un `<Button variant="ghost">` avec `ArrowLeft + texte` — fonctionnel mais la navigation back/forward du browser est désynchronisée (hash router).

**Opportunités :**

- Breadcrumb contextuel au lieu du back button simple.
- Le sélecteur de preview Gantt → intégrer directement dans le header du CapacityGantt.
- **Mobile :** `max-w-5xl` → passer en full-width sur mobile, le Gantt nécessitera un `min-w` avec scroll.

---

### 2.12 CapacityGantt.jsx

**Rôle :** Gantt 12 mois des assignments de ressources, groupés par projet ou par type, avec preview mode pour les transitions.

**Flow utilisateur :** Onglet Gantt de CapacityView → navigue entre les mois → clique sur une barre consultant pour QuickTransition.

**Visual inventory :**

- Grille CSS : `200px repeat(12, 1fr)` — 13 colonnes
- Nested grids par ressource
- Preview mode avec barres hachurées (CSS repeating-linear-gradient)
- Banner de preview + toggle "Show current state"
- UtilizationSummary en bas

**Problèmes identifiés :**

- 🔴 La colonne nom ressource est `200px` fixe + 12 colonnes `1fr`. Sur un écran de 768px, chaque colonne mois = (768-200)/12 = ~47px — trop étroit pour le label et le pourcentage dans GanttBar (le texte est `text-xs` tronqué). Sur 320px, inutilisable.
- 🔴 Aucun scroll horizontal natif sur le Gantt — le conteneur n'a pas `overflow-x-auto`. Le Gantt déborde silencieusement.
- 🟠 Le preview mode (barres hachurées rouge/vert/jaune) est une feature UX avancée mais non documentée dans l'UI — aucun tooltip ni légende expliquant ce que signifient les couleurs hachurées (sauf la `title` prop sur les divs).
- 🟠 Le `quickTransition` state ouvre un popover positionné à `fixed` relativement à la barre Gantt cliquée — le positionnement manuel sans `Popover` Radix peut créer des overlaps en scroll.
- 🟠 `setPreviewError(true)` sans message — si le plan de preview fail à charger, l'utilisateur ne sait pas pourquoi.
- 🟡 Le collapse/expand des groups (project ou type) avec `ChevronDown/Up` — le toggle est sur un `<div onClick>` sans rôle, non atteignable au clavier.
- 🟡 La navigation mois (`ChevronLeft/ChevronRight`) avec `size="sm"` — target 32px, sous le seuil touch.

**Opportunités :**

- Wrapper Gantt dans `overflow-x-auto` avec `min-width: 900px` pour permettre un scroll natif.
- Légende visuelle pour le preview mode (actuel vs prévu vs overlap).
- Remplacer QuickTransition popover par `Popover` Radix pour gestion focus et clipping.
- **Mobile :** Vue liste par ressource (lignes) avec mois scrollables horizontalement. Considérer un composant mobile séparé.

---

### 2.13 ResourcePool.jsx

**Rôle :** Liste CRUD des ressources de l'enterprise pool — nom, rôle, niveau, capacité max, badge type.

**Flow utilisateur :** Onglet Resources de CapacityView → filtre/cherche → ajoute/édite/supprime.

**Visual inventory :**

- Search input + bouton Add + table filterable
- Badge "Permanent" / "Consultant" dérivé du level
- ResourceForm inline en mode ajout/édition

**Problèmes identifiés :**

- 🔴 Erreurs CRUD surfacées via `alert()` natif — bloque le thread, non accessible, casse l'UX dark mode.
- 🔴 `confirm()` natif pour la suppression — même problème.
- 🟠 Loading state : `loading ? "Loading..." : <table>` — texte brut sans skeleton, pas de hauteur min → layout shift à la résolution.
- 🟠 La table des ressources : sur mobile la colonne "Max Capacity" et les boutons d'action peuvent déborder.
- 🟠 Les boutons Pencil et Trash2 (`h-7 w-7`, 28px) sont sous le seuil touch.
- 🟡 La dérivation "Permanent / Consultant" depuis le `level` est documentée en commentaire de code mais invisible pour l'utilisateur — aucune explication dans l'UI de ce que signifie ce badge.

**Opportunités :**

- Remplacer `alert()`/`confirm()` par AlertDialog Radix + toast de succès.
- Skeleton loading : 5 lignes de placeholder `h-10 animate-pulse bg-muted rounded`.
- Boutons action → 44px minimum avec `p-3` ou `size="icon"` en `h-9 w-9`.
- **Mobile :** Table → liste de cards par ressource avec actions en swipe ou menu contextuel.

---

### 2.14 ResourceForm.jsx

**Rôle :** Formulaire inline de création/édition d'une ressource (nom, rôle, niveau, capacité max).

**Flow utilisateur :** Bouton Add/Edit dans ResourcePool → ResourceForm apparaît au-dessus de la table.

**Visual inventory :**

- `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4` — 4 champs en ligne sur desktop
- Boutons Save (Check) et Cancel (X) à droite
- `bg-gray-50 dark:bg-gray-900` hardcodé

**Problèmes identifiés :**

- 🟠 `bg-gray-50 dark:bg-gray-900` hardcodé — à remplacer par `bg-secondary/30` pour cohérence avec les tokens.
- 🟠 Les boutons Check et X (Save/Cancel) sont `<Button>` avec seulement une icône — pas d'`aria-label`.
- 🟠 Sur mobile (`grid-cols-1`) les 4 champs s'empilent correctement — mais le formulaire est inline dans la table, ce qui crée un décalage visuel si la table est en `overflow-x-auto`.
- 🟡 `autoFocus` sur le champ name — bien pour l'UX desktop, mais peut causer un scroll indésirable sur mobile.
- 🟡 Validation : `if (!name.trim()) return` sans feedback visuel — le formulaire refuse silencieusement la soumission.

**Opportunités :**

- Ajouter `aria-label` aux boutons Check/X.
- Feedback de validation inline : border rouge + message "Le nom est requis."
- En mobile : ouvrir dans un Sheet Radix au lieu d'une ligne inline.

---

### 2.15 TransitionPlanner.jsx

**Rôle :** Créateur de plans de transition consultant → permanent — définit les lignes de transition avec calcul d'impact coûts.

**Flow utilisateur :** Onglet Transitions → bouton New Plan → TransitionPlanner → définit N transitions → calcule l'impact → applique ou sauvegarde.

**Visual inventory :**

- Header plan (nom, statut) + tableau de transitions (Consultant, Remplaçant, Date, Durée overlap, Économies)
- Panel d'impact financier (savings total, coût overlap, économie nette)
- Boutons Apply/Save/Cancel

**Problèmes identifiés :**

- 🔴 Le tableau de transitions est une grille dense (5-6 colonnes avec selects) — identique aux autres tables, même problème mobile.
- 🟠 Les `<select>` pour choisir Consultant et Remplaçant sont des selects HTML natifs avec les ressources du pool — si le pool a 50 ressources, l'UX est peu ergonomique. Un `Combobox` / `Command` serait plus adapté.
- 🟠 Le calcul d'impact (savings, overlap cost) s'affiche dans un panel à droite ou en bas — sa visibilité dépend de la hauteur de l'écran ; peut être hors viewport sur mobile.
- 🟠 L'action "Apply" (irréversible par design) n'a pas de dialog de confirmation visible dans le JSX audité — vérifier `handleApply()`. Si elle appelle `applyTransition()` directement, c'est critique.
- 🟡 Le statut du plan (draft, applied) est textuel — pas de badge visuel coloré.

**Opportunités :**

- Remplacer les selects de ressources par Combobox avec search.
- AlertDialog Radix pour la confirmation d'Apply (irréversible).
- Calcul d'impact toujours visible (sticky bottom panel).
- **Mobile :** Chaque ligne de transition → accordion expandable avec sous-form.

---

### 2.16 TransitionList.jsx

**Rôle :** Liste des plans de transition existants avec status, actions (Edit, Preview, Delete).

**Flow utilisateur :** Onglet Transitions (état par défaut) → liste des plans → actions par plan.

**Visual inventory :**

- Table ou liste de plans avec status badge + dates + actions
- Bouton "Preview" → redirige vers CapacityGantt avec plan sélectionné

**Problèmes identifiés :**

- 🟠 Le bouton "Preview" navigue vers le Gantt via `navigate('capacity/gantt?preview=id')` — l'URL query string est parsée manuellement dans CapacityView. C'est fragile et non standard.
- 🟠 Status badge (draft/applied) en texte uniquement ou badge simple — couleur sémantique absente des tokens.
- 🟡 La liste vide devrait avoir un CTA "Créer un premier plan" direct.

**Opportunités :**

- Status badge via un composant `Badge` avec variants (draft=muted, applied=green, archived=gray).
- Lien Preview → utiliser état React plutôt que query string parsée manuellement.
- **Mobile :** Cards par plan au lieu d'une table.

---

### 2.17 QuickTransition.jsx

**Rôle :** Popover de transition rapide consultant → permanent déclenché au clic sur une barre Gantt.

**Flow utilisateur :** Clic sur barre consultant dans Gantt → popover contextuel → sélectionne un remplaçant et une date → crée un plan draft.

**Visual inventory :**

- Div `fixed` positionnée manuellement relative au clic
- Form avec selects + date inputs + bouton Create Plan

**Problèmes identifiés :**

- 🔴 Popover positionné en `position: fixed` avec coordonnées calculées depuis `getBoundingClientRect()` — peut sortir du viewport, se superposer à d'autres éléments, ne gère pas le scroll. Pas de focus-trap ni de fermeture sur Escape correctement gérée au niveau DOM.
- 🔴 Sur mobile, un fixed popover au milieu d'un Gantt scrollable est inutilisable — le clavier virtuel peut cacher le popover.
- 🟠 Pas de `role="dialog"` ni `aria-label` sur le popover.
- 🟡 Les selects (Consultant, Remplaçant) reprennent les mêmes problèmes que TransitionPlanner — pas de search/combobox.

**Opportunités :**

- Remplacer par `Popover` Radix UI avec gestion automatique du clipping et du focus.
- Sur mobile : Sheet bottom-drawer au lieu d'un popover.

---

### 2.18 ScenarioComparison.jsx

**Rôle :** Comparaison côte à côte de N projets sélectionnés depuis le Dashboard.

**Flow utilisateur :** Dashboard → mode Compare → sélectionne ≥2 projets → ScenarioComparison se monte à la place du Dashboard.

**Visual inventory :**

- Layout horizontal avec une colonne par projet
- Métriques (coût total, durée, membres, budget status) par projet
- Bouton retour vers Dashboard

**Problèmes identifiés :**

- 🔴 Layout horizontal avec N colonnes — sur mobile avec 3-4 projets comparés, les colonnes sont trop étroites. Pas de scroll horizontal natif.
- 🟠 Les métriques affichées par projet sont probablement les mêmes que le ProjectSummary — duplication de logique d'affichage sans composant partagé.
- 🟡 Pas de capacité d'export de la comparaison (PDF, CSV).

**Opportunités :**

- `overflow-x-auto` sur le conteneur de comparaison.
- Sur mobile : tabs (un tab par projet) au lieu de colonnes côte-à-côte.

---

### 2.19 RolesRatesManager.jsx

**Rôle :** Gestionnaire des taux tarifaires enterprise (rôles × niveaux) — lecture et édition des rates CONSULTANT_RATES.

**Flow utilisateur :** Onglet Rates de CapacityView → tableau des taux par rôle/niveau → édition inline.

**Visual inventory :**

- Table avec rôles en lignes, niveaux en colonnes (ou inverse)
- Inputs numériques inline pour chaque cellule
- Bouton Save global

**Problèmes identifiés :**

- 🟠 Table de taux avec N rôles × M niveaux — large sur desktop, cassée sur mobile.
- 🟠 Inputs numériques inline dans une table — mêmes problèmes d'`overflow-x-auto` manquant.
- 🟡 Pas de feedback de sauvegarde visible (le bouton Save est global — pas d'auto-save contrairement au reste de l'app).
- 🟡 Aucune validation du format de taux (ex: valeur négative, valeur > 9999$/h).

**Opportunités :**

- `overflow-x-auto` sur le wrapper table.
- Auto-save avec débounce (cohérent avec le reste de l'app) ou confirmation explicite.
- **Mobile :** Accordion par rôle avec niveaux en sous-liste.

---

### 2.20 ProfileView.jsx

**Rôle :** Page profil — identité utilisateur + gestion clés API + testeur API.

**Flow utilisateur :** Bouton User dans top-bar → ProfileView avec 3 sections.

**Visual inventory :**

- `max-w-3xl mx-auto` + header utilisateur (icône + nom/email) + `<hr>` + ApiKeysView + `<hr>` + ApiTester
- Header `text-2xl font-bold` identique aux autres sections

**Problèmes identifiés :**

- 🟠 La page Profile contient ApiTester — un outil de développement dans une page de profil utilisateur est un mélange de niveaux d'abstraction (profil = settings utilisateur ; testeur API = dev tool). Devrait être dans une section "Developer" ou "Avancé".
- 🟠 Les `<hr className="border-border">` comme séparateurs sont visuellement discrets — une card par section serait plus claire.
- 🟡 L'avatar utilisateur est un `w-10 h-10 rounded-full bg-primary/10` avec icône `User` — placeholder minimal, pas d'initiales utilisateur, pas de support d'avatar réel.
- 🟡 `{user.name} · {user.email}` en `text-sm text-muted-foreground` — trop de contenu en petit texte discret.

**Opportunités :**

- Séparer ApiTester dans une section "Developer Settings" ou l'enlever de ProfileView.
- Avatar avec initiales de l'utilisateur.
- Cards par section avec titre explicite.
- **Mobile :** La page est column-flex — OK sur mobile.

---

### 2.21 ApiKeysView.jsx

**Rôle :** Génération, liste et révocation des clés API de l'utilisateur.

**Flow utilisateur :** Section de ProfileView → génère une clé → copie → révoque si nécessaire.

**Visual inventory :**

- Bouton "Generate New Key" + table de clés (name, created, last used, actions)
- Key value masquée avec bouton copy

**Problèmes identifiés :**

- 🟠 Taille de l'audit de code suggère un composant dense (16KB JSX) — probablement beaucoup de logique inline et de gestion d'états complexe qui méritera d'être refactorisée.
- 🟠 La clé API révélée après génération est probablement affichée dans un input ou une div — si elle est displayed une seule fois, l'UI doit le communiquer clairement ("Copiez maintenant, vous ne la reverrez plus").
- 🟡 Loading state probable en texte brut.

**Opportunités :**

- Alert prominente "Cette clé ne sera plus affichée après fermeture" avec bouton Copy obligatoire.
- Skeleton loading.
- **Mobile :** Table → liste de cards.

---

### 2.22 ApiTester.jsx

**Rôle :** Testeur d'endpoints API intégré — sélectionne un endpoint, remplit les paramètres, exécute, affiche la réponse.

**Flow utilisateur :** Section de ProfileView → sélectionne endpoint → exécute → voit la réponse JSON.

**Visual inventory :**

- Select d'endpoint + form paramètres dynamiques + bouton Execute + affichage réponse JSON

**Problèmes identifiés :**

- 🟠 Un testeur API dans l'UI production est inhabituel — présuppose un utilisateur technique. Pour un repo public, cela peut créer de la confusion.
- 🟠 La réponse JSON est probablement rendue en `<pre>` ou dans un `<div>` — pas de syntax highlighting.
- 🟡 25KB de JSX pour un testeur API inline — complexité élevée pour un composant accessoire.

**Opportunités :**

- Conditionner l'affichage à un flag `user.is_admin` ou une env var `VITE_SHOW_API_TESTER`.
- Ou extraire dans un onglet séparé "/developer" dans le hash router.

---

### 2.23 AuthPage.jsx

**Rôle :** Écran de login et d'inscription — première page vue par un nouvel utilisateur non authentifié.

**Flow utilisateur :** Accès direct → AuthPage → login/register → Dashboard.

**Visual inventory :**

- Form centré avec tabs Login/Register
- Champs email + mot de passe (+ nom pour register)
- Bouton submit

**Problèmes identifiés :**

- 🟠 AuthPage est la seule page où une identité visuelle forte a de l'impact — c'est la première impression. Sans logo ni marque, l'app ressemble à un boilerplate générique.
- 🟠 10KB JSX pour un form d'auth — probable gestion d'états d'erreur en local state, mais sans toast/dialog Radix.
- 🟡 Pas de lien "mot de passe oublié" visible (probable absence — feature non implémentée).
- 🟡 Le feedback d'erreur (mauvais mot de passe, email inconnu) est probablement en texte inline — bien, mais le style du message d'erreur n'est pas auditable sans voir le JSX complet.

**Opportunités :**

- Ajouter logo + nom de marque en haut du form.
- Card centrée sur fond `bg-background` avec box-shadow — profiter de la page vierge pour créer une impression.
- **Mobile :** Form centré OK — ajouter `min-h-screen flex items-center` pour centrage vertical.

---

### 2.24 Composants secondaires (traitement groupé)

**ThemeToggle :**

- Bouton `variant="ghost"` avec Sun/Moon icon — propre et fonctionnel
- 🟠 `title="Toggle theme"` au lieu d'`aria-label` — non lu par tous les screen readers
- 🟡 Pas de transition animée entre les états (pourrait avoir un `rotate` ou `scale` animation)

**SaveIndicator :**

- Bien conçu : 4 états (idle, saving, saved, error), fade-out sur "saved", icônes Lucide, localisé
- 🟡 `text-xs` (11px) très petit — potentiellement illisible sans loupe sur mobile

**ShareDialog :**

- Modal custom avec `fixed inset-0 bg-black/50` — pas de focus-trap Radix
- 🟠 `bg-white dark:bg-gray-800` hardcodé — doit utiliser `bg-card`
- 🟠 Pas de `role="dialog"` ni `aria-modal`

**TemplateManager :**

- Modal identique à ShareDialog en termes de structure
- 🟠 `bg-gray-100 dark:bg-gray-700` pour les tab buttons inactifs — hardcodé
- 🟡 Tabs custom dans le modal — 3ème implémentation différente des tabs (après ProjectView et CapacityView)

**GanttBar :**

- `<div>` clickable sans `role="button"` ni `tabIndex` pour les barres consultant
- 🟠 `text-white` hardcodé — peut manquer de contraste sur des couleurs de bar claires
- 🟡 `min-h-[28px]` — sous le seuil touch de 44px

**UtilizationSummary :**

- Visuellement bien — couleurs sémantiques (vert/amber/rouge), alignement parfait avec la grille Gantt
- 🟡 Aucun loading/empty state — apparaît vide si pas de données

**ResourceConflicts :**

- 🟟 Le design de l'alerte (`bg-amber-50 border border-amber-200 text-amber-800`) utilise des couleurs Tailwind hardcodées — inconsistant avec le design system token-based
- 🟡 L'état "aucun conflit" avec `bg-green-50` est bien — mais le design est inconsistant avec les autres states de succès de l'app

**VersionHistory :**

- Non audité (non inclus dans la liste des composants visibles dans le source tree mais présent)

---

## 3. Hiérarchie des refontes proposées

| #   | Écran / Composant                                                             | Impact                               | Complexité  | Priorité |
| --- | ----------------------------------------------------------------------------- | ------------------------------------ | ----------- | -------- |
| 1   | AuthPage                                                                      | Très haut (1ère impression + marque) | Faible      | ⭐⭐⭐   |
| 2   | Dashboard                                                                     | Très haut (hub principal + marque)   | Moyenne     | ⭐⭐⭐   |
| 3   | App layout shell (top-nav)                                                    | Très haut (navigation globale)       | Moyenne     | ⭐⭐⭐   |
| 4   | CapacityGantt (mobile + accessibilité)                                        | Haut (feature phare)                 | Haute       | ⭐⭐⭐   |
| 5   | PhaseEditor (mobile + labels)                                                 | Haut (usage fréquent)                | Moyenne     | ⭐⭐⭐   |
| 6   | ProjectView (tabs + header actions)                                           | Haut (usage fréquent)                | Faible      | ⭐⭐⭐   |
| 7   | Modals (ShareDialog, TemplateManager) → Dialog Radix                          | Haut (accessibilité + dark mode)     | Faible      | ⭐⭐⭐   |
| 8   | ResourcePool (alert/confirm → Radix + skeleton)                               | Haut (accessibilité)                 | Faible      | ⭐⭐⭐   |
| 9   | Tables sans overflow-x-auto (RiskRegister, NonLabourCosts, TransitionPlanner) | Haut (mobile)                        | Très faible | ⭐⭐⭐   |
| 10  | QuickTransition → Popover Radix                                               | Moyen (accessibilité + mobile)       | Moyenne     | ⭐⭐     |
| 11  | TransitionPlanner (selects → Combobox, apply dialog)                          | Moyen                                | Moyenne     | ⭐⭐     |
| 12  | CostCharts (pie SVG aria + empty state + layout mobile)                       | Moyen                                | Faible      | ⭐⭐     |
| 13  | BudgetTracker (tokens warning vs hardcoded amber)                             | Faible                               | Très faible | ⭐       |
| 14  | TimelineView (scroll horizontal, labels mobiles)                              | Moyen                                | Moyenne     | ⭐⭐     |
| 15  | ScenarioComparison (mobile layout)                                            | Faible (usage ponctuel)              | Faible      | ⭐       |
| 16  | RolesRatesManager (overflow + feedback)                                       | Faible                               | Très faible | ⭐       |
| 17  | ProfileView (restructuration sections)                                        | Faible                               | Faible      | ⭐       |
| 18  | ApiTester (visibilité conditionnelle)                                         | Faible                               | Très faible | ⭐       |
| 19  | OnboardingGuide (stepper + persistence)                                       | Moyen (nouveaux utilisateurs)        | Faible      | ⭐⭐     |
| 20  | GanttBar (role button + touch target)                                         | Moyen (accessibilité)                | Très faible | ⭐⭐     |

---

## 4. Chantiers transversaux préalables

Avant de toucher aux écrans individuels, établir ces fondations :

- [ ] **Tokens sémantiques manquants :** Ajouter `--warning` (amber), `--success` (green), `--info` (blue) dans `index.css` et `tailwind.config.js`. Éliminer les `bg-amber-50`, `bg-green-50`, `text-amber-800` hardcodés des composants.
- [ ] **Composants shadcn à ajouter :** `Dialog`, `Popover`, `Sheet`, `Toast/Sonner`, `Skeleton`, `Badge`, `Combobox/Command`, `Tooltip`, `Table` (headless avec accessibilité).
- [ ] **Fixer les classes dark mode hardcodées :** Audit grep de `bg-white`, `bg-gray-50`, `bg-gray-800`, `bg-gray-100`, `bg-gray-700` — les remplacer par les équivalents tokens (`bg-card`, `bg-background`, `bg-muted`, etc.).
- [ ] **Layout shell :** Décider sidebar vs top-nav vs mixed (voir Section 5). Actuellement la top-nav contient des boutons sans label sur desktop — problème d'affordance.
- [ ] **Icon sizing standard :** La codebase utilise `w-4 h-4` (16px) pour les icônes in-button et `w-5 h-5` (20px) pour les icônes de contexte. Documenter et appliquer ce standard partout. Quelques icônes utilisent `w-3 h-3` (12px — SaveIndicator) ou `w-3.5 h-3.5` (14px — Trash2 dans tables) — trop petits.
- [ ] **Éliminer alert() / confirm() natifs :** 3 occurrences confirmées (ResourcePool × 2, TransitionPlanner probable). Remplacer par AlertDialog Radix.
- [ ] **Typographie scale documentée :** Définir h1/h2/h3/body/label/caption dans un fichier de référence avec les classes correspondantes. Différencier les h1 des niveaux application (Dashboard, CapacityView) des h1 d'objet (ProjectView).
- [ ] **Overflow-x-auto sur toutes les tables :** 7 composants concernés — c'est un fix de 10 minutes par composant. Devrait être fait avant tout redesign pour rendre l'app au moins utilisable sur tablette.
- [ ] **Focus rings :** Auditer et s'assurer que tous les éléments interactifs (buttons, inputs, divs cliquables) ont un `focus-visible` ring cohérent.

---

## 5. Questions ouvertes à trancher avec Daniel

Avant la phase moodboard / direction visuelle :

- [ ] **Nom du produit :** "project-cost-calculator" est un nom technique de repo. Quel est le nom de marque ? (Ex: "PlanFlow", "CapiPlan", "Forecast", etc.) — détermine le logo, le wordmark, et le positioning.
- [ ] **Public cible élargi :** L'app est actuellement pensée pour un capacity manager expert. Avec l'ouverture à "plusieurs utilisateurs potentiels", quel niveau d'expertise assumé ? Cela change la densité d'information et la nécessité d'onboarding progressif.
- [ ] **Navigation : sidebar vs top-nav vs mixed ?** La top-nav actuelle à 3 destinations (Projects, Capacity, Profile) est minimaliste — une sidebar persistante permettrait d'ajouter des sections sans surcharger le header. Mais elle consomme de la largeur — critique avec le Gantt.
- [ ] **Mobile-first ou responsive-after ?** Le Gantt est fondamentalement desktop. Est-ce qu'on vise vraiment une expérience mobile complète, ou une tablette (768px+) comme min et mobile comme "dégradé lisible" ?
- [ ] **Logo / marque visuelle :** Y a-t-il une direction ? Couleur dominante (actuellement indigo), style (flat, glassmorphism, data-focused) ?
- [ ] **ApiTester dans Profile :** Feature de dev ou feature utilisateur ? Si dev-only, masquer en prod. Si utilisateur, justifier la présence dans ProfileView.
- [ ] **Mots de passe oubliés / gestion de compte :** Feature à implémenter avant ou après la refonte visuelle ? Impacte le flux AuthPage.
- [ ] **Transitions "Applied" irréversibles :** Est-ce qu'un "undo" / "soft delete" est envisagé ? Cela change le design du dialog de confirmation.
- [ ] **Internationalisation FR/EN :** Le code est bien préparé (`useLocale`), mais les composants codent parfois directement en FR (commentaires JSX, quelques strings). Est-ce que l'EN est une cible de production ou un nice-to-have ?
- [ ] **Export / impression :** Il y a du CSS `@media print` dans `index.css` et un bouton Print dans ProjectView — est-ce une feature prioritaire à soigner dans la refonte ?

---

_Audit généré statiquement depuis le code source — aucune exécution de l'application n'a été effectuée. Les estimations de rendu mobile sont des inférences depuis les classes Tailwind et la structure JSX._
