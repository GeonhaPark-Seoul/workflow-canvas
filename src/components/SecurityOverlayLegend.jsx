export default function SecurityOverlayLegend({ zones = [] }) {
  return (
    <aside className="security-overlay-legend" aria-label="보안 오버레이 범위와 신뢰영역 범례">
      <div className="security-overlay-legend-title">
        <span aria-hidden="true">◈</span>
        <strong>보안 오버레이</strong>
      </div>
      <div className="security-overlay-zone-list">
        {zones.map((zone) => (
          <span key={zone.id} className="security-overlay-zone-key" title={`${zone.kindLabel} · ${zone.label}`}>
            <i style={{ background: zone.color }} />
            <span>{zone.label}</span>
          </span>
        ))}
      </div>
      <p>근거로 아는 통로와 아직 모르는 구멍의 지도이며 침투 테스트가 아닙니다.</p>
    </aside>
  )
}
