/**
 * NavItem — bouton de navigation unique, utilisé par Sidebar et MobileDrawer.
 * Factorisé pour garantir une apparence cohérente entre les deux contextes :
 * même padding, radius, état actif, et comportement collapsed (tooltip + icône seule).
 *
 * Collapsed mode :
 *   - Icône centrée, label masqué
 *   - Attribut `title` fournit un tooltip natif au hover (pas de librairie tooltip requise)
 *   - Le label reste dans le DOM via `sr-only` pour les screen readers
 */

/**
 * @param {Object} props
 * @param {React.ComponentType} props.icon - Composant d'icône Lucide
 * @param {string} props.label
 * @param {boolean} props.active
 * @param {boolean} [props.collapsed=false]
 * @param {() => void} props.onClick
 */
export default function NavItem({ icon: Icon, label, active, collapsed = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
    </button>
  );
}
