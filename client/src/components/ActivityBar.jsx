import { useEffect, useState } from 'react';
import { onActivity } from '../api/client';

/** Thin animated bar at the very top while any (non-background) request is running.
 *  Appears only after 200 ms so fast responses don't flash it. */
export default function ActivityBar() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let t;
    const off = onActivity((n) => {
      clearTimeout(t);
      if (n > 0) t = setTimeout(() => setBusy(true), 200);
      else setBusy(false);
    });
    return () => { clearTimeout(t); off(); };
  }, []);
  return busy ? <div className="route-progress" role="progressbar" aria-label="Loading"><span /></div> : null;
}
