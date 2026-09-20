# 바람 단축키 도우미 관리자 Pages

기존 `license-api-worker.js`와 분리된 Cloudflare Pages 프로젝트입니다. Pages Function은 D1을 직접 조회하지 않고 Service Binding으로 기존 Worker의 `/v1/admin/*` API만 호출합니다.

## Cloudflare 구성

1. `license-api-worker.js`는 기존 `baram-shortcut-helper-license-api` Worker로 계속 배포합니다.
2. Workers & Pages에서 `baram-key-helper-admin`이라는 **별도 Pages 프로젝트**를 만듭니다.
3. 이 디렉터리를 프로젝트 루트로 배포합니다. 빌드 명령은 없으며 출력 디렉터리는 `public`입니다.
4. Pages의 Production 환경에 다음 값을 설정합니다. Preview 주소도 사용할 경우 Preview 환경에도 별도로 설정합니다.

| 종류 | 이름 | 값 |
|---|---|---|
| Service Binding | `LICENSE_API` | 기존 `baram-shortcut-helper-license-api` Worker |
| Secret | `ADMIN_API_KEY` | 기존 Worker의 `BARAM_ADMIN_API_KEY`와 동일한 값 |
| Secret | `ADMIN_LOGIN_PASSWORD` | 관리자 화면에서 사용할 16자 이상의 강력한 별도 비밀번호 |

5. 설정 후 Pages를 새로 배포합니다.

Cloudflare Access, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_ALLOWED_EMAILS`는 사용하지 않습니다. 예전에 등록했다면 삭제해도 됩니다.

## 로그인 보안

- 로그인 비밀번호는 Pages Function에서만 검증하며 브라우저 저장소나 소스에 저장하지 않습니다.
- 로그인 성공 시 8시간 유효한 HMAC 서명 세션을 `HttpOnly`, `Secure`, `SameSite=Strict` 쿠키로 발급합니다.
- 비밀번호를 바꾸면 기존 로그인 쿠키는 즉시 무효가 됩니다.
- 상태 변경 API는 같은 출처에서 온 요청만 허용합니다.
- 로그인 화면의 `로그아웃`을 누르면 현재 브라우저의 세션 쿠키를 만료시킵니다.

`ADMIN_LOGIN_PASSWORD`에는 16자 이상이고 다른 사이트에서 사용하지 않는 긴 비밀번호를 사용하세요. 저장소, 이슈, Release 본문에 비밀번호를 기록하지 마세요.

## 바인딩 원칙

- 관리자 Pages에는 D1을 바인딩하지 않습니다.
- 모든 라이선스 변경은 기존 Worker의 검증과 이메일 알림 로직을 통과합니다.
- `wrangler.toml`의 Worker 이름이 실제 배포 이름과 다르면 `service` 값을 수정합니다.
- `ADMIN_API_KEY`와 `ADMIN_LOGIN_PASSWORD`는 저장소에 커밋하지 않습니다.

## 로컬 화면 확인

```bash
npx wrangler pages dev public --service LICENSE_API=baram-shortcut-helper-license-api
```

실제 로그인과 API 확인에는 로컬 Secret 설정이 필요합니다. 운영 비밀번호와 관리자 키를 로컬 파일이나 Git에 저장하지 마세요.

## 배포

Cloudflare 설정을 마친 뒤 이 디렉터리에서 배포합니다.

```bash
npx wrangler pages deploy public --project-name baram-key-helper-admin
```

Service Binding이나 Secret을 바꾼 뒤에는 반드시 새 배포를 만드세요.
