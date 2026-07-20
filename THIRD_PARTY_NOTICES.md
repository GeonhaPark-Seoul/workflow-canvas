# Third-Party Notices

이 문서는 Workflow Canvas OS의 현재 직접 npm 의존성 목록이다. 버전은 `package-lock.json`에 고정된 배포 기준이며, 각 패키지의 전체 라이선스 문구와 저작권 고지는 배포된 패키지 안의 LICENSE 파일을 우선한다.

| Package | Locked version | License | Scope |
|---|---:|---|---|
| `@modelcontextprotocol/sdk` | `1.29.0` | MIT | runtime |
| `@supabase/supabase-js` | `2.108.2` | MIT | runtime |
| `@xyflow/react` | `12.11.1` | MIT | runtime |
| `react` | `18.3.1` | MIT | runtime |
| `react-dom` | `18.3.1` | MIT | runtime |
| `zod` | `4.4.3` | MIT | runtime |
| `@babel/parser` | `7.29.7` | MIT | development |
| `@types/react` | `18.3.31` | MIT | development |
| `@types/react-dom` | `18.3.7` | MIT | development |
| `@vitejs/plugin-react` | `4.7.0` | MIT | development |
| `sharp` | `0.35.2` | Apache-2.0 | development |
| `vite` | `6.4.3` | MIT | development |
| `vite-plugin-pwa` | `1.3.0` | MIT | development |

이 초기 목록은 법률 검토나 전이 의존성 전체 고지를 대신하지 않는다. 공개 출시 전에는 같은 lockfile에서 생성한 SBOM과 전이 라이선스 보고서를 보존하고, 필요한 저작권 고지를 배포물에 포함해야 한다. 진행 상태는 `docs/governance/TECHNICAL_DEBT.md`의 `OPS-006`에서 관리한다.
