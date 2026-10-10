/**
 * circle-execute.ts — guarded wrapper around W3SSdk.execute().
 *
 * Circle's SDK (see @circle-fin/w3s-pw-web-sdk src/index.ts handleMessage) has two sharp edges that
 * can make the whole app feel locked:
 *   1. User taps the popup's X  -> SDK closes the iframe and unsubscribes but NEVER calls the
 *      execute callback, so any `await new Promise(...)` around it hangs forever (button stuck on a
 *      spinner, flow can't be retried).
 *   2. An error inside the popup -> SDK calls the callback with the error but leaves its full-screen
 *      iframe (z-index 2147483647) on top of the app.
 *
 * executeWithGuard calls `cb` exactly once, always:
 *   - normal result / error pass through (on error the stray overlay is removed),
 *   - popup closed without a result  -> cb(Error('Approval cancelled')),
 *   - no result after `timeoutMs`    -> overlay removed, cb(Error('Approval timed out')).
 */
type ExecSdk = { execute: (challengeId: string, cb: never) => void }

const IFRAME_ID = 'sdkIframe'

export function removeCircleOverlay(): void {
  document.getElementById(IFRAME_ID)?.remove()
}

export function executeWithGuard<S extends ExecSdk>(
  sdk: S,
  challengeId: string,
  cb: (err: Error | undefined, result: any) => unknown, // eslint-disable-line @typescript-eslint/no-explicit-any
  timeoutMs = 5 * 60_000,
): void {
  let settled = false
  let seen = false
  let poll: ReturnType<typeof setInterval> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const settle = (err: Error | undefined, result: unknown, removeOverlay: boolean) => {
    if (settled) return
    settled = true
    if (poll) clearInterval(poll)
    if (timer) clearTimeout(timer)
    if (removeOverlay) removeCircleOverlay()
    void cb(err, result)
  }

  poll = setInterval(() => {
    if (document.getElementById(IFRAME_ID)) { seen = true; return }
    // Popup was shown and is now gone, but no callback arrived => user closed it.
    if (seen && !settled) {
      // short grace period in case the success callback is about to fire
      setTimeout(() => settle(new Error('Approval cancelled'), undefined, false), 800)
    }
  }, 400)

  timer = setTimeout(() => settle(new Error('Approval timed out — please try again'), undefined, true), timeoutMs)

  ;(sdk.execute as unknown as (id: string, c: (e?: unknown, r?: unknown) => void) => void)(
    challengeId,
    (err, result) => {
      if (err) {
        const msg = (err as { message?: string })?.message
        settle(err instanceof Error ? err : new Error(msg ?? 'Approval failed'), undefined, true)
      } else {
        settle(undefined, result, false)
      }
    },
  )
}
