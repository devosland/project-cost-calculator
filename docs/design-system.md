# Prism Design System

**Version** : 1.0 (foundation)
**Direction** : Warm — chaleureux, approchable, professionnel
**Produit** : Prism — "One project, every perspective."

---

## Principes

- **Contenu en premier, chrome en second** — l'UI s'efface derrière les données
- **Densité confortable** — ni suffoqué ni aéré à outrance ; padding généreux mais pas gaspillé
- **Cohérence token-based** — toutes les décisions de couleur, espacement, typographie passent par les tokens
- **Dark mode first-class** — pas un after-thought ; chaque token a sa valeur dark
- **Accessible par défaut** — WCAG AA minimum (contraste 4.5:1 pour le texte, 3:1 pour les UI)

---

## Tokens

### Colors

#### Light mode

| Token               | Variable CSS                                    | Valeur hex | Usage                             |
| ------------------- | ----------------------------------------------- | ---------- | --------------------------------- |
| Background          | `--background` / `--prism-bg`                   | `#FDFAF5`  | Main canvas — cream chaud         |
| Background elevated | `--card` / `--prism-bg-elevated`                | `#FFFFFF`  | Cards, modals, dropdowns          |
| Background subtle   | `--muted` / `--prism-bg-subtle`                 | `#F5F0E8`  | Nested surfaces, hover states     |
| Border              | `--border` / `--prism-border`                   | `#E8DFD0`  | Séparateurs, contours subtils     |
| Border strong       | `--input` / `--prism-border-strong`             | `#D4C5A8`  | Focus inputs, borders marquées    |
| Text primary        | `--foreground` / `--prism-text`                 | `#1A1815`  | Corps de texte principal          |
| Text secondary      | `--muted-foreground` / `--prism-text-secondary` | `#5C554A`  | Labels, meta, légendes            |
| Text tertiary       | `--prism-text-tertiary`                         | `#8B8274`  | Placeholders, hints très discrets |
| Primary (amber)     | `--primary` / `--prism-amber`                   | `#F59E0B`  | Actions principales, focus rings  |
| Primary foreground  | `--primary-foreground`                          | `#1A1815`  | Texte sur bouton amber            |
| Secondary (sage)    | `--accent` / `--prism-sage`                     | `#84A98C`  | Accents secondaires, tags         |
| Destructive         | `--destructive` / `--prism-error`               | `#DC2626`  | Danger, suppression               |
| Success             | `--prism-success`                               | `#16A34A`  | Confirmation, état OK             |
| Warning             | `--prism-warning`                               | `#F59E0B`  | Alerte non critique               |
| Info                | `--prism-info`                                  | `#2563EB`  | Information neutre                |

#### Dark mode

| Token               | Variable CSS                                    | Valeur hex | Usage                      |
| ------------------- | ----------------------------------------------- | ---------- | -------------------------- |
| Background          | `--background` / `--prism-bg`                   | `#1A1815`  | Fond sombre chaud          |
| Background elevated | `--card` / `--prism-bg-elevated`                | `#24211D`  | Cards, modals              |
| Background subtle   | `--muted` / `--prism-bg-subtle`                 | `#2F2B26`  | Nested, hover              |
| Border              | `--border` / `--prism-border`                   | `#3A3530`  | Séparateurs                |
| Border strong       | `--input` / `--prism-border-strong`             | `#504940`  | Focus                      |
| Text primary        | `--foreground` / `--prism-text`                 | `#FAF7F0`  | Texte blanc chaud          |
| Text secondary      | `--muted-foreground` / `--prism-text-secondary` | `#B8AF9E`  | Muted                      |
| Text tertiary       | `--prism-text-tertiary`                         | `#8B8274`  | Très muted (same as light) |
| Primary (amber)     | `--primary` / `--prism-amber`                   | `#FBBF24`  | Légèrement plus clair      |
| Secondary (sage)    | `--accent` / `--prism-sage`                     | `#A8C6B0`  | Sage clair                 |
| Destructive         | `--destructive` / `--prism-error`               | `#EF4444`  |                            |
| Success             | `--prism-success`                               | `#22C55E`  |                            |
| Warning             | `--prism-warning`                               | `#FBBF24`  |                            |
| Info                | `--prism-info`                                  | `#3B82F6`  |                            |

**Note :** Les tokens shadcn (`--primary`, `--secondary`, etc.) sont maintenus pour backward-compat avec les composants existants. Les tokens `--prism-*` sont les valeurs brutes hex pour usage via `var(--prism-x)` dans des contextes non-HSL.

---

### Typography

#### Font stacks

