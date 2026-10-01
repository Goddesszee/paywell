import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-[#8A8F9E] mb-6 max-w-xs">
            {this.state.error.message || 'An unexpected error occurred on this page.'}
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
