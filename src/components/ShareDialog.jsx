import React, { useState } from 'react';
import { Button } from './ui/button';
import { Mail, UserPlus, X, Shield } from 'lucide-react';
import { useLocale } from '../lib/i18n';

const roleBadgeStyles = {
  viewer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  editor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const ShareDialog = ({ open, onClose, shares, onShare, onUnshare }) => {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');

  const ROLE_OPTIONS = [
    { value: 'viewer', label: t('share.roleViewer') },
    { value: 'editor', label: t('share.roleEditor') },
  ];

  if (!open) return null;

  const handleInvite = async () => {
    setError('');
    try {
      await onShare(email, role);
      setEmail('');
      setRole('viewer');
    } catch (err) {
      setError(err.message || t('share.error'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <h2 className="text-xl font-semibold">{t('share.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invite Form */}
        <div className="space-y-3 mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                className="input-field w-full pl-9"
                placeholder={t('share.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <select
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button variant="default" size="sm" onClick={handleInvite} className="w-full">
            <UserPlus className="w-4 h-4 mr-2" />
            {t('share.invite')}
          </Button>
        </div>

        {/* Current Shares */}
        <div>
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">{t('share.currentShares')}</h3>
          <div className="space-y-2">
            {(!shares || shares.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t('share.noShares')}
              </p>
            ) : (
              shares.map((share) => (
                <div
                  key={share.user_id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{share.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{share.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeStyles[share.role] || ''}`}>
                      {ROLE_OPTIONS.find((o) => o.value === share.role)?.label || share.role}
                    </span>
                    <button
                      onClick={() => onUnshare(share.user_id)}
                      className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;
