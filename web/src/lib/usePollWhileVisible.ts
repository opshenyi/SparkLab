import { useEffect, useRef } from 'react'

/**
 * 仅在前台标签页时按 intervalMs 轮询；后台暂停以减轻 API 与节点压力。
 * 回到前台时立即执行一次 callback 再恢复轮询。
 *
 * @param skipInitialRefresh 为 true 时，启用后首次不立即请求（可与外层带 loading 的首次加载配合，避免双请求）。
 */
export function usePollWhileVisible(
  enabled: boolean,
  callback: () => void | Promise<void>,
  intervalMs: number,
  skipInitialRefresh = false
) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return

    let id: ReturnType<typeof setInterval> | undefined

    const clear = () => {
      if (id !== undefined) {
        clearInterval(id)
        id = undefined
      }
    }

    const tick = () => void cbRef.current()

    const arm = () => {
      clear()
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      id = setInterval(tick, intervalMs)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick()
        arm()
      } else {
        clear()
      }
    }

    if (!skipInitialRefresh) {
      tick()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clear()
    }
  }, [enabled, intervalMs, skipInitialRefresh])
}
