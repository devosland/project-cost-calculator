# API d'intégration Roadmap → Calculateur de coûts

**Version** : `v1` (draft)
**Base URL** : `https://calculateur.danielvaliquette.com/api/v1`
**Statut** : Documentation d'intégration pour revue — le schéma peut évoluer avant publication.

---

## 1. Vue d'ensemble

Cette API permet à un outil externe (roadmap haut-niveau) de créer un **nouveau projet dans le calculateur de coûts**, avec sa structure de phases, son timing initial, et ses dépendances entre phases.

### Frontière fonctionnelle

| Côté roadmap (exposé via cette API) | Côté calculateur (non exposé) |
|---|---|
| Nom + identifiant externe du projet | Budget et seuils d'alerte |
| Liste des phases (nom, ordre, durée) | Pool de ressources (personnes, rôles) |
| Date de début projet (obligatoire) | Taux horaires et rates |
| Dates optionnelles par phase | Membres d'équipe, allocations, périodes |
| Dépendances entre phases | Gestion des transitions consultant→permanent |
| — | Risques et mitigation |

Après import, l'utilisateur ouvre le projet dans le calculateur pour y ajouter ressources, budget et détails opérationnels.

### Flux typique

```
[Roadmap Tool]  ──POST──►  [Calculateur API]  ──crée──►  [Nouveau Projet]
                 │                                           │
                 │                                           ▼
                 └────── returns projectId + URL ──► [User ouvre et complète]
```

---

## 2. Authentification

### Clé d'API

Toutes les requêtes doivent inclure une clé d'API dans le header :

```http
X-API-Key: ckc_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### Obtenir une clé

L'utilisateur du calculateur génère une clé depuis son profil :
`https://calculateur.danielvaliquette.com/#/profile/api-keys`

Lors de la création :
1. L'utilisateur choisit un nom (ex: "Intégration Roadmap")
2. Il sélectionne les scopes (`roadmap:import`, `roadmap:read`)
3. La clé complète s'affiche **une seule fois** — elle doit être copiée immédiatement
4. Par la suite, seul le préfixe (`ckc_live_a1b2c3d4...`) est visible

### Règles de sécurité

- La clé est liée à **un utilisateur** du calculateur — tout projet créé appartient à cet utilisateur
- Les clés sont révocables à tout moment (invalidation immédiate)
- Aucune expiration par défaut — l'utilisateur révoque manuellement
- Chiffrées au repos (bcrypt), jamais loggées en clair
- Rate limit par défaut : **60 requêtes/minute par clé**

### Origines autorisées (CORS)

Les origines cross-domain doivent être pré-enregistrées côté serveur. Pour obtenir l'ajout de ton domaine à la whitelist, contacter l'administrateur du calculateur.

---

## 3. Endpoint : créer un projet depuis une roadmap

### Requête

```http
POST /api/v1/roadmap/import
X-API-Key: ckc_live_...
Content-Type: application/json
```

### Schéma du payload

```typescript
{
  project: {
    name: string;              // Obligatoire. Max 200 caractères.
    externalId: string;        // Obligatoire. Votre identifiant unique côté roadmap. Max 100 caractères.
    startDate: string;         // Obligatoire. Format ISO 8601 date : "2026-06-01"
    description?: string;      // Optionnel. Max 2000 caractères.
  };
  phases: Array<{
    id: string;                // Obligatoire. Identifiant local à l'import (référencé par dependsOn). Slug-like.
    name: string;              // Obligatoire. Max 100 caractères.
    order: number;             // Obligatoire. Entier ≥ 1. Détermine l'ordre visuel par défaut.
    durationMonths?: number;   // Obligatoire SAUF si startDate ET endDate sont fournis. Nombre positif (accepte décimales : 1.5 = 6 semaines).

    // Optionnels — si fournis, écrasent le calcul séquentiel basé sur durationMonths :
    startDate?: string;        // ISO 8601 date
    endDate?: string;          // ISO 8601 date — doit être > startDate

    // Optionnel — dépendances finish-to-start :
    dependsOn?: string[];      // Array d'id de phases (locales à cet import)
    description?: string;      // Max 1000 caractères.
  }>;
}
```

### Règles de validation

