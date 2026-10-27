// Aura Studio shows the app in an iframe on another port, so it can't read which page is open. In dev, inside Studio,
// the app reports its path on every navigation (links, router pushState/replaceState, back/forward) and the address
// bar follows. Does nothing in a normal tab or in a production build.
export function reportPathToStudio() {
  if (!import.meta.env.DEV || window.parent === window) return
  const report = () =>
    window.parent.postMessage({ type: 'aura-studio:path', path: location.pathname + location.search + location.hash }, '*')
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = (...args: Parameters<History['pushState']>) => {
      original.apply(history, args)
      report()
    }
  }
  addEventListener('popstate', report)
  addEventListener('hashchange', report)
  report()
}
