/**
 * Sidebar desktop — navigation persistante gauche avec états expanded (220px) et
 * collapsed (56px, icon-only avec tooltip). Masqué sous le breakpoint `lg`
 * (le MobileDrawer prend le relais).
 *
 * Structure :
 *   - Header : PrismWordmark (expanded) / PrismLogo seul (collapsed)
 *   - Nav items : Dashboard + Capacity, état actif dérivé de currentView
 *   - Footer : bouton de bascule collapse/expand
 */
import { LayoutDashboard, BarChart3, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import PrismLogo from '../brand/PrismLogo';
import PrismWordmark from '../brand/PrismWordmark';
import { useLocale } from '../../lib/i18n';
import NavItem from './NavItem';

/**
 * @param {Object} props
 * @param {boolean} props.collapsed
 * @param {() => void} props.onToggleCollapsed
 * @param {string} props.currentView - 'projects' | 'capacity' | 'profile'
 * @param {(view: string) => void} props.onNavigate
 */
export default function Sidebar({ collapsed, onToggleCollapsed, currentView, onNavigate }) {
  const { t } = useLocale();

  const items = [
    { id: 'projects', label: t('dashboard.title'), icon: LayoutDashboard },
    { id: 'capacity', label: t('capacity.title'), icon: BarChart3 },
  ];

  return (
    <aside
      className={`hidden lg:flex sticky top-0 h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out print:hidden ${
        collapsed ? 'w-14' : 'w-56'
      }`}
      aria-label="Primary navigation"
    >
      {/* Header brand */}
      <div className={`flex h-14 items-center border-b border-border ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        {collapsed ? (
          <PrismLogo size={28} className="text-primary" />
        ) : (
          <PrismWordmark logoSize={24} className="text-primary" />
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {items.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={currentView === item.id}
            collapsed={collapsed}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      {/* Footer — collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 mx-auto" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>{t('app.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
