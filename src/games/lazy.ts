import { createElement, use, type ComponentType } from 'react'

/**
 * A component whose code loads on first use, like React.lazy, except that once its code has
 * arrived (say, preloaded in the background) it renders straight away instead of suspending
 * for a moment first.
 */
export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null
  let loading: Promise<ComponentType<P>> | null = null

  const preload = () => {
    loading ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        // Let a later attempt try again, for example once the connection is back.
        loading = null
        throw error
      },
    )
    return loading
  }

  // The component it renders never changes once loaded, so nothing is recreated between renders.
  function LazyComponent(props: P) {
    return createElement(loaded ?? use(preload()), props)
  }

  return { Component: LazyComponent, preload }
}
