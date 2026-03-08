import React, { useState } from 'react';
import { Mail, Lock, User, LogIn, KeyRound } from 'lucide-react';
import { Button } from './ui/button';
import { api } from '../lib/api';
import { useLocale } from '../lib/i18n';

export default function AuthPage({ onAuth }) {
  const { t } = useLocale();
  const [mode, setMode] = useState('login'); // login, register, forgot, reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const data = await api.login(email, password);
        api.setToken(data.token);
        onAuth(data.user, data.token);
      } else if (mode === 'register') {
        const data = await api.register(email, name, password);
        api.setToken(data.token);
        onAuth(data.user, data.token);
      } else if (mode === 'forgot') {
        const data = await api.forgotPassword(email);
        setResetToken(data.resetToken);
        setSuccess(t('auth.resetTokenGenerated'));
        setMode('reset');
      } else if (mode === 'reset') {
        await api.resetPassword(resetToken, password);
        setSuccess(t('auth.passwordChanged'));
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  const titles = {
    login: t('auth.login'),
    register: t('auth.register'),
    forgot: t('auth.forgot'),
    reset: t('auth.reset'),
  };

  const submitLabels = {
    login: t('auth.submit.login'),
    register: t('auth.submit.register'),
    forgot: t('auth.submit.forgot'),
    reset: t('auth.submit.reset'),
  };

  const loadingLabels = {
    login: t('auth.loading.login'),
    register: t('auth.loading.register'),
    forgot: t('auth.loading.forgot'),
    reset: t('auth.loading.reset'),
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-xl mb-4 shadow-lg shadow-primary/25">
            PC
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('app.name')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('app.subtitle')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-black/5 border border-border/50 dark:border-gray-700 p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            {titles[mode]}
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-sm border border-emerald-200 dark:border-emerald-800">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (login, register, forgot) */}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field w-full pl-10"
                    placeholder={t('auth.email.placeholder')}
                  />
                </div>
              </div>
            )}

            {/* Name (register only) */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="name">
                  {t('auth.name')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field w-full pl-10"
                    placeholder={t('auth.name.placeholder')}
                  />
                </div>
              </div>
            )}

            {/* Reset token (reset mode) */}
            {mode === 'reset' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="token">
                  {t('auth.resetToken')}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="token"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="input-field w-full pl-10 font-mono text-sm"
                  />
                </div>
              </div>
            )}

            {/* Password (login, register, reset) */}
            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field w-full pl-10"
                    placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="default"
              size="default"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {loadingLabels[mode]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  {submitLabels[mode]}
                </span>
              )}
            </Button>
          </form>

          {/* Footer links */}
          <div className="mt-6 text-center space-y-2">
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="block w-full text-sm text-muted-foreground hover:text-foreground transition-colors hover:underline"
                >
                  {t('auth.forgotLink')}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="block w-full text-sm text-primary hover:text-primary/80 transition-colors hover:underline"
                >
                  {t('auth.registerLink')}
                </button>
              </>
            )}
            {mode === 'register' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sm text-primary hover:text-primary/80 transition-colors hover:underline"
              >
                {t('auth.loginLink')}
              </button>
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-sm text-primary hover:text-primary/80 transition-colors hover:underline"
              >
                {t('auth.backToLogin')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
