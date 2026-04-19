/**
 * User profile page composing three sections: user identity header, API key
 * management (ApiKeysView), and the API endpoint tester (ApiTester). Acts as
 * a layout shell — no business logic lives here; each sub-section is
 * self-contained.
 *
 * ApiTester backdoor : l'outil de test manuel des endpoints publics est
 * masqué par défaut en prod (bruit pour l'utilisateur standard). Il reste
 * accessible via le flag d'URL `?debug=1` (p. ex. `site/?debug=1#/profile`)
 * — suffisant pour le dev/debug sans polluer l'UX courante.
 */
import React from 'react';
import { User } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import ApiKeysView from './ApiKeysView';
import ApiTester from './ApiTester';

/** Detect debug flag in either query string or hash (hash-routing compat). */
function isDebugMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === '1') return true;
  // Also support `#/profile?debug=1` for users who prefer keeping the flag
  // scoped to the hash fragment.
  const hash = window.location.hash || '';
  const hashQueryIdx = hash.indexOf('?');
  if (hashQueryIdx >= 0) {
    const hashParams = new URLSearchParams(hash.slice(hashQueryIdx + 1));
    if (hashParams.get('debug') === '1') return true;
  }
  return false;
}

/**
 * @param {Object} props
 * @param {{name: string, email: string}} props.user - Authenticated user object
 *   displayed in the header. ApiKeysView and ApiTester fetch their own data.
 */
export default function ProfileView({ user }) {
  const { t } = useLocale();
  const debug = isDebugMode();

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          {user && (
            <p className="text-sm text-muted-foreground">{user.name} · {user.email}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* API Keys section */}
      <ApiKeysView />

      {/* API Tester — only in debug mode (?debug=1) */}
      {debug && (
        <>
          <hr className="border-border" />
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            Debug mode actif — ApiTester visible via le flag <code>?debug=1</code>.
          </div>
          <ApiTester />
        </>
      )}
    </div>
  );
}
