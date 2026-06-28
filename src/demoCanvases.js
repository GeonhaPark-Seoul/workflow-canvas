// Seed canvases shown on a fresh install (empty localStorage). As soon as the
// user edits or adds a canvas, their own data is saved over these.
import { MarkerType } from '@xyflow/react'

// colorIdx → DEFAULT_STAGE_TYPES: 0 기획 · 1 개발 · 2 검토 · 3 배포 · 4 완료
const FLOW = {
  type: 'separable',
  style: { stroke: '#4a4a5a', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a4a5a' },
}
const NOTE = {
  type: 'separable',
  style: { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b88' },
}

const stage = (id, x, y, label, description, colorIdx) => ({
  id, type: 'stage', position: { x, y }, data: { label, description, colorIdx },
})
const memo = (id, x, y, header, text) => ({
  id, type: 'memo', position: { x, y }, data: { header, text },
})
const flow = (s, t, extra = {}) => ({ id: `${s}-${t}`, source: s, target: t, ...FLOW, ...extra })
const note = (s, t) => ({ id: `${s}-${t}`, source: s, target: t, ...NOTE })

const ROW_Y = 320
const ABOVE = 110
const BELOW = 520
const colX = (i) => 80 + i * 300

// ── 사례 1: 스타트업 앱 출시 ──────────────────────────────────────────────────
const startup = {
  name: '📱 스타트업 앱 출시',
  nodes: [
    stage('s1', colX(0), ROW_Y, '시장 조사', '타겟 시장·경쟁사 분석', 0),
    stage('s2', colX(1), ROW_Y, '기획 확정', 'MVP 범위·핵심 기능 정의', 0),
    stage('s3', colX(2), ROW_Y, 'UI/UX 디자인', '와이어프레임·디자인 시스템', 2),
    stage('s4', colX(3), ROW_Y, '프로토타입 제작', '핵심 플로우 검증', 2),
    stage('s5', colX(4), ROW_Y, '개발 환경 세팅', '레포·CI/CD 구성', 1),
    stage('s6', colX(5), ROW_Y, '프론트엔드 개발', '화면·상태관리 구현', 1),
    stage('s7', colX(6), ROW_Y, '백엔드 개발', 'API·DB 설계', 1),
    stage('s8', colX(7), ROW_Y, 'QA 테스트', '기능·성능 검증', 2),
    stage('s9', colX(8), ROW_Y, '버그 수정', '이슈 트래킹·핫픽스', 2),
    stage('s10', colX(9), ROW_Y, '베타 출시', '제한 사용자 배포', 4),
    stage('s11', colX(10), ROW_Y, '피드백 수집', '사용성·버그 리포트', 4),
    stage('s12', colX(11), ROW_Y, '정식 출시', '앱스토어 정식 배포', 4),

    memo('m1', colX(0), ABOVE, '시장조사', '경쟁사 최소 5개 분석 필수'),
    memo('m2', colX(1), BELOW, '기획', 'MVP 범위 꼭 문서화할 것'),
    memo('m3', colX(2), ABOVE, '디자인', '모바일 퍼스트로 설계'),
    memo('m4', colX(6), BELOW, '백엔드', 'API 문서 작성 병행'),
    memo('m5', colX(7), ABOVE, 'QA', '실제 사용자 10명 이상 베타 테스터 확보'),
    memo('m6', colX(11), BELOW, '출시', '앱스토어 심사 2주 소요 감안'),
  ],
  edges: [
    flow('s1', 's2'), flow('s2', 's3'), flow('s3', 's4'), flow('s4', 's5'),
    flow('s5', 's6'), flow('s6', 's7'), flow('s7', 's8'), flow('s8', 's9'),
    flow('s9', 's10'), flow('s10', 's11'), flow('s11', 's12'),
    // feedback loop: 피드백 수집 → 버그 수정 (routed below the row)
    flow('s11', 's9', { sourceHandle: 'bottom', targetHandle: 'bottom' }),
    note('m1', 's1'), note('m2', 's2'), note('m3', 's3'),
    note('m4', 's7'), note('m5', 's8'), note('m6', 's12'),
  ],
}

// ── 사례 2: 도쿄 여행 계획 ────────────────────────────────────────────────────
const tokyo = {
  name: '✈️ 도쿄 여행 계획',
  nodes: [
    stage('t1', colX(0), ROW_Y, '여행 날짜 확정', '휴가·일정 조율', 0),
    stage('t2', colX(1), ROW_Y, '항공권 예매', '왕복 항공편 확보', 0),
    stage('t3', colX(2), ROW_Y, '숙소 예약', '위치·예산 고려', 0),
    stage('t4', colX(3), ROW_Y, '여행 일정 짜기', '동선·교통 계획', 0),
    stage('t5', colX(4), ROW_Y, '1일차: 도착/신주쿠', '공항→호텔, 신주쿠 야경', 1),
    stage('t6', colX(5), ROW_Y, '2일차: 아사쿠사/우에노', '센소지·우에노 공원', 1),
    stage('t7', colX(6), ROW_Y, '3일차: 시부야/하라주쿠', '스크램블·쇼핑', 1),
    stage('t8', colX(7), ROW_Y, '4일차: 당일치기 닛코', '도쇼구·자연 명소', 1),
    stage('t9', colX(8), ROW_Y, '5일차: 오다이바/귀국', '오다이바→공항', 1),
    stage('t10', colX(9), ROW_Y, '귀국 후 정산', '경비 정산·후기', 4),

    memo('n1', colX(1), BELOW, '항공권', '왕복 최소 2달 전 예매, 화/수 출발이 저렴'),
    memo('n2', colX(2), ABOVE, '숙소', '신주쿠 or 시부야 역 근처 추천'),
    memo('n3', colX(3), BELOW, '교통', 'JR패스 vs 스이카 카드 비교 필수'),
    memo('n4', colX(4), ABOVE, '1일차', '도착 당일 시차 적응, 무리하지 말 것'),
    memo('n5', colX(5), BELOW, '2일차', '아사쿠사는 아침 일찍 가야 한산함'),
    memo('n6', colX(6), ABOVE, '3일차', '하라주쿠 다케시타 거리 현금 필요'),
    memo('n7', colX(7), BELOW, '닛코', '왕복 4시간, 아침 7시 출발 권장'),
    memo('n8', colX(9), ABOVE, '정산', '면세 한도 800달러 주의'),
  ],
  edges: [
    flow('t1', 't2'), flow('t2', 't3'), flow('t3', 't4'), flow('t4', 't5'),
    flow('t5', 't6'), flow('t6', 't7'), flow('t7', 't8'), flow('t8', 't9'),
    flow('t9', 't10'),
    note('n1', 't2'), note('n2', 't3'), note('n3', 't4'), note('n4', 't5'),
    note('n5', 't6'), note('n6', 't7'), note('n7', 't8'), note('n8', 't10'),
  ],
}

export const DEMO_CANVASES = [startup, tokyo]
