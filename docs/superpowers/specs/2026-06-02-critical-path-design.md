# Design — Chemin critique + marges (SP2 du moteur d'ordonnancement)

> Date : 2026-06-02
> Branche : `feature/critical-path`
> Programme : moteur d'ordonnancement **niveau phase** (C + E), 4 sous-projets. SP1 (dépendances typées + lag) livré (PR #100). **SP2 = chemin critique + marges.**
> Statut : design validé par Daniel — prêt pour le plan d'implémentation.

## 1. Problème

Depuis SP1, l'ordonnanceur calcule les dates au plus tôt (early start/finish) par phase en respectant FS/SS/FF/SF + lag. Mais il manque l'analyse MS Project classique : **quel est le chemin critique** (les phases dont tout retard décale le projet) et **quelle marge** a chaque phase. C'est la valeur « pilotage de planning » la plus attendue, et la suite naturelle de SP1.

## 2. Objectif

Calculer, par phase, la **marge totale** (float) et un **flag critique**, puis les **surligner** dans la Ligne de temps (barres critiques en rouge, marge affichée). Pas de flèches de lien (SP2b).

## 3. Décisions de cadrage (issues du brainstorming)

| #   | Décision        | Choix retenu                                                                                                                                                                                             |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Architecture    | **Fonction pure séparée** `calculateCriticalPath(project)` qui réutilise l'ordonnanceur (passe avant) puis fait la passe arrière. Le scheduler reste **inchangé** (zéro ripple sur ses 4 consommateurs). |
| D2  | Marge           | **Marge totale** (total float) en **semaines**. `critique = marge ≤ 0`. (Pas de marge libre en SP2.)                                                                                                     |
| D3  | Surbrillance    | Barres **critiques** dans la couleur critique (`--prism-error`) ; non-critiques gardent la couleur de projet.                                                                                            |
| D4  | Affichage marge | Label « marge +N sem » sur les barres **non-critiques** dans la Ligne de temps + légende.                                                                                                                |
| D5  | Dégradations    | Cycle (scheduler en repli séquentiel) ou aucune dépendance → chaîne séquentielle ⇒ **toutes critiques, marge 0**.                                                                                        |

## 4. Non-objectifs (frontière de portée)

- **Flèches de lien SVG** dans le Gantt → SP2b.
- **Marge libre** (free float) — seulement la marge totale en SP2.
- **Contraintes de date** (SP3), **nivellement** (SP4).
- Toute modification de l'ordonnanceur SP1 ou de la forme `phaseSchedule`.

## 5. Calcul — `src/lib/criticalPath.js` (pur)

`calculateCriticalPath(project)` :

1. **Passe avant** : `calculateProjectDurationWithDependencies(project)` → `{ totalWeeks, phaseSchedule }`. `earlyStart = startWeek`, `earlyEnd = endWeek` par phase.
2. **Adjacence inverse** : pour chaque phase `succ` et chacune de ses dépendances normalisées (`normalizeDependency`) `{ id: predId, type, lag }`, enregistrer `(succ, type, lag)` dans la liste des **successeurs** de `predId` (filtrée aux phases existantes).
3. **Passe arrière** (ordre topologique inverse — l'inverse de l'ordre de la passe avant convient) : pour chaque phase `P` de durée `d` :
   - Si `P` n'a **aucun successeur** : `lateEnd = totalWeeks`.
   - Sinon `lateEnd = min` sur ses successeurs `S` (relation type/lag) de la borne inversée :
     - **FS** : `S.lateStart − lag`
     - **FF** : `S.lateEnd − lag`
     - **SS** : `S.lateStart − lag + d`
     - **SF** : `S.lateEnd − lag + d`
   - `lateStart = lateEnd − d`.
4. **Marge / critique** : `totalFloat = lateStart − earlyStart` (= `lateEnd − earlyEnd`) ; `critical = totalFloat <= 0`.
5. **Retour** : `{ totalWeeks, byPhase: { [phaseId]: { earlyStart, earlyEnd, lateStart, lateEnd, totalFloat, critical } } }`.

**Dégradations** : `calculateCriticalPath` fait sa **propre détection de cycle** au début — un DFS trois couleurs sur les ids normalisés (`normalizeDependency`), local au fichier (le scheduler n'est pas modifié). Si **cycle détecté** OU **aucune dépendance** dans le projet, retourner directement toutes les phases en `critical: true, totalFloat: 0` (en réutilisant les `earlyStart/earlyEnd` du scheduler pour `lateStart/lateEnd`), sans tenter la passe arrière. Sinon, le graphe est un DAG et la passe arrière est sûre.

## 6. Visualisation (`TimelineView`)

- Appelle `calculateCriticalPath(project)` ; `crit = result.byPhase[phase.id]`.
- **Barre critique** (`crit.critical`) : fond/bordure en `var(--prism-error)` ; sinon couleur de projet inchangée.
- **Marge** : pour une phase non-critique, label « +{totalFloat} {sem} » sur la barre (ou à côté), via i18n.
- **Légende** discrète : « ▆ Critique · +N marge (sem.) ».
- Aucune autre modification de la mise en page (positions toujours via `phaseSchedule`).

## 7. i18n (FR/EN)

`cpm.criticalPath` (« Chemin critique » / « Critical path »), `cpm.critical` (« Critique » / « Critical »), `cpm.float` (« Marge » / « Float »), `cpm.weeksShort` (« sem. » / « wks ») si pas déjà disponible.

## 8. Tests (TDD — cœur de SP2)

`src/__tests__/criticalPath.test.js` sur le pur `calculateCriticalPath` :

- **Chaîne FS** A→B→C : toutes critiques, marge 0.
- **Branches parallèles** : A→{B court, C long}→D ; la branche courte (B) a une marge = (durée C − durée B), la branche longue (C) est critique.
- **Lag** : un lag sur le chemin critique allonge `totalWeeks` et reste critique ; un lag sur une branche à marge réduit sa marge.
- **Types** SS/FF/SF : marge correcte sur un cas chiffré simple.
- **Repli** : cycle → toutes critiques/float 0 ; aucune dépendance → toutes critiques/float 0.
- Cohérence : `earlyStart`/`earlyEnd` == `phaseSchedule` du scheduler.

UI (`TimelineView`) : build + vérification manuelle (pas de harness React).

## 9. Rétro-compatibilité

Purement additif : 1 lib pure + viz dans `TimelineView` + clés i18n. L'ordonnanceur SP1 et la forme `phaseSchedule` sont inchangés ; les 3 autres consommateurs (PV/EVM, conflits, iCal) ne sont pas touchés.

## 10. Critères de succès

- Sur un projet avec dépendances, les phases du chemin critique s'affichent en rouge dans la Ligne de temps ; les autres montrent leur marge.
- Une chaîne FS pure est entièrement critique (marge 0) ; une branche parallèle plus courte montre une marge = écart de durée.
- Les dates au plus tôt du calcul coïncident avec `phaseSchedule` (non-régression du scheduler).
- Un projet sans dépendances (ou cyclique) s'affiche sans crash (tout critique / marge 0).
- Tests verts (`calculateCriticalPath`), build OK, lint sans nouvelle erreur.
