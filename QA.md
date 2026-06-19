# Figma Plugin QA Report

## Result

**Passed** — 프레임 체크포인트 기능에서 재현되는 P0, P1, P2 문제가 없습니다.

## Scope

- Target: `figma/ui.html`, `figma/code.js`
- Environment: Codex in-app browser, Chromium
- Viewports: 1280x720, 700x900
- Test media: 320x640, 약 3초 길이의 합성 WebM 영상
- Date: 2026-06-19

## Functional Tests

| Test | Result | Evidence |
| --- | --- | --- |
| 초기 상태 | Pass | 영상이 없을 때 체크포인트 및 Figma 배치 버튼이 비활성화됨 |
| 영상 업로드 | Pass | 320x640 해상도와 약 3초 길이를 인식하고 체크포인트 버튼이 활성화됨 |
| 버튼 체크포인트 | Pass | 1.250초 프레임이 원본 크기 PNG와 썸네일로 생성됨 |
| `M` 단축키 | Pass | 2.250초 프레임이 추가되고 정밀 타임코드가 표시됨 |
| 메모 입력 보호 | Pass | 메모 입력창에서 `m`을 입력해도 체크포인트가 추가되지 않음 |
| 시점 복귀 | Pass | 1.250초 썸네일 클릭 후 영상이 1.250초로 이동함 |
| 체크포인트 삭제 | Pass | 두 번째 체크포인트 삭제 후 첫 번째 체크포인트만 유지됨 |
| Figma 전송 | Pass | `collectionName: checkpoints`, 이미지 2개, 메모, `Uint8Array` 바이트가 전달됨 |
| Figma 메인 처리 | Pass | 보드 이름, 00:01.234 형식 타임코드, 메모 라벨, 완료 메시지 생성 확인 |
| 자동 추출 회귀 | Pass | 기존 자동 추출 결과 2개가 생성되고 체크포인트가 유지됨 |
| 반응형 레이아웃 | Pass | 700px 너비에서 단일 열로 전환되고 수평 오버플로가 발생하지 않음 |
| 패키지 무결성 | Pass | UI/메인 스크립트 문법, HTML, manifest JSON, ZIP 검사를 통과함 |

## Visual Review

- Typography: 기존 Inter/system-ui 계층과 크기를 유지하며 잘림이나 비정상 줄바꿈이 없음.
- Spacing: 체크포인트 헤더, 카드, 버튼 사이 간격이 기존 8px 기반 리듬과 일치함.
- Colors: 기존 teal, coral, neutral 토큰을 재사용하고 비활성 상태가 구분됨.
- Images: 세로 영상은 카드 안에서 `object-fit: contain`으로 표시되어 왜곡이나 잘림이 없음.
- Copy: 버튼, 안내 문구, 상태 메시지가 현재 기능과 일치함.

별도 소스 디자인이 없어 픽셀 단위 디자인 비교는 제외하고 기존 플러그인 스타일과의 회귀 여부를 확인했습니다.

## Residual Test Gap

- 실제 Figma Desktop에서 개발 플러그인을 실행해 최종 이미지 보드가 캔버스에 생성되는 과정은 자동화 환경 밖이므로 수동 스모크 테스트가 한 번 필요합니다. UI→플러그인 메시지와 `code.js` 보드 생성 로직은 각각 자동 검증했습니다.

## Regression Update — Shortcut, Resize, Card Layout

- 한글 입력 상태를 재현한 `key: ㅡ`, `code: KeyM` 이벤트에서 1.250초 체크포인트 생성 확인.
- 키 이벤트를 window capture 단계에서 수신하고 입력창·조합 중·키 반복 상태를 제외하는 동작 확인.
- 체크포인트 카드에서 타임코드, PNG, 삭제 버튼이 한 줄로 유지되고 메모 입력창이 카드 폭 안에 정렬됨.
- 우측 하단 창 크기 조절 드래그에서 `1020x742` resize 메시지 전달 확인.
- 창 크기 조절 버튼 더블클릭 시 기본 `980x760` 크기 복원 메시지 전달 확인.
- 플러그인 메인 코드에서 최소 `640x520`, 최대 `1400x1000` 크기 제한 확인.
