/**
 * Tracks the rendered size of an element.
 *
 * The drawing needs the container's real pixel size to fill it exactly. The
 * alternative — a fixed `viewBox` with `preserveAspectRatio="meet"` — is
 * simpler but letterboxes whenever the container's aspect ratio differs from
 * the viewBox, leaving empty bands instead of using the space.
 *
 * Size starts at zero because the server-rendered pass has no layout. The
 * canvas renders nothing until the first measurement arrives, which happens
 * on the same frame as hydration.
 *
 * That first measurement is taken synchronously with getBoundingClientRect
 * rather than left to ResizeObserver alone. The observer is specified to
 * deliver an initial observation when it starts observing, but in practice
 * that callback does not always arrive — and when it does not, nothing else
 * ever changes the element's box, so no second callback comes either and the
 * canvas is left believing its container is zero-sized forever. The symptom
 * is the drawing's empty state on a page that has a perfectly good model, and
 * it clears the moment the window is resized, which is exactly the kind of
 * bug that looks intermittent and is not.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    // Bail out when nothing changed: ResizeObserver fires on sub-pixel
    // reflows too, and a new object every time would re-render the SVG for
    // no reason.
    const record = (width: number, height: number) => {
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    const { width, height } = element.getBoundingClientRect();
    record(width, height);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      record(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
