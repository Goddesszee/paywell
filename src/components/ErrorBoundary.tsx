import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to console so Vercel/hosting logs capture the real crash reason
    console.error('[ErrorBoundary] caught:', error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-[#8A8F9E] mb-3 max-w-xs">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <p className="text-xs text-[#50556A] mb-6 max-w-xs font-mono break-all">
            {this.state.error.stack?.split('\n')[1]?.trim() ?? ''}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2.5 bg-[#0066FF] text-white text-sm font-semibold rounded-xl"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
