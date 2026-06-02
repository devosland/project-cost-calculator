/**
 * DependencyArrows — overlay SVG des dépendances entre barres de la TimelineView (SP2b).
 *
 * Approche par mesure du DOM (robuste à la mise en page responsive) : lit la
 * position rendue de chaque barre via getBoundingClientRect (relative au
 * conteneur) et trace une courbe de Bézier du bord droit du prédécesseur vers
 * le bord gauche du successeur, avec une tête de flèche. Recalcule au montage
 * et au redimensionnement du conteneur. Purement visuel ; pointer-events-none ;
 * ne casse pas si une mesure manque (ex. jsdom → rects à 0).
 *
 * @param {object} props
 * @param {Array<{fromId,toId,type,critical}>} props.links - liens à tracer (getDependencyLinks).
 * @param {{current: Map<string, Element>}} props.barRefs   - refs des barres indexées par phase.id.
 * @param {{current: Element|null}} props.containerRef       - conteneur positionné (origine des coordonnées).
 */
import { useLayoutEffect, useState, useCallback } from 'react';

const DependencyArrows = ({ links, barRefs, containerRef }) => {
  const [paths, setPaths] = useState([]);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    const next = [];
    for (const link of links) {
      const fromEl = barRefs.current.get(link.fromId);
      const toEl = barRefs.current.get(link.toId);
      if (!fromEl || !toEl) continue;
      const f = fromEl.getBoundingClientRect();
      const tg = toEl.getBoundingClientRect();
      const x1 = f.right - c.left;
      const y1 = f.top - c.top + f.height / 2;
      const x2 = tg.left - c.left;
      const y2 = tg.top - c.top + tg.height / 2;
      // Poignées de Bézier proportionnelles à l'écart horizontal, bornées.
      const dx = Math.max(20, Math.abs(x2 - x1) / 2);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      next.push({ key: `${link.fromId}->${link.toId}`, d, critical: link.critical });
    }
    setPaths(next);
  }, [links, barRefs, containerRef]);

  useLayoutEffect(() => {
    // Ce composant est le premier enfant du conteneur ; les refs des barres
    // (frères suivants) ne sont attachées qu'APRÈS l'exécution de cet effet
    // (commit React en post-ordre). On diffère donc la première mesure à la
    // frame suivante, quand toutes les barres sont mesurables. Le recompute
    // immédiat couvre les re-mesures ultérieures (refs déjà en place).
    recompute();
    const raf =
      typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(recompute) : null;

    const container = containerRef.current;
    let ro;
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recompute);
      ro.observe(container);
    }
    // Reflow lié au redimensionnement de la fenêtre (mise en page responsive).
    if (typeof window !== 'undefined') window.addEventListener('resize', recompute);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', recompute);
    };
  }, [recompute]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none text-muted-foreground"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="dep-arrow-crit"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--prism-error)" />
        </marker>
        <marker
          id="dep-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.critical ? 'var(--prism-error)' : 'currentColor'}
          strokeWidth="1.5"
          strokeOpacity="0.7"
          markerEnd={`url(#${p.critical ? 'dep-arrow-crit' : 'dep-arrow'})`}
        />
      ))}
    </svg>
  );
};

export default DependencyArrows;
