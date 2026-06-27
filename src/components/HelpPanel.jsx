import { useState } from 'react'

const SECTIONS = [
  {
    title: '노드 다루기',
    items: [
      ['단계 노드 추가', '툴바 「단계 추가」 또는 캔버스 우클릭 → 메뉴'],
      ['메모 노드 추가', '툴바 「메모 추가」 또는 캔버스 우클릭 → 메뉴'],
      ['노드 선택', '노드를 한 번 클릭'],
      ['여러 노드 선택', '빈 공간을 길게 눌렀다가 드래그 (박스 선택)'],
      ['선택 추가/제외', 'Shift + 노드 클릭'],
      ['노드 이동', '노드를 드래그'],
      ['노드 크기 조절', '선택 후 모서리·가장자리 핸들 드래그'],
      ['제목/내용 편집', '해당 텍스트를 더블클릭'],
      ['편집 종료', 'Enter 또는 바깥 클릭 (제목은 Esc로 취소)'],
      ['메모 헤더 편집', '메모 상단 제목 영역 더블클릭'],
      ['노드 삭제', '선택 후 Delete / Backspace, 또는 우클릭 → 삭제'],
    ],
  },
  {
    title: '단계 종류 · 색상',
    items: [
      ['색상 빠른 변경', '단계 노드 왼쪽 색상 점 클릭 (순환)'],
      ['종류 선택', '단계 노드 우클릭 → 종류 선택'],
      ['종류 이름 변경', '우클릭 메뉴에서 ✎ 클릭'],
      ['종류 추가/삭제', '우클릭 메뉴 「+ 새 종류 추가」 / ✕'],
    ],
  },
  {
    title: '연결선',
    items: [
      ['연결 만들기', '한 노드의 연결점에서 다른 노드로 드래그'],
      ['양방향 포트', '모든 연결점은 입·출력 겸용 (어느 쪽이든 연결)'],
      ['화살표 방향', '시작 연결점 → 도착 연결점'],
      ['연결선 선택', '연결선 클릭 (선택 시 노드 위로 올라옴)'],
      ['연결선 삭제', '선택 후 Delete, 또는 우클릭 → 삭제'],
    ],
  },
  {
    title: '캔버스 · 화면',
    items: [
      ['캔버스 이동', '빈 공간 드래그 또는 트랙패드 두 손가락 스와이프'],
      ['확대/축소', '트랙패드 핀치, 마우스 휠, 또는 좌하단 컨트롤'],
      ['동시 이동+확대', '스와이프와 핀치를 동시에 (지도 앱처럼)'],
      ['전체 보기', '툴바 「전체 보기」 (모든 노드 화면에 맞춤)'],
      ['캔버스 전환', '상단 탭에서 클릭'],
      ['캔버스 추가', '상단 탭 「+ 새 캔버스」'],
      ['캔버스 이름 변경', '탭 더블클릭'],
    ],
  },
  {
    title: '단축키',
    items: [
      ['실행 취소', '⌘/Ctrl + Z'],
      ['다시 실행', '⌘/Ctrl + Shift + Z'],
      ['삭제', 'Delete / Backspace'],
    ],
  },
]

export default function HelpPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'absolute', bottom: 20, left: 64, zIndex: 10 }}>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            width: 320,
            maxHeight: '70vh',
            overflowY: 'auto',
            background: '#1a1a22',
            border: '1px solid #ffffff18',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 8px 32px #000c',
            color: '#aaa',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>사용법 & 단축키</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          {SECTIONS.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 12 }}>
              <div style={{ color: '#6ea8fe', fontWeight: 700, fontSize: 11, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>
                {sec.title}
              </div>
              {sec.items.map(([label, desc]) => (
                <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                  <span style={{ color: '#ddd', flexShrink: 0, minWidth: 96, fontWeight: 600 }}>{label}</span>
                  <span style={{ color: '#888' }}>{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        title="사용법"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 20,
          padding: '8px 14px', color: open ? '#6ea8fe' : '#aaa',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 16px #0008', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 15 }}>{open ? '✕' : '❔'}</span>
        <span>사용법</span>
      </button>
    </div>
  )
}
