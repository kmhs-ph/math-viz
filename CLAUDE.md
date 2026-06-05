# math-viz 인수인계 문서

수학 개념을 인터랙티브하게 시각화하는 정적 웹사이트.
Desmos처럼 슬라이더/입력값 조작 시 실시간 부드러운 반응이 핵심.
GitHub Pages(`https://kmhs-ph.github.io/math-viz/`)에 배포.

---

## 1. 현재 코드 구조

```
math-viz/
├── index.html              # 홈페이지 — 개념 카드 그리드
├── main.js                 # 홈페이지 JS: registry를 읽어 카드 렌더링
├── style.css               # 전역 스타일 (다크 테마, 컨트롤 컴포넌트 CSS)
├── registry.js             # ★ 개념 목록 — 새 개념 추가 시 이 파일만 편집
├── vite.config.js          # Vite MPA 설정 (concepts/*/index.html 자동 탐색)
├── package.json            # scripts: dev / build / deploy
├── shared/
│   ├── canvas-utils.js     # resizeCanvas(canvas), lerp(a, b, t)
│   └── controls.js         # createSlider / createSelect / createButton / addDivider
└── concepts/
    └── fourier/
        ├── index.html      # 페이지 진입점 (링크: ../../ → 홈)
        └── main.js         # 에피사이클 애니메이션 + 컨트롤 UI
```

### 핵심 파일 역할

**`registry.js`** — 홈페이지 카드 데이터 소스.
```js
export const concepts = [
  {
    id: 'fourier',
    title: '푸리에 급수',
    description: '...',
    tags: ['해석학', '신호처리'],
    path: 'concepts/fourier/',   // 카드 클릭 시 이동할 경로
  },
]
```

**`vite.config.js`** — `concepts/*/index.html`을 glob으로 자동 탐색해 MPA 입력으로 등록.
새 개념 폴더를 만들면 설정 변경 없이 빌드에 포함됨.

**`shared/controls.js`** — 모든 개념 페이지에서 재사용하는 UI 컴포넌트.
`createSlider({ container, label, min, max, step, value, format, onChange })` 형태로 호출.

**`concepts/fourier/main.js`** — 푸리에 급수 시각화 구조:
- `WAVEFORMS` 객체: 파형별 계수 함수 정의 (사각/톱니/삼각파)
- `getCircles()`: N개 항의 에피사이클 목록 계산
- `draw()`: 매 프레임 Canvas를 지우고 에피사이클 + 파형 전개 그리기
- `requestAnimationFrame(loop)`: 60fps 애니메이션 루프

### 새 개념 추가 방법

1. `concepts/새이름/index.html` — 아래 템플릿 복사 후 제목 수정:
   ```html
   <!DOCTYPE html>
   <html lang="ko">
   <head>
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>개념 이름 — 수학 시각화</title>
     <link rel="preconnect" href="https://fonts.googleapis.com" />
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
     <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
     <link rel="stylesheet" href="../../style.css" />
   </head>
   <body>
     <div class="concept-page">
       <nav class="concept-nav">
         <a class="back-link" href="../../">
           <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
             <path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           홈
         </a>
         <span style="color:var(--border)">|</span>
         <h1>개념 이름</h1>
       </nav>
       <div class="concept-canvas-area">
         <canvas id="canvas"></canvas>
       </div>
       <div class="concept-controls" id="controls"></div>
     </div>
     <script type="module" src="./main.js"></script>
   </body>
   </html>
   ```

2. `concepts/새이름/main.js` — Canvas API + `shared/controls.js` 활용해 시각화 구현.

3. `registry.js`에 항목 1개 추가.

### 개발 / 배포 명령어

```bash
npm run dev      # 개발 서버 → http://localhost:5173/math-viz/
npm run build    # dist/ 생성
npm run deploy   # dist/ → gh-pages 브랜치 push → 사이트 반영
```

---

## 2. 진행 중인 작업

없음. 기본 골격과 첫 번째 개념(푸리에 급수)이 완성된 상태.

---

## 3. 작업 목록

### ✅ 완료

- [x] Vite MPA 프로젝트 초기화 (`concepts/*/index.html` 자동 탐색)
- [x] 다크 테마 전역 스타일 (`style.css`)
- [x] 홈페이지 카드 그리드 (`index.html` + `main.js` + `registry.js`)
- [x] 공통 컨트롤 컴포넌트 (`shared/controls.js`: Slider, Select, Button)
- [x] 공통 Canvas 헬퍼 (`shared/canvas-utils.js`: resizeCanvas)
- [x] 푸리에 급수 시각화 (`concepts/fourier/`)
  - 에피사이클(회전 원) 애니메이션
  - 파형 전개(사각/톱니/삼각파)
  - 항의 수 N 슬라이더 (1~50)
  - 속도 슬라이더 (0.1×~5×)
  - 파형 선택 셀렉트
  - 일시정지 / 초기화 버튼
- [x] GitHub Pages 배포 설정 (`npm run deploy`)

- [x] 유한군 표현론 시각화 (`concepts/group-rep/`)
  - D_n (n=3~6), S_3, S_4, A_3, A_4, V₄ 지원
  - ℝ/ℂ 체 선택, 각 군의 모든 irrep 목록 + 지표표
  - 생성원 클릭으로 군 원소 실시간 구성
  - 1D(실수): 수직선 + 화살표, 1D(복소): Argand 평면, 2D: 격자 + 'F' 도형, nD: 랜덤 투영
  - 행렬 선형 보간 애니메이션 (0.45s)
  - 전체 irrep 미니 비교 카드

### 🔄 진행 중

없음.

### 📋 미진행

- [ ] 홈페이지 카드에 미니 애니메이션 썸네일 (각 개념의 preview canvas)
- [ ] 모바일 레이아웃 대응 (controls 영역 세로 스택)
- [ ] KaTeX로 수식 렌더링 (각 개념 페이지에 공식 표시)
- [ ] 페이지 전환 애니메이션
- [ ] `404.html` 처리 (GitHub Pages SPA fallback)
- [ ] group-rep: [P] 키 외에 UI 버튼으로 새 투영 생성 (dim ≥ 3)
- [ ] group-rep: 애니메이션 누적 적용 (현재 상태 → 새 원소) 모드
- [ ] group-rep: S_4, A_4의 3D irrep에서 3D 뷰어 (마우스로 회전) 옵션
