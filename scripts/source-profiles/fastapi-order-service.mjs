import { defineSourceProfile, SOURCE_PROFILE_CONTRACT_VERSION } from '../../shared/sourceProfileContract.js'

const ROLE = (area, subsystem, summary, userImpact) => ({ area, subsystem, summary, userImpact })

export const FASTAPI_ORDER_SERVICE_SOURCE_PROFILE = defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'fastapi-order-service-reference',
  version: '0.1.0',
  sourceId: 'fastapi-order-service:source',
  label: 'FastAPI Order Service Reference Profile',
  projectLabel: '주문 처리 서비스',
  priority: 60,
  match: {
    requiredFiles: ['pyproject.toml', 'app/main.py', 'app/services/order_service.py'],
  },
  capabilities: ['file-structure', 'curated-file-roles', 'product-area-classification', 'python-structure-only'],
  languageSupport: [
    {
      language: 'python',
      level: 'structure-only',
      note: '현재 버전은 파일 위치와 프로필 근거만 사용합니다. 함수·호출 관계는 Python parser 도입 전까지 검증하지 않습니다.',
    },
  ],
  areas: [
    { id: 'service-interface', label: '서비스 진입·API', description: '외부 요청을 받고 응답 계약을 제공하는 영역', order: 0 },
    { id: 'order-processing', label: '주문 처리', description: '주문 검증, 상태 전이와 핵심 업무 규칙을 다루는 영역', order: 1 },
    { id: 'fulfillment-integration', label: '재고·배송 연결', description: '주문 결과를 재고 및 배송 시스템과 연결하는 영역', order: 2 },
  ],
  subsystems: [
    { id: 'order-api', area: 'service-interface', label: '주문 API', description: '주문 생성·조회 요청과 응답 계약', order: 0 },
    { id: 'order-workflow', area: 'order-processing', label: '주문 업무 흐름', description: '주문 검증과 상태 전이를 조율하는 서비스', order: 1 },
    { id: 'order-model', area: 'order-processing', label: '주문 모델', description: '주문 자료와 상태의 기본 형식', order: 2 },
    { id: 'order-persistence', area: 'data-storage-sync', label: '주문 저장', description: '주문을 데이터베이스에 기록하고 조회하는 경계', order: 3 },
    { id: 'inventory-gateway', area: 'fulfillment-integration', label: '재고 연결', description: '재고 시스템에 예약과 해제를 요청하는 경계', order: 4 },
    { id: 'order-tests', area: 'testing-quality', label: '주문 검증', description: '주문 업무 규칙과 API 계약의 자동 검사', order: 5 },
  ],
  fileRoles: {
    'app/main.py': ROLE('service-interface', 'order-api', 'FastAPI 애플리케이션을 시작하고 주문 API 경로를 서비스에 연결합니다.', '이 파일이 실패하면 주문 서비스가 시작되지 않거나 외부 요청을 받을 수 없습니다.'),
    'app/api/orders.py': ROLE('service-interface', 'order-api', '주문 생성·조회 요청의 입력을 받고 업무 서비스의 결과를 HTTP 응답으로 돌려줍니다.', '고객이나 다른 시스템이 주문을 접수하고 현재 상태를 확인하는 방식을 결정합니다.'),
    'app/services/order_service.py': ROLE('order-processing', 'order-workflow', '주문 가능 여부를 확인하고 주문 생성과 상태 변경 순서를 조율합니다.', '중복 주문, 잘못된 상태 전이와 재고 없는 주문을 막는 핵심 업무 동작입니다.'),
    'app/models/order.py': ROLE('order-processing', 'order-model', '주문 ID, 품목, 수량과 상태가 어떤 자료 형식이어야 하는지 정의합니다.', 'API와 데이터베이스가 주문 정보를 서로 다르게 해석하는 일을 줄입니다.'),
    'app/repositories/order_repository.py': ROLE('data-storage-sync', 'order-persistence', '주문 자료를 데이터베이스에 저장하고 다시 조회하는 경계를 제공합니다.', '서비스를 재시작해도 주문 기록과 상태가 남아 있게 합니다.'),
    'app/integrations/inventory.py': ROLE('fulfillment-integration', 'inventory-gateway', '외부 재고 시스템에 수량 예약과 해제를 요청하는 연결 경계를 제공합니다.', '주문이 실제 재고보다 많이 접수되는 것을 막고 실패 시 되돌릴 지점을 만듭니다.'),
    'tests/test_orders.py': ROLE('testing-quality', 'order-tests', '주문 생성, 중복 방지와 재고 부족 처리 결과를 자동으로 확인합니다.', '핵심 주문 규칙이 코드 변경 뒤 조용히 깨진 채 배포되는 것을 막습니다.'),
  },
  areaRules: [
    { area: 'service-interface', pathPattern: '^app/(?:main\\.py|api/)' },
    { area: 'order-processing', pathPattern: '^app/(?:services|models)/' },
    { area: 'fulfillment-integration', pathPattern: '^app/integrations/' },
  ],
  subsystemRules: [
    { area: 'service-interface', subsystem: 'order-api', pathPattern: '.*' },
    { area: 'order-processing', subsystem: 'order-model', pathPattern: '/models/' },
    { area: 'order-processing', subsystem: 'order-workflow', pathPattern: '.*' },
    { area: 'fulfillment-integration', subsystem: 'inventory-gateway', pathPattern: 'inventory' },
    { area: 'data-storage-sync', subsystem: 'order-persistence', pathPattern: 'order_repository' },
    { area: 'testing-quality', subsystem: 'order-tests', pathPattern: 'orders' },
  ],
})
