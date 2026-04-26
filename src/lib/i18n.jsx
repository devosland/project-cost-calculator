/**
 * Lightweight custom i18n system for FR/EN bilingual support.
 *
 * Chosen over i18next and react-intl because the translation surface is small
 * (flat dot-notation keys, two locales) and a custom implementation avoids
 * adding a heavy dependency for a feature that needs no pluralisation rules,
 * no ICU message format, and no lazy-loading. The entire translation table
 * is bundled synchronously so there is no locale-loading flash.
 *
 * Public surface:
 *   <LocaleProvider>   — wrap the app root to inject the locale context.
 *   useLocale()        — returns { t, locale, setLocale } in any child component.
 *   t(key, params?)    — translate a key, interpolating {placeholder} tokens.
 *   getDateLocale()    — map app locale to an Intl locale string.
 *   getLevelLabel()    — translate a stored level key to a display string.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Translation table
// Keys use dot-notation namespacing (e.g. 'auth.login', 'phase.duration').
// The FR locale is the source-of-truth; EN is a mirror. If a key is missing
// from EN, t() falls back to FR so the UI never shows a raw key string.
// ---------------------------------------------------------------------------
const translations = {
  fr: {
    // App / Header
    'app.name': 'Planificateur',
    'app.subtitle': 'Calculateur de coûts de projet',
    'app.logout': 'Déconnexion',
    'app.collapse': 'Réduire',
    'app.user_menu': 'Menu utilisateur',
    'app.theme_light': 'Mode clair',
    'app.theme_dark': 'Mode sombre',
    'app.language': 'Langue',

    // Auth
    'auth.login': 'Connexion',
    'auth.register': 'Inscription',
    'auth.forgot': 'Mot de passe oublié',
    'auth.reset': 'Nouveau mot de passe',
    'auth.submit.login': 'Se connecter',
    'auth.submit.register': 'Créer un compte',
    'auth.submit.forgot': 'Envoyer le jeton',
    'auth.submit.reset': 'Réinitialiser',
    'auth.loading.login': 'Connexion...',
    'auth.loading.register': 'Création...',
    'auth.loading.forgot': 'Envoi...',
    'auth.loading.reset': 'Réinitialisation...',
    'auth.email': 'Adresse courriel',
    'auth.email.placeholder': 'vous@exemple.com',
    'auth.name': 'Nom complet',
    'auth.name.placeholder': 'Jean Dupont',
    'auth.resetToken': 'Jeton de réinitialisation',
    'auth.password': 'Mot de passe',
    'auth.newPassword': 'Nouveau mot de passe',
    'auth.forgotLink': 'Mot de passe oublié ?',
    'auth.registerLink': 'Pas encore de compte ? Inscrivez-vous',
    'auth.loginLink': 'Déjà un compte ? Connectez-vous',
    'auth.backToLogin': 'Retour à la connexion',
    'auth.resetTokenGenerated': 'Un jeton de réinitialisation a été généré.',
    'auth.passwordChanged': 'Mot de passe modifié avec succès. Connectez-vous.',

    // Save indicator
    'save.saving': 'Sauvegarde...',
    'save.saved': 'Sauvegardé',
    'save.error': 'Erreur',

    // Dashboard
    'dashboard.title': 'Projets',
    'dashboard.startMessage': 'Commencez par créer un projet',
    'dashboard.projectCount': '{count} projet{plural}',
    'dashboard.compare': 'Comparer',
    'dashboard.compareSelect': 'Sélectionnez 2+',
    'dashboard.compareCount': 'Comparer ({count})',
    'dashboard.cancel': 'Annuler',
    'dashboard.templates': 'Modèles',
    'dashboard.import': 'Importer',
    'dashboard.newProject': 'Nouveau projet',
    'dashboard.noProjects': 'Aucun projet',
    'dashboard.noProjectsMessage': 'Créez un nouveau projet ou importez-en un pour commencer.',
    'dashboard.stats.projects': 'Projets',
    'dashboard.stats.totalCost': 'Coût total',
    'dashboard.stats.avgDuration': 'Durée moyenne',
    'dashboard.stats.members': 'Membres',
    'dashboard.stats.weeks': 'sem.',
    'dashboard.role.editor': 'Éditeur',
    'dashboard.role.viewer': 'Lecture',
    'dashboard.phases': 'phase{plural}',
    'dashboard.members': 'membre{plural}',
    'dashboard.weeks': 'semaines',
    'dashboard.modified': 'Modifié ',
    'dashboard.totalCost': 'Coût total',
    'dashboard.rename': 'Renommer',
    'dashboard.duplicate': 'Dupliquer',
    'dashboard.exportJSON': 'Exporter JSON',
    'dashboard.exportCSV': 'Exporter CSV',
    'dashboard.delete': 'Supprimer',
    'dashboard.copy': 'copie',

    // Tabs
    'tab.phases': 'Phases',
    'tab.timeline': 'Ligne de temps',
    'tab.budget': 'Budget',
    'tab.charts': 'Graphiques',
    'tab.summary': 'Rapport',
    'tab.risks': 'Risques',
    'tab.work': 'Travail',
    'work.tabBoard': 'Tableau',
    'work.tabBacklog': 'Carnet',
    'work.tabTimesheet': 'Feuille de temps',
    'work.loading': 'Chargement…',
    'work.loadFailed': 'Échec du chargement.',
    'work.saveFailed': 'Échec de la sauvegarde.',
    'work.errUnknownStatus': "Statut inconnu pour ce projet.",
    'work.errTransitionBlocked': 'Cette transition est interdite par le workflow.',
    'work.close': 'Fermer',
    'work.taskDetails': 'Détails de la tâche',
    'work.title': 'Titre',
    'work.description': 'Description',
    'work.status': 'Statut',
    'work.priority': 'Priorité',
    'work.priority.low': 'Basse',
    'work.priority.medium': 'Moyenne',
    'work.priority.high': 'Haute',
    'work.priority.critical': 'Critique',
    'work.assignee': 'Assigné à',
    'work.unassigned': '— Non assigné —',
    'work.estimate': 'Estimé (h)',
    'work.filterAssignee': 'Filtrer par personne',
    'work.allAssignees': 'Toutes',
    'work.emptyBoard': 'Aucune tâche pour ce filtre.',
    'work.emptyBacklog': 'Aucun epic encore — ajoutez-en un.',
    'work.emptyEpic': 'Aucune story dans cet epic.',
    'work.emptyStory': 'Aucune tâche dans cette story.',
    'work.emptyTimesheet': "Aucune heure pour cette semaine.",
    'work.newEpic': 'Nouvel epic',
    'work.syncFromPlan': 'Synchroniser depuis le plan',
    'work.syncTitle': 'Crée un Epic par phase et une Story par jalon. Idempotent — relancer ne duplique rien.',
    'work.syncConfirm': 'Créer les Epics et Stories manquants depuis les phases et jalons du projet ?',
    'work.syncResult': '{epics} epic(s) et {stories} story(ies) créés.',
    'work.syncFailed': 'Échec de la synchronisation.',
    'work.newStory': 'Nouvelle story',
    'work.newTask': 'Nouvelle tâche',
    'work.newEpicPrompt': "Titre de l'epic :",
    'work.newStoryPrompt': 'Titre de la story :',
    'work.newTaskPrompt': 'Titre de la tâche :',
    'work.task': 'Tâche',
    'work.total': 'Total',
    'work.today': "Aujourd'hui",
    'time.sectionTitle': 'Temps loggé',
    'time.date': 'Date',
    'time.hours': 'Heures',
    'time.log': 'Logger',
    'time.remove': 'Supprimer',
    'time.noteOptional': 'Note (optionnelle)',
    'time.notePlaceholder': 'Ce qui a été fait…',
    'time.loading': 'Chargement des entrées…',
    'time.noEntries': 'Aucune entrée pour cette tâche.',
    'time.invalidHours': 'Heures invalides (0 < h ≤ 24).',
    'time.errPeriodClosed': 'Cette période est fermée.',
    'time.errFutureDate': 'Impossible de logger dans le futur.',
    'time.errNotYours': "Cette tâche n'est pas la vôtre.",
    'time.errGeneric': "Une erreur est survenue.",
    'tab.rates': 'Taux',

    // Project View
    'project.back': 'Projets',
    'project.history': 'Historique',
    'project.share': 'Partager',
    'project.weeks': 'semaines',
    'project.contingency': 'Contingence',
    'project.taxes': 'Taxes',
    'project.currency': 'Devise',
    'project.addPhase': 'Ajouter une phase',
    'project.totalDuration': 'Durée totale',
    'project.totalCost': 'Coût total',
    'project.deletePhase': 'Supprimer la phase',
    'project.movePhaseUp': 'Déplacer la phase vers le haut',
    'project.movePhaseDown': 'Déplacer la phase vers le bas',
    'project.exportJSON': 'Exporter JSON',
    'project.exportCSV': 'Exporter CSV',
    'project.budget': 'Budget du projet',
    'project.startDate': 'Date de début',
    'project.noBudget': 'Aucun budget',

    // Webhook
    'webhook.title': 'Notifications webhook',
    'webhook.url': 'URL du webhook',
    'webhook.sending': 'Envoi…',
    'webhook.test': 'Tester',
    'webhook.success': 'Envoyé avec succès',
    'webhook.error': "Échec de l'envoi",
    'webhook.webhook_not_configured': 'Aucune URL webhook configurée',
    'webhook.webhook_url_invalid': 'URL webhook invalide ou non autorisée',
    'webhook.webhook_response_error': 'Le webhook a répondu avec une erreur',
    'webhook.webhook_timeout': "Le webhook n'a pas répondu dans les délais",
    'webhook.webhook_unreachable': "Impossible de joindre l'URL du webhook",
    'webhook.threshold': "Seuil d'alerte",
    'webhook.thresholdUnit': '% du budget',

    // Phase Editor
    'phase.duration': 'Durée :',
    'phase.weeks': 'semaines',
    'phase.team': 'Équipe',
    'phase.addMember': 'Ajouter un membre',
    'phase.noMembers': 'Aucun membre. Ajoutez des membres pour calculer les coûts.',
    'phase.remove': 'Supprimer',
    'phase.rate': 'Taux',
    'phase.hoursWeek': 'Heures/sem',
    'phase.costWeek': 'Coût/sem',
    'phase.period': 'Période',
    'phase.start': 'Début',
    'phase.end': 'Fin',
    'phase.weeklyCost': 'Coût hebdomadaire',
    'phase.totalCost': 'Coût total ({weeks} sem.)',
    'phase.milestones': 'Jalons',
    'phase.add': 'Ajouter',
    'phase.milestonePlaceholder': 'Nom du jalon',
    'phase.weekAbbr': 'Sem.',
    'phase.noMilestones': 'Aucun jalon défini.',
    'phase.week': 'Semaine {week}',
    'phase.dependencies': 'Dépendances',
    'phase.noDependencies': 'Aucune dépendance. Cette phase peut démarrer immédiatement.',

    // Levels
    'level.internal': 'Employé interne',
    'level.junior': 'Junior',
    'level.intermediate': 'Intermédiaire',
    'level.senior': 'Sénior',
    'level.expert': 'Expert',

    // Timeline
    'timeline.title': 'Ligne de temps du projet',
    'timeline.empty': 'Ajoutez des phases pour voir la ligne de temps.',
    'timeline.calendar': 'Calendrier',
    'timeline.costBreakdown': 'Répartition des coûts',
    'timeline.phase': 'Phase',
    'timeline.duration': 'Durée',
    'timeline.members': 'Membres',
    'timeline.costPerWeek': 'Coût/sem.',
    'timeline.phaseCost': 'Coût phase',
    'timeline.cumulative': 'Cumul',
    'timeline.milestones': 'Jalons',
    'timeline.weekLabel': 'Semaine {week}',

    // Budget
    'budget.title': 'Suivi du budget',
    'budget.usage': 'Utilisation du budget',
    'budget.alert': 'Alerte budgétaire :',
    'budget.alertMessage': 'le coût estimé ({cost}) a atteint {percent}% du budget, dépassant le seuil de {threshold}%.',
    'budget.webhookConfigured': ' Une notification webhook est configurée.',
    'budget.overBudget': 'Dépassement',
    'budget.underBudget': 'Sous le budget',
    'budget.estimatedCost': 'Coût total estimé',
    'budget.burnRate': 'Taux de consommation',
    'budget.perWeek': 'par semaine',
    'budget.duration': 'Durée',
    'budget.weeksAbbr': 'sem.',
    'budget.budgetFor': 'Budget pour {weeks} sem.',
    'budget.breakdown': 'Ventilation',
    'budget.labour': "Main-d\u2019\u0153uvre",
    'budget.otherCosts': 'Autres coûts',
    'budget.contingency': 'Contingence ({percent}%)',
    'budget.contingencyIncluded': "Incluse dans main-d\u2019\u0153uvre",
    'budget.taxes': 'Taxes ({percent}%)',
    'budget.taxesIncluded': "Incluses dans main-d\u2019\u0153uvre",
    'budget.actualsTitle': 'Réels (temps loggé)',
    'budget.actualsHours': 'Heures loggées',
    'budget.actualsCost': 'Coût réel',
    'budget.forecastVsActuals': 'Écart prévision / réel',

    // Non-labour costs
    'nonLabour.title': "Coûts non liés à la main-d\u2019\u0153uvre",
    'nonLabour.add': 'Ajouter',
    'nonLabour.name': 'Nom',
    'nonLabour.amount': 'Montant',
    'nonLabour.cancel': 'Annuler',
    'nonLabour.empty': "Aucun coût supplémentaire. Ajoutez des coûts d\u2019infrastructure, licences, etc.",
    'nonLabour.category': 'Catégorie',
    'nonLabour.total': 'Total',
    'nonLabour.byCategory': 'Par catégorie',
    'nonLabour.cat.infrastructure': 'Infrastructure',
    'nonLabour.cat.licenses': 'Licences',
    'nonLabour.cat.saas': 'SaaS / Outils',
    'nonLabour.cat.travel': 'Voyage',
    'nonLabour.cat.training': 'Formation',
    'nonLabour.cat.equipment': 'Matériel',
    'nonLabour.cat.other': 'Autre',

    // Charts
    'charts.title': 'Répartition des coûts',
    'charts.byRole': 'Par rôle',
    'charts.byPhase': 'Par phase',
    'charts.byCategory': 'Par catégorie',
    'charts.empty': "Ajoutez des membres d\u2019équipe pour voir les graphiques.",

    // Rates Manager
    'rates.title': 'Gestion des rôles et taux',
    'rates.internalRate': 'Taux horaire interne',
    'rates.consultantRates': 'Taux consultants',
    'rates.addRole': 'Ajouter un rôle',
    'rates.roleName': 'Nom du rôle',
    'rates.role': 'Rôle',
    'rates.actions': 'Actions',
    'rates.clickToEdit': 'Cliquer pour modifier',
    'rates.deleteRole': 'Supprimer le rôle',
    'rates.noRoles': 'Aucun rôle défini. Cliquez sur « Ajouter un rôle » pour commencer.',

    // Summary
    'summary.export': 'Exporter PDF',
    'summary.generatedOn': 'Rapport généré le ',
    'summary.totalCost': 'Coût total',
    'summary.duration': 'Durée',
    'summary.members': 'Membres',
    'summary.ratePerWeek': 'Taux/semaine',
    'summary.variance': 'Variance',
    'summary.costBreakdown': 'Ventilation des coûts',
    'summary.labour': "Main-d\u2019\u0153uvre",
    'summary.otherCosts': 'Autres coûts',
    'summary.contingencyIncluded': 'Contingence de {percent}% incluse',
    'summary.taxesIncluded': 'Taxes de {percent}% incluses',
    'summary.actualsTitle': 'Réels',
    'summary.hoursLogged': 'Heures loggées',
    'summary.actualCost': 'Coût réel',
    'summary.phases': 'Phases',
    'summary.phase': 'Phase',
    'summary.budget': 'Budget',
    'summary.total': 'Total',
    'summary.costPerWeek': 'Coût/semaine',
    'summary.nonLabourCosts': "Coûts non liés à la main-d\u2019\u0153uvre",
    'summary.milestones': 'Jalons',
    'summary.name': 'Nom',
    'summary.category': 'Catégorie',
    'summary.amount': 'Montant',
    'summary.weekNum': 'Semaine {week}',
    'summary.footer': 'Calculateur de coûts de projet',

    // Scenario Comparison
    'scenario.title': 'Comparaison de scénarios',
    'scenario.close': 'Fermer',
    'scenario.selectTwo': 'Sélectionnez au moins 2 projets pour comparer.',
    'scenario.totalCost': 'Coût total',
    'scenario.labour': "Main-d\u2019\u0153uvre",
    'scenario.otherCosts': 'Autres coûts',
    'scenario.duration': 'Durée',
    'scenario.burnRate': 'Taux/sem.',
    'scenario.phases': 'Phases',
    'scenario.members': 'Membres',
    'scenario.budget': 'Budget',
    'scenario.visualComparison': 'Comparaison visuelle des coûts',

    // Share
    'share.title': 'Partager le projet',
    'share.emailPlaceholder': 'adresse@courriel.com',
    'share.invite': 'Inviter',
    'share.currentShares': 'Partages actuels',
    'share.noShares': 'Aucun partage.',
    'share.error': 'Une erreur est survenue.',
    'share.roleViewer': 'Lecture seule',
    'share.roleEditor': 'Éditeur',

    // Templates
    'templates.title': 'Gestion des modèles',
    'templates.save': 'Sauvegarder',
    'templates.load': 'Charger',
    'templates.templateName': 'Nom du modèle',
    'templates.saveAsTemplate': 'Sauvegarder comme modèle',
    'templates.noTemplates': 'Aucun modèle sauvegardé.',
    'templates.use': 'Utiliser',
    'templates.defaultName': 'Modèle',
    'templates.defaultNameProject': '{name} - Modèle',

    // Version History
    'history.title': 'Historique des versions',
    'history.labelPlaceholder': 'Libellé (optionnel)',
    'history.createSnapshot': 'Créer un point de sauvegarde',
    'history.noSnapshots': 'Aucune version sauvegardée.',
    'history.autoSave': 'Auto-save',
    'history.restore': 'Restaurer',

    // Resource Conflicts
    'conflicts.title': 'Conflits de ressources',
    'conflicts.none': 'Aucun conflit de ressources détecté',
    'conflicts.warning': 'Le rôle {role} ({level}) est alloué à {alloc}% pendant les semaines {start}-{end} (maximum recommandé\u00a0: 100%)',

    // Risk Register
    'risks.title': 'Registre des risques',
    'risks.add': 'Ajouter un risque',
    'risks.empty': 'Aucun risque enregistré. Cliquez sur "Ajouter un risque" pour commencer.',
    'risks.matrix': 'Matrice de risques',
    'risks.probability': 'Probabilité',
    'risks.impact': 'Impact',
    'risks.score': 'Score',
    'risks.phase': 'Phase',
    'risks.mitigation': 'Atténuation',
    'risks.risk': 'Risque',
    'risks.actions': 'Actions',
    'risks.riskPlaceholder': 'Nom du risque',
    'risks.phasePlaceholder': 'Phase',
    'risks.mitigationPlaceholder': "Stratégie d'atténuation",

    // Onboarding
    'onboarding.title': 'Guide de démarrage',
    'onboarding.subtitle': 'Suivez ces étapes pour configurer votre planification de capacité.',
    'onboarding.completeTitle': 'Configuration terminée !',
    'onboarding.completeDesc': 'Votre environnement est prêt. Vous pouvez consulter le Gantt de capacité.',
    'onboarding.help': 'Guide',
    'onboarding.done': 'Fait',
    'onboarding.step1Title': '1. Vérifier les taux horaires',
    'onboarding.step1Desc': 'La grille tarifaire par défaut est pré-configurée. Ajustez-la au besoin.',
    'onboarding.step1Action': 'Voir les taux',
    'onboarding.step2Title': '2. Ajouter vos ressources',
    'onboarding.step2Desc': 'Créez les membres de votre équipe (nom, rôle, permanent ou consultant).',
    'onboarding.step2Action': 'Ajouter des ressources',
    'onboarding.step3Title': '3. Créer un projet',
    'onboarding.step3Desc': 'Définissez vos phases, durées et assignez vos ressources.',
    'onboarding.step3Action': 'Créer un projet',
    'onboarding.step4Title': '4. Consulter la capacité',
    'onboarding.step4Desc': "Visualisez l'occupation de vos ressources et planifiez les transitions.",
    'onboarding.step4Action': 'Voir le Gantt',

    // Cost categories (for getCostByCategory)
    'category.labour': "Main-d'oeuvre",

    // Capacity
    'capacity.title': 'Capacité',
    'capacity.gantt': 'Gantt',
    'capacity.resources': 'Ressources',
    'capacity.transitions': 'Transitions',
    'capacity.byProject': 'Par projet',
    'capacity.byType': 'Par type',
    'capacity.exportExcel': 'Exporter Excel',
    'capacity.exportError': "Échec de l'export Excel.",
    'capacity.utilization': "Taux d'occupation",
    'capacity.overAllocated': 'Sur-alloué',
    'capacity.available': 'Disponible',
    'capacity.permanent': 'Permanent',
    'capacity.consultant': 'Consultant',
    'myWork.title': 'Mes tâches',
    'myWork.subtitle': 'Tâches qui vous sont assignées, sur tous les projets.',
    'myWork.back': 'Retour',
    'myWork.empty': "Aucune tâche ne vous est assignée. Un gestionnaire doit d'abord vous associer à une ressource.",
    'myWork.openCount': 'en cours',
    'myWork.totalCount': 'au total',
    'dashboard.role.member': 'Équipe',
    'share.roleMember': 'Équipe',
    'capacity.linkedUser': 'Utilisateur lié',
    'capacity.notLinked': '— Non lié —',
    'capacity.userAlreadyLinked': 'Cet utilisateur est déjà lié à une autre ressource.',
    'capacity.alreadyLinkedShort': 'déjà lié',
    'capacity.invalidUser': "Cet utilisateur n'est pas un candidat valide.",
    'capacity.linkFailed': "Échec de l'association.",
    'close.title': 'Clôture comptable',
    'close.subtitle': 'Verrouillez les périodes déjà publiées pour empêcher toute modification rétroactive des heures.',
    'close.open': 'Ouverte',
    'close.closed': 'Fermée',
    'close.close': 'Fermer',
    'close.reopen': 'Rouvrir',
    'close.closedBy': 'fermée par {email} le {date}',
    'close.loading': 'Chargement des périodes…',
    'close.loadFailed': 'Impossible de charger les périodes.',
    'close.toggleFailed': 'Action impossible pour cette période.',
    'capacity.permanentCount': '{count} permanent{plural}',
    'capacity.consultantCount': '{count} consultant{plural}',
    'capacity.noData': 'Aucune donnée de capacité. Ajoutez des ressources et assignez-les à des projets.',

    // Resources
    'resources.title': 'Pool de ressources',
    'resources.add': 'Ajouter une ressource',
    'resources.edit': 'Modifier',
    'resources.delete': 'Supprimer',
    'resources.name': 'Nom',
    'resources.role': 'Rôle',
    'resources.level': 'Niveau',
    'resources.type': 'Type',
    'resources.maxCapacity': 'Capacité max',
    'resources.assignments': 'Assignations',
    'resources.search': 'Rechercher...',
    'resources.empty': 'Aucune ressource. Ajoutez des personnes à votre pool.',
    'resources.confirmDelete': 'Supprimer cette ressource et toutes ses assignations ?',
    'resources.nameExists': 'Une ressource avec ce nom existe déjà.',
    'resources.save': 'Enregistrer',
    'resources.cancel': 'Annuler',
    'resources.addToPool': 'Ajouter au pool',

    // Transitions
    'transitions.title': 'Plans de transition',
    'transitions.add': 'Nouveau plan',
    'transitions.planName': 'Nom du plan',
    'transitions.status.draft': 'Brouillon',
    'transitions.status.planned': 'Planifié',
    'transitions.status.applied': 'Appliqué',
    'transitions.consultant': 'Consultant actuel',
    'transitions.replacement': 'Remplacement permanent',
    'transitions.date': 'Date de transition',
    'transitions.overlap': 'Chevauchement',
    'transitions.weeks': 'semaines',
    'transitions.addTransition': 'Ajouter une transition',
    'transitions.costCurrent': 'Coût actuel (annuel)',
    'transitions.costAfter': 'Coût après transitions',
    'transitions.savings': 'Économie projetée',
    'transitions.apply': 'Appliquer le plan',
    'transitions.conflict': 'Conflit: projet en cours',
    'transitions.missingResources': 'Ressources manquantes',
    'transitions.empty': 'Aucun plan de transition.',
    'transitions.quick': 'Transition rapide',
    'transitions.impact': 'Impact coût',
    'transitions.overlapCost': 'Coût chevauchement',
    'transitions.newPermanent': '+ Nouveau permanent',
    'transitions.annualSavings': 'Économie annuelle',
    'transitions.preview': 'Aperçu',

    // Capacity preview mode (what-if Gantt)
    'capacity.previewMode.banner': 'Mode aperçu : {name} — aucun changement appliqué.',
    'capacity.previewMode.exit': 'Sortir',
    'capacity.previewMode.selectPlan': 'Aperçu du plan draft',
    'capacity.previewMode.none': 'Aucun aperçu',
    'capacity.previewMode.showCurrent': 'Afficher état actuel',
    'capacity.previewMode.legend': 'Légende : rouge = raccourci, vert = ajouté, jaune = overlap',
    'capacity.previewMode.planNotFound': 'Erreur : plan introuvable.',
    'capacity.previewMode.loading': 'Chargement…',
    'capacity.previewMode.tooltipOverlap': 'Overlap — transition en cours',
    'capacity.previewMode.tooltipShortened': 'raccourci',
    'capacity.previewMode.tooltipReplacement': 'remplaçant',

    // Project store
    'store.newProject': 'Nouveau projet',
    'store.copy': '(copie)',
    'store.calendarDescription': 'Phase : {phase} — Semaine {week}',

    // Server errors
    'error.webhook_not_configured': 'Aucune URL webhook configurée',
    'error.webhook_invalid_url': 'URL webhook invalide ou non autorisée',
    'error.webhook_bad_response': 'Le webhook a répondu avec le statut {status}',
    'error.webhook_timeout': "Le webhook n\u2019a pas répondu dans les délais",
    'error.webhook_unreachable': "Impossible de joindre l\u2019URL du webhook",
    'error.access_denied': 'Accès refusé',
    'error.project_not_found': 'Projet introuvable',
    'error.unknown': 'Une erreur est survenue',

    // Common
    'common.cancel': 'Annuler',

    // Profile
    'profile.title': 'Profil',

    // API Keys
    'apiKeys.title': 'Clés d\'API',
    'apiKeys.subtitle': 'Gérez les clés d\'API pour permettre à des outils externes d\'intégrer votre compte',
    'apiKeys.create': 'Créer une clé',
    'apiKeys.keyName': 'Nom',
    'apiKeys.keyNamePlaceholder': 'ex: Intégration Roadmap',
    'apiKeys.scopes': 'Permissions',
    'apiKeys.scopeRoadmapImport': 'Importer des projets depuis une roadmap',
    'apiKeys.scopeRoadmapRead': 'Lire l\'état d\'imports roadmap',
    'apiKeys.copyOnce': 'Copiez cette clé maintenant — elle ne sera plus affichée.',
    'apiKeys.copy': 'Copier',
    'apiKeys.copied': 'Copiée',
    'apiKeys.revoke': 'Révoquer',
    'apiKeys.revokeConfirm': 'Révoquer cette clé ? Les intégrations qui l\'utilisent cesseront immédiatement de fonctionner.',
    'apiKeys.lastUsed': 'Dernière utilisation',
    'apiKeys.never': 'Jamais',
    'apiKeys.active': 'Active',
    'apiKeys.revoked': 'Révoquée',
    'apiKeys.noKeys': 'Aucune clé. Cliquez sur « Créer une clé » pour en générer une.',
    'apiKeys.usage.title': 'Usage',
    'apiKeys.usage.calls': 'appels',
    'apiKeys.usage.window7d': '7j',
    'apiKeys.usage.window30d': '30j',
    'apiKeys.usage.successRate': 'taux de succès',
    'apiKeys.usage.topEndpoint': 'endpoint principal',
    'apiKeys.usage.lastUsed': 'dernière utilisation',
    'apiKeys.usage.recentCalls': 'appels récents',
    'apiKeys.usage.showDetails': 'Voir détails',
    'apiKeys.usage.hideDetails': 'Masquer détails',
    'apiKeys.usage.noCalls': 'Aucun appel sur cette période.',
    'apiKeys.usage.loading': 'Chargement…',
    'apiKeys.usage.method': 'Méthode',
    'apiKeys.usage.endpoint': 'Endpoint',
    'apiKeys.usage.status': 'Statut',
    'apiKeys.usage.ago': 'Il y a',

    // API Tester
    'apiTester.title': 'Testeur API',
    'apiTester.subtitle': 'Tester les endpoints `/api/v1/*` avec votre clé API',
    'apiTester.apiKey': 'Clé API',
    'apiTester.apiKeyPlaceholder': 'Collez votre clé ckc_live_...',
    'apiTester.tabImport': 'POST import',
    'apiTester.tabStatus': 'GET status',
    'apiTester.modeForm': 'Formulaire',
    'apiTester.modeJson': 'JSON brut',
    'apiTester.project': 'Projet',
    'apiTester.phases': 'Phases',
    'apiTester.addPhase': 'Ajouter une phase',
    'apiTester.upsertMode': 'Mode upsert (mettre à jour si existe)',
    'apiTester.send': 'Envoyer',
    'apiTester.checking': 'Vérifier',
    'apiTester.externalId': 'externalId',
    'apiTester.response': 'Réponse',
    'apiTester.copyCurl': 'Copier curl équivalent',
    'apiTester.copied': 'Copié',
    'apiTester.ms': 'ms',
    'apiTester.noResponse': 'Aucune réponse encore.',
    'apiTester.invalidJson': 'JSON invalide',
    'apiTester.colId': 'id',
    'apiTester.colName': 'name',
    'apiTester.colOrder': 'order',
    'apiTester.colDuration': 'durée (mois)',
    'apiTester.colStart': 'startDate',
    'apiTester.colEnd': 'endDate',
    'apiTester.colDeps': 'dependsOn',
    'apiTester.actions': 'Supprimer',
    'apiTester.showApiKey': 'Afficher',
    'apiTester.hideApiKey': 'Masquer',
    'apiTester.apiKeyHelper': 'Non persistée — à coller à chaque session.',
    'apiTester.copyFailed': 'Échec de la copie',
    'apiTester.noPhases': 'Aucune phase. Cliquez sur « {addPhase} ».',
    'apiTester.labelName': 'name',
    'apiTester.labelExternalId': 'externalId',
    'apiTester.labelStartDate': 'startDate',
    'apiTester.labelDescription': 'description',
    'apiTester.required': '*',
    'apiTester.placeholderProjectName': 'Nom du projet',
    'apiTester.placeholderOptional': 'Optionnel',
  },

  en: {
    // App / Header
    'app.name': 'Planner',
    'app.subtitle': 'Project Cost Calculator',
    'app.logout': 'Log out',
    'app.collapse': 'Collapse',
    'app.user_menu': 'User menu',
    'app.theme_light': 'Light mode',
    'app.theme_dark': 'Dark mode',
    'app.language': 'Language',

    // Auth
    'auth.login': 'Log in',
    'auth.register': 'Sign up',
    'auth.forgot': 'Forgot password',
    'auth.reset': 'New password',
    'auth.submit.login': 'Log in',
    'auth.submit.register': 'Create account',
    'auth.submit.forgot': 'Send token',
    'auth.submit.reset': 'Reset',
    'auth.loading.login': 'Logging in...',
    'auth.loading.register': 'Creating...',
    'auth.loading.forgot': 'Sending...',
    'auth.loading.reset': 'Resetting...',
    'auth.email': 'Email address',
    'auth.email.placeholder': 'you@example.com',
    'auth.name': 'Full name',
    'auth.name.placeholder': 'John Smith',
    'auth.resetToken': 'Reset token',
    'auth.password': 'Password',
    'auth.newPassword': 'New password',
    'auth.forgotLink': 'Forgot password?',
    'auth.registerLink': "Don't have an account? Sign up",
    'auth.loginLink': 'Already have an account? Log in',
    'auth.backToLogin': 'Back to login',
    'auth.resetTokenGenerated': 'A reset token has been generated.',
    'auth.passwordChanged': 'Password changed successfully. Please log in.',

    // Save indicator
    'save.saving': 'Saving...',
    'save.saved': 'Saved',
    'save.error': 'Error',

    // Dashboard
    'dashboard.title': 'Projects',
    'dashboard.startMessage': 'Start by creating a project',
    'dashboard.projectCount': '{count} project{plural}',
    'dashboard.compare': 'Compare',
    'dashboard.compareSelect': 'Select 2+',
    'dashboard.compareCount': 'Compare ({count})',
    'dashboard.cancel': 'Cancel',
    'dashboard.templates': 'Templates',
    'dashboard.import': 'Import',
    'dashboard.newProject': 'New project',
    'dashboard.noProjects': 'No projects',
    'dashboard.noProjectsMessage': 'Create a new project or import one to get started.',
    'dashboard.stats.projects': 'Projects',
    'dashboard.stats.totalCost': 'Total cost',
    'dashboard.stats.avgDuration': 'Avg. duration',
    'dashboard.stats.members': 'Members',
    'dashboard.stats.weeks': 'wks',
    'dashboard.role.editor': 'Editor',
    'dashboard.role.viewer': 'Viewer',
    'dashboard.phases': 'phase{plural}',
    'dashboard.members': 'member{plural}',
    'dashboard.weeks': 'weeks',
    'dashboard.modified': 'Modified ',
    'dashboard.totalCost': 'Total cost',
    'dashboard.rename': 'Rename',
    'dashboard.duplicate': 'Duplicate',
    'dashboard.exportJSON': 'Export JSON',
    'dashboard.exportCSV': 'Export CSV',
    'dashboard.delete': 'Delete',
    'dashboard.copy': 'copy',

    // Tabs
    'tab.phases': 'Phases',
    'tab.timeline': 'Timeline',
    'tab.budget': 'Budget',
    'tab.charts': 'Charts',
    'tab.summary': 'Report',
    'tab.risks': 'Risks',
    'tab.work': 'Work',
    'work.tabBoard': 'Board',
    'work.tabBacklog': 'Backlog',
    'work.tabTimesheet': 'Timesheet',
    'work.loading': 'Loading…',
    'work.loadFailed': 'Failed to load.',
    'work.saveFailed': 'Save failed.',
    'work.errUnknownStatus': 'Unknown status for this project.',
    'work.errTransitionBlocked': 'Transition blocked by workflow.',
    'work.close': 'Close',
    'work.taskDetails': 'Task details',
    'work.title': 'Title',
    'work.description': 'Description',
    'work.status': 'Status',
    'work.priority': 'Priority',
    'work.priority.low': 'Low',
    'work.priority.medium': 'Medium',
    'work.priority.high': 'High',
    'work.priority.critical': 'Critical',
    'work.assignee': 'Assignee',
    'work.unassigned': '— Unassigned —',
    'work.estimate': 'Estimate (h)',
    'work.filterAssignee': 'Filter by assignee',
    'work.allAssignees': 'All',
    'work.emptyBoard': 'No tasks match this filter.',
    'work.emptyBacklog': 'No epics yet — add one.',
    'work.emptyEpic': 'No stories in this epic.',
    'work.emptyStory': 'No tasks in this story.',
    'work.emptyTimesheet': 'No hours logged this week.',
    'work.newEpic': 'New epic',
    'work.syncFromPlan': 'Sync from plan',
    'work.syncTitle': 'Create one Epic per phase and one Story per milestone. Idempotent — re-running never duplicates.',
    'work.syncConfirm': 'Create missing Epics and Stories from the project phases and milestones?',
    'work.syncResult': '{epics} epic(s) and {stories} story(ies) created.',
    'work.syncFailed': 'Sync failed.',
    'work.newStory': 'New story',
    'work.newTask': 'New task',
    'work.newEpicPrompt': 'Epic title:',
    'work.newStoryPrompt': 'Story title:',
    'work.newTaskPrompt': 'Task title:',
    'work.task': 'Task',
    'work.total': 'Total',
    'work.today': 'Today',
    'time.sectionTitle': 'Time logged',
    'time.date': 'Date',
    'time.hours': 'Hours',
    'time.log': 'Log',
    'time.remove': 'Remove',
    'time.noteOptional': 'Note (optional)',
    'time.notePlaceholder': 'What you worked on…',
    'time.loading': 'Loading entries…',
    'time.noEntries': 'No entries for this task.',
    'time.invalidHours': 'Invalid hours (0 < h ≤ 24).',
    'time.errPeriodClosed': 'This period is closed.',
    'time.errFutureDate': 'Cannot log in the future.',
    'time.errNotYours': 'Not your task.',
    'time.errGeneric': 'Something went wrong.',
    'tab.rates': 'Rates',

    // Project View
    'project.back': 'Projects',
    'project.history': 'History',
    'project.share': 'Share',
    'project.weeks': 'weeks',
    'project.contingency': 'Contingency',
    'project.taxes': 'Taxes',
    'project.currency': 'Currency',
    'project.addPhase': 'Add a phase',
    'project.totalDuration': 'Total duration',
    'project.totalCost': 'Total cost',
    'project.deletePhase': 'Delete phase',
    'project.movePhaseUp': 'Move phase up',
    'project.movePhaseDown': 'Move phase down',
    'project.exportJSON': 'Export JSON',
    'project.exportCSV': 'Export CSV',
    'project.budget': 'Project budget',
    'project.startDate': 'Start date',
    'project.noBudget': 'No budget',

    // Webhook
    'webhook.title': 'Webhook notifications',
    'webhook.url': 'Webhook URL',
    'webhook.sending': 'Sending…',
    'webhook.test': 'Test',
    'webhook.success': 'Sent successfully',
    'webhook.error': 'Send failed',
    'webhook.webhook_not_configured': 'No webhook URL configured',
    'webhook.webhook_url_invalid': 'Webhook URL is invalid or not allowed',
    'webhook.webhook_response_error': 'Webhook responded with an error',
    'webhook.webhook_timeout': 'Webhook did not respond in time',
    'webhook.webhook_unreachable': 'Unable to reach webhook URL',
    'webhook.threshold': 'Alert threshold',
    'webhook.thresholdUnit': '% of budget',

    // Phase Editor
    'phase.duration': 'Duration:',
    'phase.weeks': 'weeks',
    'phase.team': 'Team',
    'phase.addMember': 'Add member',
    'phase.noMembers': 'No members. Add members to calculate costs.',
    'phase.remove': 'Remove',
    'phase.rate': 'Rate',
    'phase.hoursWeek': 'Hours/wk',
    'phase.costWeek': 'Cost/wk',
    'phase.period': 'Period',
    'phase.start': 'Start',
    'phase.end': 'End',
    'phase.weeklyCost': 'Weekly cost',
    'phase.totalCost': 'Total cost ({weeks} wks)',
    'phase.milestones': 'Milestones',
    'phase.add': 'Add',
    'phase.milestonePlaceholder': 'Milestone name',
    'phase.weekAbbr': 'Wk',
    'phase.noMilestones': 'No milestones defined.',
    'phase.week': 'Week {week}',
    'phase.dependencies': 'Dependencies',
    'phase.noDependencies': 'No dependencies. This phase can start immediately.',

    // Levels
    'level.internal': 'Internal employee',
    'level.junior': 'Junior',
    'level.intermediate': 'Intermediate',
    'level.senior': 'Senior',
    'level.expert': 'Expert',

    // Timeline
    'timeline.title': 'Project timeline',
    'timeline.empty': 'Add phases to see the timeline.',
    'timeline.calendar': 'Calendar',
    'timeline.costBreakdown': 'Cost breakdown',
    'timeline.phase': 'Phase',
    'timeline.duration': 'Duration',
    'timeline.members': 'Members',
    'timeline.costPerWeek': 'Cost/wk',
    'timeline.phaseCost': 'Phase cost',
    'timeline.cumulative': 'Cumulative',
    'timeline.milestones': 'Milestones',
    'timeline.weekLabel': 'Week {week}',

    // Budget
    'budget.title': 'Budget tracking',
    'budget.usage': 'Budget usage',
    'budget.alert': 'Budget alert:',
    'budget.alertMessage': 'estimated cost ({cost}) has reached {percent}% of budget, exceeding the {threshold}% threshold.',
    'budget.webhookConfigured': ' A webhook notification is configured.',
    'budget.overBudget': 'Over budget',
    'budget.underBudget': 'Under budget',
    'budget.estimatedCost': 'Estimated total cost',
    'budget.burnRate': 'Burn rate',
    'budget.perWeek': 'per week',
    'budget.duration': 'Duration',
    'budget.weeksAbbr': 'wks',
    'budget.budgetFor': 'Budget for {weeks} wks',
    'budget.breakdown': 'Breakdown',
    'budget.labour': 'Labour',
    'budget.otherCosts': 'Other costs',
    'budget.contingency': 'Contingency ({percent}%)',
    'budget.contingencyIncluded': 'Included in labour',
    'budget.taxes': 'Taxes ({percent}%)',
    'budget.taxesIncluded': 'Included in labour',
    'budget.actualsTitle': 'Actuals (logged time)',
    'budget.actualsHours': 'Hours logged',
    'budget.actualsCost': 'Actual cost',
    'budget.forecastVsActuals': 'Forecast vs actual',

    // Non-labour costs
    'nonLabour.title': 'Non-labour costs',
    'nonLabour.add': 'Add',
    'nonLabour.name': 'Name',
    'nonLabour.amount': 'Amount',
    'nonLabour.cancel': 'Cancel',
    'nonLabour.empty': 'No additional costs. Add infrastructure, licenses, etc.',
    'nonLabour.category': 'Category',
    'nonLabour.total': 'Total',
    'nonLabour.byCategory': 'By category',
    'nonLabour.cat.infrastructure': 'Infrastructure',
    'nonLabour.cat.licenses': 'Licenses',
    'nonLabour.cat.saas': 'SaaS / Tools',
    'nonLabour.cat.travel': 'Travel',
    'nonLabour.cat.training': 'Training',
    'nonLabour.cat.equipment': 'Equipment',
    'nonLabour.cat.other': 'Other',

    // Charts
    'charts.title': 'Cost breakdown',
    'charts.byRole': 'By role',
    'charts.byPhase': 'By phase',
    'charts.byCategory': 'By category',
    'charts.empty': 'Add team members to see charts.',

    // Rates Manager
    'rates.title': 'Roles & rates management',
    'rates.internalRate': 'Internal hourly rate',
    'rates.consultantRates': 'Consultant rates',
    'rates.addRole': 'Add role',
    'rates.roleName': 'Role name',
    'rates.role': 'Role',
    'rates.actions': 'Actions',
    'rates.clickToEdit': 'Click to edit',
    'rates.deleteRole': 'Delete role',
    'rates.noRoles': 'No roles defined. Click "Add role" to get started.',

    // Summary
    'summary.export': 'Export PDF',
    'summary.generatedOn': 'Report generated on ',
    'summary.totalCost': 'Total cost',
    'summary.duration': 'Duration',
    'summary.members': 'Members',
    'summary.ratePerWeek': 'Rate/week',
    'summary.variance': 'Variance',
    'summary.costBreakdown': 'Cost breakdown',
    'summary.labour': 'Labour',
    'summary.otherCosts': 'Other costs',
    'summary.contingencyIncluded': '{percent}% contingency included',
    'summary.taxesIncluded': 'Taxes ({percent}%) included',
    'summary.actualsTitle': 'Actuals',
    'summary.hoursLogged': 'Hours logged',
    'summary.actualCost': 'Actual cost',
    'summary.phases': 'Phases',
    'summary.phase': 'Phase',
    'summary.budget': 'Budget',
    'summary.total': 'Total',
    'summary.costPerWeek': 'Cost/week',
    'summary.nonLabourCosts': 'Non-labour costs',
    'summary.milestones': 'Milestones',
    'summary.name': 'Name',
    'summary.category': 'Category',
    'summary.amount': 'Amount',
    'summary.weekNum': 'Week {week}',
    'summary.footer': 'Project Cost Calculator',

    // Scenario Comparison
    'scenario.title': 'Scenario comparison',
    'scenario.close': 'Close',
    'scenario.selectTwo': 'Select at least 2 projects to compare.',
    'scenario.totalCost': 'Total cost',
    'scenario.labour': 'Labour',
    'scenario.otherCosts': 'Other costs',
    'scenario.duration': 'Duration',
    'scenario.burnRate': 'Rate/wk',
    'scenario.phases': 'Phases',
    'scenario.members': 'Members',
    'scenario.budget': 'Budget',
    'scenario.visualComparison': 'Visual cost comparison',

    // Share
    'share.title': 'Share project',
    'share.emailPlaceholder': 'email@example.com',
    'share.invite': 'Invite',
    'share.currentShares': 'Current shares',
    'share.noShares': 'No shares.',
    'share.error': 'An error occurred.',
    'share.roleViewer': 'View only',
    'share.roleEditor': 'Editor',

    // Templates
    'templates.title': 'Template management',
    'templates.save': 'Save',
    'templates.load': 'Load',
    'templates.templateName': 'Template name',
    'templates.saveAsTemplate': 'Save as template',
    'templates.noTemplates': 'No saved templates.',
    'templates.use': 'Use',
    'templates.defaultName': 'Template',
    'templates.defaultNameProject': '{name} - Template',

    // Version History
    'history.title': 'Version history',
    'history.labelPlaceholder': 'Label (optional)',
    'history.createSnapshot': 'Create save point',
    'history.noSnapshots': 'No saved versions.',
    'history.autoSave': 'Auto-save',
    'history.restore': 'Restore',

    // Resource Conflicts
    'conflicts.title': 'Resource conflicts',
    'conflicts.none': 'No resource conflicts detected',
    'conflicts.warning': 'Role {role} ({level}) is allocated at {alloc}% during weeks {start}-{end} (recommended maximum: 100%)',

    // Risk Register
    'risks.title': 'Risk register',
    'risks.add': 'Add risk',
    'risks.empty': 'No risks recorded. Click "Add risk" to get started.',
    'risks.matrix': 'Risk matrix',
    'risks.probability': 'Probability',
    'risks.impact': 'Impact',
    'risks.score': 'Score',
    'risks.phase': 'Phase',
    'risks.mitigation': 'Mitigation',
    'risks.risk': 'Risk',
    'risks.actions': 'Actions',
    'risks.riskPlaceholder': 'Risk name',
    'risks.phasePlaceholder': 'Phase',
    'risks.mitigationPlaceholder': 'Mitigation strategy',

    // Onboarding
    'onboarding.title': 'Getting Started',
    'onboarding.subtitle': 'Follow these steps to set up your capacity planning.',
    'onboarding.completeTitle': 'Setup complete!',
    'onboarding.completeDesc': 'Your environment is ready. Check out the capacity Gantt.',
    'onboarding.help': 'Guide',
    'onboarding.done': 'Done',
    'onboarding.step1Title': '1. Review hourly rates',
    'onboarding.step1Desc': 'The default rate card is pre-configured. Adjust as needed.',
    'onboarding.step1Action': 'View rates',
    'onboarding.step2Title': '2. Add your resources',
    'onboarding.step2Desc': 'Create your team members (name, role, permanent or consultant).',
    'onboarding.step2Action': 'Add resources',
    'onboarding.step3Title': '3. Create a project',
    'onboarding.step3Desc': 'Define phases, durations and assign your resources.',
    'onboarding.step3Action': 'Create project',
    'onboarding.step4Title': '4. View capacity',
    'onboarding.step4Desc': 'Visualize resource utilization and plan transitions.',
    'onboarding.step4Action': 'View Gantt',

    // Cost categories
    'category.labour': 'Labour',

    // Capacity
    'capacity.title': 'Capacity',
    'capacity.gantt': 'Gantt',
    'capacity.resources': 'Resources',
    'capacity.transitions': 'Transitions',
    'capacity.byProject': 'By project',
    'capacity.byType': 'By type',
    'capacity.exportExcel': 'Export to Excel',
    'capacity.exportError': 'Excel export failed.',
    'capacity.utilization': 'Utilization rate',
    'capacity.overAllocated': 'Over-allocated',
    'capacity.available': 'Available',
    'capacity.permanent': 'Permanent',
    'capacity.consultant': 'Consultant',
    'myWork.title': 'My work',
    'myWork.subtitle': 'Tasks assigned to you across all your projects.',
    'myWork.back': 'Back',
    'myWork.empty': "Nothing assigned to you yet. A project manager needs to link your account to a resource first.",
    'myWork.openCount': 'open',
    'myWork.totalCount': 'total',
    'dashboard.role.member': 'Team',
    'share.roleMember': 'Team',
    'capacity.linkedUser': 'Linked user',
    'capacity.notLinked': '— Not linked —',
    'capacity.userAlreadyLinked': 'That user is already linked to another resource.',
    'capacity.alreadyLinkedShort': 'already linked',
    'capacity.invalidUser': 'That user is not a valid candidate.',
    'capacity.linkFailed': 'Link failed.',
    'close.title': 'Financial close',
    'close.subtitle': 'Lock published periods so hours cannot be edited retroactively.',
    'close.open': 'Open',
    'close.closed': 'Closed',
    'close.close': 'Close',
    'close.reopen': 'Reopen',
    'close.closedBy': 'closed by {email} on {date}',
    'close.loading': 'Loading periods…',
    'close.loadFailed': 'Could not load periods.',
    'close.toggleFailed': 'Action not available for this period.',
    'capacity.permanentCount': '{count} permanent{plural}',
    'capacity.consultantCount': '{count} consultant{plural}',
    'capacity.noData': 'No capacity data. Add resources and assign them to projects.',

    // Resources
    'resources.title': 'Resource pool',
    'resources.add': 'Add resource',
    'resources.edit': 'Edit',
    'resources.delete': 'Delete',
    'resources.name': 'Name',
    'resources.role': 'Role',
    'resources.level': 'Level',
    'resources.type': 'Type',
    'resources.maxCapacity': 'Max capacity',
    'resources.assignments': 'Assignments',
    'resources.search': 'Search...',
    'resources.empty': 'No resources. Add people to your pool.',
    'resources.confirmDelete': 'Delete this resource and all its assignments?',
    'resources.nameExists': 'A resource with this name already exists.',
    'resources.save': 'Save',
    'resources.cancel': 'Cancel',
    'resources.addToPool': 'Add to pool',

    // Transitions
    'transitions.title': 'Transition plans',
    'transitions.add': 'New plan',
    'transitions.planName': 'Plan name',
    'transitions.status.draft': 'Draft',
    'transitions.status.planned': 'Planned',
    'transitions.status.applied': 'Applied',
    'transitions.consultant': 'Current consultant',
    'transitions.replacement': 'Permanent replacement',
    'transitions.date': 'Transition date',
    'transitions.overlap': 'Overlap',
    'transitions.weeks': 'weeks',
    'transitions.addTransition': 'Add transition',
    'transitions.costCurrent': 'Current cost (annual)',
    'transitions.costAfter': 'Cost after transitions',
    'transitions.savings': 'Projected savings',
    'transitions.apply': 'Apply plan',
    'transitions.conflict': 'Conflict: active project',
    'transitions.missingResources': 'Missing resources',
    'transitions.empty': 'No transition plans.',
    'transitions.quick': 'Quick transition',
    'transitions.impact': 'Cost impact',
    'transitions.overlapCost': 'Overlap cost',
    'transitions.newPermanent': '+ New permanent',
    'transitions.annualSavings': 'Annual savings',
    'transitions.preview': 'Preview',

    // Capacity preview mode (what-if Gantt)
    'capacity.previewMode.banner': 'Preview mode: {name} — no changes applied.',
    'capacity.previewMode.exit': 'Exit',
    'capacity.previewMode.selectPlan': 'Preview draft plan',
    'capacity.previewMode.none': 'No preview',
    'capacity.previewMode.showCurrent': 'Show current state',
    'capacity.previewMode.legend': 'Legend: red = shortened, green = added, yellow = overlap',
    'capacity.previewMode.planNotFound': 'Error: plan not found.',
    'capacity.previewMode.loading': 'Loading…',
    'capacity.previewMode.tooltipOverlap': 'Overlap — transition in progress',
    'capacity.previewMode.tooltipShortened': 'shortened',
    'capacity.previewMode.tooltipReplacement': 'replacement',

    // Project store
    'store.newProject': 'New project',
    'store.copy': '(copy)',
    'store.calendarDescription': 'Phase: {phase} — Week {week}',

    // Server errors
    'error.webhook_not_configured': 'No webhook URL configured',
    'error.webhook_invalid_url': 'Invalid or disallowed webhook URL',
    'error.webhook_bad_response': 'Webhook responded with status {status}',
    'error.webhook_timeout': 'Webhook did not respond in time',
    'error.webhook_unreachable': 'Unable to reach webhook URL',
    'error.access_denied': 'Access denied',
    'error.project_not_found': 'Project not found',
    'error.unknown': 'An error occurred',

    // Common
    'common.cancel': 'Cancel',

    // Profile
    'profile.title': 'Profile',

    // API Keys
    'apiKeys.title': 'API Keys',
    'apiKeys.subtitle': 'Manage API keys to allow external tools to integrate with your account',
    'apiKeys.create': 'Create a key',
    'apiKeys.keyName': 'Name',
    'apiKeys.keyNamePlaceholder': 'ex: Roadmap Integration',
    'apiKeys.scopes': 'Permissions',
    'apiKeys.scopeRoadmapImport': 'Import projects from a roadmap',
    'apiKeys.scopeRoadmapRead': 'Read roadmap import status',
    'apiKeys.copyOnce': 'Copy this key now — it will not be shown again.',
    'apiKeys.copy': 'Copy',
    'apiKeys.copied': 'Copied',
    'apiKeys.revoke': 'Revoke',
    'apiKeys.revokeConfirm': 'Revoke this key? Integrations using it will stop working immediately.',
    'apiKeys.lastUsed': 'Last used',
    'apiKeys.never': 'Never',
    'apiKeys.active': 'Active',
    'apiKeys.revoked': 'Revoked',
    'apiKeys.noKeys': 'No keys. Click "Create a key" to generate one.',
    'apiKeys.usage.title': 'Usage',
    'apiKeys.usage.calls': 'calls',
    'apiKeys.usage.window7d': '7d',
    'apiKeys.usage.window30d': '30d',
    'apiKeys.usage.successRate': 'success rate',
    'apiKeys.usage.topEndpoint': 'top endpoint',
    'apiKeys.usage.lastUsed': 'last used',
    'apiKeys.usage.recentCalls': 'recent calls',
    'apiKeys.usage.showDetails': 'Show details',
    'apiKeys.usage.hideDetails': 'Hide details',
    'apiKeys.usage.noCalls': 'No calls in this period.',
    'apiKeys.usage.loading': 'Loading…',
    'apiKeys.usage.method': 'Method',
    'apiKeys.usage.endpoint': 'Endpoint',
    'apiKeys.usage.status': 'Status',
    'apiKeys.usage.ago': 'Ago',

    // API Tester
    'apiTester.title': 'API Tester',
    'apiTester.subtitle': 'Test `/api/v1/*` endpoints with your API key',
    'apiTester.apiKey': 'API Key',
    'apiTester.apiKeyPlaceholder': 'Paste your ckc_live_... key',
    'apiTester.tabImport': 'POST import',
    'apiTester.tabStatus': 'GET status',
    'apiTester.modeForm': 'Form',
    'apiTester.modeJson': 'Raw JSON',
    'apiTester.project': 'Project',
    'apiTester.phases': 'Phases',
    'apiTester.addPhase': 'Add a phase',
    'apiTester.upsertMode': 'Upsert mode (update if exists)',
    'apiTester.send': 'Send',
    'apiTester.checking': 'Check',
    'apiTester.externalId': 'externalId',
    'apiTester.response': 'Response',
    'apiTester.copyCurl': 'Copy curl command',
    'apiTester.copied': 'Copied',
    'apiTester.ms': 'ms',
    'apiTester.noResponse': 'No response yet.',
    'apiTester.invalidJson': 'Invalid JSON',
    'apiTester.colId': 'id',
    'apiTester.colName': 'name',
    'apiTester.colOrder': 'order',
    'apiTester.colDuration': 'duration (months)',
    'apiTester.colStart': 'startDate',
    'apiTester.colEnd': 'endDate',
    'apiTester.colDeps': 'dependsOn',
    'apiTester.actions': 'Delete',
    'apiTester.showApiKey': 'Show',
    'apiTester.hideApiKey': 'Hide',
    'apiTester.apiKeyHelper': 'Not persisted — paste each session.',
    'apiTester.copyFailed': 'Copy failed',
    'apiTester.noPhases': 'No phases. Click "{addPhase}" to add one.',
    'apiTester.labelName': 'name',
    'apiTester.labelExternalId': 'externalId',
    'apiTester.labelStartDate': 'startDate',
    'apiTester.labelDescription': 'description',
    'apiTester.required': '*',
    'apiTester.placeholderProjectName': 'Project name',
    'apiTester.placeholderOptional': 'Optional',
  },
};

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

/**
 * Determine the initial locale on first load.
 * Priority: persisted user choice (localStorage) → browser language → 'fr'.
 * Falls back to 'fr' for any browser language other than English.
 * @returns {'fr'|'en'}
 */
