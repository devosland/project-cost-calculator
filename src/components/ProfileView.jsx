/**
 * User profile page composing three sections: user identity header, API key
 * management (ApiKeysView), and the API endpoint tester (ApiTester). Acts as
 * a layout shell — no business logic lives here; each sub-section is
 * self-contained.
 */
import React from 'react';
import { User } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import ApiKeysView from './ApiKeysView';
import ApiTester from './ApiTester';

/**
 * @param {Object} props
 * @param {{name: string, email: string}} props.user - Authenticated user object
 *   displayed in the header. ApiKeysView and ApiTester fetch their own data.
 */
export default function ProfileView({ user }) {
  const { t } = useLocale();

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

      {/* Divider */}
      <hr className="border-border" />

      {/* API Tester section */}
      <ApiTester />
    </div>
  );
}
