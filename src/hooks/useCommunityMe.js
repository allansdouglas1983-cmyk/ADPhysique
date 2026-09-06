/**
 * The signed-in user's own Community state, for the header dot, the
 * entry points and every screen that must know whether a profile exists
 * (blueprint section 5.7).
 *
 * Cache first, then the RPC: the cached payload renders immediately and
 * a background refresh replaces it, so opening Community never waits on
 * the network to draw. A failure is returned as an error CODE, never
 * thrown: Community is somewhere the user visits, and it must not be
 * able to break the screen it was reached from.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMe, emptyMe } from '../lib/community/profile';

/**
 * @param {{enabled?: boolean}} [opts] pass `enabled: false` to hold off
 *   (for example before the session is restored).
 * @returns {{me: object, loading: boolean, error: (string|null),
 *   refresh: (force?: boolean) => Promise<void>}}
 */
export default function useCommunityMe({ enabled = true } = {}) {
  const [me, setMe] = useState(emptyMe);
  const [loading, setLoading] = useState(!!enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return;
    setLoading(true);
    const out = await loadMe({ force });
    if (!mounted.current) return;
    setMe(out.me ?? emptyMe());
    setError(out.error ?? null);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    refresh(false);
  }, [enabled, refresh]);

  return { me, loading, error, refresh };
}

export { useCommunityMe };
