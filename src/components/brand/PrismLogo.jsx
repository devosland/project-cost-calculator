/**
 * Prism logo — un prisme stylisé qui réfracte la lumière.
 * Sert de brand mark dans la sidebar, AuthPage, et README.
 *
 * @param {number} size  - Taille en pixels (width = height)
 * @param {string} className - Classes Tailwind additionnelles
 */
export default function PrismLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Prism"
      role="img"
    >
      {/* Triangle principal — le prisme */}
      <path
        d="M16 4 L28 26 L4 26 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Rayons réfractés — 3 lignes aux couleurs de la palette Warm */}
      <line x1="14" y1="14" x2="20" y2="14" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="18" x2="22" y2="18" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="22" x2="24" y2="22" stroke="#84A98C" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
