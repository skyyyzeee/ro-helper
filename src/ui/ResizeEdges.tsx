import type { ResizeEdge } from '../platform/types';
import { usePlatform } from '../platform/PlatformContext';

const EDGES: [ResizeEdge, string][] = [
  ['North', 'n'],
  ['South', 's'],
  ['East', 'e'],
  ['West', 'w'],
  ['NorthWest', 'nw'],
  ['NorthEast', 'ne'],
  ['SouthWest', 'sw'],
  ['SouthEast', 'se'],
];

/** Invisible strips along the edges of the frameless window that resize it when dragged. */
export function ResizeEdges() {
  const platform = usePlatform();
  return (
    <>
      {EDGES.map(([edge, cls]) => (
        <div
          key={edge}
          className={`resize resize--${cls}`}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button === 0) void platform.startResize(edge);
          }}
        />
      ))}
    </>
  );
}
