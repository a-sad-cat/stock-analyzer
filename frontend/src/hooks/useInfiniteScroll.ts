import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  /** 触发距离视口底部的阈值（px），默认 100 */
  threshold?: number
}

export function useInfiniteScroll({ hasMore, loading, onLoadMore, threshold = 100 }: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  const setSentinel = useCallback((el: HTMLDivElement | null) => {
    sentinelRef.current = el
  }, [])

  useEffect(() => {
    if (!hasMore || loading) return

    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMoreRef.current()
        }
      },
      { rootMargin: `0px 0px ${threshold}px 0px` }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, threshold])

  return { sentinelRef: setSentinel }
}
