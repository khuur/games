/** Four tiles in the colours of the games. Matches public/favicon.svg. */
export function SiteLogo() {
  return (
    <svg className="site-logo" viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#151935" />
      <rect x="12" y="12" width="18" height="18" rx="5" fill="#f0606b" />
      <rect x="34" y="12" width="18" height="18" rx="5" fill="#ffc53d" />
      <rect x="12" y="34" width="18" height="18" rx="5" fill="#2fbf9b" />
      <rect x="34" y="34" width="18" height="18" rx="5" fill="#a77bf3" />
    </svg>
  )
}
