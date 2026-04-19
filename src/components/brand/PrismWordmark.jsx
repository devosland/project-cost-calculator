import PrismLogo from './PrismLogo';

/**
 * Prism wordmark — logo + texte horizontal pour les headers et sidebar.
 *
 * @param {number} logoSize - Taille du logo SVG en pixels
 * @param {string} className - Classes Tailwind additionnelles
 */
export default function PrismWordmark({ logoSize = 24, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <PrismLogo size={logoSize} />
      <span className="font-display text-lg font-semibold tracking-tight">Prism</span>
    </div>
  );
}
