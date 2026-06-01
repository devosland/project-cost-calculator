# Design — Disponibilité time-phasée des ressources (chantier A)

> Date : 2026-06-01
> Branche : `feature/capacity-time-phased-availability`
> Contexte amont : `docs/specs/2026-06-01-msproject-capacity-parity.md` (diagnostic de parité MS Project)
> Statut : design validé par Daniel — prêt pour le plan d'implémentation.

## 1. Problème

La capacité d'une ressource est aujourd'hui une **valeur unique et constante** : `resources.max_capacity INTEGER DEFAULT 100`. Le `%` d'allocation des affectations se mesure donc contre un dénominateur fixe (100), et la détection de surcharge utilise un seuil constant.

Conséquence : impossible d'exprimer les réalités de base de la gestion de capacité — **congés, temps partiel daté, montée en charge (ramp-up), absences**. C'est le premier écart structurant identifié face à Microsoft Project (dont la capacité — _Max Units_ — est time-phasée). C'est aussi la **fondation** des chantiers suivants (capacité-vs-demande, nivellement).

## 2. Objectif

Permettre une **disponibilité en pourcentage, variable par mois, par ressource**, et faire en sorte que la détection de surcharge respecte cette disponibilité au lieu d'un seuil fixe de 100.

Exemple cible :

```
Marie (capacité de base 100%)
  Jan 100 | Fév 100 | Mar 50 (mi-temps) | Avr 100 | … | Juil 0 (congé)
Surcharge en mois M  ⇔  somme(allocations actives en M) > disponibilité(Marie, M)
```

## 3. Décisions de cadrage (issues du brainstorming)

| #   | Décision                      | Choix retenu                                                                                                                                     |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Fidélité au modèle calendaire | **Disponibilité % time-phasée par mois** (pas d'heures, pas de calendrier de jours ouvrés). Reste 100 % aligné sur le modèle mensuel-% existant. |
| D2  | Sémantique de la valeur       | **% absolu** (même base que `allocation`). Un mi-temps a une dispo de base 60 ; un congé l'amène à 0. Pas de pourcentage relatif.                |
| D3  | Source de vérité              | `resources.max_capacity` reste la **capacité de base / défaut**. La nouvelle table ne stocke que les **overrides mensuels**. Aucune duplication. |
| D4  | Rétro-compatibilité           | Sans override pour un mois → la capacité de ce mois vaut `max_capacity`. Comportement actuel strictement préservé pour les données existantes.   |
| D5  | Stockage                      | **Table normalisée d'overrides** `resource_availability` (jumelle de `resource_assignments`), pas de colonne JSON. Joignable pour le chantier 2. |
| D6  | Surface d'édition             | Nouveau **sous-onglet « Disponibilité »** dans `CapacityView` : grille ressources × 12 mois éditable.                                            |

## 4. Non-objectifs (frontière de portée)

Explicitement **hors de ce chantier** (relèvent du chantier 2 ou ultérieurs) :