| Famille          | Variable Tailwind | Fontsource package                    | Usage                                      |
| ---------------- | ----------------- | ------------------------------------- | ------------------------------------------ |
| Sans (UI)        | `font-sans`       | `@fontsource-variable/dm-sans`        | Corps, labels, UI générale                 |
| Display (titres) | `font-display`    | `@fontsource-variable/fraunces`       | H1/H2, hero sections, brand                |
| Mono             | `font-mono`       | `@fontsource-variable/jetbrains-mono` | Codes, IDs, timestamps, valeurs numériques |

Installés via npm (pas CDN) — meilleur pour perf, offline, et bundle splitting.

#### Échelle typographique

| Token Tailwind     | Taille | Line-height | Letter-spacing | Poids    | Famille            |
| ------------------ | ------ | ----------- | -------------- | -------- | ------------------ |
| `text-display-2xl` | 48px   | 1.1         | -0.02em        | variable | display (Fraunces) |
| `text-display-xl`  | 40px   | 1.15        | -0.02em        | variable | display            |
| `text-display-lg`  | 32px   | 1.2         | -0.015em       | variable | display            |
| `text-heading-lg`  | 24px   | 1.3         | -0.01em        | 700      | sans (DM Sans)     |
| `text-heading-md`  | 20px   | 1.35        | -0.01em        | 600      | sans               |
| `text-heading-sm`  | 16px   | 1.4         | 0em            | 600      | sans               |
| `text-body-lg`     | 16px   | 1.6         | 0em            | 400      | sans               |
| `text-body-md`     | 14px   | 1.55        | 0em            | 400      | sans (défaut)      |
| `text-body-sm`     | 13px   | 1.5         | 0em            | 400      | sans               |
| `text-caption`     | 12px   | 1.5         | 0.01em         | 400      | sans               |
| `text-mono`        | 13px   | 1.5         | 0em            | 400      | mono               |

**Feature settings activés :**

- `html` : `'cv02', 'cv03', 'cv04', 'cv11'` — meilleurs chiffres pour DM Sans
- `body` : `'rlig' 1, 'calt' 1` — ligatures contextuelles
- `code/pre` : `'liga' 1, 'calt' 1` — ligatures JetBrains Mono
- `Fraunces` : `font-variation-settings: 'opsz' 72, 'SOFT' 50`

---

### Spacing

Échelle 4px-based (Tailwind standard) :

| Classe              | Valeur |
| ------------------- | ------ |
| `space-1` / `p-1`   | 4px    |
| `space-2` / `p-2`   | 8px    |
| `space-3` / `p-3`   | 12px   |
| `space-4` / `p-4`   | 16px   |
| `space-5` / `p-5`   | 20px   |
| `space-6` / `p-6`   | 24px   |
| `space-8` / `p-8`   | 32px   |
| `space-10` / `p-10` | 40px   |
| `space-12` / `p-12` | 48px   |
| `space-16` / `p-16` | 64px   |
| `space-20` / `p-20` | 80px   |
| `space-24` / `p-24` | 96px   |

---

### Radii

| Token          | Valeur | Usage                      |
| -------------- | ------ | -------------------------- |
| `rounded-sm`   | 6px    | Badges, chips, tags        |
| `rounded-md`   | 10px   | Inputs, buttons            |
| `rounded-lg`   | 14px   | Cards, modals, popovers    |
| `rounded-xl`   | 20px   | Larges surfaces, panels    |
| `rounded-full` | 9999px | Pills, avatars circulaires |

---

### Shadows

