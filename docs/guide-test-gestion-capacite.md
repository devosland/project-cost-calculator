# Guide de test — Gestion de capacité (parité MS Project)

> Couvre tout ce qui a été livré : dépendances typées (SP1), chemin critique + marges (SP2), **flèches de lien Gantt (SP2b)**, contraintes de date (SP3), **ALAP (SP3b)**, nivellement (SP4) et **baseline figée EVM** (#106).
> Les sections marquées 👁 demandent surtout **ton œil** (rendus visuels que je n'ai pas pu valider en autonome).

---

## 0. Démarrer l'application (dev local)

Deux terminaux à la racine `D:\repos\project-cost-calculator` :

```powershell
# Terminal 1 — backend (API sur http://localhost:3000)
node server/index.js

# Terminal 2 — frontend (Vite, proxy /api → :3000)
npm run dev
```

Ouvre l'URL affichée par Vite (par défaut **http://localhost:5173**). Connecte-toi / ouvre ton espace habituel.

> Alternative « comme en prod » : `docker compose up --build` (rappel : re-ajouter le mapping de port après chaque rebuild). Le dev local ci-dessus est plus simple pour cliquer/itérer.

---

## 1. Préparer un projet de test

Crée un projet **« Test parité »** avec **4 phases** (onglet _Phases_). Donne à chacune une durée et une petite équipe pour que les barres/coûts apparaissent :

| Phase         | Durée | Équipe (exemple)       |
| ------------- | ----- | ---------------------- |
| **Cadrage**   | 2 sem | 1 × Dev Senior @ 60 %  |
| **Build A**   | 4 sem | 1 × Dev Senior @ 60 %  |
| **Build B**   | 2 sem | 1 × Dev Senior @ 60 %  |
| **Livraison** | 1 sem | 1 × Dev Senior @ 100 % |

Renseigne une **date de début** du projet (onglet _Réglages/Budget_, champ date) — nécessaire pour le PV/SPI de l'EVM.

---

## 2. SP1 — Dépendances typées (FS/SS/FF/SF) + lag

**Onglet _Phases_** → ouvre **Build A** → section _Dépendances_.

1. Ajoute une dépendance **Build A dépend de Cadrage**, type **FS** (Finish-to-Start), lag **0**.
2. Sur **Livraison**, ajoute deux dépendances : **Build A (FS)** et **Build B (FS)**.
3. Sur **Build B**, dépendance **Cadrage (FS)**.

✅ **Attendu** : pas d'erreur ; les types sont sélectionnables (FS/SS/FF/SF) et le lag accepte des valeurs négatives (ex. `-1` = chevauchement). Va voir l'onglet _Ligne de temps_ : les barres se positionnent en cascade (Cadrage d'abord, puis Build A/B en parallèle, puis Livraison).

- [ ] Les 4 types de dépendance sont proposés
- [ ] Le lag accepte un nombre négatif (taper `-1`)
- [ ] Le planning reflète l'enchaînement

---

## 3. SP2 — Chemin critique + marges 👁

**Onglet _Ligne de temps_**.

✅ **Attendu** :

- Les barres du **chemin critique** (le plus long enchaînement : Cadrage → Build A → Livraison) sont **rouges**.
- **Build B** (plus courte, en parallèle de Build A) n'est **pas** rouge et affiche un label **`+N sem`** à droite (sa **marge** = le retard qu'elle peut prendre sans décaler le projet).
- Une **légende** en haut indique le code couleur (carré rouge = chemin critique ; `+N sem` = marge).

- [ ] Barres critiques en rouge
- [ ] Label `+N sem` sur la phase à marge (Build B)
- [ ] Légende présente

---

## 4. SP2b — Flèches de lien Gantt 👁👁 (le plus important à valider)

Toujours **onglet _Ligne de temps_**. C'est l'overlay SVG que je n'ai **pas pu voir** — c'est le point n°1 à vérifier.

✅ **Attendu** :

- Des **flèches courbes** relient les barres : de la fin d'un prédécesseur vers le début de son successeur (Cadrage→Build A, Cadrage→Build B, Build A→Livraison, Build B→Livraison).
- Les flèches le long du **chemin critique** sont **rouges** ; les autres **grises**.
- Les flèches **suivent** les barres si tu redimensionnes la fenêtre (elles sont calculées par mesure du DOM).

👁 **À regarder de près** :

- [ ] Les flèches pointent vers la **bonne** barre (bon prédécesseur → bon successeur)
- [ ] Couleur cohérente avec le chemin critique (rouge vs gris)
- [ ] Pas de chevauchement gênant avec le texte des barres ou les jalons (🚩)
- [ ] Au **redimensionnement** de la fenêtre, les flèches restent alignées
- [ ] Esthétique acceptable (courbure, épaisseur, têtes de flèche) — **sinon note ce qui cloche**, j'ajuste

---

## 5. SP3 — Contraintes de date (SNET / FNLT / MSO / MFO) 👁

**Onglet _Phases_** → **Build B** → section _Contrainte_ (sous les dépendances).

1. Choisis **SNET** (_Start No Earlier Than_), semaine **3**. → Build B ne peut pas démarrer avant la semaine 3.
2. Va en _Ligne de temps_ : Build B est décalée à la semaine 3.
3. Reviens et mets **MSO** (_Must Start On_) semaine **0** (alors qu'une dépendance la pousse plus tard) → un **conflit** doit être signalé.

✅ **Attendu** :

- _Ligne de temps_ : la barre respecte la contrainte (SNET décale le départ).
- En cas de contrainte impossible (MSO/MFO/FNLT non satisfiable), un **marqueur ⚠** apparaît à côté du nom de la phase (survol = type de conflit).

- [ ] SNET décale bien le départ
- [ ] Le marqueur ⚠ apparaît sur une contrainte en conflit
- [ ] Repasser à « Aucune » efface la contrainte

---

## 6. SP3b — ALAP (au plus tard) 👁

**Onglet _Phases_** → **Build B** (elle a de la marge, cf. §3) → _Contrainte_ → choisis **ALAP (au plus tard)**. (Pas de champ semaine pour ALAP.)

✅ **Attendu** en _Ligne de temps_ :

- La barre de **Build B se déplace vers la droite** : elle démarre **au plus tard** (juste avant la Livraison), au lieu d'au plus tôt.
- Comme elle a consommé sa marge, elle **passe en rouge** (plus de marge = critique) et son label `+N sem` disparaît.
- La **durée totale du projet ne change pas** (le dernier repère de semaine reste identique).

- [ ] Build B glisse à droite (juste-à-temps)
- [ ] Elle devient rouge / le label de marge disparaît
- [ ] La fin du projet (`totalWeeks`) est inchangée

> C'est la sémantique MS Project : une tâche ALAP qui consomme toute sa marge devient critique.

---

## 7. SP4 — Nivellement (suggestions)

Le nivellement détecte deux phases **qui se chevauchent**, partageant **le même rôle+niveau**, dont la somme d'allocations **dépasse 100 %**, et propose de décaler celle **qui a de la marge**.

**Mise en situation** (onglet _Phases_) :

1. Assure-toi que **Build A** et **Build B** se **chevauchent** (toutes deux dépendent de Cadrage en FS → elles démarrent en même temps).
2. Donne-leur le **même rôle+niveau** très chargé : **Build A** = Dev Senior **@ 60 %**, **Build B** = Dev Senior **@ 60 %** (somme 120 % > 100 %).
3. Retire toute contrainte ALAP de Build B (remets « Aucune ») pour qu'elle garde sa marge.

✅ **Attendu** en bas de l'onglet _Ligne de temps_, panneau **« Nivellement »** :

- Une suggestion du type **« Décaler Build B de N sem. — Dev Senior sur-alloué »** avec un bouton **Appliquer**.
- Clique **Appliquer** → une contrainte **SNET** est posée sur Build B (elle se décale dans sa marge), et la sur-allocation se résorbe → la suggestion disparaît. La **fin du projet ne bouge pas**.

- [ ] Le panneau « Nivellement » liste la sur-allocation
- [ ] « Appliquer » décale la phase et fait disparaître la suggestion
- [ ] Si aucune sur-allocation : message « Aucune sur-allocation à niveler »

---

## 8. Baseline figée — EVM (#106) 👁

**Onglet _Pilotage_** (valeur acquise).

> ℹ️ Le tableau de bord EVM + le **bandeau de baseline** s'affichent **toujours** (corrigé #108) : tu peux **figer la baseline dès la planification**. PV/BAC viennent du plan ; **EV/AC** restent à 0 tant qu'aucun avancement n'est **attribué à une phase** (relie l'epic porteur des tâches à une phase via l'éditeur d'epic du Carnet, ou « Synchroniser depuis le plan »).

1. Une fois le tableau EVM visible, repère le **bandeau** en haut : « **Aucune baseline — PV vs plan vivant** ».
2. Note les valeurs **SPI / CPI** (sans baseline, le SPI tourne autour de 1).
3. Clique **« Figer la baseline »** → le bandeau devient « **Baseline figée le {date} — PV mesuré contre la baseline** ».
4. **Maintenant modifie le plan** : onglet _Phases_, augmente l'équipe ou la durée d'une phase (donc son coût/planning vivant change).
5. Reviens en _Pilotage_.

✅ **Attendu** :

- Le **PV, le BAC et le SPI** restent calculés sur la **baseline figée** (le plan de référence), **pas** sur le plan que tu viens de modifier. C'est tout l'intérêt : l'écart devient visible.
- **« Re-figer »** demande une **confirmation** avant d'écraser la baseline.

- [ ] Le bouton « Figer la baseline » fige et change le bandeau
- [ ] Après modif du plan, PV/BAC/SPI reflètent la **baseline**, pas le plan modifié
- [ ] « Re-figer » demande confirmation

---

## 9. Gestion de la capacité (vue Capacité) 👁 — focus des prochains tests

Accès : depuis le **Tableau de bord**, section/bouton **Capacité** (vue **cross-projets**, en dehors d'un projet précis). 6 onglets : Ressources, Gantt, Disponibilité, Charge, Transitions, Taux. Prépare 2-3 ressources et affecte-les sur quelques projets pour générer de la demande.

### 9.1 Ressources (pool)

- Ajoute des ressources : nom, rôle, niveau, **capacité max %** (ex. 100 %) ; possibilité de lier une ressource à un utilisateur.
- ✅ Attendu : pool listé, édition/suppression OK, rôles/niveaux cohérents avec l'onglet Taux.
- [ ] Ajouter / éditer une ressource

### 9.2 Disponibilité — time-phasée (chantier A)

- Grille **ressources × 12 mois**. Cellule **vide** = capacité de base (`max_capacity`). Saisis un **override** mensuel (ex. 50 % en juillet pour des vacances).
- ✅ Attendu : l'override est **persisté** (rechargé après save) ; saisir la **valeur de base** efface l'override (cellule redevient « vide ») ; seuls les overrides sont stockés.
- [ ] Un override mensuel se sauvegarde et persiste
- [ ] Remettre la valeur de base efface l'override

### 9.3 Charge — capacité vs demande (chantier B)

- Heatmap **ressources × 12 mois** : chaque cellule = **capacité restante = capacité − demande**, couleur (`capacityStatus`) : **vert** = marge, **ambre** = proche de 100 %, **rouge** = surcharge. Ligne **Pool** = restant agrégé.
- Mets une ressource en **surcharge** : affecte-la à >100 % sur un mois (via projets) ou baisse sa disponibilité (9.2) sous la demande.
- ✅ Attendu : cellule **rouge** quand demande > capacité (restant négatif), **ambre** proche de 100 %, **vert** sinon ; tooltip chiffré ; la ligne Pool reflète l'agrégat.
- [ ] Surcharge → cellule rouge (restant négatif)
- [ ] Baisser la dispo (9.2) → la Charge se met à jour en conséquence

### 9.4 Gantt cross-projets + utilisation

- Timeline de la **demande cross-projets** (toutes affectations). En bas, **résumé d'utilisation** par mois (allocation totale ÷ capacité totale) : **vert < 80 %, ambre 80-99 %, rouge ≥ 100 %**.
- Sélecteur **« Aperçu d'un plan brouillon »** : choisis un plan de transition _draft_ → le Gantt montre l'impact projeté.
- [ ] Utilisation mensuelle cohérente (bons seuils de couleur)
- [ ] L'aperçu d'un plan _draft_ modifie la projection

### 9.5 Transitions consultant → permanent (ton cœur de métier)

- Onglet **Transitions** → **Nouveau plan** (TransitionPlanner) : remplace un consultant par un permanent à une date donnée.
- ✅ Attendu : calcul de l'**impact coût** (économie consultant vs permanent) et de l'impact capacité ; **Aperçu** projette le plan sur le Gantt/Charge ; **Appliquer** met à jour les affectations (et recharge les coûts projet).
- [ ] Créer un plan + voir l'impact coût
- [ ] Aperçu du plan sur le Gantt
- [ ] Appliquer met à jour la capacité

### 9.6 Taux (rôles / niveaux)

- Modifie un taux par rôle/niveau ; vérifie qu'il se répercute sur les coûts projet **mais que les réels historisés ne bougent pas** (taux snapshotté à la saisie).
- [ ] Modifier un taux → coûts projet recalculés ; réels inchangés

**👁 Cohérence à surveiller (single source of truth)** : la demande et la capacité doivent concorder entre **Disponibilité ↔ Charge ↔ Gantt** ; couleurs aux bons seuils ; impact des transitions visible partout.

---

## 10. Limitations connues & retours utiles

**Corrigés en cours de tests (déployés) :**

- ✅ Flèches Gantt (§4) — bug de timing (#107). ✅ Pilotage/baseline désormais visible **sans** exécution + message clair sur l'attribution par phase (#108). ✅ Renommer/supprimer epics & stories (#109). ✅ Avancement Epic/Story + **lien epic↔phase** dans le Carnet (#110). ✅ Étiquette d'epic sur le board (#111).
- 💡 Rappel attribution EVM : pour que l'**EV** d'une phase remonte, l'epic qui porte les tâches doit être **relié à cette phase** (éditeur d'epic du Carnet, ou « Synchroniser depuis le plan »).

**Ce qui est volontairement reporté** (pas des bugs) :

- Team Planner glisser-déposer (SP4b) ; nivellement cross-projets ; calendriers de jours ouvrés ; courbes temporelles PV/EV/AC ; contraintes en dates calendaires ; ordonnancement depuis une date de fin imposée.

**Quoi me remonter** (par section) :

1. Tout rendu **visuel** qui cloche — surtout les **flèches (§4)** et l'**ALAP (§6)** : capture d'écran + ce qui ne va pas (alignement, couleur, chevauchement, esthétique).
2. Tout écart entre l'**attendu** ci-dessus et ce que tu vois.
3. Tout écart sur la **gestion de la capacité (§9)** — c'est le focus des prochains tests.

Je corrige/ajuste à la reprise. Bon test 👍
