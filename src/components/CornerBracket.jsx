function CornerBracket({ flip }) {
  const t = { x: 'scaleX(-1)', y: 'scaleY(-1)', xy: 'scale(-1,-1)' }[flip] || '';
  return (
    <svg className={'og-corner og-corner-' + (flip || 'tl')} viewBox="0 0 18 18" style={{ transform: t }}>
      <path d="M1 6 V1 H6" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export default CornerBracket;