function detectLocale() {
  const saved = localStorage.getItem('locale');
  if (saved && translations[saved]) return saved;
  const browserLang = navigator.language || 'fr';
  return browserLang.startsWith('fr') ? 'fr' : 'en';
}

/**
 * Map the app locale to an Intl-compatible locale string for date and number
 * formatting. Both locales use Canadian conventions (CA suffix) because the
 * application targets a Canadian organisation.
 *
 * @param {'fr'|'en'} locale - App locale.
 * @returns {'fr-CA'|'en-CA'}
 */
export function getDateLocale(locale) {
  return locale === 'fr' ? 'fr-CA' : 'en-CA';
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

/** @type {React.Context<{t: Function, locale: string, setLocale: Function}|null>} */
const LocaleContext = createContext(null);

/**
 * Wraps the application (or a subtree) and provides locale state to all
 * descendant components via `useLocale()`.
 *
 * Syncs `document.documentElement.lang` on every locale change so that
 * browser accessibility tools and CSS `:lang()` selectors work correctly.
 *
 * @param {object}      props          - Component props.
 * @param {React.ReactNode} props.children - Child tree to wrap.
 */
export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  /**
   * Change the active locale. Persists the choice to localStorage so it
   * survives page reloads, and updates the <html lang> attribute immediately.
   * @param {'fr'|'en'} newLocale
   */
  const setLocale = useCallback((newLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  // Keep lang attribute in sync even when locale is set externally (e.g.
  // during hydration from SSR, though we don't do SSR — defensive coding).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  /**
   * Translate a dot-notation key into the current locale's string.
   * Falls back to the FR string, then to the raw key if both are missing.
   * Supports {placeholder} interpolation via the params object.
   *
   * @param {string} key    - Translation key (e.g. 'auth.login').
   * @param {object} [params] - Optional substitution map ({ count: 3 }).
   * @returns {string}
   */
  const t = useCallback((key, params) => {
    // FR is the canonical fallback — a missing EN key should never show as a
    // raw dot-notation string to the user.
    let str = translations[locale]?.[key] || translations.fr[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Access the current locale context.
 * Must be called inside a component rendered within `<LocaleProvider>`.
 * Throws a descriptive error if used outside the provider so misconfigured
 * trees fail loudly at development time.
 *
 * @returns {{ t: Function, locale: 'fr'|'en', setLocale: Function }}
 */
export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}

// ---------------------------------------------------------------------------
// Level key helpers
// ---------------------------------------------------------------------------

/**
 * Canonical level keys as stored in project data (language-neutral).
 * These French strings are the single source of truth for level identity —
 * they are stored in the DB and in exported JSON. Display strings are
 * obtained via `getLevelLabel(t, key)`.
 */
export const LEVEL_KEYS = ['Employé interne', 'Junior', 'Intermédiaire', 'Sénior', 'Expert'];

/**
 * Translate a stored level key to a localised display label.
 * Falls back to the raw key when no mapping exists (forward-compatible with
 * custom levels that may be added in future).
 *
 * @param {Function} t        - Translation function from `useLocale()`.
 * @param {string}   levelKey - Stored level key (one of LEVEL_KEYS).
 * @returns {string} Localised display string.
 */
export function getLevelLabel(t, levelKey) {
  const map = {
    'Employé interne': t('level.internal'),
    'Junior': t('level.junior'),
    'Intermédiaire': t('level.intermediate'),
    'Sénior': t('level.senior'),
    'Expert': t('level.expert'),
  };
  return map[levelKey] || levelKey;
}

/**
 * Subset of LEVEL_KEYS excluding internal employees.
 * Used when a UI element should only show consultant seniority levels
 * (e.g. the resource pool type selector for consultants).
 */
export const CONSULTANT_LEVEL_KEYS = ['Junior', 'Intermédiaire', 'Sénior', 'Expert'];

/**
 * Alias for `getLevelLabel` scoped to consultant levels.
 * Exists for call-site clarity — the underlying logic is identical.
 *
 * @param {Function} t        - Translation function from `useLocale()`.
 * @param {string}   levelKey - Consultant level key.
 * @returns {string} Localised display string.
 */
export function getConsultantLevelLabel(t, levelKey) {
  return getLevelLabel(t, levelKey);
}
