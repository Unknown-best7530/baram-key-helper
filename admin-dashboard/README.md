# 바람 단축키 도우미 관리자 Pages

기존 `license-api-worker.js`와 분리된 Cloudflare Pages 프로젝트입니다. Pages Function은 D1을 직접 조회하지 않고 Service Binding으로 기존 Worker의 `/v1/admin/*` API만 호출합니다.

## Cloudflare 구성

1. `license-api-worker.js`는 기존 `baram-shortcut-helper-license-api` Worker로 계속 배포합니다.
2. Workers & Pages에서 `baram-key-helper-admin`이라는 **별도 Pages 프로젝트**를 만듭니다.
3. 이 디렉터리를 프로젝트 루트로 배포합니다. 빌드 명령은 없으며 출력 디렉터리는 `public`입니다.
4. Pages의 Production과 Preview 환경 각각에 다음 값을 설정합니다.

| 종류 | 이름 | 값 |
|---|---|---|
| Service Binding | `LICENSE_API` | 기존 라이선스 Worker |
| Secret | `ADMIN_API_KEY` | 기존 Worker의 `BARAM_ADMIN_API_KEY`와 동일한 값 |
| Variable | `ACCESS_TEAM_DOMAIN` | 예: `your-team.cloudflareaccess.com` |
| Variable | `ACCESS_AUD` | Access Application의 AUD 태그 |
| Variable | `ADMIN_ALLOWED_EMAILS` | 허용 이메일, 여러 개면 쉼표로 구분 |

5. 설정 후 Pages를 다시 배포합니다.
6. Zero Trust → Access → Applications에서 Pages의 production 도메인과 preview 도메인을 모두 보호하고 동일한 관리자 이메일만 Allow 합니다.

`ADMIN_API_KEY`는 브라우저로 전달되지 않습니다. Pages Function은 Access JWT의 서명·발급자·AUD·만료·이메일을 검증한 뒤에만 기존 Worker에 관리자 키를 붙입니다.

## 바인딩 원칙

- 관리자 Pages에는 D1을 바인딩하지 않습니다.
- 모든 변경은 기존 Worker의 검증과 이메일 알림 로직을 통과합니다.
- `wrangler.toml`의 Worker 이름이 실제 배포 이름과 다르면 `service` 값을 수정합니다.
- Secret과 Access 값은 저장소에 커밋하지 않습니다.

## 로컬 정적 화면 확인

```bash
npx wrangler pages dev public --service LICENSE_API=baram-shortcut-helper-license-api
```

실제 API 확인에는 로컬 Secret과 유효한 Access JWT가 필요합니다. 운영 관리자 키는 로컬 파일이나 Git에 저장하지 마세요.

## 배포

Cloudflare 설정을 마친 뒤 이 디렉터리에서 배포합니다.

```bash
npx wrangler pages deploy public --project-name baram-key-helper-admin
```

Service Binding·Secret·Access 변수를 바꾼 뒤에는 반드시 다시 배포하세요.