- **Vue « capacité restante » chiffrée** (disponible − assigné par mois, affichée). Ici on ne fait que _détecter la surcharge_ contre la dispo ; on n'affiche pas le résiduel chiffré.
- **Calendrier de jours ouvrés / fériés** (décision D1 l'exclut).
- **Capacité en heures / FTE absolus** (D1).
- **Nivellement / résolution** de surcharge (chantier C).
- **`ResourceConflicts.jsx`** (agrégat par rôle+niveau, scope projet) : reste inchangé pour l'instant. La dispo time-phasée s'applique à la surcharge **par ressource nommée** (Gantt + UtilizationSummary). L'extension de ResourceConflicts à la dispo time-phasée est notée en suivi (§9).

## 5. Modèle de données

Nouvelle table (migration idempotente dans `server/db.js`, même pattern `CREATE TABLE IF NOT EXISTS` que les tables existantes) :

```sql
CREATE TABLE IF NOT EXISTS resource_availability (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,                 -- 'YYYY-MM'
  available_pct INTEGER NOT NULL,              -- 0..100, % absolu
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id, month)
);
CREATE INDEX IF NOT EXISTS idx_availability_resource_month
  ON resource_availability(resource_id, month);
```

Règle de capacité effective (utilisée partout) :

```
capacité(resource, month) = override(resource, month) ?? resource.max_capacity
```

Invariant anti-duplication : on **ne stocke jamais** un override égal à `max_capacity`. Si l'utilisateur ressaisit la valeur de base ou vide la cellule, la ligne est **supprimée** (la base reprend le relais). Cela garantit que la table ne contient que de l'information non redondante (principe « single source of truth »).

`ON DELETE CASCADE` : supprimer une ressource purge ses overrides, comme pour `resource_assignments`.

## 6. API (calque du pattern `server/capacity.js`)

| Méthode | Route                        | Description                                                                                                                                                                                                                                                                                                 |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/api/capacity/availability` | Liste les overrides du pool de l'utilisateur. Filtres optionnels : `resource`, `month`. Retourne `[{ id, resource_id, month, available_pct }]`.                                                                                                                                                             |
| PUT     | `/api/capacity/availability` | Upsert en lot. Corps : `[{ resource_id, month, available_pct }]`. Pour chaque entrée : si `available_pct` égale la capacité de base de la ressource → **DELETE** la ligne ; sinon **UPSERT** sur `(resource_id, month)`. Validation Zod (mois `YYYY-MM`, pct 0–100, ressource appartenant à l'utilisateur). |

Autorisation : mêmes garde-fous que les autres routes capacité (JWT, vérification que `resource_id` appartient au pool de l'utilisateur courant).

Note : pas d'endpoint DELETE séparé — la suppression passe par un `available_pct === base` dans le PUT, ce qui simplifie l'UX de la grille (vider une cellule = revenir à la base).

## 7. Logique de calcul (`src/lib/capacityCalculations.js`)

Nouveau helper pur, testable, sans effet de bord :

```js
/**
 * Capacité effective d'une ressource pour un mois donné.
 * @param {string|number} resourceId
 * @param {string} month            'YYYY-MM'
 * @param {object[]} overrides      lignes resource_availability
 * @param {number} baseCapacity     resources.max_capacity
 * @returns {number} 0..100
 */
export function getMonthlyCapacity(resourceId, month, overrides, baseCapacity) { … }
```

Détection de surcharge **par ressource nommée** : une ressource est en surcharge le mois M lorsque

```
calculateUtilization(assignments, resourceId, M) > getMonthlyCapacity(resourceId, M, overrides, baseCapacity)
```

`calculateUtilization` (la somme des allocations actives) **reste inchangée** ; seul le seuil de comparaison passe d'une constante (100) à la capacité du mois.

## 8. UI

- **Sous-onglet « Disponibilité »** ajouté dans `CapacityView` (`src/components/CapacityView.jsx`), positionné entre **Gantt** et **Transitions** (ordre : Ressources → Gantt → Disponibilité → Transitions → Taux). Clé i18n FR/EN ajoutée pour le libellé d'onglet.
- **Grille** ressources (lignes) × mois (colonnes), même fenêtre de 12 mois que le Gantt (réutilise la logique de plage de mois existante). Cellule éditable : saisir un entier 0–100. Cellule **non saisie / égale à la base = grisée** (affiche la base, n'écrit rien). Vider une cellule = revenir à la base (supprime l'override).
- **Recoloration de la surcharge** : `CapacityGantt` et `UtilizationSummary` comparent désormais la charge à `getMonthlyCapacity(...)` au lieu de 100. Le rouge « surchargé » reflète la vraie capacité du mois (ex. 60 % d'allocation un mois où la dispo est 50 % devient rouge).
- Style : tokens Prism existants (`bg-card`, `border-border`, `font-mono tabular-nums` pour les chiffres alignés), cohérent avec les composants capacité actuels.

## 9. Tests

- `src/__tests__/capacityCalculations.test.js` : ajouter des cas pour `getMonthlyCapacity` (override présent / absent → base, bornes 0 et 100) et pour le **seuil de surcharge time-phasé** (charge > dispo réduite ⇒ surcharge ; charge ≤ dispo ⇒ ok).
- `server/__tests__/capacity.test.js` : schéma de `resource_availability`, GET/PUT availability (upsert, suppression quand `pct === base`, rejet d'une ressource d'un autre utilisateur, validation des bornes).
- Style et helpers de test identiques à l'existant (Vitest, `setup.js`).

## 10. Rétro-compatibilité & migration

- Aucune donnée existante n'est modifiée. La table est créée vide. Tant qu'aucun override n'existe, `getMonthlyCapacity` retourne `max_capacity` → comportement strictement identique à aujourd'hui.
- Migration purement additive (nouvelle table + index), exécutée au démarrage comme les autres (`server/db.js`).

## 11. Suivis (hors périmètre, à tracer après livraison)

1. **Chantier 2** — Vue « capacité restante » chiffrée (disponible − assigné), qui consommera `resource_availability` via JOIN.
2. **`ResourceConflicts`** — étendre la détection agrégée par rôle+niveau pour sommer les dispos time-phasées des ressources du groupe.
3. **Aides de saisie** — actions groupées dans la grille (ex. « marquer un congé » sur une plage de mois) si le besoin se confirme. Volontairement exclu du MVP (YAGNI).

## 12. Critères de succès

- On peut définir une dispo mensuelle ≠ base pour une ressource et la voir persister (reload).
- Vider une cellule restaure la base et **ne laisse aucune ligne** redondante en base de données.
- Le Gantt passe une cellule en surcharge quand la charge dépasse la **dispo du mois** (et non plus 100 fixe).
- Les données et comportements existants (ressources sans override) sont inchangés.
- Tests verts (frontend + backend), CI verte.
