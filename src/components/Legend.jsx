export default function Legend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 10,
        background: '#1a1a22',
        border: '1px solid #ffffff18',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 4px 16px #0008',
        color: '#666',
        fontSize: 11,
        lineHeight: 1.8,
      }}
    >
      <div style={{ color: '#888', fontWeight: 700, marginBottom: 4, fontSize: 10, letterSpacing: 1 }}>사용법</div>
      <div>노드 핸들 드래그 → 연결</div>
      <div>제목 더블클릭 → 편집</div>
      <div>색상 점 클릭 → 색상 변경</div>
      <div>캔버스 우클릭 → 메뉴</div>
      <div>연결선 클릭 후 Delete → 삭제</div>
    </div>
  )
}
