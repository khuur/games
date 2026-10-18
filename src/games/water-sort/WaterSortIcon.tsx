const TUBES = [
  ['#3d6df0', '#e5484d', '#f4d13b'],
  ['#e5484d', '#3fbf5a', '#3d6df0'],
  ['#f4d13b', '#3fbf5a', '#e5484d'],
]

/** Three test tubes with mixed layers of colour. */
export function WaterSortIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      {TUBES.map((layers, tube) => {
        const x = 5 + tube * 14.5
        return (
          <g key={tube}>
            <clipPath id={`water-icon-${tube}`}>
              <rect x={x} y="6" width="10" height="38" rx="5" />
            </clipPath>
            <g clipPath={`url(#water-icon-${tube})`}>
              {layers.map((color, level) => (
                <rect key={level} x={x} y={36 - level * 9} width="10" height="9" fill={color} />
              ))}
            </g>
            <rect x={x} y="6" width="10" height="38" rx="5" fill="none" stroke="var(--glass-edge)" strokeWidth="2" />
          </g>
        )
      })}
    </svg>
  )
}
