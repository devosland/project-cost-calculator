/**
 * AppShell — orchestrateur du layout Prism : sidebar gauche (desktop) +
 * drawer (mobile) + topbar minimal + zone de contenu principale.
 *
 * Gère deux états locaux :
 *   - `collapsed` : sidebar desktop réduite (56px) vs expanded (220px),
 *     persisté dans localStorage pour que la préférence survive au reload.
 *   - `mobileOpen` : drawer mobile ouvert/fermé (éphémère, pas persisté).
 *
 * Le composant ne connaît pas les routes : il reçoit `currentView` et
 * `onNavigate` en props, et délègue la logique métier (auth, data, save)
 * à App.jsx. Seule la logique de chrome vit ici.
 */
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileDrawer from './MobileDrawer';
import Topbar from './Topbar';

const COLLAPSED_STORAGE_KEY = 'prism.sidebar.collapsed';

/**
 * @param {Object} props
 * @param {{name: string, email: string}} props.user
 * @param {string} props.saveStatus
 * @param {string} props.currentView
 * @param {(view: string) => void} props.onNavigate
 * @param {string|null} [props.activeProjectName]
 * @param {() => void} [props.onNavigateRoot]
 * @param {string} props.locale
 * @param {(l: string) => void} props.onLocaleChange
 * @param {() => void} props.onLogout
 * @param {React.ReactNode} props.children
 */
export default function AppShell({
  user,
  saveStatus,
  currentView,
  onNavigate,
  activeProjectName,
  onNavigateRoot,
  locale,
  onLocaleChange,
  onLogout,
  children,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapsed preference. Wrapped in try/catch because some browsers
  // block localStorage access in privacy modes — we degrade gracefully rather
  // than crashing the UI.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Ignore — collapsed state is a UX nicety, not critical data.
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        currentView={currentView}
        onNavigate={onNavigate}
      />

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        currentView={currentView}
        onNavigate={onNavigate}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          saveStatus={saveStatus}
          currentView={currentView}
          activeProjectName={activeProjectName}
          locale={locale}
          onLocaleChange={onLocaleChange}
          onLogout={onLogout}
          onToggleMobile={() => setMobileOpen(true)}
          onNavigateRoot={onNavigateRoot}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