Direction Warm = `shadow-sm` dominant. Éviter les shadows dramatiques (elles alourdissent l'ambiance).

| Token       | Valeur                                          | Usage                       |
| ----------- | ----------------------------------------------- | --------------------------- |
| `shadow-sm` | `0 1px 2px rgba(26,24,21,.06)`                  | Cards au repos, subtle lift |
| `shadow-md` | `0 2px 8px rgba(26,24,21,.08) + 0 1px 2px .04`  | Dropdowns, hover cards      |
| `shadow-lg` | `0 8px 24px rgba(26,24,21,.10) + 0 2px 4px .04` | Modals, drawers             |

Toutes les shadows utilisent `#1A1815` (warm dark) comme teinte — pas le noir pur — pour rester dans la direction chaleureuse.

---

### Motion

| Concept            | Valeur                                   |
| ------------------ | ---------------------------------------- |
| Duration fast      | 120ms — micro-interactions, hover        |
| Duration normal    | 200ms — transitions de composants        |
| Duration slow      | 320ms — entrée/sortie de modals, drawers |
| Easing default     | `ease-out` (cubic-bezier 0,0,0.2,1)      |
| Easing symmétrique | `ease-in-out` (cubic-bezier 0.4,0,0.2,1) |

**Reduced motion :** `@media (prefers-reduced-motion: reduce)` dans `src/index.css` — toutes les animations et transitions sont coupées à 0.01ms.

---

## Composants de base (état courant)

### Présents (shadcn primitives)

| Composant | Fichier                          | Status  |
| --------- | -------------------------------- | ------- |
| Button    | `src/components/ui/button.jsx`   | Présent |
| Card      | `src/components/ui/card.jsx`     | Présent |
| Label     | `src/components/ui/label.jsx`    | Présent |
| Switch    | `src/components/ui/switch.jsx`   | Présent |
| Dropdown  | `src/components/ui/dropdown.jsx` | Présent |

### Brand (Prism)

| Composant     | Fichier                                  | Status      |
| ------------- | ---------------------------------------- | ----------- |
| PrismLogo     | `src/components/brand/PrismLogo.jsx`     | Ajouté v1.0 |
| PrismWordmark | `src/components/brand/PrismWordmark.jsx` | Ajouté v1.0 |

### À ajouter (PRs suivantes)

| Composant      | Priorité | Notes                                       |
| -------------- | -------- | ------------------------------------------- |
| Input          | Haute    | shadcn Input, brancher sur tokens           |
| Select         | Haute    | shadcn Select                               |
| AlertDialog    | Haute    | Confirmations destructives                  |
| Badge          | Haute    | Tags, status pills                          |
| Tabs           | Haute    | Navigation sections                         |
| Table          | Haute    | Grilles de données — critique pour Capacity |
| Sheet          | Moyenne  | Drawer mobile                               |
| Skeleton       | Moyenne  | Loading states (préféré au spinner)         |
| CommandPalette | Basse    | Recherche globale, à considérer             |
| Toast/Sonner   | Moyenne  | Notifications non-bloquantes                |

---

## Patterns d'usage

### Cards

Utiliser quand : on groupe du contenu lié avec une frontière visuelle claire (section, entité, widget de données).

```jsx
// Structure standard
<Card className="shadow-sm rounded-lg">
  <CardHeader>
    <CardTitle className="text-heading-sm">Titre</CardTitle>
    <CardDescription className="text-caption text-muted-foreground">
      Sous-titre optionnel
    </CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

**Éviter :** cards imbriquées plus de 2 niveaux. Préférer `bg-subtle` pour les niveaux internes.

### Buttons

Variants disponibles :

| Variant       | Usage                                          |
| ------------- | ---------------------------------------------- |
| `default`     | Action principale (amber, attention capsturée) |
| `outline`     | Action secondaire                              |
| `ghost`       | Tertiary, inline actions                       |
| `destructive` | Suppression, action irréversible               |

Sizes : `sm` (h-8), `md`/défaut (h-9), `lg` (h-11), `icon` (carré).

**Règle :** une seule action `default` par section. Hiérarchie claire : primary > outline > ghost.

### Form inputs

```jsx
<div className="space-y-1.5">
  <Label htmlFor="field">Label visible</Label>
  <Input id="field" placeholder="Placeholder" />
  <p className="text-caption text-muted-foreground">Help text optionnel</p>
  {/* En cas d'erreur : */}
  <p className="text-caption text-destructive">Message d'erreur précis</p>
</div>
```

### Empty states

Structure recommandée : `icon + titre + description + CTA`.

```jsx
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <Icon className="h-8 w-8 text-muted-foreground" />
  <div>
    <p className="text-heading-sm">Aucun élément</p>
    <p className="text-body-sm text-muted-foreground mt-1">
      Description courte expliquant pourquoi c'est vide.
    </p>
  </div>
  <Button size="sm">Action principale</Button>
</div>
```

### Loading

**Skeleton préféré au spinner** pour les contenus de taille connue (tables, cards).

```jsx
// Skeleton d'une ligne de tableau
<div className="h-8 w-full rounded-md bg-muted animate-pulse" />
```

Spinner acceptable uniquement pour les actions ponctuelles (submit button, save en cours).

---

## Historique des versions

| Version | Date       | Description                                                                      |
| ------- | ---------- | -------------------------------------------------------------------------------- |
| 1.0     | 2026-04-17 | Foundation : tokens, typography, brand assets. Aucun composant existant modifié. |

---

## Références

- Direction visuelle : **B — Warm** (Notion / Campfire vibes)
- Tagline : _"One project, every perspective."_
- Couleurs converties hex → HSL pour compatibilité `hsl(var(--x))` pattern shadcn
- Fonts via `@fontsource-variable` (npm, pas CDN)
