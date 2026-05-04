import React from 'react'

interface SkeletonCardProps {
  count?: number
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: '#fff',
            borderRadius: 10,
            padding: '14px 16px',
            border: '1px solid var(--color-border)',
            marginBottom: 8,
          }}
        >
          <div
            className="skeleton-shimmer"
            style={{ width: '60%', height: 14, borderRadius: 4, marginBottom: 10 }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '40%', height: 24, borderRadius: 6, marginBottom: 8 }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '80%', height: 12, borderRadius: 4 }}
          />
        </div>
      ))}
    </>
  )
}

export default SkeletonCard