1. `project.startDate` doit être une date ISO valide
2. Chaque `phase.id` doit être **unique** dans la requête
3. `dependsOn` ne peut référencer que des phases présentes dans le même payload
4. **Pas de cycles** dans le graphe de dépendances (A → B → A rejeté)
5. Au moins **une phase sans `dependsOn`** doit exister (point d'entrée du graphe)
6. Si `startDate` et `endDate` sont fournis sur une phase, `endDate > startDate`
7. `durationMonths` : valeur numérique positive. Obligatoire si `startDate` ou `endDate` sont absents ; optionnel si les deux sont fournis (dans ce cas, la durée est calculée à partir des dates).

### Exemple minimal

```json
POST /api/v1/roadmap/import
{
  "project": {
    "name": "Refonte portail client",
    "externalId": "RM-2026-042",
    "startDate": "2026-06-01"
  },
  "phases": [
    { "id": "decouverte", "name": "Découverte", "order": 1, "durationMonths": 2 },
    { "id": "conception", "name": "Conception", "order": 2, "durationMonths": 3 },
    { "id": "realisation", "name": "Réalisation", "order": 3, "durationMonths": 6 }
  ]
}
```

### Exemple complet avec dépendances et dates explicites

```json
{
  "project": {
    "name": "Modernisation plateforme",
    "externalId": "RM-2026-099",
    "startDate": "2026-09-01",
    "description": "Migration infrastructure vers cloud hybride"
  },
  "phases": [
    {
      "id": "audit",
      "name": "Audit technique",
      "order": 1,
      "durationMonths": 1
    },
    {
      "id": "archi",
      "name": "Architecture cible",
      "order": 2,
      "durationMonths": 2,
      "dependsOn": ["audit"]
    },
    {
      "id": "migration-data",
      "name": "Migration données",
      "order": 3,
      "startDate": "2026-12-01",
      "endDate": "2027-03-31",
      "dependsOn": ["archi"]
    },
    {
      "id": "migration-apps",
      "name": "Migration applications",
      "order": 4,
      "durationMonths": 4,
      "dependsOn": ["archi"]
    }
  ]
}
```

### Réponses

#### `201 Created` — Projet créé avec succès

```json
{
  "id": "cme4xq2p000008la3z5k6r9p",
  "name": "Refonte portail client",
  "externalId": "RM-2026-042",
  "url": "https://calculateur.danielvaliquette.com/#/projects/cme4xq2p000008la3z5k6r9p/phases",
  "phasesCreated": 3,
  "createdAt": "2026-04-17T14:23:11.000Z"
}
```

#### `409 Conflict` — `externalId` déjà utilisé

```json
{
  "error": "duplicate_external_id",
  "message": "A project with externalId 'RM-2026-042' already exists for this account.",
  "existing": {
    "id": "cme4xq2p000008la3z5k6r9p",
    "url": "https://calculateur.danielvaliquette.com/#/projects/cme4xq2p000008la3z5k6r9p/phases"
  }
}
```

**Override** : ajouter `?upsert=true` pour mettre à jour le projet existant au lieu d'échouer.

```http
POST /api/v1/roadmap/import?upsert=true
```

En mode upsert, les phases sont remplacées par celles du payload. Les ressources/membres d'équipe existants attachés aux phases conservées (par `id`) sont préservés ; ceux attachés à des phases supprimées sont détachés.

#### `422 Unprocessable Entity` — Payload invalide

```json
{
  "error": "validation_error",
  "issues": [
    { "path": "phases.2.dependsOn.0", "message": "References unknown phase id 'phase-xyz'" },
    { "path": "project.startDate", "message": "Invalid ISO 8601 date format" }
  ]
}
```

#### `401 Unauthorized` — Clé manquante ou invalide

```json
{ "error": "invalid_api_key" }
```

#### `403 Forbidden` — Scope insuffisant

```json
{ "error": "insufficient_scope", "required": "roadmap:import" }
```

#### `429 Too Many Requests` — Rate limit dépassé

```json
{ "error": "rate_limit_exceeded", "retryAfter": 42 }
```

Le header `Retry-After: 42` indique le délai en secondes.

---

## 4. Endpoint : vérifier l'état d'un import

Permet de vérifier si un `externalId` a déjà été importé (utile pour éviter les doublons côté roadmap).

### Requête

```http
GET /api/v1/roadmap/import/{externalId}/status
X-API-Key: ckc_live_...
```

### Réponses

#### `200 OK` — Trouvé

```json
{
  "exists": true,
  "project": {
    "id": "cme4xq2p000008la3z5k6r9p",
    "name": "Refonte portail client",
    "externalId": "RM-2026-042",
    "url": "https://calculateur.danielvaliquette.com/#/projects/cme4xq2p000008la3z5k6r9p/phases",
    "createdAt": "2026-04-17T14:23:11.000Z",
    "updatedAt": "2026-04-17T14:23:11.000Z"
  }
}
```

#### `200 OK` — Non trouvé

```json
{ "exists": false }
```

(Note : on retourne 200 et non 404, car la question "existe-t-il ?" a une réponse valide même si la réponse est "non".)

---

## 5. Sémantique des champs

### `externalId`

Identifiant unique **côté roadmap**, utilisé pour :
- Empêcher les imports dupliqués accidentels
- Permettre les updates (mode `?upsert=true`)
- Corréler projet roadmap ↔ projet calculateur dans vos logs

Contraintes :
- Max 100 caractères
- Unique par utilisateur (même `externalId` autorisé pour deux utilisateurs différents)
- Recommandé : utiliser votre ID interne stable (ex: `RM-{year}-{sequence}`)

### `startDate` / `endDate`

- Format : **ISO 8601 date** (`YYYY-MM-DD`), pas de timestamp avec heure
- Fuseau horaire implicite : le calculateur interprète les dates en **date locale naïve** (pas de conversion UTC)
- `project.startDate` définit la T0 du projet — tous les calculs de timing s'y rattachent

### `durationMonths`

- Accepte décimales (ex: `1.5` = 1 mois et demi)
- Conversion interne : `semaines = durationMonths × 4.33` (arrondi à 1 décimale)
- Si vous fournissez `startDate` + `endDate` sur une phase, `durationMonths` est optionnel (la durée est calculée à partir des dates). Sinon, `durationMonths` est obligatoire.

### `order`

- Détermine l'ordre d'affichage dans le calculateur
- Utilisé comme fallback de séquencement si aucune dépendance n'est définie
- Si `dependsOn` est présent, le calculateur respectera le graphe en priorité (feature future — voir section "Dépendances" ci-dessous)

### Dépendances (`dependsOn`)

**Statut actuel** : les dépendances sont **importées et persistées**, mais la visualisation Gantt les ignore pour l'instant (le layout reste basé sur `order` + durée cumulative). Cette information est stockée pour une future fonctionnalité d'auto-layout selon le graphe de dépendances.

**Implication pratique** : envoyez les dépendances dès maintenant — aucune modification ne sera nécessaire côté roadmap quand la feature de layout graphique sera activée.

**Types supportés** : finish-to-start uniquement (`lag = 0`). Start-to-start et finish-to-finish pourront être ajoutés si le besoin se présente.

---

## 6. Codes d'erreur — référence complète

| Code | Nom | Signification |
|------|-----|---------------|
| `400` | `bad_request` | Requête malformée (JSON invalide, header manquant) |
| `401` | `invalid_api_key` | Clé manquante, mal formée, ou révoquée |
| `403` | `insufficient_scope` | Clé valide mais ne couvre pas le scope requis |
| `409` | `duplicate_external_id` | `externalId` déjà importé (sans `?upsert=true`) |
| `422` | `validation_error` | Payload bien structuré mais contenu invalide (voir `issues`) |
| `422` | `dependency_cycle` | Cycle détecté dans le graphe `dependsOn` |
| `422` | `dangling_dependency` | `dependsOn` référence une phase absente du payload |
| `422` | `no_root_phase` | Toutes les phases ont une dépendance (pas de point d'entrée) |
| `422` | `validation_error` | `durationMonths` manquant sur une phase qui n'a pas `startDate` + `endDate` |
| `429` | `rate_limit_exceeded` | Quota atteint (60 req/min par défaut) |
| `500` | `internal_error` | Erreur serveur — réessayer avec backoff |

---

## 7. Versioning & stabilité

- Le chemin contient la version : `/api/v1/...`
- Toute modification **breaking** (suppression/renommage de champ, changement de sémantique) donnera lieu à une nouvelle version (`/api/v2/...`)
- Les ajouts **additifs** (nouveaux champs optionnels, nouveaux endpoints) resteront en `v1`
- Garantie de support : v1 supportée **≥ 6 mois** après publication de v2

---

## 8. Exemple d'intégration (pseudocode)

```typescript
async function pushRoadmapToCalculator(roadmap: Roadmap): Promise<string> {
  const payload = {
    project: {
      name: roadmap.title,
      externalId: `RM-${roadmap.id}`,
      startDate: roadmap.kickoffDate.toISOString().slice(0, 10),
      description: roadmap.summary,
    },
    phases: roadmap.milestones.map((m, idx) => ({
      id: m.slug,
      name: m.title,
      order: idx + 1,
      durationMonths: m.estimatedDurationMonths,
      dependsOn: m.precedingMilestoneSlugs,
    })),
  };

  const response = await fetch(
    'https://calculateur.danielvaliquette.com/api/v1/roadmap/import',
    {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.CALCULATOR_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.status === 409) {
    // Stratégie au choix : renvoyer avec upsert=true, ou prévenir l'utilisateur
    return handleDuplicate(response);
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Import failed: ${err.error} — ${err.message}`);
  }

  const result = await response.json();
  return result.url; // URL à ouvrir pour l'utilisateur
}
```

---

## 9. Questions ouvertes (à discuter avant figer)

- [ ] **Notifications d'événements entrants** : voulez-vous recevoir un webhook quand l'utilisateur ajuste significativement un projet issu d'un import (décalage de timeline, ajout/suppression de phase) ? Événements candidats : `project.timeline.shifted`, `project.phase.added`, `project.phase.removed`. HMAC-signé.
- [ ] **Lecture inverse** : scope `roadmap:read` pour récupérer l'état actuel (timing recalculé, budget si partagé) — utile ?
- [ ] **Batch import** : nécessité de pousser plusieurs projets en une requête ?
- [ ] **Tagging / catégorisation** : besoin d'un champ `tags: string[]` au niveau projet ?

---

## 10. Contact

Feedback, bugs, demandes d'évolution : [à définir — canal Slack, email, repo GitHub]
