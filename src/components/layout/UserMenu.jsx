/**
 * UserMenu — dropdown déclenché par l'avatar utilisateur dans la Topbar.
 * Regroupe l'identité (name / email), la nav Profile, et les actions rares
 * (theme, locale, logout) pour les sortir du chrome principal.
 *
 * Gestion du focus / fermeture :
 *   - Click outside → fermeture (listener sur document)
 *   - Escape → fermeture
 *   - Items cliqués → exécutent l'action puis ferment
 *
 * Accessibilité : on utilise des rôles ARIA *basiques* (button) plutôt que
 * `role="menu"` / `role="menuitem"`, car ces rôles impliquent une sémantique
 * clavier complète (roving focus, flèches haut/bas) qu'on n'implémente pas
 * ici. Mentir sur le rôle ARIA est pire qu'utiliser le rôle générique.
 */
import { useState, useEffect, useRef } from 'react';
import { User, LogOut, Moon, Sun, Languages, Check } from 'lucide-react';
import { useLocale } from '../../lib/i18n';

/**
 * @param {Object} props
 * @param {{name: string, email: string}} props.user
 * @param {string} props.locale - 'fr' | 'en'
 * @param {(l: string) => void} props.onLocaleChange
 * @param {() => void} props.onLogout
 * @param {() => void} props.onNavigateProfile - Open the Profile view
 */
export default function UserMenu({ user, locale, onLocaleChange, onLogout, onNavigateProfile }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const containerRef = useRef(null);

  // Close on click outside or Escape. Attaching listeners only while open
  // avoids unnecessary document-level work in the common case.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Restricted/privacy modes may throw — the in-memory toggle still works,
      // the preference just won't survive the next reload.
    }
    setIsDark(next);
    setOpen(false);
  };

  const initials = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={t('app.user_menu') || 'User menu'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-md">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {onNavigateProfile && (
            <div className="py-1">
              <MenuItem icon={User} onClick={() => { onNavigateProfile(); setOpen(false); }}>
                {t('profile.title') || 'Profile'}
              </MenuItem>
            </div>
          )}

          <div className="border-t border-border py-1">
            <MenuItem icon={isDark ? Sun : Moon} onClick={toggleTheme}>
              {isDark ? t('app.theme_light') || 'Mode clair' : t('app.theme_dark') || 'Mode sombre'}
            </MenuItem>

            <div className="px-2 py-1">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t('app.language') || 'Langue'}
              </p>
              <button
                type="button"
                onClick={() => { onLocaleChange('fr'); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-muted-foreground" />
                  Français
                </span>
                {locale === 'fr' && <Check className="h-4 w-4 text-primary" />}
              </button>
              <button
                type="button"
                onClick={() => { onLocaleChange('en'); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-muted-foreground" />
                  English
                </span>
                {locale === 'en' && <Check className="h-4 w-4 text-primary" />}
              </button>
            </div>
          </div>

          <div className="border-t border-border py-1">
            <MenuItem icon={LogOut} onClick={() => { onLogout(); setOpen(false); }} destructive>
              {t('app.logout') || 'Déconnexion'}
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

/** Nav-item atomique du menu dropdown. Factorisé pour uniformité visuelle. */
function MenuItem({ icon: Icon, children, onClick, destructive = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted ${
        destructive ? 'text-destructive' : ''
      }`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}
