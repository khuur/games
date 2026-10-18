import { RotateCw } from 'lucide-react'
import { Component, type ReactNode } from 'react'

interface LoadErrorProps {
  children: ReactNode
}

/**
 * Catches a game that fails to load (offline, or the site was updated since this page opened)
 * and offers a reload, instead of leaving an empty page.
 */
export class LoadError extends Component<LoadErrorProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="load-error" role="alert">
        <p>This game couldn&apos;t be loaded. Check your connection, then try again.</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden="true" />
          Reload
        </button>
      </div>
    )
  }
}
