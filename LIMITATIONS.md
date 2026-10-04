# Limitations

현재 버전은 확정 설계에 따른 작은 동기 tree-walk 언어입니다. 다음은 의도적인 제약입니다.

- 동시 user call은 64개까지, 65번째 진입은 RuntimeError입니다. 활성 evaluate/execute 중첩은 256개까지이며 복잡한 함수에서는 이 제한이 먼저 걸릴 수 있습니다. tail-call 최적화가 없습니다. Node 20.20.2/24.16.0 기본 스택에서 경계를 검사하며 호스트 RangeError도 언어 오류로 변환합니다. 다른 OS·Node 버전 전체를 검증했다는 의미는 아닙니다.
- parser 입력 재귀 edge는 64, 전체 AST height는 128입니다. 긴 왼쪽 결합 식도 이 제한을 받습니다. 배열 표시는 64단계 이후 `<max-depth>`, 순환 경로는 `<cycle>`로 나타냅니다.
- 실행 시간·loop 횟수·총 메모리 한도는 없습니다. REPL은 동기 실행 중인 무한 loop를 세션을 보존하며 취소하지 못합니다. OS process 중단이 필요할 수 있습니다. 신뢰할 수 없는 프로그램의 격리 sandbox로 제공하지 않습니다.
- 배열 길이는 고정이며 기존 요소만 변경할 수 있습니다. push, 삭제, sparse array, spread, trailing comma, string indexing을 지원하지 않습니다. 음수·범위 밖 index는 RuntimeError, 정수가 아닌 index는 TypeError입니다.
- 문자열 길이와 source column은 UTF-16 code unit 기준입니다. `len("😀")`는 2입니다. caret은 Unicode 화면 폭·tab 정렬을 보정하지 않고 숫자 column을 기준으로 표시합니다.
- number는 finite binary64이며 정밀도 손실이 있을 수 있습니다. 지수·hex literal, NaN/Infinity, 암묵 변환은 없습니다. `/0`과 `%0`은 오류입니다.
- 식별자는 ASCII이고 문자열은 큰따옴표와 제한된 escape만 지원합니다. 자동 세미콜론 삽입, 함수 표현식, default/rest parameter가 없습니다. 함수 인자 수는 정확히 일치해야 합니다.
- if/while body에 중괄호가 필요합니다. REPL의 else는 직전 닫는 중괄호와 같은 입력 줄에서 시작해야 합니다. raw multiline 문자열과 parser 오류 복구는 지원하지 않습니다.
- scope별 동일 이름 재선언은 금지됩니다. REPL runtime 실패 이전 효과와 예약된 TDZ binding은 남습니다. 실패한 초기화 이름을 다시 쓰려면 새 이름 또는 새 REPL 세션을 사용해야 합니다.
- objects, property access, modules, for/break/continue 문법, 증감·복합대입 연산자, 비동기 실행, filesystem/network builtin, VM, 별도 GC, debugger, static type checker는 없습니다.

현재 알려진 미해결 기능 버그는 없습니다. 신규 버그 발견 시 기존 테스트를 유지하고 재현 테스트·명세 영향·수정 근거를 PROGRESS에 기록합니다.
