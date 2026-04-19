/**
 * MobileDrawer — version overlay de la Sidebar, activée sous le breakpoint `lg`.
 *
 * WHY un composant séparé : la sidebar desktop est *sticky* dans le flow
 * normal (colonne fixe à côté du contenu). Le drawer mobile doit flotter par
 * dessus tout le contenu avec un backdrop — comportements structurellement
 * différents qu'on ne veut pas forcer dans un seul composant à états croisés.
 *
 * Accessibilité :
 *   - Escape ferme le drawer
 *   - Click sur le backdrop ferme
 *   - aria-modal + role="dialog" pour les screen readers
 */
import { useEffect } from 'react';
import { LayoutDashboard, BarChart3, X } from 'lucide-react';
import PrismWordmark from '../brand/PrismWordmark';
import { useLocale } from '../../lib/i18n';
import NavItem from './NavItem';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.currentView
 * @param {(view: string) => void} props.onNavigate
 */
export default function MobileDrawer({ open, onClose, currentView, onNavigate }) {
  const { t } = useLocale();

  // Escape to close — listener only active while open to keep it cheap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the drawer is open (typical mobile drawer behavior).
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
    };
  }, [open, onClose]);

  const items = [
    { id: 'projects', label: t('dashboard.title'), icon: LayoutDashboard },
    { id: 'capacity', label: t('capacity.title'), icon: BarChart3 },
  ];

  const handleNavigate = (id) => {
    onNavigate(id);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-card transition-transform duration-200 ease-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <PrismWordmark logoSize={24} className="text-primary" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3">
          {items.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentView === item.id}
              onClick={() => handleNavigate(item.id)}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}
