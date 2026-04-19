/**
 * Modal dialog for sharing a project with other users. Supports two roles:
 * viewer (read-only) and editor (can modify the project). Invitees must already
 * have an account — the API resolves the email to an existing user and returns
 * an error if the user is not found. The current share list is fetched by the
 * parent (App) before opening and passed in via props; removals update the
 * parent's state optimistically.
 */
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Mail, UserPlus, X, Shield } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

/** Role → Prism token (info for viewer = read-only, warning for editor = mutable access). */
const roleTokens = {
  viewer: '--prism-info',
  editor: '--prism-warning',
};

const roleBadgeStyle = (role) => {
  const token = roleTokens[role];
  if (!token) return undefined;
  return {
    backgroundColor: `color-mix(in srgb, var(${token}) 18%, transparent)`,
    color: `var(${token})`,
  };
};

/**
 * @param {Object} props
 * @param {boolean} props.open - Whether the dialog is visible.
 * @param {function(): void} props.onClose - Close the dialog.
 * @param {Array<{user_id: string, name: string, email: string, role: string}>} props.shares
 *   Current list of users with access to the active project.
 * @param {function(string, string): Promise<void>} props.onShare
 *   Called with (email, role) to invite a user.
 * @param {function(string): void} props.onUnshare - Remove a share by user_id.
 */
const ShareDialog = ({ open, onClose, shares, onShare, onUnshare }) => {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');
  const trapRef = useFocusTrap(open);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        tabIndex={-1}
        className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <h2 id="share-dialog-title" className="font-display text-xl font-semibold tracking-tight">
              {t('share.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('nonLabour.cancel')}
            className="p-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className="flex items-center justify-between p-3 rounded-md border border-border bg-background"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{share.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{share.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={roleBadgeStyle(share.role)}
                    >
                      {ROLE_OPTIONS.find((o) => o.value === share.role)?.label || share.role}
                    </span>
                    <button
                      onClick={() => onUnshare(share.user_id)}
                      title={t('resources.delete')}
                      aria-label={t('resources.delete')}
                      className="p-1 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
