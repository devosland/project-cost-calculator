/**
 * Topbar — chrome horizontal minimal (48px) au-dessus de la zone de contenu.
 * Contient le hamburger mobile, un breadcrumb contextuel, le SaveIndicator,
 * et le UserMenu. Délibérément léger : les actions globales (nav) sont dans
 * la Sidebar, les actions rares (theme, locale, logout) sont dans UserMenu.
 */
import { Menu } from 'lucide-react';
import SaveIndicator from '../SaveIndicator';
import UserMenu from './UserMenu';
import { useLocale } from '../../lib/i18n';

/**
 * @param {Object} props
 * @param {{name: string, email: string}} props.user
 * @param {string} props.saveStatus - 'idle' | 'saving' | 'saved' | 'error'
 * @param {string} props.currentView - 'projects' | 'capacity' | 'profile'
 * @param {string|null} [props.activeProjectName] - When inside a project, shown as second breadcrumb segment.
 * @param {string} props.locale
 * @param {(l: string) => void} props.onLocaleChange
 * @param {() => void} props.onLogout
 * @param {() => void} props.onToggleMobile - Open mobile drawer
 * @param {() => void} props.onNavigateRoot - Navigate back to root of current section (for breadcrumb root click)
 * @param {() => void} [props.onNavigateProfile] - Open the Profile view (delegated to UserMenu)
 */
export default function Topbar({
  user,
  saveStatus,
  currentView,
  activeProjectName,
  locale,
  onLocaleChange,
  onLogout,
  onToggleMobile,
  onNavigateRoot,
  onNavigateProfile,
}) {
  const { t } = useLocale();

  const sectionLabel =
    currentView === 'capacity' ? t('capacity.title') :
    currentView === 'profile' ? t('profile.title') :
    t('dashboard.title');

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur print:hidden sm:px-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onToggleMobile}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex min-w-0 flex-1 items-center gap-2 text-sm" aria-label="Breadcrumb">
        {activeProjectName ? (
          <>
            <button
              type="button"
              onClick={onNavigateRoot}
              className="truncate text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
            >
              {sectionLabel}
            </button>
            <span className="text-muted-foreground" aria-hidden="true">/</span>
            <span className="truncate font-medium">{activeProjectName}</span>
          </>
        ) : (
          <span className="truncate font-medium">{sectionLabel}</span>
        )}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-3">
        <SaveIndicator status={saveStatus} />
        <UserMenu
          user={user}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onLogout={onLogout}
          onNavigateProfile={onNavigateProfile}
        />
      </div>
    </header>
  );
}
