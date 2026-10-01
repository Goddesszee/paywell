import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] caught:', error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0A0B0D', color: '#F2F3F5',
          fontFamily: "'Inter', sans-serif", padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: '#8A8F9E', marginBottom: 8, maxWidth: 320 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <p style={{ fontSize: 11, color: '#50556A', marginBottom: 24, maxWidth: 320, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {this.state.error.stack?.split('\n')[1]?.trim() ?? ''}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '10px 22px', background: '#0066FF', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
