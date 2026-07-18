'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, 1000)
  return () => clearInterval(id)
}

// Current time as an external store, so countdowns can be derived during render instead of
// mirrored into state from an effect (react-hooks/set-state-in-effect). Whole-second
// granularity keeps getSnapshot referentially stable between ticks — React requires cached
// snapshots — and is all a mm:ss display needs.
export function useNowSeconds(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    // The server render has no clock the client could hydrate against — null lets callers
    // render the same placeholder on SSR and first client render, then flip after mount.
    () => null
  )
}
