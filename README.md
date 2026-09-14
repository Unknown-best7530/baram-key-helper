# 바람의나라 단축키 도우미

바람의나라 단축키·타이머·메모 도우미

## 다운로드 및 실행 방법

1. 우측의 **[Releases](https://github.com/Unknown-best7530/baram-key-helper/releases/latest)** 페이지로 이동
2. 최신 버전의 `baram_key_helper.exe` 파일 다운로드
3. 원하는 폴더에 보관 후 실행
   - 별도의 Python 설치 없이 실행 가능
   - 실행 시 Windows UAC 확인 창이 나타나면 **[예]** 선택

---

## 실행 전 주의사항

### 1. 전역 단축키

본 프로그램은 Windows 전체에서 단축키와 입력을 감지함

- 문서 작성, 웹 브라우징, 다른 게임 이용 중에도 단축키가 작동할 수 있음
- 게임 외 작업 시 전체 기능을 끄거나 프로그램 종료 권장

### 2. Microsoft Edge 다운로드 안내

Edge에서 `baram_key_helper.exe는 일반적으로 다운로드되지 않는 파일입니다`라는 안내가 나올 수 있음

- Chrome에서 Releases 페이지를 열어 다운로드 권장
- Edge를 계속 사용하려면 [Edge 다운로드 차단 해결 방법](https://forbes.tistory.com/1437) 참고
- 다운로드 후 릴리스 페이지에 적힌 SHA-256 값 확인 권장

### 3. Windows SmartScreen 경고

개인 개발자가 배포하는 미서명 프로그램 특성상 `'Windows의 PC 보호'` 경고가 표시될 수 있음

- `[추가 정보]` → `[실행]` 선택
- 실행 전 Releases에 게시된 SHA-256 값 확인 권장

---

## 주요 기능

- 키보드 및 마우스 입력 매핑
- Shift / Ctrl / Alt 조합 입력 딜레이 설정
- 단축키 기반 쿨타임 타이머와 스톱워치
- 경험치 계산, 표 형식 메모, 화면 돋보기 기능
- 모드별 개별 설정 저장 및 반복/순차 입력 지원

---

## 설정 파일 위치

프로그램 설정과 메모 데이터는 아래 경로에 자동 저장됨
```text
%APPDATA%\바람의나라_단축키도우미\
```

---

## 문제 제보 및 문의

- 업데이트 내용과 파일 검증값은 [Releases](https://github.com/Unknown-best7530/baram-key-helper/releases/latest) 에서 확인
- 오류 제보·기능 개선 요청은 [Issues](https://github.com/Unknown-best7530/baram-key-helper/issues) 에 등록
