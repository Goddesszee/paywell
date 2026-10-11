import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'

/** Returns a function that goes back to the page the user came from (or Home). */
export function useGoBack(current: string) {
  const setActiveView = useAppStore(s => s.setActiveView)
  return useCallback(() => {
    const prev = useAppStore.getState().previousView
    setActiveView(prev && prev !== current && prev !== 'login' && prev !== 'landing' ? prev : 'home')
  }, [current, setActiveView])
}
