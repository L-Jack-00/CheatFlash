# ⚡ 치트 플래시 (Cheat Flash) v1.0.0
### Universal Flash Player & Retro Speed/Cheat Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](https://github.com/L-Jack-00/CheatFlash)
[![Tests: Passing](https://img.shields.io/badge/tests-61%20passed-brightgreen.svg)](tests)

> **2000년대 어도비/매크로미디어 플래시 플레이어의 감성을 현대적인 WebAssembly(WASM) 및 시간 왜곡 엔진으로 재탄생시킨 범용 플래시 플레이어 & 치트 플랫폼입니다.**

---

## 🌟 핵심 기능 (Core Features)

### 1. 🎯 스마트 델타 헌터 (실시간 변동 감지 & 99.9% 소거 마법사)
- **수천 개 주소 폭발(Candidate Explosion) 극복**:
  - **1단계 (기준값)**: 현재 수치(예: `100`)를 입력하고 `[🎯 추적 시작]`을 누르면 즉시 기준값 고정.
  - **2단계 (실시간 적중)**: 게임에서 공격을 받거나 재화를 소비하는 순간, **값이 변한 주소를 실시간 자동 포착하여 맨 위에 [적중!] 뱃지로 하이라이트**.
  - **소거 마법사**: 맞은 후 수치(예: `85`)를 입력하고 `[🔍 99.9% 소거]`를 누르면 수천 개 노이즈 메모리 중 정확히 85로 바뀐 핵심 주소만 남기고 일괄 정리.
  - **원클릭 치트 & 무한 고정**: 포착된 메모리에 대해 **[999,999 주입]** 및 **[무한 고정(Freeze)]**을 단 한 번의 클릭으로 실행.
- **400px+ 대화면 결과창**: 세로 높이를 대폭 확장하여 스크롤 없이 수십~수백 개의 실시간 메모리 변동을 한눈에 감시.

### 2. ⚙️ 클래식 정밀 스캐너 (치트엔진 스타일 Value Scanner)
- **정밀 탐색 모드**: 정확한 값(Exact Value)뿐만 아니라, 체력바만 있고 숫자가 보이지 않는 게임을 위한 **미지수 초기 스캔(Unknown Initial Value)** 지원.
- **다양한 필터링**: 증가한 값(Increased), 감소한 값(Decreased), 변하지 않은 값(Unchanged), 변한 값(Changed) 필터링 완비.
- **원클릭 서브 세그먼트 전환**: 상단 토글 스위치(`[🎯 간편 델타 헌터]` | `[⚙️ 클래식 정밀 스캐너]`)로 원하는 도구를 언제든 즉시 전환.

### 3. 📋 치트 메모리 조작 북 (Tab 2)
- **자동 누적 기록**: 메모리 검색기에서 편집된 모든 수치가 최신순으로 자동 등록 및 누적 보존.
- **수치 수정 & 영구 고정(Freeze)**: 실시간 수치 인라인 수정 및 백그라운드 무한 고정 유지.
- **주소 수동 등록**: 알고 있는 메모리 주소를 직접 수동 등록하여 관리 가능.

### 4. ⏱️ 만능 시간 왜곡 (Speedhack Engine)
- **0.1x ~ 10.0x 자유로운 가속/감속**: 슬로우모션 탄막 회피부터 지루한 파밍 구간 10배속 돌파까지 실시간 슬라이더 및 단축키 조절.
- **0% CPU 완전 일시정지 (F1)**: 게임 렌더링과 물리 연산을 물리적으로 동결하여 CPU 사용률을 0%로 절감.
- **1프레임 미세 전진 (F4)**: 정확히 1프레임(+16.6ms)만 물리 연산을 진행하고 즉시 재동결하여 초정밀 프레임 단위 조작 가능.

### 5. 🎵 Web Audio API 사운드 피치 & 동결 싱크
- 게임 배속에 맞춰 BGM 및 효과음 재생 속도가 자연스럽게 동기화.
- 일시정지(F1) 시 오디오를 즉시 정지하여 소리 겹침이나 지연 드리프트를 차단.

### 6. 🛡️ 플래시 안티치트 자동 무력화 (Anti-Cheat Disarmer)
- SWF 파일 로드 시 바이트코드를 분석하여 `confereNDS` 등 유명 플래시 안티치트 검증 함수를 자동 감지하고 원클릭/자동 무력화 패치 적용.

### 7. 🗗 독립 윈도우 인스펙터 분리 (Undock & Multi-Monitor)
- 우측 치트 인스펙터 패널을 완전히 독립된 네이티브 윈도우 창으로 분리하여 듀얼/트리플 모니터로 이동 가능.
- 창 위치 및 크기(Geometry) 자동 기억 및 복원.
- 메인 화면으로 언제든 원클릭 재도킹 지원.

### 8. 🖱️ 정통 플래시 우클릭 메뉴 & 조작 안전망
- 게임 화면 우클릭 시 확대, 축소, 100%, 퀄리티 제어 등 정통 플래시 메뉴 제공.
- 우클릭을 막아둔 게임에서도 항상 메뉴가 호출되도록 이벤트 캡처 가드 탑재.
- 일시정지 및 배속 제어를 **F1~F5 전용 기능키**에 할당하여, 게임 고유의 **스페이스바, 엔터, 방향키** 입력을 100% 온전히 보존.

---

## 🎮 단축키 가이드 (Shortcut Keys)

| 키 | 기능 | 설명 |
| :--- | :--- | :--- |
| **F1** | ⏸ **일시정지 / 게임 재개** | 게임 연산을 멈추고 CPU 부하 0%로 동결 |
| **F2** | ⏪ **슬로우모션 (0.5x)** | 정밀한 탄막 회피나 타이밍 공략용 반속 모드 |
| **F3** | ⏩ **초고속 재생 (2.0x)** | 지루한 대기 시간이나 노가다 구간 돌파용 2배속 |
| **F4** | ⏭ **1프레임 미세 전진 (+16.6ms)** | 1프레임 단위로 미세 조작 및 전진 |
| **F5 / 0** | ⚡ **정상 배속 복귀 (1.0x)** | 본래 게임 기본 속도로 즉시 복귀 |
| **[ / ]** | ⏳ **0.25x 미세 배속 조절** | 원하는 속도로 정밀 조절 |
| **우클릭** | 🖱️ **플래시 메뉴 열기** | 확대/축소/100%/퀄리티 설정/툴바 접기 |

---

## 🚀 빠른 시작 (Quick Start)

### 1. 요구 사항 (Prerequisites)
- **Python 3.10 이상**
- **PyQt6 및 PyQt6-WebEngine** (선택 사항: 설치되지 않은 환경에서는 경량 로컬 웹 모드로 자동 실행)

### 2. 설치 및 실행 (One-Click Launch)
```bash
# 1. 저장소 복제
git clone https://github.com/L-Jack-00/CheatFlash.git
cd CheatFlash

# 2. 의존성 설치 (데스크톱 네이티브 윈도우 모드)
pip install -r requirements.txt

# 3. 원클릭 런처 실행
python run.py
```

### 3. 모드별 직접 실행
- **PyQt6 데스크톱 독립 창 모드**:
  ```bash
  python main.py
  ```
- **무설치 로컬 웹 브라우저 모드**:
  ```bash
  python server.py
  ```

### 4. 자체 검증 테스트 실행
```bash
python -m unittest discover tests -v
```
*(총 61개 이상의 단위/통합 테스트가 내장되어 있으며, 모든 환경에서 100% 통과를 보장합니다.)*

---

## 📁 프로젝트 구조 (Repository Architecture)

```text
CheatFlash/
├── index.html            # 메인 플래시 뷰포트 및 통합 3-Tab 치트 인스펙터 UI
├── inspector.html        # 다중 모니터용 독립 분리(Undock) 네이티브 윈도우 UI
├── style.css             # Windows 고전 감성 하이 콘트라스트 스타일시트
├── cheat_harness.js      # 메모리 스캐너, 스마트 델타 헌터 및 치트 테이블 코어
├── virtual_clock.js      # 드리프트 없는 가상 시계 시간 왜곡 & Web Audio 싱크 엔진
├── main.py               # PyQt6 QWebEngine 데스크톱 윈도우 프레임 및 다중창 관리자
├── server.py             # 안티치트 바이트코드 패치 및 로컬 HTTP 스트리밍 서버
├── run.py                # 환경 자동 감지 원클릭 실행 런처
├── tests/                # 61개 통합 자동화 테스트 스위트
└── requirements.txt      # Python 패키지 의존성 목록
```

---

## 📄 라이선스 (License)

본 프로젝트는 [MIT License](LICENSE)에 따라 자유롭게 사용, 수정 및 배포할 수 있습니다.
플래시 에뮬레이션은 오픈소스 [Ruffle](https://github.com/ruffle-rs/ruffle) WebAssembly 엔진을 활용합니다.
