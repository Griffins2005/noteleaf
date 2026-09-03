interface LeafMarkProps {
  size?: number;
}

/** Green leaf mark used on the auth entry and in the app sidebar. */
export function LeafMark({ size = 46 }: LeafMarkProps) {
  const icon = Math.round(size * 0.56);
  const radius = Math.round(size * 0.29);

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: 'linear-gradient(145deg, #1fa463 0%, #0d7a47 100%)',
        boxShadow: '0 3px 12px rgba(13,122,71,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 26 26" fill="none">
        <path
          d="M13 24C13 24 5 18 5 11.5C5 7.36 8.58 4 13 4C17.42 4 21 7.36 21 11.5C21 18 13 24 13 24Z"
          fill="white"
          opacity="0.95"
        />
        <path d="M13 24L13 12" stroke="rgba(13,122,71,0.5)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13 15.5L9.5 13.5" stroke="rgba(13,122,71,0.35)" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M13 19L9.5 17" stroke="rgba(13,122,71,0.35)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
