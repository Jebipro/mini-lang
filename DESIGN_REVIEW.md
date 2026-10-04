# Mini-Lang 사전 설계 검토

검토일: 2026-10-02 (Asia/Seoul)  
분석 대상: `PRE_IMPLEMENTATION_REVIEW_PROMPT_v2.md`(작성자의 로컬 파일, 저장소에 포함하지 않음) 전체 및 그 안의 추가 구현 요구사항.  
상태: 다음 구현 세션의 기준 설계. 아래 언어 규칙은 선택을 완료했으며, 실제 동작·스택 안전성·테스트 통과를 검증했다는 뜻은 아니다.

## A. Executive Review

요구된 기능은 작은 tree-walk interpreter로 구현할 수 있다. 그러나 원문만으로 구현을 시작하면 선언의 가시성, closure의 이름 해석, 대입 평가 순서, 오류 위치, REPL 입력 완성 판정에서 서로 다른 구현이 모두 정답처럼 보인다. 이 문서는 그 선택을 고정하고, 위험마다 실행 가능한 테스트 기준을 연결한다.

이번 세션의 범위는 설계 검토와 이 문서 저장뿐이다. 첨부 문서 안의 Implementation Master Prompt는 분석 대상이며, 그 안의 구현·설치·커밋 지시는 실행하지 않는다. 상위 검토 지시의 일반적인 파일 생성 금지는 사용자가 직접 요청한 `DESIGN_REVIEW.md` 저장에 한해 예외로 해석한다. 소스, scaffold, package 설정, 테스트 코드를 만들지 않는다.

읽기 전용 확인 결과 현재 프로젝트 루트에는 기존 `.git`만 있고, 소스 및 적용할 `AGENTS.md`는 발견되지 않았다. Git에는 아직 커밋이 없다. 따라서 다음 세션에서는 현재 루트를 프로젝트 루트로 사용하며 `mini-lang/mini-lang` 같은 중첩 디렉터리를 만들지 않는다. 설치된 Node는 v24.16.0이다. 이것은 목표인 Node 20+ 전 범위에서의 검증 결과가 아니다.

핵심 확정 사항:

1. 문장과 표현식 모두 recursive descent로 파싱한다. precedence별 함수, 오른쪽 결합 assignment, 반복형 postfix 체인을 사용한다.
2. AST와 RuntimeValue는 각각 discriminated union이며, interpreter는 exhaustive switch로 처리한다.
3. lexical scope는 mutable binding cell과 parent pointer로 구성한다. 각 scope 진입 시 직접 선언된 이름을 미리 예약하고 함수는 초기화한다. `let`은 선언 실행 때 초기화하여 TDZ를 적용한다. 이로써 closure가 실행 시점에 따라 다른 외부 binding으로 바뀌는 문제를 막는다.
4. return은 명시적인 completion record로 전파하며, 언어 오류만 예외로 전달한다.
5. 함수도 first-class runtime value다. 정확한 arity, lexical capture, 배열과 함수의 참조 동일성, 제한된 타입 조합을 명시한다.
6. source와 span을 첫 단계부터 공유한다. 오류 보고를 구현 순서의 마지막에 덧붙이지 않는다.
7. REPL은 제출 단위 전체를 파싱한 뒤 한 번만 실행한다. persistent global, 주입식 I/O, complete/incomplete/invalid 분류를 사용한다.
8. user call 깊이 64, 별도의 평가 중첩 및 파서 입력 중첩 제한을 둔다. 호스트 스택 안전성은 다음 세션의 실제 evaluator로 반드시 측정한다.
9. 최소 15개 예제의 `.lang`/`.expected` 쌍, 위험별 테스트 ID, 단계별 커밋과 `PROGRESS.md` 재개 절차를 완료 조건으로 삼는다.

호환성을 이유로 JavaScript의 암묵적 변환, 자동 세미콜론 삽입, 프로토타입, 배열 자동 확장까지 가져오지 않는다. objects, modules, VM, GC, debugger, static type checker, 함수 표현식, 비동기 기능은 현재 범위 밖이다.

## B. Requirements Gaps & Ambiguities

우선순위 P0는 의미론·구조가 바뀌는 문제, P1은 사용자 동작 및 검증의 불확실성, P2는 유지보수·작업 절차의 문제다.

| 중요도 | 원문의 공백 또는 충돌 | 결정과 이유 | 기준 섹션 |
|---|---|---|---|
| P0 | 값 목록에 함수가 없지만 closure·chained call을 요구 | user function과 builtin을 callable value로 추가. 새 언어 기능이 아니라 요구된 동작의 필수 표현 | C, F |
| P0 | lexical scope만으로 선언 전 참조·나중에 선언되는 local의 capture를 결정할 수 없음 | scope의 이름을 미리 예약, `let` TDZ, 함수 hoisting. 별도 resolver 없이 lexical binding을 안정화 | C, F |
| P0 | 함수 선언 실행 순서, 자기 재귀·상호 재귀 불명확 | scope 진입 시 그 scope의 직접 함수 선언을 초기화. 호출 전 선언문 위치와 무관하게 사용 가능 | C, F |
| P0 | closure를 값 복사로 만들면 상태 변경과 재귀가 깨짐 | 같은 호출에서 생성된 closure는 같은 binding cell 공유. 서로 다른 호출은 별도 frame | F |
| P0 | return 구현 방법, top-level return 규칙 없음 | 함수 밖 return은 SyntaxError, 내부는 completion record 전파 | E, F |
| P0 | precedence·associativity·유효한 lvalue 미정 | E의 전체 grammar 및 precedence 표 고정. 식별자와 index만 대입 가능 | E |
| P0 | 배열 참조·동일성·잘못된 인덱스·쓰기 확장 규칙 없음 | 참조 공유, identity equality, 정수·범위 엄격 검사, 자동 확장 없음 | C, F |
| P0 | Node의 안전한 호출 횟수가 명시되지 않음 | call 64 + 평가 중첩 256 + 입력 중첩 64, RangeError 경계 변환. 실측을 출고 조건으로 둠 | F, J, K |
| P1 | 세미콜론 필수와 REPL 표현식 편의가 충돌할 수 있음 | 파일은 필수, REPL의 마지막 최상위 expression에만 EOF 세미콜론 생략 허용 | C, E, H |
| P1 | truthiness와 논리 연산 결과 미정 | false/null만 falsy, 논리 연산은 선택된 피연산자 반환 | C |
| P1 | 숫자 표현 범위, NaN/Infinity, 나눗셈 0 미정 | finite binary64만 허용, `/`와 `%`의 0은 RuntimeError, 비유한 결과도 RuntimeError | C |
| P1 | string 덧셈·정렬·index·len 의미 미정 | string+string만 허용, 관계 비교는 number만, string index 미지원, len은 UTF-16 code unit 수 | C |
| P1 | 인자 부족·초과 및 부작용 순서 미정 | callee → callable/arity 검사 → 인자 좌→우 → 실행. arity 오류면 인자 미실행 | C, F |
| P1 | 오류 복구와 미완성 입력이 혼동됨 | 파일은 첫 SyntaxError에서 중단. REPL은 파서의 EOF 관련 진단으로만 incomplete 분류 | G, H |
| P1 | REPL에서 오류가 나면 이전 변경의 유지 여부 미정 | parse 실패는 무실행. runtime 실패 전 완료한 변경·출력은 유지, rollback 없음 | H |
| P1 | 한 제출의 실패로 아직 초기화 안 된 global이 남는 문제 | 예약된 binding을 유지해 TDZ 의미론 보존. 재선언 불가, 새 이름 또는 REPL 재시작으로 회복 | H |
| P1 | span·연산자·call/index 오류 지점 미정 | 전체 half-open span과 개별 anchor span 모두 보존 | G |
| P1 | print 출력, 반환값, 순환 배열 표시 미정 | LF 출력, null 반환, 배열 내 문자열은 quoted, 순환은 `<cycle>`로 표시 | C, F |
| P1 | 예제 출력·줄바꿈 자동 검증 규칙 없음 | 모든 예제에 expected 필수. CRLF만 LF로 정규화하고 끝 개행까지 완전 비교 | J |
| P1 | Vitest timeout만으로 무한 루프가 멈춘다고 오해할 수 있음 | 위험 실행은 부모 프로세스가 시간 제한으로 종료하는 별도 child process | J |
| P2 | error reporting이 구현 순서 후반이라 위치를 잃기 쉬움 | source/error 계약을 Lexer 전에 구현하고 각 단계에서 위치 테스트 | K |
| P2 | `any` 예외 허용과 `check:any` 자동 검출 요구가 충돌 | `src/` 명시적 any는 예외 없이 0개. TypeScript compiler API로 AnyKeyword 검출 | D, K |
| P2 | grammar 문서가 마지막이면 Parser와 불일치 가능 | SPEC, GRAMMAR, ARCHITECTURE를 가장 먼저 작성하고 함께 갱신 | K |
| P2 | 빈 mini-lang 디렉터리 생성과 현재 프로젝트 루트가 다름 | 현재 루트를 사용, 기존 Git 보존 | A, K |
| P2 | 중단 재개·커밋 경계가 불명확 | K의 단계별 완료 조건과 PROGRESS 필드 사용. 실패 상태를 완료로 표시하지 않음 | K |

원문의 기능 수를 늘리는 선택은 하지 않는다. `%`는 FizzBuzz를 간단히 구현하기 위해 포함하고, 추가 builtin은 필요하지 않으므로 `print`, `len` 두 개만 둔다. 아래 hoisting/TDZ는 JavaScript 호환 선언이 아니라 이 언어 자체의 규칙이다.

## C. Final Language Decisions

이 표 및 D~H는 구현 세션이 따라야 하는 규범이다. 변경이 필요하면 SPEC·이 문서의 해당 결정·테스트를 함께 수정하고 이유를 `PROGRESS.md`에 남긴다.

| 영역 | 확정 규칙 | 예시·경계 |
|---|---|---|
| 소스 | UTF-8 텍스트, 파일 시작 BOM 하나 허용. LF, CRLF, CR을 줄바꿈으로 처리하되 원본 offset 보존 | BOM은 offset 1을 소비하되 첫 코드의 line/column은 1:1 |
| 식별자 | ASCII `[A-Za-z_][A-Za-z0-9_]*`, 대소문자 구분 | `x`, `_count2`; 한글 식별자는 미지원 |
| 예약어 | `let fn if else while return true false null` | 예약어는 변수·함수·매개변수 이름 불가 |
| 공백·주석 | space, tab, 줄바꿈 무시. `//`부터 줄 끝까지 주석 | block comment·shebang 미지원 |
| 숫자 literal | `DIGIT+ ('.' DIGIT+)?`, 선행 0 허용하고 10진 해석 | `.5`, `1.`, 지수·hex 미지원. 음수는 unary `-` |
| 숫자 의미 | finite IEEE-754 binary64. 정밀도 손실은 이 숫자 모델의 한계 | NaN/Infinity literal 없음. 비유한 literal은 SyntaxError, 비유한 연산 결과는 RuntimeError |
| 문자열 literal | 큰따옴표만 허용. escape는 `\"`, `\\`, `\n`, `\r`, `\t` | raw newline, 알 수 없는 escape, Unicode escape syntax는 SyntaxError. Unicode 문자 자체는 허용 |
| 변수 선언 | `let name = expression;`만 허용, initializer 필수 | `let x;` 불허 |
| 재선언 | 동일 lexical scope의 let/fn 이름 중복 불허. 매개변수와 함수 본문 최상위 선언의 중복도 불허 | 소스 내 중복은 SyntaxError. REPL 기존 global과 새 선언 충돌은 RuntimeError, 실행 전 검출 |
| scope 준비 | 각 Program/Block의 직접 let/fn 이름을 먼저 예약. 중첩 block의 선언은 그 block 진입 때만 준비 | 예약된 let cell은 uninitialized, 값 null과 구분 |
| let 초기화 | 선언문 실행 시 initializer 평가 후 cell을 초기화. 그 전 읽기·쓰기는 RuntimeError | `let x = x;`는 TDZ 오류. 외부 x로 우회하지 않음 |
| block scope | `{...}`마다 새 Environment. 함수 본문 최상위 block은 매개변수 frame 자체 사용 | while body는 매 반복 새로운 block scope |
| shadowing | 자식 scope에서 부모 이름을 가릴 수 있음. shadowing은 해당 scope 전체에 적용 | `{ print(x); let x=1; }`는 외부 x가 있어도 TDZ 오류 |
| lexical lookup | 현재 env에서 가장 가까운 이름을 찾고 parent로 이동. caller env는 검색 경로가 아님 | uninitialized cell을 만나면 즉시 오류, 부모 검색 금지 |
| 함수 선언 | `fn name(p1, p2) { ... }`. 선언은 statement-list 안에만 허용 | 함수 표현식, anonymous fn, default/rest 인자 미지원 |
| 함수 가시성 | scope 진입 시 모든 직접 fn binding을 초기화. 선언문 실행 자체는 no-op | 선언 앞 호출·자기 재귀·동일 scope 상호 재귀 허용 |
| 함수 binding | user 함수 이름은 초기화된 mutable binding. 재대입 가능 | 함수의 자기 이름도 capture된 같은 cell lookup. 재대입하면 재귀 목적지도 바뀜 |
| 매개변수 | 중복 이름 금지, mutable local binding | 함수 이름과 같은 parameter는 허용하되 자기 이름을 shadow함 |
| 함수 값 | user function과 builtin 모두 first-class. 변수, 인자, 반환값, 배열 요소 가능 | named declaration으로 생성한 함수를 반환해 closure 구현 |
| closure | 함수가 선언된 Environment 객체를 참조 capture. cell 값의 복사본을 만들지 않음 | 동일 factory 호출의 sibling closure는 state 공유 |
| 독립 state | factory 호출마다 새 parameter/local frame, 새 함수 객체 생성 | 두 counter의 증가 횟수는 독립 |
| 재귀 | 일반 lookup·호출 경로 그대로 처리, tail-call 최적화 없음 | 상호 재귀도 동일 call depth 사용 |
| statement 종료 | let, return, expression statement는 `;` 필수. block/fn/if/while은 `}`로 종료 | empty statement `;`는 불허. `fn f(){};`의 추가 세미콜론도 불허 |
| if/while | `if (expr) block [else (block 또는 if)]`, `while (expr) block` | 중괄호 필수, dangling else 모호성 없음 |
| top-level return | 어느 top-level block 내부여도 함수 밖이면 SyntaxError | `if(true){return 1;}` 불허 |
| return | `return expr;` 또는 `return;`. newline은 의미 없는 공백 | `return\n1;`은 1 반환. bare return 및 끝까지 실행은 null |
| 대입 | `=`는 오른쪽 결합, 식의 값은 저장한 RHS 값 | `a=b=3`은 a,b 모두 3, 결과 3 |
| 대입 target | AST 최외곽이 Identifier 또는 Index인 경우만 허용. Group 자체는 불가 | `(a)=1` 불허, `(a)[0]=1` 허용 |
| 대입 순서 | target reference 결정·검증 후 RHS 평가, 마지막에 그 reference에 저장 | `a[i()] = rhs()`에서 i는 한 번만 평가. 잘못된 target이면 rhs 미실행 |
| 일반 평가 순서 | 배열 요소·binary 피연산자는 좌→우. binary는 두 피연산자 평가 후 타입 검사 | `null + print(1)`은 1 출력 후 TypeError |
| truthiness | false와 null만 falsy. 나머지는 truthy | 0, `""`, `[]`, 함수는 truthy |
| unary | `!`는 모든 값의 truthiness를 반전하여 boolean. `-`, `+`는 number만 | `!0`은 false, `+"1"`은 TypeError |
| 산술 | `+ - * / %`, number끼리만. 예외는 string+string 연결 | 배열 합치기, 숫자·문자 암묵 변환 없음 |
| 나눗셈·나머지 | `/0`, `%0`은 RuntimeError. `%`는 truncate-toward-zero remainder | `-5%2`는 -1. -0은 표시 시 0 |
| 관계 비교 | `< <= > >=`는 number/number만 허용, boolean 반환 | string 관계 비교는 TypeError |
| equality | `== !=` 지원. primitive는 같은 tag와 같은 값, number의 +0/-0은 같음 | 다른 타입은 false/true. `null==false` false |
| 참조 equality | array 및 callable은 객체 identity. 깊은 비교 없음 | `[]==[]` false, `let b=a; a==b` true |
| 논리 | `&&`, `\|\|` 지원, 왼쪽 값에 따라 오른쪽을 생략. 선택된 operand 그대로 반환 | `null \|\| 7`은 7, `0 && 9`는 9 |
| precedence | postfix > unary > multiplicative > additive > relational > equality > and > or > assignment | 전체 표 E 참조. 비교 체인은 왼쪽 결합 후 타입 검사 |
| 배열 literal | `[expr, expr]`, 빈 배열 가능, 요소 타입 혼합 가능 | trailing comma, hole, spread 미지원 |
| 배열 값 | mutable reference. 대입·인자 전달·반환에서 동일 객체 공유 | 배열 복사·자동 flatten 없음 |
| index 대상 | array만. string indexing 미지원 | `"abc"[0]` TypeError |
| index 타입 | finite number이며 정수여야 함. -0은 0 취급 | string/boolean/null/소수는 TypeError |
| index 범위 | `0 <= index < length`. 음수·범위 초과는 RuntimeError | 빈 배열의 어떤 index도 실패 |
| index 평가 | base를 평가하고 array 검사 후 index를 한 번 평가·검증 | base가 잘못되면 index 식은 실행 안 함 |
| 배열 쓰기 | 기존 index에만 쓰기, 길이는 고정. 삭제·push·속성 접근 없음 | `a[len(a)]=x`는 RuntimeError |
| nested array | 각 index 단계를 같은 규칙으로 처리. 공유 subarray와 순환 배열 허용 | `a[0][1]=9`, `let a=[null]; a[0]=a;` |
| call 체인 | postfix `()`와 `[]`를 왼쪽부터 임의 조합 | `f(1)(2)`, `arr[0](1)`, `f(1)[0]` 모두 허용 |
| call 순서 | callee 평가 → callable 검사 → arity 검사 → 인자 좌→우 → 새 frame/실행 | callee·arity 오류 시 인자 부작용 없음 |
| user arity | 선언 매개변수 수와 정확히 일치해야 함 | 부족·초과 모두 RuntimeError |
| builtin arity | `print`: 0개 이상, `len`: 정확히 1개 | 일반 호출 경로가 arity 검사 |
| print | 인자를 표시 문자열로 바꾸어 ASCII space 하나로 연결하고 LF 하나 출력 | `print()`는 빈 줄 출력. 반환은 null |
| 표시 형식 | number는 JS의 finite number 표기, -0은 `0`; boolean/null은 소문자; 최상위 string은 원문 | 함수는 `<fn name>`, builtin은 `<builtin name>` |
| 배열 표시 | `[1, "x", null]`처럼 comma+space, 내부 string은 JSON 규칙으로 quote/escape | active traversal path에서 재방문한 배열은 `<cycle>`; 단순 alias 반복은 정상 표시 |
| 표시 깊이 | array 중첩 64개까지 표시, 65번째 array는 `<max-depth>` | formatter 자체 스택 폭주 방지, equality·원본 값에는 영향 없음 |
| len | array는 요소 수, string은 UTF-16 code unit 수, number 반환 | `len("😀")`는 2. 다른 타입 TypeError |
| builtin binding | builtin 전용 부모 scope에 readonly cell, user global은 그 자식 | `let print=1;`은 shadow 허용, 선언 없이 `print=1;`은 RuntimeError |
| unsupported | 객체, 속성, 문자열 index, coercion, 증감 연산자, +=, ===, ternary, for/break/continue 문법 미지원 | 인식 불가 문자/문법 SyntaxError, 지원 문법의 타입 불일치 TypeError. `++x`는 E의 grammar에 따라 unary `+` 두 번이며 증가시키지 않음. for/break/continue는 예약어 목록에 없으므로 일반 식별자로는 사용 가능 |
| 오류 taxonomy | SyntaxError, RuntimeError, TypeError. TypeError는 runtime 계열이며 별도 표시 | undefined name·TDZ·arity·범위·깊이는 RuntimeError |
| 오류 복구 | 파일은 첫 구문 오류에서 중단, AST 일부 실행 금지. 런타임은 첫 오류까지 실행 | parser synchronization 없음 |
| 위치 | offset 0-based UTF-16, line/column 1-based UTF-16, span end-exclusive | operator/identifier/call/index anchor와 전체 식 span 모두 보존 |
| REPL 실행 단위 | 여러 줄을 모은 한 submission 전체 parse 완료 후 한 번 실행 | complete/incomplete/invalid는 H 규칙 |
| REPL 세미콜론 | 마지막 최상위 expression statement에만 EOF 세미콜론 생략 허용 | `1+2` 허용. `let x=1`은 `;`를 기다림 |
| REPL echo | 최상위 expression statement마다 null이 아닌 결과를 한 줄 표시. 명시적 `;`도 suppress하지 않음 | `print(1);`은 print 출력만. null 결과는 echo 없음 |
| REPL scope | 세션 전체에서 동일 global 유지. submission 중첩 frame을 만들지 않음 | `let x=1;` 다음 입력 `x=x+1`은 2 |
| REPL 오류 후 | 문법 오류는 해당 입력 폐기, runtime 오류는 이전 효과 및 예약 cell 유지 후 다음 입력 허용 | uninitialized global은 재선언·대입 불가. 새 이름/재시작 필요 |
| 호출 깊이 | 동시에 활성 user function 최대 64개. 65번째 진입 전에 RuntimeError | builtin은 user depth 미가산. 인자 평가 중 user call은 동일 카운터 사용 |
| 평가 자원 제한 | 활성 evaluate/execute 진입 합계 최대 256, AST 최대 깊이 128 | 초과 RuntimeError(평가)/SyntaxError(AST). user depth가 64 이하여도 먼저 적용 가능 |
| 파싱 자원 제한 | 재귀 입력 edge 깊이 최대 64: 괄호·배열·block·중첩 호출 인자·unary·assignment 우변 등 | precedence 함수 호출 개수가 아니라 입력으로 중첩되는 edge 수를 셈 |
| 시간 제한 | 언어 자체의 실행시간·루프 횟수 제한은 없음 | 영원한 while은 사용자 중단 필요. 테스트는 process isolation으로 보호 |
| 스크립트 실행 | UTF-8 읽기 → 전체 parse → 새 global로 실행. expression 자동 출력 없음 | stdout은 print만, 실패 진단은 stderr |
| exit code | 정상 0, 언어 오류 1, 사용법/파일 I/O/호스트 내부 오류 2 | REPL 개별 언어 오류 후 정상 EOF는 0, 미완성 EOF는 1 |
| 예제 검증 | `examples/NN-name.lang`와 같은 stem의 `.expected` 필수, 최소 15쌍 | 전체 디렉터리 자동 검색, 누락·고아 expected도 실패 |
| 출력 비교 | 실제·expected의 CRLF만 LF로 바꾸고 전체 문자열 동일성 비교 | trim 금지. 출력 없는 예제 expected는 0 byte, 출력 줄 끝 LF 필수 |
| 구현 타입 규율 | strict TypeScript, `src/` explicit any 0개, 무검증 assertion 금지 | `unknown`을 검사해 좁히고 모든 union switch exhaustiveness 보장 |

## D. Recommended Architecture

모듈은 역할별 최소 단위로 나눈다. 아래 파일명은 다음 세션의 설계 경로이며 이번에 생성한 파일이 아니다. 화살표 `A → B`는 A가 B에 의존한다는 뜻이다.

```text
token → source-location
ast → source-location
errors → source-location
lexer → token, errors, source-location
parser → token, ast, errors

runtime-values --type-only→ ast, environment
environment → runtime-values, errors
value-format → runtime-values
builtins → runtime-values, value-format, errors, output-port
interpreter → ast, runtime-values, environment, errors
runner → lexer, parser, interpreter, builtins, source-location
repl → runner, repl-ports
cli/run → runner, Node fs/process
cli/repl → repl, Node readline/process
```

RuntimeValue의 user function record는 closure Environment를 가리키므로 타입 수준의 상호 참조는 필요하다. `runtime-values`에서 Environment의 runtime import를 금지하고 `import type`만 사용한다. Environment 역시 RuntimeValue를 타입으로만 사용할 수 있다. 런타임 객체 생성은 interpreter/builtins가 담당한다. 따라서 JS 모듈 초기화 순환은 생기지 않는다. 이를 없애려고 closure를 `unknown`으로 저장하거나 과도한 interface 계층을 만들지 않는다.

| 모듈 | 책임·공개 계약 | 금지할 책임 |
|---|---|---|
| `src/source-location.ts` | SourceUnit(id, displayName, text, lineStarts), Position, Span, 원본 줄 추출 | 파싱·출력 |
| `src/token.ts` | TokenKind, lexeme, literal payload, span. EOF 포함 | operator 실행 |
| `src/lexer.ts` | SourceUnit → tokens. 불법 문자·escape·숫자 검증 | scope, 의미 분석 |
| `src/ast.ts` | immutable union shape, Program/Stmt/Expr 및 anchor 정의 | evaluate 메서드 |
| `src/parser.ts` | tokens + script/repl mode → Program 또는 structured parse diagnostic. 함수 문맥·중복 선언 검증 | RuntimeValue 생성, env 접근 |
| `src/runtime-values.ts` | primitive/array/user-function/builtin shape, truthiness·equality 등의 순수 helper | AST 실행, stdout |
| `src/environment.ts` | own cell 예약, 초기화, lookup reference, assign; 가장 가까운 binding 반환 | AST 스캔, caller 추적 |
| `src/interpreter.ts` | scope 준비, evaluate, execute, completion, call 경계와 깊이 카운터 | 파일 읽기, readline, 오류 직접 출력 |
| `src/builtins.ts` | builtin 객체 생성, print/len 구현, output callback 주입 | 별도 call/arity 경로, interpreter import |
| `src/value-format.ts` | 모든 표시 규칙, cycle 및 표시 깊이 처리 | equality 변경, 값 mutation |
| `src/errors.ts` | LangSyntaxError/LangRuntimeError/LangTypeError, diagnostic code, formatter | process.exit, stderr 직접 쓰기 |
| `src/runner.ts` | compile(SourceUnit, mode), createSession(output), execute(program, session), runScript | 콘솔 직접 의존, 오류를 문자열로만 축소 |
| `src/repl.ts` | buffer·source ID·parse 상태·지속 session 관리, 주입 ports로 echo/진단 | fs/readline/process 접근 |
| `src/cli/run.ts` | argv, UTF-8 fs, stdout/stderr, exit code 변환 | interpreter semantics |
| `src/cli/repl.ts` | readline adapter, Ctrl+C/EOF, prompt 표시 | 입력 완성 여부 재구현 |
| `scripts/check-any.mjs` | TypeScript compiler API로 `src/**/*.ts`의 AnyKeyword를 찾아 file:line:column 출력, 있으면 exit 1 | 문자열·주석의 단어 any를 금지하는 regex 검사 |
| `tests/` | 모듈 계약, 의미론·오류·CLI·REPL 검증 | 환경 내부 Map 구조를 의미론 정답으로 취급 |
| `examples/` | 15개 이상 프로그램과 expected | 호스트 sort 등으로 알고리즘 대체 |

AST node 종류를 사전에 고정한다. Program, LetDecl, FunctionDecl, BlockStmt, IfStmt, WhileStmt, ReturnStmt, ExpressionStmt; LiteralExpr, IdentifierExpr, GroupExpr, UnaryExpr, BinaryExpr, LogicalExpr, AssignExpr, ArrayExpr, IndexExpr, CallExpr. AssignExpr target은 IdentifierExpr 또는 IndexExpr의 union이며, parser가 다른 target을 차단한다. FunctionDecl은 expression이 아니다. 선언 node에는 이름 span과 매개변수별 span이 있다. Program/Block의 direct declarations를 parser가 검사하고 interpreter는 scope 준비에 재사용한다. 캐시된 목록은 원래 statement의 참조를 보관하여 두 AST 사본을 만들지 않는다.

배열과 함수 등 runtime 객체만 mutable identity를 가진다. AST의 source span, 자식 목록, token은 읽기 전용이다. 단위 테스트에서는 필요한 AST 모양을 직접 검사할 수 있지만 모든 필드의 대형 snapshot에 의존하지 않는다.

| 선택 영역 | 비교 | 최종 선택과 근거 |
|---|---|---|
| AST | union: narrowing/exhaustiveness 간단, 위치 필드를 공통화; class: visitor/생성자 boilerplate, 클래스 identity에 테스트 결합 가능 | discriminated union. 향후 type checker는 별도 traversal을 추가할 수 있고 AST에 실행을 넣을 필요가 없음 |
| dispatch | Visitor: pass 확장에 적합하나 이 규모에서는 방문 인터페이스 반복; switch: 흐름이 한곳에 보임; node.evaluate: AST와 runtime 결합 | exhaustive switch evaluator/executor. 새로운 node 누락은 never 검증으로 typecheck 실패 |
| return | sentinel exception: 짧지만 오류 catch와 혼동; completion: 매 단계 전파가 필요하나 타입에 드러남; continuation: 과도함 | 명시적 completion record. J의 중첩 return 테스트로 누락 방지 |
| runtime 값 | JS 직접 값: tag/undefined/호스트 coercion 누출; tagged union: 검사 명확; class: 객체 계층·boilerplate 증가 | tagged union. VM 전환 시에도 값 계약을 유지하기 쉬움 |
| lexical scope | parent chain: 공유 cell·재귀에 자연스러움; immutable 값 snapshot: mutation/late binding 손상; resolver+depth: 정교하지만 추가 pass | parent chain + scope predeclaration. immutable cell 참조 snapshot은 가능하지만 이 범위에서 이점 부족 |

TypeScript의 discriminant narrowing과 `never` exhaustiveness는 공식 Handbook의 동작을 근거로 한다. 이 프로젝트에 union/switch를 선택한 것은 그 기능을 활용한 설계 판단이다. [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

빌드 형태는 ESM, TypeScript `NodeNext`, target ES2022, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 사용한다. runtime import의 `.js` 경로와 type-only import를 일관되게 적용한다. 빌드는 `tsc`, 테스트는 Vitest로 한다. 실행은 빌드된 JS를 Node로 실행하여 TS 직접 실행 도구를 필수 의존성으로 추가하지 않는다. 개발 의존성은 TypeScript, Vitest, Node 타입으로 제한한다. 정확한 버전은 다음 세션에서 Node 20 호환성을 확인해 lockfile로 고정한다.

## E. Parser Strategy

### E1. 비교와 선택

| 기준 | Recursive descent: precedence별 함수 | Pratt | Precedence climbing |
|---|---|---|---|
| 구현 복잡도 | 함수 수가 늘지만 호출 관계가 grammar와 동일 | nud/led 또는 parselet 등록, binding power 규칙 필요 | binary loop는 짧으나 unary/postfix/assignment는 별도 처리 |
| precedence 명확성 | 함수 호출 순서로 직접 읽을 수 있음 | 숫자 표와 좌/우 binding power를 해석해야 함 | minimum precedence의 경계 조건에 주의 |
| assignment | 별도 최저 단계, RHS 재귀·target 검증 명확 | 특수 parselet 필요 | RHS threshold와 lvalue 검증 특례 필요 |
| strict TypeScript | 반환 union과 token narrowing 단순 | callback/테이블 누락 검증 설계 필요 | 반환 union 단순, operator lookup의 undefined 처리 필요 |
| 테스트 | 각 precedence 경계와 statement 함수 테스트가 쉬움 | parselet별 및 조합 테스트 필요 | precedence threshold의 off-by-one 집중 테스트 |
| 교육용 가독성 | EBNF와 일대일 대응 | 알고리즘에 익숙해야 짧은 코드를 이해 | binary 부분은 간결, 전체 grammar와 대응은 덜 직접적 |
| 확장 | 연산자 계층 증가 시 함수 추가 | 연산자 확장에 유리 | binary 연산자 확장에 유리 |

이 프로젝트는 연산자 집합이 작고 고정되어 있으므로 recursive descent 하나를 선택한다. statement는 recursive descent, expression은 Pratt인 혼합 설계를 도입하지 않는다.

### E2. 전체 grammar

다음은 파일 모드의 전체 syntactic grammar다. `{ X }`는 0회 이상, `[ X ]`는 선택이며, 따옴표는 literal token이다. `NUMBER`, `STRING`, `IDENTIFIER`의 lexical 규칙은 C에 정의되어 있다.

```ebnf
program         = { declaration }, EOF ;
declaration     = letDecl | functionDecl | statement ;
letDecl         = "let", IDENTIFIER, "=", expression, ";" ;
functionDecl    = "fn", IDENTIFIER, "(", [ parameters ], ")", block ;
parameters      = IDENTIFIER, { ",", IDENTIFIER } ;
statement       = block | ifStmt | whileStmt | returnStmt | expressionStmt ;
block           = "{", { declaration }, "}" ;
ifStmt          = "if", "(", expression, ")", block,
                  [ "else", (block | ifStmt) ] ;
whileStmt       = "while", "(", expression, ")", block ;
returnStmt      = "return", [ expression ], ";" ;
expressionStmt  = expression, ";" ;
expression      = assignment ;
assignment      = logicalOr, [ "=", assignment ] ;
logicalOr       = logicalAnd, { "||", logicalAnd } ;
logicalAnd      = equality, { "&&", equality } ;
equality        = comparison, { ("==" | "!="), comparison } ;
comparison      = term, { ("<" | "<=" | ">" | ">="), term } ;
term            = factor, { ("+" | "-"), factor } ;
factor          = unary, { ("*" | "/" | "%"), unary } ;
unary           = ("!" | "-" | "+"), unary | postfix ;
postfix         = primary, { callSuffix | indexSuffix } ;
callSuffix      = "(", [ arguments ], ")" ;
arguments       = expression, { ",", expression } ;
indexSuffix     = "[", expression, "]" ;
primary         = NUMBER | STRING | "true" | "false" | "null"
                | IDENTIFIER | "(", expression, ")" | arrayLiteral ;
arrayLiteral    = "[", [ arguments ], "]" ;
```

Grammar 외 정적 제약은 세 가지다. assignment 왼쪽은 Identifier/Index여야 한다. return은 함수 본문 안이어야 한다. 동일 scope 및 매개변수/본문 최상위 선언 이름은 중복되면 안 된다. 이 제약도 Parser가 검사하고 source-aware SyntaxError로 보고한다. 숫자에 바로 식별자 문자가 붙는 `12abc`는 숫자 literal 뒤 잘못된 suffix로 lexer가 SyntaxError를 낸다.

REPL 모드에서만 `expressionStmt`를 마치려는 시점에 실제 EOF이며 그 문장이 Program의 직접 자식인 경우 `;`를 생략할 수 있다. let/return, block 내부, 이전 expression에는 적용하지 않는다. 따라서 `1 2`와 `let a=1`을 자동으로 유효한 프로그램으로 바꾸지 않는다. virtual semicolon token도 만들지 않으며, 생략된 문장 span은 expression의 끝에서 종료한다.

### E3. Precedence와 AST 구성

| 낮음→높음 | 연산자 | 결합 방향 | AST |
|---|---|---|---|
| 1 | `=` | 오른쪽 | Assign(target, value, equalsSpan) |
| 2 | `\|\|` | 왼쪽 | Logical |
| 3 | `&&` | 왼쪽 | Logical |
| 4 | `== !=` | 왼쪽 | Binary |
| 5 | `< <= > >=` | 왼쪽 | Binary |
| 6 | `+ -` | 왼쪽 | Binary |
| 7 | `* / %` | 왼쪽 | Binary |
| 8 | prefix `! - +` | 오른쪽 | Unary |
| 9 | call `()` 및 index `[]` | 왼쪽 postfix 체인 | Call/Index |
| 10 | literal, identifier, `(expr)`, array | primary | 각각의 node |

`a=b=3`은 `Assign(a, Assign(b, 3))`이다. `1-2-3`은 `(1-2)-3`, `f(1)[0](2)`는 `Call(Index(Call(f,1),0),2)`이다. `1<2<3`도 grammar상 가능하지만 `(1<2)<3`이 되어 두 번째 비교에서 TypeError다. Python식 chained comparison으로 바꾸지 않는다.

assignment 함수는 logicalOr를 읽고 `=`가 있으면 왼쪽 target의 유효성을 먼저 검사한다. 잘못된 target이면 `=` 위치에서 바로 SyntaxError를 내며 RHS를 기다리지 않는다. 유효하면 RHS를 assignment로 재귀 파싱한다. 괄호 Group node를 보존하므로 `(a)=1`을 실수로 허용하지 않는다.

postfix는 primary를 한 번 읽고 `(` 또는 `[`가 이어지는 동안 node를 감싸는 반복문으로 구현한다. argument/array 목록은 첫 원소 생략 가능 여부와 comma 뒤 필수 expression을 분리한다. `f(,)`, `f(1,)`, `[1,,2]`, `a[]`는 오류다. `f(1,`처럼 EOF에서 다음 표현식이 필요한 경우만 REPL에서 incomplete가 된다.

Lexer는 `!= == <= >= && ||`를 longest-match로 처리한다. `/`는 다음 문자가 `/`인 경우에만 주석이다. 단독 `&`, `|`, `.`는 SyntaxError다. EOF token은 언제나 정확히 하나이며 `advance()`는 EOF 뒤로 넘어가지 않는다.

### E4. 문맥·진행·자원 제한

함수 본문 진입/이탈 시 function-context depth를 복원한다. if/while/block은 이 문맥을 초기화하지 않으며 nested fn은 별도의 함수 문맥을 연다. duplicate parameter는 두 번째 이름 위치, scope duplicate도 두 번째 선언 이름 위치에 오류를 낸다. 전체 AST 파싱·검증이 성공하기 전 interpreter를 호출하지 않는다.

Program과 block의 반복문은 한 번 반복할 때 token을 소비하거나 성공 반환/오류 중 하나를 반드시 수행해야 한다. 파서 panic-mode recovery는 구현하지 않는다. 진행하지 못한 상태에서 다음 iteration으로 계속하는 catch도 금지한다.

입력 구조를 따라 재귀하는 edge에 nesting counter를 두고 64를 넘기 전에 SyntaxError를 낸다. precedence 계층을 통과하는 고정 호출은 이 counter에 넣지 않는다. 단항 operand, assignment RHS, grouping/배열 요소/호출 인자/인덱스 식, nested block/if-else-if 등의 재귀 edge는 포함한다. binary/postfix 체인의 AST height는 node 생성 시 자식 height의 최댓값+1로 계산하며 128 초과를 거부한다. 긴 왼쪽 결합 식은 parser loop가 안전해도 evaluator에 깊은 AST를 전달할 수 있기 때문이다. parser 자체에서 발생하는 호스트 RangeError는 가장 가까운 현재 token 위치의 구문 자원 제한 오류로 경계 변환한다.

nesting의 시작값은 0이며 해당 재귀 edge 진입 시 1 증가하고 finally로 감소한다. 순차 형제의 횟수는 누적하지 않는다. AST height는 자식 없는 node를 1로 하고 Program/Stmt/Expr의 실제 자식 관계를 모두 포함한다. token/name/parameter metadata 및 direct-declaration 참조 캐시는 별도 자식으로 세지 않는다. root height도 검사하므로 T-SAFE-5의 128/129는 expression만이 아닌 최종 Program height를 기준으로 fixture를 만든다.

## F. Runtime Strategy

### F1. RuntimeValue와 Environment

RuntimeValue의 tag는 `number`, `string`, `boolean`, `null`, `array`, `user-function`, `builtin`이다. primitive payload는 대응 JS primitive다. null은 payload 없는 canonical value로 표현할 수 있다. array는 `elements: RuntimeValue[]`를 가진 객체이고 함수는 identity를 갖는 record다. 함수 tag 두 개는 언어 오류에서 공통 타입 이름 `function`으로 출력한다. JS undefined, NaN, Infinity는 언어 값으로 유입하지 않는다.

Environment는 `parent`와 own `Map<string, BindingCell>`을 갖는다. BindingCell은 `uninitialized` 또는 `initialized(value)` 상태와 mutable 여부, declaration name span을 가진다. uninitialized를 null/undefined 값으로 표현하지 않는다. lookup은 반복문으로 parent를 따라가며 처음 찾은 cell을 반환한다. get/assign은 그 cell의 초기화 및 쓰기 허용 여부를 확인한다. 대입은 새로운 이름을 만들지 않는다.

scope 준비 절차는 다음과 같다.

1. Program/Block의 직접 선언 목록을 얻는다. 중첩 block 안으로 들어가지 않는다.
2. 동일 scope 이름 중복은 parser가 이미 거절했다. persistent global에서는 기존 own 이름과의 충돌을 전부 검사한다. 충돌하면 새 이름을 하나도 예약하지 않고 종료한다.
3. let/fn 이름 모두에 uninitialized cell을 예약한다.
4. fn cell마다 해당 선언 AST와 현재 env 참조를 가진 새 함수 객체를 넣어 초기화한다.
5. source 순서대로 문장을 실행한다. let은 initializer가 성공하면 자신의 예약 cell을 초기화하고 fn declaration은 no-op이다.

function call은 parameter frame을 만들고 인자를 초기화한 뒤, body의 직접 선언을 같은 frame에 준비한다. 일반 BlockStmt는 자식 frame을 만들지만 함수 본문의 outer braces는 추가 frame을 만들지 않는다. 이 규칙으로 매개변수와 본문 최상위 let/fn의 중복을 금지한다. 매 while 반복에는 새 body frame이 생성된다.

핵심 binding 사례:

```text
let a="outer";
{
  fn read(){ return a; }
  // 이 scope의 a는 이미 예약됨. 여기서 read()하면 TDZ 오류.
  let a="inner";
  print(read()); // inner
}
```

동일 scope의 나중 let을 외부 let으로 잘못 연결하지 않는다. 아직 값이 없다는 것은 이름이 없다는 뜻이 아니다. 전역은 persistent 환경이므로 기존 함수가 이후 REPL submission에서 추가된 global을 나중에 읽는 것은 허용한다. 예를 들어 `fn read(){return future;}`를 먼저 제출하고 다음 제출에서 `let future=3;`을 실행한 후 read는 3을 반환한다. 해당 global이 생기기 전 호출하면 undefined-variable 오류다. 다른 scope의 뒤늦은 local 삽입은 scope 준비 규칙으로 차단된다.

### F2. Function, Closure, Builtin

user function은 선언 이름, parameter 목록, body AST, closure env, declaration source를 보유한다. 함수가 capture하는 env는 선언한 scope이며 호출한 scope가 아니다. frame의 생존은 JS GC에 맡긴다. 별도 garbage collector를 구현하지 않는다. Program/AST span은 source를 참조하므로 REPL에서 과거에 정의한 함수의 오류도 원래 source를 표시할 수 있다.

공통 call 경로는 callee를 평가하여 callable tag를 검사하고, 실제 인자 AST 수로 arity를 검사한다. 그 후 인자 식을 왼쪽부터 평가한다. 인자 평가가 실패하면 body/builtin을 실행하지 않는다. user 함수는 depth 검사 후 frame을 만들어 body를 실행하고, builtin은 같은 검증을 거쳐 native implementation을 호출한다. builtin 구현에는 이미 평가된 RuntimeValue 목록, call anchor, output port만 전달한다. builtin이 interpreter나 Environment를 import하지 않는다.

`print`의 arity descriptor는 min=0/max=무제한, `len`은 min=max=1이다. 숫자로만 arity를 표현하여 print를 예외 분기하지 않는다. native callable은 AST나 unchecked JS 값을 반환하지 않고 RuntimeValue를 반환해야 한다. builtin의 타입 오류는 user 함수와 같은 오류 경로로 전달된다.

각 factory 호출의 frame은 독립이다. 같은 frame에서 만든 `inc`와 `get`은 동일 cell을 참조한다. 이를 테스트하려면 두 함수를 배열로 반환할 수 있으므로 객체 기능을 추가할 필요가 없다. 함수와 배열 인자 전달은 값 record 참조 전달이며 mutation은 호출자에서도 관찰된다. 인자 binding 자체를 재대입하는 것은 호출자의 binding을 바꾸지 않는다. 배열 원소 mutation과 변수 재바인딩을 구분한다.

### F3. Return propagation

짧은 타입 모양은 `Completion = Normal | Return(RuntimeValue)`로 확정한다. expression evaluator는 RuntimeValue를, statement executor는 Completion을 반환한다. 오류는 별도 LangError를 throw한다.

| 실행 위치 | completion 처리 |
|---|---|
| ExpressionStmt/LetDecl/FunctionDecl | 성공하면 Normal |
| ReturnStmt | 식을 평가하고 Return(value), 식이 없으면 Return(null) |
| statement list/Block | 문장을 순서대로 실행하다 Return이면 즉시 같은 record 반환 |
| If | 선택한 branch의 completion을 그대로 반환 |
| While | body가 Return이면 즉시 반환. 다음 조건을 평가하지 않음 |
| user function call | body의 Return(value)를 call 결과 value로 소비. Normal은 null |
| Program | Normal만 정상. Return은 parser 불변식 위반으로 내부 오류 |

nested 함수의 return은 그 함수 call 경계에서만 소비한다. catch-all에서 Return을 RuntimeError로 포장하는 코드가 필요하지 않다. 환경을 interpreter의 mutable currentEnv 필드로 교체하기보다 evaluate/execute에 env를 명시 전달한다. call/evaluation depth와 diagnostic call-stack만 mutable context로 두고 `finally`로 복원한다.

### F4. Assignment, Array, Operators

assignment는 reference와 value를 구분한다. Identifier target은 가장 가까운 초기화된 mutable cell을 먼저 구한다. Index target은 base 평가·array 검사·index 평가·정수/범위 검사를 순서대로 하고 `{arrayObject, index}` reference를 기억한다. 그 다음 RHS를 평가하고 기억한 reference에 쓴다. RHS가 같은 변수에 다른 배열을 대입하더라도 이미 계산한 array target은 바뀌지 않는다. target 또는 index를 다시 평가하지 않는다.

배열 literal은 매 평가마다 새 array identity를 만든다. 중첩 배열은 그대로 reference를 보관하며 복사하지 않는다. 순환 배열은 허용하되 equality는 identity만 검사하고 formatter는 현재 traversal path의 Set으로 cycle을 감지한다. 한 번 출력한 객체 전체를 visited 처리하면 `[a,a]`의 두 번째 a를 cycle로 잘못 표시하므로 그렇게 하지 않는다. formatter는 중첩 64단계까지 표시하고 이후 `<max-depth>`를 사용한다.

Binary와 Logical AST를 분리하여 논리 연산이 공통 eager evaluator로 흘러가지 않게 한다. 숫자 연산은 타입 확인 후 연산하며 결과의 finite 여부도 확인한다. 숫자 remainder는 C의 부호 규칙을 따른다. 문자열 연결 이외의 암묵 변환은 없다.

### F5. 호출 깊이, 스택, 호스트 오류

동시 활성 user-call 기본 상한을 **64**로 고정한다. depth=0은 프로그램 실행 중 user function이 없는 상태다. 인자 평가가 끝나고 body에 진입하기 직전에 depth가 64이면 그 call의 `(` 위치에서 `RuntimeError: maximum call depth (64) exceeded`를 낸다. 진입에 성공한 경우에만 증가시키고 모든 정상·오류 경로에서 finally로 감소시킨다. 반환된 호출은 누적 횟수에 포함되지 않는다.

언어 호출 1회는 JS 프레임 1개가 아니다. 일반적인 재귀는 expression 평가, call helper, function body, statement 실행, return 평가 등 여러 프레임을 점유하며 중간 if/block/binary node가 프레임을 더한다. 따라서 1,000 같은 숫자를 임의로 안전하다고 선언하지 않는다. 64는 작은 교육용 예제의 수십 단계 재귀를 허용하는 보수적 설계값이다. 활성 evaluate/execute 총합 **256**을 별도로 제한해 깊은 AST가 결합된 재귀도 방어한다. 이 보조 제한이 먼저 걸리면 `evaluation nesting limit (256) exceeded` 오류를 낸다. call 64 보장은 단순 재귀 기준이며 모든 AST 모양에서 64단계를 보장하지 않는다.

평가 counter는 각 Expr를 평가하는 evaluate 진입과 각 Stmt를 실행하는 execute 진입에서만 증가한다. Program/statement-list 반복 helper, 환경 lookup, call helper, formatter 진입은 이 counter를 추가 증가시키지 않는다. 함수 body와 일반 block의 statement-list 실행은 공통 helper를 사용하며, 함수 body를 별도 BlockStmt로 execute하지 않는 F1 규칙을 유지한다. 이렇게 카운트 단위를 고정한 뒤 활성 256개를 허용하고 257번째 진입 전 오류를 낸다. JS helper 프레임이 이 counter보다 많다는 점은 별도 실측으로 확인한다.

Node/V8의 스택 크기와 최적화 결과를 이 검토만으로 보장할 수 없다. V8 command-line 옵션에는 안정성 보장이 없으므로 `--stack-size`를 키워 해결하거나 `--stack-trace-limit`를 실행 깊이 제한으로 오해하지 않는다. [Node.js 20 CLI: V8 options](https://nodejs.org/download/release/v20.20.0/docs/api/cli.html#v8-options)

다음 구현 세션은 기본 스택의 Node 20과 사용 환경 Node 24에서 실제 compiled evaluator로 깊이 63/64 성공, 65 실패를 별도 process에서 검증한다. 단순 tail-shaped 재귀, 비-tail 재귀, 중첩 if/while 경유 재귀를 구분한다. 실제 실패가 guard보다 먼저 발생하면 helper 프레임 구조부터 줄이고, 불가피하게 한도를 변경할 때는 C/F/SPEC/LIMITATIONS 및 테스트 기대값을 함께 변경하고 측정 근거를 남긴다. 지금은 측정이 수행되지 않았다.

호스트 RangeError는 interpreter call 경계 및 외곽 execute 경계에서 catch하여 `RuntimeError: host runtime limit exceeded`로 변환한다. 가능한 가장 안쪽 call `(` 또는 현재 AST anchor를 붙이고 원래 cause는 내부 진단용으로만 보관한다. 이미 LangError인 것은 다시 포장하지 않는다. RangeError만으로 스택 오버플로 원인을 단정하지 않으므로 메시지는 일반적인 host limit으로 둔다. 다른 unknown 예외는 내부 오류로 상위 adapter에 전달하여 버그를 언어 타입 오류로 숨기지 않는다. parser/lexer 경계의 RangeError는 입력 처리 자원 제한 SyntaxError로 변환한다. 테스트는 guard 실동작과 주입한 RangeError 변환을 따로 검증한다.

## G. Source Location & Error Strategy

### G1. 위치 데이터의 전파

SourceUnit은 unique id, displayName(파일명 또는 `<repl:N>`), 원본 text, 줄 시작 offset 배열을 갖는다. Span은 같은 SourceUnit의 start/end Position을 가진다. Position은 offset, line, column을 모두 보유한다. offset과 column은 UTF-16 code unit 기준이며 column은 1부터 시작한다. tab도 column 하나로 센다. CRLF는 offset 두 칸·line 한 줄이며 CR 단독도 한 줄이다. EOF는 text 길이 위치의 폭 0 span이다. 최종 개행 뒤 EOF는 다음 빈 줄 1열이다.

파일 시작 BOM은 C에 정한 예외대로 offset만 1 소비하고 column은 증가시키지 않는다. 따라서 첫 줄 위치 변환과 표시에서도 선행 BOM 하나를 제외하며, 원본 text와 offset은 유지한다. 이후 줄의 UTF-16 column 규칙은 동일하다.

Token은 kind, 원래 lexeme, optional decoded literal, span을 가진다. 문자열 span은 따옴표까지 포함하고 decoded 문자열 길이를 원본 span 계산에 사용하지 않는다. 모든 AST node는 전체 span을 갖는다. Group node는 양쪽 괄호를 포함하여 원문 범위를 잃지 않는다. statement의 세미콜론도 statement span에 포함한다. source를 복제해 node마다 문자열을 저장하지 않고 동일 SourceUnit 참조를 공유한다.

| AST/오류 | 별도 보존 위치 | 실제 진단 anchor |
|---|---|---|
| Identifier/lookup/TDZ | 이름 token span | 사용한 이름의 첫 글자 |
| Let/Function declaration 중복 | name span | 두 번째 선언 이름 |
| Unary/Binary/Logical | operatorSpan | 연산자 시작 |
| Assign | equalsSpan 및 target span | target undefined/readonly는 이름; target 문법 오류는 `=` |
| Call | openingParenSpan, callee span, 전체 span | non-callable·arity·call-depth·builtin 타입 오류는 `(` |
| Index | openingBracketSpan, index expression span | non-array는 `[`, index 타입/범위는 index 식 시작 |
| Return | keywordSpan | 함수 밖 return의 `return` |
| literal lexer 오류 | token 시작 및 문제 문자 위치 | invalid escape는 backslash, 불법 문자는 그 문자 |
| missing token | current token 또는 EOF | 예상 위치의 current start, EOF면 EOF position |
| runtime 함수 내부 오류 | 원래 body AST의 source/anchor | caller 위치로 덮어쓰지 않음 |

함수 호출 stack은 필요하면 내부 context에 call span들을 유지할 수 있으나 v1 사용자 진단은 오류 발생 지점 한 곳만 표시한다. 모든 statement/expression 진입 때 현재 anchor를 저장하고 finally로 복원해 RangeError 변환의 fallback을 확보한다.

### G2. 오류 계약

내부 class는 `LangSyntaxError`, `LangRuntimeError`, `LangTypeError`다. TypeError는 runtime 계열로 분류하되 public kind는 `TypeError`다. 공통 진단은 `kind`, 안정적 `code`, `message`, `span`을 가진다. Syntax 진단은 REPL용 `incompleteCandidate`와 `expected`를 추가한다. 사용자 입력 문제와 내부 invariant 오류를 구분한다. catch 변수는 unknown에서 narrowing한다.

| code | kind | 메시지 템플릿 |
|---|---|---|
| E_UNDEFINED | RuntimeError | `undefined variable 'name'` |
| E_TDZ | RuntimeError | `variable 'name' accessed before initialization` |
| E_REDECLARE | RuntimeError | `name 'name' is already declared in this scope` |
| E_READONLY | RuntimeError | `cannot assign to read-only binding 'name'` |
| E_NOT_CALLABLE | TypeError | `value of type number is not callable` 등 실제 타입 |
| E_ARITY | RuntimeError | `function 'f' expects 2 arguments but got 1` |
| E_OPERAND | TypeError | `operator '+' cannot be applied to number and string` |
| E_INDEX_TYPE | TypeError | `array index must be an integer number` |
| E_INDEX_RANGE | RuntimeError | `array index 3 out of bounds for length 3` |
| E_INDEX_BASE | TypeError | `cannot index value of type string` 등 실제 타입 |
| E_LEN_TYPE | TypeError | `len expects array or string, got number` |
| E_ZERO_DIVISION | RuntimeError | `division by zero` 또는 `remainder by zero` |
| E_NONFINITE | RuntimeError | `numeric result is not finite` |
| E_CALL_DEPTH | RuntimeError | `maximum call depth (64) exceeded` |
| E_EVAL_DEPTH | RuntimeError | `evaluation nesting limit (256) exceeded` |
| E_HOST_LIMIT | RuntimeError | `host runtime limit exceeded` |
| E_EXPECTED | SyntaxError | `expected ')' but found EOF` 등 token 표기 |
| E_ASSIGN_TARGET | SyntaxError | `invalid assignment target` |
| E_RETURN_CONTEXT | SyntaxError | `return is only allowed inside a function` |
| E_DUPLICATE | SyntaxError | `duplicate declaration 'name'` / `duplicate parameter 'name'` |
| E_INPUT_LIMIT | SyntaxError | `syntax nesting limit (64) exceeded` 또는 `AST depth limit (128) exceeded` |

메시지에 실제 이름·숫자·타입을 넣는다. EOF는 `EOF`, 다른 token은 원 lexeme를 single quote로 감싼다. 추가 lexer 오류 메시지도 구현 전에 SPEC의 오류 표에 고정한다. 테스트는 kind/code/정확한 line/column과 대표 메시지 전체를 검사하며 메시지 전체를 느슨한 substring 하나로 대체하지 않는다.

진단 formatter의 형식은 다음으로 고정한다.

```text
TypeError at demo.lang:1:11: operator '+' cannot be applied to number and string
let x = 1 + "a";
          ^
```

위 예시는 J의 정확한 위치 fixture와 동일하다. formatter는 source line을 그대로 넣되 tab을 space 1개로 치환하고, 다음 줄에 column-1개의 space와 caret 하나를 둔다. wide glyph·emoji의 화면 폭까지 정렬하는 기능은 미지원이며 숫자 column을 기준으로 삼는다. ANSI 색, host stack, 절대경로 강제 노출은 없다. formatter 결과 자체는 끝 LF가 없으며 CLI/REPL error sink가 LF 하나를 붙인다. source가 없는 파일 I/O 실패는 억지 line/column을 만들지 않고 `IOError: ...`와 exit 2를 사용한다.

### G3. 복구 정책

Script: lex/parse 단계에서 첫 오류를 반환하고 실행하지 않는다. Runtime: 첫 오류가 전파되면 나머지 문장 실행을 중단한다. REPL: parser recovery로 AST 일부를 실행하지 않고 현재 buffer를 폐기하거나 추가 입력을 기다린다. 오류 메시지 문자열에서 `EOF`를 검색하여 incomplete를 추측하지 않는다.

## H. REPL Strategy

### H1. Core와 adapter

ReplCore는 Session(global env, interpreter context, output port), pending buffer, submission sequence를 소유한다. 입력은 `submitLine`, `endInput`, `cancelInput`에 대응하는 이벤트로 받는다. 출력은 주입한 writeOutput/writeDiagnostic/showPrompt로 보낸다. readline/stdin/stdout/process는 CLI adapter에만 둔다. 테스트는 문자열 이벤트 목록과 수집형 sink만으로 세션을 구동할 수 있어야 한다.

prompt는 기본 `> `, continuation은 `... `다. core는 prompt 요청도 port로 내보내며 prompt text가 print 결과 문자열과 섞이지 않도록 테스트 수집 channel을 나눈다. CLI adapter는 TTY에서 prompt를 표시하고 piped stdin에서는 표시하지 않는다. print와 expression echo는 output channel, 언어 오류는 diagnostic channel이다.

### H2. 입력 완료 판정

입력 줄은 line ending을 제거해 전달받고, pending line들을 LF로 연결한다. 마지막 입력 줄 뒤에 가상의 LF를 붙이지 않는다. 매 submit마다 전체 buffer를 재lex/parse하지만 실행은 complete일 때 단 한 번이다.

| 상태 | 판정 | 행동 |
|---|---|---|
| complete | Program parse 성공, 마지막 expression에 한정된 EOF 종결 특례 적용 | scope 준비 후 전체 실행, 최상위 expression 결과 echo, buffer 비움 |
| incomplete | 유효한 prefix가 필수 operand/구분자/block 등을 기다리다 EOF에 도달 | continuation prompt, buffer 보존, 실행 없음 |
| invalid | 비EOF에서 불가능한 token, 정적 제약 위반, 입력 제한 초과, lexer 오류 | 진단 출력, buffer 비움, global 유지, 기본 prompt |

완료되지 않은 큰따옴표 문자열은 예외적으로 항상 invalid다. 이 언어는 raw newline 문자열을 허용하지 않기 때문에 다음 줄을 받아도 고칠 수 없다. `"abc`를 입력하면 그 줄에서 unterminated string SyntaxError를 낸다. 열린 괄호 수만 세는 판정은 사용하지 않는다. 문자열·주석에 있는 bracket은 문법 token이 아니며, 괄호가 없어도 `1+`는 incomplete이기 때문이다.

| 입력 | 판정과 결과 |
|---|---|
| 빈 줄, `// note` | complete empty Program, echo 없음 |
| `1+2` | complete, `3\n` |
| `let x=1` | incomplete, `;` 입력을 기다림 |
| `1+` | incomplete, 다음 줄 `2`를 받으면 3 출력 |
| `fn add(a,` | incomplete, 매개변수와 본문을 기다림 |
| `fn f(){` | incomplete, 닫는 block까지 기다림 |
| `[1,` | incomplete, 원소를 기다림 |
| `[1,]` / `f(1,)` | invalid, trailing comma 금지 |
| `let x=;` / `1 2` | invalid, 다음 줄로 고칠 수 없음 |
| `1+2 =` | invalid, target 검증은 RHS EOF 대기보다 우선 |
| `if(true){ print(1); }` | complete, 1 출력 |
| `if(true){ print(1); } else` | incomplete, else block을 기다림 |
| `else { print(2); }` 단독 | invalid |
| `print("[");` | complete, `[` 출력, bracket count로 기다리지 않음 |

if의 닫는 `}`까지 입력한 시점에 유효한 프로그램이면 즉시 제출된다. optional else를 기다리기 위한 숨은 lookahead나 빈 줄 제출 규칙은 없다. multi-line if/else를 입력하려면 `} else {`를 같은 입력 줄에 두거나 `} else`까지 같은 줄에 입력한다. 이 제한은 README에 명시한다.

### H3. Persistent state와 실패

각 complete submission은 `<repl:1>`, `<repl:2>` 등 고유 SourceUnit을 갖고 global은 재사용한다. incomplete 상태의 재parse는 같은 submission id를 사용한다. 오류로 폐기·취소한 submission도 id를 소비하여 나중 source와 섞이지 않게 한다. 성공 AST를 실행하기 전까지 global에 이름을 예약하지 않는다.

문법 오류면 아무 statement도 실행하지 않는다. 기존 global과 이름 충돌이면 scope preflight에서 전체 submission을 실행하지 않는다. runtime 오류면 이미 출력·변경·초기화된 binding과 아직 uninitialized인 예약 binding 모두 유지한다. 예를 들어 `let a=1; let b=1/0;` 이후 a는 1, b는 TDZ다. `b=2;`와 `let b=2;`로 복구하지 못한다. 이는 초기화 실패를 null로 바꾸거나 closure가 참조하는 binding을 삭제하는 것보다 일관된 규칙이며, README에 분명히 적는다. REPL 자체는 다음 정상 입력을 계속 받는다.

최상위 ExpressionStmt를 실행할 때 그 값이 null이 아니면 echo한다. 선언과 block/if/while 내부 expression은 echo하지 않는다. 여러 최상위 expression은 순서대로 각각 echo하며 `1; 2;`는 두 줄이다. print는 자체 output 후 null을 반환하므로 중복 echo가 없다. script runner에서는 echo hook을 연결하지 않는다.

EOF에서 buffer가 비었으면 정상 종료한다. incomplete buffer가 남아 있으면 원래 EOF 위치의 SyntaxError를 한 번 출력하고 실행 없이 exit 1이다. 입력 대기 중 Ctrl+C는 buffer를 폐기하고 기본 prompt로 돌아간다. 동기 실행 중 무한 while은 입력 이벤트로 취소할 수 없으므로 adapter가 이를 처리한다고 약속하지 않는다. OS의 process interrupt로 세션이 종료될 수 있으며 이는 LIMITATIONS에 기록한다. worker 기반 실행 취소 기능은 현재 범위에 추가하지 않는다.

## I. Risk Register

모든 대응 테스트 ID는 J에서 입력과 기대 결과를 정의한다. 위험은 구현 여부와 별개인 사전 예상이며, 아직 발견된 실제 버그를 의미하지 않는다.

| ID | Risk | 발생 이유 | 영향 모듈 | 대응 테스트 | 예방 전략 |
|---|---|---|---|---|---|
| R01 | precedence 오류 | parse 함수 순서 또는 operator 묶음 실수 | Parser, Interpreter | T-PREC-1, T-PREC-2 | 표와 grammar 일대일 대응, 계산 결과와 AST 둘 다 검증 |
| R02 | assignment 좌결합 | binary 공통 loop에 `=` 포함 | Parser | T-ASG-1 | 별도 assignment 함수에서 RHS 재귀 |
| R03 | 잘못된 lvalue 허용 | 모든 Expr를 target 타입으로 저장 | AST, Parser | T-ASG-2 | target union 제한, Group 유지 |
| R04 | target 중복 평가 | read와 write helper가 index를 각각 실행 | Interpreter, Arrays | T-ASG-3, T-ASG-4 | reference를 한 번 계산·보관 |
| R05 | 동적 scope처럼 동작 | caller env를 함수 frame parent로 사용 | Function, Environment | T-SCOPE-1 | declaration env capture, call parent 고정 |
| R06 | closure 값 복사로 mutation 유실 | capture 시 env Map/value 복제 | Closure | T-CLOS-1, T-CLOS-3 | cell 참조 공유 |
| R07 | 독립 closure state 합쳐짐 | factory frame을 캐시·재사용 | Function, Closure | T-CLOS-2 | 호출마다 fresh frame |
| R08 | 자기 재귀 binding 누락 | 함수 객체 생성 후 env가 분리됨 | Function, Environment | T-REC-1 | 이름 예약 후 같은 env에 함수 초기화 |
| R09 | 상호 재귀 또는 선언 전 호출 실패 | 함수 선언문 실행 때만 바인딩 | Interpreter | T-REC-2 | scope entry에서 직접 함수 초기화 |
| R10 | 나중 local이 closure lookup을 바꿈 | 선언을 순차 Map 삽입하면서 부모로 fallback | Environment, Closure | T-SCOPE-3 | let/fn 사전 예약, TDZ를 부모 검색과 분리 |
| R11 | shadowing 또는 parameter 충돌 오류 | 부모까지 중복 검사하거나 body frame을 하나 더 만듦 | Parser, Environment | T-SCOPE-2, T-SCOPE-4 | own-only 재선언 검사, parameter/body 같은 scope |
| R12 | return이 while 밖으로 안 나감 | loop가 body completion을 버림 | Interpreter | T-RET-1, T-RET-2 | 비Normal 즉시 전파 |
| R13 | return을 runtime 오류로 출력 | return sentinel을 catch-all로 감쌈 | Interpreter, Errors | T-RET-3 | completion과 throw 분리 |
| R14 | nested fn return이 외부 함수를 종료 | 가장 바깥 호출에서 completion 소비 | Function | T-RET-4 | 각 call 경계에서만 소비 |
| R15 | short-circuit 미작동 | binary helper가 양쪽을 미리 평가 | Interpreter | T-LOG-1, T-LOG-2 | Logical 별도 node/분기 |
| R16 | 논리 결과를 boolean으로 강제 | JS truthiness 또는 비교 helper 오용 | Runtime values | T-LOG-3, T-VAL-1 | 전용 truthiness 및 operand 반환 |
| R17 | 배열 alias/mutation 손실 | 대입·인자 전달 때 deep/shallow copy | Arrays, Function | T-ARR-1, T-ARR-2 | reference identity 유지 |
| R18 | nested array를 잘못 flatten | 배열 변환 helper 재사용 | Arrays | T-ARR-3, T-ARR-4 | 각 원소 RuntimeValue 그대로 보관 |
| R19 | invalid index가 JS property가 됨 | host array[index] 직접 사용 | Arrays | T-IDX-1, T-IDX-2 | 타입·정수·범위 검사 후 접근 |
| R20 | 깊은 equality/출력에서 cycle crash | 배열 deep equals 또는 무방비 stringify | Runtime values, Formatter | T-VAL-2, T-FMT-1 | identity equality, path Set·깊이 상한 |
| R21 | arity·부작용 순서 불일치 | 인자부터 평가하거나 부족값 undefined 허용 | Function, Builtins | T-CALL-1, T-CALL-2 | 공통 call 파이프라인 |
| R22 | builtin만 별도 의미론 | print/len을 parser 또는 이름으로 특수 처리 | Builtins, Interpreter | T-BI-1, T-BI-2 | callable record와 공통 dispatch |
| R23 | source 위치 손실 | token을 값으로만 변환, group 제거 | AST, Parser | T-LOC-1, T-LOC-2 | full span/anchor 모두 필수 필드 |
| R24 | runtime 오류를 caller 위치로 덮음 | catch마다 새 오류 생성 | Errors, Function | T-LOC-3, T-REPL-6 | LangError 보존, 원래 SourceUnit 유지 |
| R25 | EOF·CRLF off-by-one | 줄 끝 처리 이중 증가, EOF 마지막 token 재사용 | Lexer, Errors | T-LEX-2, T-LOC-4 | half-open span과 명시 EOF |
| R26 | parser infinite loop | 오류 후 advance 없이 반복 | Parser | T-PARSE-1, T-SAFE-3 | 성공/소비/throw 불변식, child deadline |
| R27 | malformed argument list 허용 | comma 뒤 expression 선택 처리 | Parser | T-PARSE-2 | 목록 공통 helper와 필수 원소 구분 |
| R28 | REPL 입력마다 global 초기화 | runScript helper가 매번 env 생성 | Runner, REPL | T-REPL-1, T-REPL-2 | Session 생성과 execute 분리 |
| R29 | incomplete 입력을 일부 실행·반복 실행 | 줄별 실행 또는 parse 재시도에서 실행 | REPL | T-REPL-3, T-REPL-4 | full parse 성공 뒤 한 번만 실행 |
| R30 | REPL 테스트가 stdin/stdout에 묶임 | core에서 readline/console import | REPL | T-REPL-5 | port 주입, adapter 분리 |
| R31 | strict narrowing 우회 | optional field 남발, any/assertion 사용 | 전 모듈 | T-STATIC-1, T-STATIC-2 | union/exhaustiveness, check:any 게이트 |
| R32 | 테스트가 구현 세부사항에 결합 | env Map·함수 호출 횟수 snapshot | Tests | T-CONTRACT-1 | 공개 동작·span·오류 code 중심, 내부 구조 변경에도 동작 검증 유지 |
| R33 | 재귀가 host stack overflow로 process crash | 언어 깊이를 JS 프레임 수로 착각 | Interpreter, CLI | T-SAFE-1, T-SAFE-2 | 64/256 이중 guard, finally, RangeError 변환 |
| R34 | 무한 loop 테스트가 suite를 정지 | 동기 loop에서 Vitest timer가 실행되지 않음 | Test harness | T-SAFE-3 | 별도 process와 부모 deadline/kill |
| R35 | runtime 오류 후 depth/env 오염 | 감소·복원이 정상 경로에만 있음 | Interpreter, REPL | T-SAFE-4, T-REPL-2 | finally와 명시 env 인자 |
| R36 | expected가 실제 출력 오류를 가림 | trim, 예제 일부 hardcoded list, 누락 파일 무시 | Integration | T-EX-1, T-EX-2 | 디렉터리 전체 순회·pair 검증·정확 비교 |
| R37 | 숫자 NaN/Infinity·coercion 유입 | JS 연산 결과를 무검증 반환 | Runtime values | T-NUM-1, T-NUM-2 | finite invariant, 명시적 타입 행렬 |
| R38 | 실패한 REPL submission의 binding 처리 불일치 | 임의 rollback 또는 TDZ를 null로 치환 | Environment, REPL | T-REPL-7 | 준비 preflight와 실행 실패 효과를 구분 |
| R39 | 깊은 식은 call guard를 우회 | 함수 없는 AST 재귀, 긴 binary 체인 | Parser, Interpreter | T-SAFE-5 | syntax/AST/evaluation depth 각각 제한 |
| R40 | 문서·실행 명령·중단 기록 불일치 | 마지막에 문서 일괄 작성, 커밋 단위 불분명 | Docs, Scripts | T-DOC-1, T-CLI-1 | 단계별 문서 동기화·PROGRESS 기록·README 명령 smoke |

## J. Test Strategy

### J1. 테스트 원칙과 분류

아래는 다음 세션에서 작성할 테스트 명세이며 이번 세션에는 테스트 소스나 실행 결과가 없다. 각 ID가 여러 parameterized case를 포함할 수 있으므로 ID 수를 실제 테스트 개수로 보고하지 않는다. 최소 하나의 regression 테스트가 각 R 항목에 연결되어야 한다.

테스트는 기능 명세에서 기대값을 도출한다. lexer의 token 종류/lexeme/span, parser의 핵심 tree shape, runtime의 값/출력/오류를 나눠 관찰한다. parser AST 테스트만 통과한다고 precedence의 end-to-end 계산까지 맞았다고 간주하지 않는다. snapshot은 제한된 진단 형식에만 쓰고 실행 결과를 자동으로 정답 파일에 덮어쓰지 않는다.

| 모듈 | happy path | boundary | invalid input | regression | integration |
|---|---|---|---|---|---|
| Lexer | 모든 literal·keyword·operator·주석 | 빈 입력, 최종 개행, EOF, CRLF, Unicode string | 불법 문자, escape, 숫자 suffix, raw newline | T-LEX-1/2의 longest-match와 위치 | Parser에 실제 token 전달 |
| Parser | 모든 declaration/statement/expression | 빈 block/array/call, 64 nesting 경계 | trailing comma, target, top-level return | T-PREC, T-ASG, T-PARSE | 실제 Lexer→AST→계산 |
| AST | tag·자식 모양·full span | Group, empty Program, postfix chain | 구조적으로 불가능한 target은 compile-time 거절 | T-LOC-1/2 | source 보존한 runtime 오류 |
| Runtime values | 산술·truthiness·equality | -0, 빈 문자열/배열, cycle | unsupported 타입 조합·비유한 결과 | T-VAL, T-NUM | print/조건문/배열 함께 실행 |
| Environment | define/init/get/assign chain | parent 없음, own shadow | undefined, TDZ, readonly, redeclare | T-SCOPE | 함수 및 REPL에서 공유 |
| Interpreter | let/if/while/assignment | 미선택 branch, 0회 loop | 타입 오류 후 중단 | T-LOG, T-RET | 예제 전체 |
| Function | 인자·반환·first-class | 0개 인자, implicit null | arity, non-callable, duplicate params | T-CALL, T-RET-4 | chained call/배열 함수 |
| Closure | outer 읽기·mutation | outer 종료 후 호출 | 초기화 전 capture 읽기 | T-CLOS, T-SCOPE-3 | counter/nested closures |
| Recursion | factorial, even/odd | base case, depth 63/64/65 | 무한 재귀 제한 | T-REC, T-SAFE-1/4 | Fibonacci·recursive array |
| Builtins | print 모든 값, len array/string | print 0개, len 빈 값/emoji | 잘못된 len 타입·arity | T-BI, T-FMT | 주입 output, REPL echo |
| Arrays | read/write/alias | empty, first/last, -0 | 음수·소수·길이와 같은 index | T-ARR, T-IDX | traversal/sort/nested |
| Error system | kind/code/message/span | EOF, 여러 줄, 과거 REPL source | unknown host error/RangeError | T-LOC, T-SAFE-2 | CLI stderr/exit code |
| Script runner | UTF-8 파일 실행 | 출력 없음, 경로 공백 | 읽기 실패·syntax/runtime 실패 | T-CLI, T-EX | compiled Node 실행 |
| REPL | expression/statement 입력 | 빈 줄, multiline, EOF, Ctrl+C | malformed input·runtime 실패 | T-REPL-1~7 | adapter stdin/stdout smoke |

### J2. 구체적 입력과 oracle

아래 code fragment는 테스트 데이터 설계용 Mini-Lang 예시이며 interpreter 구현 코드가 아니다. `→` 오른쪽은 expression value 또는 설명한 출력이다. script에서 값만 검사하는 경우 테스트 harness가 평가 결과를 관찰하거나 print로 감싼다. 표에서 문자열 literal 바깥의 `\n`, `\r\n`은 fixture의 실제 줄바꿈을 가리킨다. 문자열 literal 안에서는 C의 escape 문법 그대로 해석한다. 입력들이 여러 case로 나열된 행은 명시적으로 순차 session이라고 쓴 경우를 제외하고 각각 독립 실행하며, 필요한 공통 선언은 각 fixture에 넣는다.

| ID | 입력·행동 | 기대 결과 |
|---|---|---|
| T-LEX-1 | `let a=12.5; // hi` 다음 줄 `a!=0 && a<=20;`; 문자열 `"a\\n"`와 `"a\n"` 구별 | keyword/number/두 글자 operator 정확, 주석 토큰 없음, escape와 원본 lexeme 보존. 단독 `&`, `@`, `12abc`, `"\q"`는 SyntaxError |
| T-LEX-2 | 빈 source, `x;\n`, `let x=1;\r\nprint(x);`, BOM+`x;`, `"😀";` | EOF 각각 1:1·2:1, print 2:1; BOM 이후 x 1:1/offset1, 문자열 end와 UTF-16 offset 일치 |
| T-PREC-1 | `1+2*3`, `(1+2)*3`, `10-3-2`, `8/2*2` | 각각 7, 9, 5, 8. 해당 AST 자식 관계도 검사 |
| T-PREC-2 | `1+2<4==true`, `true \|\| false && false`, `-2*3`, `!false==true`, `1<2<3` | true, true, -6, true, 마지막은 두 번째 `<`의 TypeError |
| T-ASG-1 | `let a=0; let b=0; print(a=b=3,a,b);` 및 `let c=[0]; print(a=c[0]=8);` | `3 3 3\n`, `8\n`; Assign(a,Assign(b,3)) |
| T-ASG-2 | `1=2;`, `(a)=1;`, `f()=2;`, `a+b=3;`, `1+2 =` | 모두 `=` 위치 SyntaxError, 마지막도 incomplete 아님 |
| T-ASG-3 | `let a=[0]; let i=0; fn idx(){i=i+1;return 0;} a[idx()]=(i=i+10); print(i,a[0]);` | `11 11\n`, index 1회 평가 |
| T-ASG-4 | `let a=[0]; let old=a; a[0]=(a=[9]); print(old[0]==a,old==a);` | `true false\n`. `a[9]=print(1);`은 범위 오류, 출력 없음 |
| T-SCOPE-1 | `let x=1; fn f(){return x;} fn g(){let x=2;return f();} print(g());` | `1\n`, lexical scoping |
| T-SCOPE-2 | `let x=1; {let x=2; x=3;} print(x);` 및 `{x=4;} print(x);` | 첫 출력 1, 다음 출력 4. nearest binding만 갱신 |
| T-SCOPE-3 | `let a="outer"; {fn f(){return a;} print(f()); let a="inner";}`; print를 let 뒤로 이동한 별도 case | 앞 case E_TDZ/출력 없음, 뒤 case `inner\n`; 외부 binding으로 fallback 금지 |
| T-SCOPE-4 | `let x=1; let x=2;`, `fn f(a,a){}`, `fn f(a){let a=1;}`, `fn f(a){{let a=1;}return a;}` | 앞 세 case SyntaxError, 마지막은 허용. `let x=x;`는 RuntimeError TDZ |
| T-CLOS-1 | `fn make(){let n=0;fn inc(){n=n+1;return n;}return inc;} let c=make(); print(c(),c());` | `1 2\n`, make 반환 후 state 유지 |
| T-CLOS-2 | 같은 make 정의 후 `let a=make();let b=make();print(a(),a(),b(),a(),b());` | `1 2 1 3 2\n` |
| T-CLOS-3 | factory에서 n을 공유하는 inc/get을 `[inc,get]`으로 반환. inc 두 번 뒤 get, 다른 factory get 호출 | 각각 2와 0. sibling 공유·factory 독립 모두 확인 |
| T-REC-1 | factorial(0), factorial(5), fibonacci(0), fibonacci(1), fibonacci(6) | 1, 120, 0, 1, 8 |
| T-REC-2 | 같은 block의 even/odd가 서로 호출하고 선언문 앞에서 even(10) 실행 | true. 함수 선언문 앞 `print(f()); fn f(){return 3;}`도 3 |
| T-RET-1 | `fn f(){while(true){if(true){return 7;}}print(99);} print(f());` | `7\n`, 99 미출력, child process timeout 아래 실행 |
| T-RET-2 | `fn f(){let i=0;while(i<3){i=i+1;if(i==2){{return i;}}}return 9;}print(f());` | `2\n`, nested block→if→while→function 전파 |
| T-RET-3 | `fn f(){return;} fn g(){} print(f(),g());` 및 top-level nested block return | `null null\n`, 정상 return은 diagnostic 없음; top-level은 SyntaxError |
| T-RET-4 | `fn outer(){fn inner(){return 2;}inner();return 3;} print(outer());` | `3\n` |
| T-LOG-1 | `false && missing; true \|\| missing; null && (1/0);` | 오류 없음, RHS 미평가 |
| T-LOG-2 | `let n=0; false&&(n=1);true\|\|(n=2);true&&(n=3);false\|\|(n=4);print(n);` | `4\n`. 별도 함수 RHS 출력 횟수도 생략/실행 검증 |
| T-LOG-3 | `null\|\|"x"`, `0&&9`, `""\|\|5`, `[]&&7` | `"x"`, 9, `""`, 7; 결과 tag까지 확인 |
| T-VAL-1 | false/null/0/빈 string/빈 array/function을 if·unary !에 각각 적용 | false/null만 falsy, `!0` false. `1=="1"`, `null==false` false |
| T-VAL-2 | `let a=[];let b=a;print(a==b,a==[],0==-0);fn f(){}let g=f;print(f==g,f==len);` | `true false true\ntrue false\n` |
| T-ARR-1 | `let a=[1,2];let b=a;b[0]=9;print(a[0],len(a));` | `9 2\n` |
| T-ARR-2 | `fn set(a){a[0]=7;}let a=[1];set(a);print(a[0]);` | `7\n`; 인자 참조 공유 |
| T-ARR-3 | `let a=[[1,2],[3]];a[0][1]=9;print(a);` | `[[1, 9], [3]]\n` |
| T-ARR-4 | `let row=[0];let a=[row,row];a[1][0]=5;print(a[0][0]);` | `5\n`; 같은 row를 공유 |
| T-IDX-1 | `let a=[10,20];` 후 `a[0]`, `a[1]`, `a[-0]`, `a[-1]`, `a[2]`, `[][0]` 별도 case | 10,20,10, 이후 세 개 E_INDEX_RANGE. 쓰기도 같은 경계 |
| T-IDX-2 | `a[0.5]`, `a["0"]`, `a[true]`, `a[null]`, `"abc"[0]`, `1[print(9)]` | 앞 네 개 E_INDEX_TYPE, 뒤 두 개 E_INDEX_BASE. 마지막 출력 없음 |
| T-CALL-1 | `fn f(a){return a;} f(); f(1,2);`는 각 별도 실행. `1()` 별도 실행 | E_ARITY 두 건, E_NOT_CALLABLE 한 건, 각각 call `(` 위치 |
| T-CALL-2 | `fn f(a){return a;} f(print(1),print(2));`; 정상 두 인자 함수에 출력 함수 인자 전달 | arity 실패 case 출력 없음. 정상 case 인자 출력 순서 1→2 |
| T-CALL-3 | `fn make(x){fn add(y){return x+y;}return add;} print(make(1)(2));` 및 `let a=[make(3)];print(a[0](4));` 및 배열 반환 함수 `f(1)[0]` | 3,7,배열의 첫 값. postfix AST와 실행 결과 일치 |
| T-BI-1 | print 0개, print(1,"x",null), len([]), len(""), len("😀"), len(1), len(), len([],[]) | 빈 LF; `1 x null\n`; 0,0,2; E_LEN_TYPE; E_ARITY 두 건 |
| T-BI-2 | `let p=print;p(1);` 및 `let print=3; print;` 및 별도 session `print=3;` | 출력 1, shadow된 값 3, E_READONLY. `print==p` true |
| T-FMT-1 | `let a=[null];a[0]=a;print(a);` 및 `let b=[1];print([b,b]);`, 65단계 중첩 배열을 유한 loop로 구성 | `[<cycle>]\n`, `[[1], [1]]\n`, depth 65는 `<max-depth>` 표시·crash 없음 |
| T-NUM-1 | `5/2`, `-5%2`, `1/0`, `1%0`, `"a"+"b"`, `1+"a"`, `"a"<"b"`, `-true` | 2.5,-1,RuntimeError 두 건,`"ab"`,TypeError 세 건 |
| T-NUM-2 | 유한 큰 literal 두 개의 곱으로 overflow, 400자리 숫자 literal, `0/0`, `-0` 출력 | E_NONFINITE, SyntaxError, zero division, `0\n`. NaN/Infinity RuntimeValue 없음 |
| T-PARSE-1 | `}`, `fn f(`, `let x =`, `while(true)`, 열린 block EOF, 긴 잘못된 token 목록 | invalid/incomplete 계약대로 유한 시간에 반환. script에서는 모두 SyntaxError |
| T-PARSE-2 | `f(,)`, `f(1,)`, `f(1 2)`, `[1,,2]`, `[1,]`, `a[]`; 별도 `f(1,` | 앞 여섯 invalid, 마지막 REPL incomplete |
| T-LOC-1 | `1 + 2 * 3;` | Binary '+' anchor 1:3, '*' 1:7, expression span offset [0,9), statement [0,10) |
| T-LOC-2 | `(f(1))[0];` | Group span [0,6), inner Call [1,5)/'(' 1:3, outer Index [0,9)/'[' 1:7, index literal 1:8 |
| T-LOC-3 | `let x=0;\nmissing;`, `fn f(){\n  return 1 + "x";\n}\nf();` | undefined 2:1, operand error는 함수 정의 source의 2:12, caller 4행으로 덮지 않음 |
| T-LOC-4 | `let x =` EOF; `let a=[1];\na[2];`; `1();`; `len(1);`; `let x = 1 + "a";` | EOF 1:8, 범위 오류 2:3, non-callable 1:2, builtin type 1:4, '+' 오류 1:11. formatter message와 caret 검사 |
| T-REPL-1 | 순차 입력 `let x=1;` → `x=x+1` → `x` | 출력 2,2; global 유지, declaration echo 없음 |
| T-REPL-2 | counter 선언 → c 생성 → c() → missing → c() → 2+2 | 1, 오류,2,4. session·captured state·실행 context 유지 |
| T-REPL-3 | `let n=0;` 후 `fn f(){` → `n=n+1;` → `return n;` → `}` → `f()` | fn 정의 중 n 변화·출력 없음, f 호출 한 번에 1 |
| T-REPL-4 | `print(1); fn f(){` → `}`; 별도 `print(1); let x=;`; H의 모든 완료 판정 표 | 첫 case 완성 시에만 1 한 번, 둘째 출력 없음. `} else {` 동작과 독립 else 오류 검증 |
| T-REPL-5 | fake ports로 blank→expression→runtime error→정상 입력→EOF, continuation 취소·불완전 EOF | prompt `> `/`... ` 이벤트, echo/diagnostic channel 분리, process 접근 없이 테스트 가능 |
| T-REPL-6 | submission 1에서 오류를 포함한 함수 정의, submission 2에서 호출 | 진단 displayName `<repl:1>`, 정의 본문 line/column. prompt/현재 입력 위치로 오염 없음 |
| T-REPL-7 | `let a=1;let b=1/0;` 이후 a, b, `b=2;`, `let b=2;`; 별도 `let z=0;` 후 `let fresh=1;let z=2;` | a 유지, b TDZ, 대입 TDZ, 재선언 오류. duplicate preflight case에서는 fresh가 전혀 생기지 않음 |
| T-SAFE-1 | child process에서 f(n)이 n=0에 반환하고 아니면 f(n-1)만 반환. f(62)/f(63)/f(64) 별도 실행 | user depth 63/64는 정상 종료 code 0, 65는 E_CALL_DEPTH와 종료 code 1. host crash/RangeError 노출 없음 |
| T-SAFE-2 | 테스트 전용 injected native callable이 RangeError를 throw, 별도 Error도 throw | RangeError는 call 위치 E_HOST_LIMIT, 일반 Error는 내부 오류로 보존. 함수 내부 기존 LangTypeError도 원위치 유지 |
| T-SAFE-3 | 의도적 `while(true){}`로 watchdog 자체 검증; 별도로 guard를 적용한 무한 재귀 입력과 malformed parser case를 독립 child에서 실행 | watchdog 자체 case만 deadline 종료가 기대 결과다. 재귀·parser case는 제한 시간 내 각각 언어 오류로 종료해야 하고, timeout이면 regression 실패다. 모든 경로의 teardown이 child를 남기지 않음 |
| T-SAFE-4 | depth 오류 후 같은 session에서 정상 작은 재귀 두 번, body 타입 오류 후 정상 call | 카운터가 0으로 복원, 정상 결과 동일. non-tail 재귀/중첩 control flow도 controlled error 또는 정상 반환 |
| T-SAFE-5 | 입력 nesting 64/65, 긴 binary·postfix AST height 128/129, 충분히 깊은 재귀+식으로 eval 256 초과 | 정의한 경계까지 parse, 그 다음 SyntaxError; 평가 중첩은 E_EVAL_DEPTH, host crash 없음 |
| T-STATIC-1 | `npm run typecheck`, `npm run check:any`; scanner의 임시 fixture `let x:any`와 comment/string의 any | 실제 src는 모두 통과. explicit AnyKeyword는 실패, comment/string은 통과. alias `type X=any`도 검출 |
| T-STATIC-2 | RuntimeValue/AST switch 누락을 type fixture에서 검증, caught unknown narrowing, out-of-range token 접근 검토 | typecheck가 누락 variant를 탐지, unchecked cast로 숨기지 않음 |
| T-CONTRACT-1 | Environment의 공개 declare/init/get/assign 계약 테스트와 별도 interpreter lexical/closure 테스트를 동일 oracle로 수행 | internal Map 모양·frame 객체 개수 검사 없이 값·오류·출력이 일치 |
| T-EX-1 | examples 전체 discover, 양방향 stem 매칭, 최소 15개 확인, 각 fresh session 실행 | 모든 stdout 일치, stderr 없음. 예제를 새로 추가하면 목록 수정 없이 실행 |
| T-EX-2 | harness 임시 fixture에서 expected 누락/고아/끝 LF 누락/여분 공백/CRLF·LF 차이 | 앞 네 가지는 실패, CRLF·LF만 같다고 처리, 빈 출력은 empty file만 성공 |
| T-CLI-1 | 빌드 후 정상 파일·syntax 오류·runtime 오류·없는 파일·잘못된 인자 수·공백 경로 실행 | exit 0/1/1/2/2/0, stdout/stderr 정확. script expression은 echo 없음 |
| T-DOC-1 | README의 install/typecheck/test/run/repl 명령 smoke, GRAMMAR production별 Parser 사례, PROGRESS 단계 대조 | 명령과 grammar가 실제 동작과 일치, 완료되지 않은 단계가 완료로 표시되지 않음 |

closure 외부 상태, 독립 closure, nested array, precedence, assignment, scope/shadowing, nested return, short-circuit, error 위치, REPL persistent state는 위 표에서 각각 복수 case로 검증한다. 이는 단일 대표 예제가 우연히 통과하는 것을 막기 위한 최소 구성이다.

### J3. 예제 15쌍의 고정 계획

모든 예제는 Mini-Lang 자체 코드로 작성한다. 표의 expected에서 `\n`은 실제 파일의 LF를 뜻하며 두 글자 escape를 저장하지 않는다. 각 예제는 별도 global과 수집형 output port에서 실행한다.

| 파일 stem | 검증 내용 | expected 전체 출력 |
|---|---|---|
| `01-hello-world` | print string | `Hello, World!\n` |
| `02-variables-arithmetic` | 변수·산술 precedence | `14\n` (2+3*4) |
| `03-conditionals` | if/else, 수 5의 양수 판정 | `positive\n` |
| `04-while-loop` | 1~5 누적 | `15\n` |
| `05-fizzbuzz` | 1~15, `%` 및 분기 순서 | `1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n` |
| `06-factorial` | 재귀 factorial(5) | `120\n` |
| `07-fibonacci-recursive` | fib(10), base 0/1 | `55\n` |
| `08-fibonacci-iterative` | 같은 fib(10)의 반복 구현 | `55\n` |
| `09-closure-counter` | 동일 counter 세 번 | `1\n2\n3\n` |
| `10-nested-closures` | outer(1)→middle(2)→inner(3) 누적 capture | `6\n` |
| `11-lexical-shadowing` | outer global 값 1을 읽는 함수, inner shadow 2 | `1\n2\n1\n` |
| `12-array-operations` | [3,1,2]의 index 0을 10으로 변경, len | `[10, 1, 2]\n3\n` |
| `13-array-traversal` | [1,2,3,4] 반복 합계 | `10\n` |
| `14-bubble-sort` | [3,1,4,1,5]를 nested while/교환으로 정렬 | `[1, 1, 3, 4, 5]\n` |
| `15-recursion-array-sum` | sum([1,2,3,4], index) 재귀, 끝에서 0 | `10\n` |

통합 harness는 `.lang` 파일명을 사전순으로 정렬하고 stem 정규형 `NN-name` 및 companion 존재를 검사한다. `.expected`에도 대응 `.lang`가 있어야 한다. 기대 출력은 위 명세에서 독립 작성하고 interpreter의 현재 출력으로 생성하지 않는다. 언어 오류 예제는 성공 예제 폴더 대신 tests fixture에서 진단과 exit code를 검사한다.

### J4. 실행 안전성·검증 게이트

일반 단위 테스트에서는 종료하는 loop와 작은 recursion 입력을 사용한다. return 누락·depth guard 오류·parser loop 버그처럼 실패 시 hang할 수 있는 시나리오는 child process로 분리한다. 부모는 일반 위험 case 2초, 예제 통합 case 5초의 deadline을 사용하고 초과 시 child를 강제 종료·정리한다. 초기 Node 프로세스 기동 오버헤드가 이 한도를 넘는 CI에서는 시간을 늘린 근거를 기록하되 타임아웃을 제거하지 않는다. child stdout/stderr 수집에도 크기 상한을 두어 무한 출력으로 부모 메모리가 소진되지 않게 한다.

`Vitest testTimeout`만으로 동기 infinite loop가 안전하게 끊긴다고 가정하지 않는다. parser fuzz를 한다면 고정 seed·짧은 입력·고정 반복 횟수만 사용하고 별도 property-testing 라이브러리를 필수로 추가하지 않는다. 언어 사용자에게 보이는 instruction budget이나 arbitrary loop limit은 만들지 않는다.

필수 명령 계약:

| 명령 | 역할 |
|---|---|
| `npm run build` | src를 dist로 컴파일 |
| `npm run typecheck` | src·tests·설정을 emit 없이 strict 검사 |
| `npm run check:any` | src의 explicit AnyKeyword 검출, 위반 시 실패 |
| `npm test` | Vitest run 전체 단위·통합 테스트 |
| `npm run test:integration` | integration/CLI/REPL adapter 대상 실행 |
| `npm run test:examples` | example discovery 및 실행 비교 |
| `npm run run -- examples/01-hello-world.lang` | 필요 시 pre-run build 후 script CLI 실행 |
| `npm run repl` | 필요 시 pre-repl build 후 REPL CLI 실행 |

integration child 실행 전에는 부모 test setup이 build를 한 번 수행하거나 이미 성공한 build artifact를 사용한다. child마다 npm/build를 다시 실행하지 않는다. 완료 보고에는 실제 Node/npm 버전, 명령, exit code, 실제 테스트 수를 기록한다. 설계 단계에서는 어떤 검사도 성공했다고 주장하지 않는다.

## K. Recommended Implementation Order

### K1. 다음 세션의 작업 계약

현재 프로젝트 루트를 사용하고 기존 `.git`을 보존한다. 이 `DESIGN_REVIEW.md`를 기준으로 먼저 SPEC/ARCHITECTURE/GRAMMAR를 작성한다. 코드 구현을 시작하기 전에 의미론을 다시 임의 선택하지 않는다. 미지원 기능을 추가하거나 실패한 테스트를 삭제·약화하여 통과시키지 않는다. 동일 원인의 실패가 두 번 반복되면 관련 테스트와 구현의 전제를 다시 검토하고 PROGRESS에 원인을 남긴다.

각 단계는 독립적으로 커밋할 수 있는 검증 가능한 크기다. 단계 내부에는 기능별 **행동 정의 → 실패 테스트 확인 → 최소 구현 → 관련 테스트 통과 → typecheck → check:any → 문서/PROGRESS 갱신 → 커밋** 순서를 적용한다. 초기 설정 단계처럼 아직 테스트가 없는 경우에는 실행한 smoke/typecheck 결과와 해당 이유를 기록한다. 실패 상태의 feature 코드를 완료 커밋으로 만들지 않는다. 커밋을 만들기 전 기존 사용자 변경을 확인하고 해당 단계 파일만 명시적으로 stage한다. 다음 단계 기능을 false success stub이나 무의미한 assertion으로 대체하지 않는다.

추후 AST variant를 먼저 모두 정의할 수는 있으나 evaluator가 지원하지 않는 variant에는 임시로 명시적 내부 unsupported 오류를 두고 진행 기록에 남긴다. 조용히 null을 반환하는 placeholder는 금지한다. 최종 단계에서는 이런 경로가 남아 있지 않아야 한다.

### K2. 단계별 산출물·완료 조건·커밋

| 단계 | 작업 및 산출물 | 선행 조건 | 테스트·완료 조건 | 권장 커밋 주제 |
|---|---|---|---|---|
| 01 | 읽기 전용 현황 확인, SPEC.md·ARCHITECTURE.md·GRAMMAR.md·PROGRESS.md 작성. C~H 및 test ID 이관 | 본 검토 | 모든 syntax/semantics 결정에 명세 위치 존재. grammar와 precedence 상호 대조. Git 현황 기록 | `docs: define mini-lang semantics and architecture` |
| 02 | package.json, npm lockfile, strict tsconfig/build·typecheck 구성, Vitest, .gitignore, check:any script, 최소 build/test fixture와 child deadline helper | 01 | Node 20 호환 버전 선택 근거 기록, install/build/typecheck/check:any/test smoke 성공. child 종료 helper 검증. dist/node_modules 미추적 | `chore: configure strict TypeScript and validation` |
| 03 | source-location 및 errors 계약, SourceUnit·span·diagnostic formatter, error taxonomy | 02 | T-LOC-4 중 formatter/위치, CRLF/BOM/EOF source mapping, 오류 class 테스트. Node stdout 직접 의존 없음 | `feat: add source locations and language diagnostics` |
| 04 | Token와 Lexer 전체 literal/operator/comment/EOF 규칙 | 03 | T-LEX-1/2, invalid escape·number·raw newline 메시지 및 위치. 원본 lexeme·decoded value 분리 | `feat: implement lexer with precise spans` |
| 05 | AST union 전체 shape 및 Parser 표현식 계층. assignment/postfix/array 포함 | 04 | T-PREC·T-ASG-1/2의 expression shape, T-LOC-1/2의 expression span, T-PARSE-2의 expression 오류. declaration/statement wrapper와 REPL 분류는 06에서 검증 | `feat: parse expressions and postfix chains` |
| 06 | Program/declaration/block/if/while/fn/return parsing, 함수 문맥·중복 선언 검증, script/repl mode의 complete/incomplete/invalid 결과 | 05 | T-PARSE-1/2, static T-SCOPE-4, top-level return, EOF와 malformed 입력. H의 parse 분류 표 전부 검증 | `feat: parse statements and classify incomplete input` |
| 07 | primitive/array RuntimeValue, truthiness/equality/숫자 불변식/value formatter, arity 계약. Environment를 필요로 하는 callable union 확장은 08에서 함께 작성 | 03,05 | T-VAL, T-NUM의 primitive/array 부분, T-FMT-1 helper 수준. 순환/alias 표시, depth64. 아직 없는 Environment import 없음 | `feat: define runtime values and formatting` |
| 08 | Environment/BindingCell 예약·초기화·lookup·assign·readonly, builtin/global parent 구조, 최종 callable RuntimeValue union과 함수 identity/표시 확장 | 07 | T-SCOPE의 공개 env 계약, TDZ/undefined/own redeclare/parent assign. null과 uninitialized 구별. type-only 상호참조 컴파일 성공 | `feat: implement lexical environments and bindings` |
| 09 | 기본 evaluator/executor: literals/operators/logical/let/assignment/blocks/if/while; scope 준비, completion shape, evaluation guard | 06,08 | T-PREC 계산, T-LOG의 primitive·변수 부작용, T-SCOPE-2, T-NUM의 core 동작. 값·binding으로 관찰하며 array/call/print는 요구하지 않음. 유한 loop와 location 검증 | `feat: evaluate expressions and control flow` |
| 10 | array literal/index/reference assignment, nested/aliasing/type/bounds 동작 완성 | 09 | T-ASG-4, T-ARR-1/3/4, T-IDX-1/2의 core 동작 및 T-LOG의 array case. index 1회 평가는 inline assignment로 확인하고 함수 idx를 쓰는 T-ASG-3는 11에서 검증 | `feat: support mutable arrays and indexed assignment` |
| 11 | user/builtin 공통 callable dispatch, scope 함수 초기화, frame/capture, arity, return 소비, recursion·call depth·RangeError 변환. 구체 print/len은 12 | 09,10 | T-CLOS, T-SCOPE-1/3/4, T-REC, T-RET, T-CALL, T-ASG-3, T-ARR-2, T-SAFE-1/2/4의 core 동작. 주입 callable로 native 경로 검증, 오류 후 context 복원 | `feat: add functions closures and guarded recursion` |
| 12 | print/len builtin 구현·등록, 공통 dispatch 연결, 주입 output port; runtime 오류 메시지·위치 전체 연결 | 11 | 09~11에서 core만 검증한 J2의 원문 fixture를 출력·len까지 전부 검증. T-BI, T-FMT end-to-end, T-LOC-3/4, builtin/user arity·shadow·identity. return sentinel 흔적 없음 | `feat: add builtins and source-aware runtime errors` |
| 13 | runner compile/session/execute API, script CLI, argv·UTF-8 I/O·exit code, process test harness | 12 | T-CLI-1, T-SAFE-3, parse 실패 무실행, stdout/stderr 분리. 재귀 기본 스택 Node20/24 실측 기록 | `feat: add script runner and CLI integration` |
| 14 | 주입식 REPL core와 얇은 readline adapter, persistent scope, multiline, echo, EOF/cancel | 13 | T-REPL-1~7, H 전체 입력 표, fake ports 및 실제 piped CLI smoke. 과거 source 위치 보존 | `feat: add persistent multiline REPL` |
| 15 | examples 15쌍 전부 작성, 자동 discovery·pair·LF 검증; bubble sort는 Mini-Lang으로 작성 | 13,14 | T-EX-1/2, 15개 전부 실제 실행·expected 일치, recursive/iterative fib 결과 동일 | `test: verify fifteen language examples` |
| 16 | Risk Register 모든 ID 추적, 추가 경계/negative/regression 테스트, 자원 제한·오류 경로 audit | 15 | R01~R40 대응 테스트 누락 0. T-SAFE 전체, T-STATIC, T-CONTRACT. 실제 evaluator에서 기본 스택 및 보조 제한 확인 | `test: cover language edge cases and runtime limits` |
| 17 | README·LIMITATIONS·FUTURE 완성, SPEC/ARCHITECTURE/GRAMMAR 최종 대조, 코드 전체 읽기 및 필요한 수정 | 16 | 중복 로직·책임 혼합·unsafe assertion·any·dead code·미검증 공개 동작·임시 unsupported 경로 없음. T-DOC-1 | `docs: document usage constraints and future work` |
| 18 | 최종 build·전체 test·integration·examples·typecheck·check:any 수행, PROGRESS 완료 근거와 실제 커밋 목록 기록 | 17 | 아래 K4의 완료 게이트 모두 충족. 변경이 생기면 영향 검사 재수행. 검증 결과만 간결히 보고 | `chore: record final validation results` |

03의 오류 시스템을 마지막에 미루지 않는 이유는 token→AST→runtime 위치 계약이 모든 기능의 구조를 결정하기 때문이다. 배열은 parser/runtime shape부터 포함하고 기본 실행을 함수 이전에 완성하여 closure 테스트에서 함수 배열을 곧바로 사용할 수 있게 한다. REPL parser mode도 parser 단계에서 설계하여 REPL 추가 때 grammar를 다시 쓰지 않게 한다. 02의 child deadline helper는 CLI 없이 작은 test fixture를 독립 Node process로 실행할 수 있어야 하며, 11의 recursion 검증에 사용한 뒤 13의 CLI 통합에서 재사용한다. 완성되지 않은 기능을 사용자에게 배포하는 단계는 없으며 최종 실행 가능 프로젝트는 모든 단계 이후에 판단한다.

단계별 core 검증은 후속 기능을 흉내 내는 stub 대신 이미 구현한 모듈의 반환값·공개 binding 계약·오류를 직접 관찰하는 별도 단위 case다. 03은 직접 구성한 source/span/diagnostic으로 formatter를 검사하며 아직 없는 parser/interpreter를 요구하지 않는다. 09~11은 print/len을 포함하지 않는 core fixture를 사용하고, print·len이 필요한 J2 원문 case는 12에서 추가하여 그대로 검증한다. 11의 child fixture는 interpreter를 직접 호출하고 13부터 실제 CLI exit code도 검증한다. core 통과만으로 전체 Test ID가 완료되었다고 표시하거나 최종 fixture를 삭제·완화하지 않는다. 따라서 후속 단계의 구현 없이도 각 단계의 검사와 커밋을 완료할 수 있다.

### K3. PROGRESS.md와 중단 재개

PROGRESS에는 다음 필드를 유지한다.

| 필드 | 반드시 기록할 내용 |
|---|---|
| 기준 설계 | DESIGN_REVIEW의 날짜/현재 변경 이력, SPEC/GRAMMAR 버전 변경 사유 |
| 현재 단계 | K2의 단계 번호, not-started/in-progress/verified/committed 중 상태 |
| 완료 내용 | 구현된 공개 동작과 실제 파일, 완료한 테스트 ID |
| 현재 실패 | 실패 명령·핵심 오류·재현 입력·원인 가설. 실패를 숨기지 않음 |
| 검증 결과 | 실행한 명령, Node/npm 버전, exit code, 실제 테스트 수·시간, stack 측정 조건 |
| 변경 파일 | 추적/미추적 파일과 해당 단계 소유 변경, 기존 사용자 변경 구분 |
| 다음 최소 행동 | 바로 재개할 구체 작업과 확인할 파일/테스트 |
| 남은 위험 | R ID, 아직 없는 대응 테스트 및 unresolved 원인 |
| 커밋 | 완료 단계의 실제 hash/제목. 만들지 않은 hash를 기록하지 않음 |

중단되면 현재 변경을 보존하고 정확한 상태를 기록한다. 새 세션은 DESIGN_REVIEW·SPEC·GRAMMAR·PROGRESS를 읽고 `git status` 및 최근 커밋을 확인한 다음, 현재 단계의 관련 실패 테스트/검증부터 재현한다. 완료된 단계를 처음부터 다시 만들지 않는다. 한도 종료를 기능 완료로 바꾸지 않으며, 상태 기록만으로 의미론을 변경하지 않는다. 재개 과정에서 원인 불명 실패가 반복되면 같은 패치 대신 모듈 경계와 테스트 전제를 재검토한다.

### K4. 최종 완료 게이트

1. SPEC, ARCHITECTURE, GRAMMAR, README, LIMITATIONS, FUTURE, PROGRESS가 실제 구현과 일치한다. 호출·평가·파싱·표시 제한, TDZ/hoisting, REPL 실패 상태·else 입력 규칙·Unicode 길이 규칙이 문서에 있다.
2. Lexer, Parser, AST, RuntimeValue, Environment, Interpreter, Function, Closure, Recursion, Builtins, Arrays, Error system, Script runner, REPL 테스트가 전부 통과한다.
3. R01~R40 각각에 최소 하나의 실제 테스트가 연결되고, 해당 테스트가 실행되는 suite에 포함되어 있다. 설계상의 ID만 만들어 두는 것으로 충족하지 않는다.
4. examples는 최소 15개 `.lang`/`.expected` 쌍이고 자동 검색·실행·정확 출력 비교가 모두 통과한다. source 예제를 단지 parse하는 것만으로 통합 테스트를 대체하지 않는다.
5. `npm run build`, `npm test`, `npm run test:integration`, `npm run test:examples`, `npm run typecheck`, `npm run check:any`가 성공한다. scripts에 허위 성공이나 테스트 제외 우회가 없다.
6. 기본 스택의 Node 20 및 사용 환경 Node 24에서 actual evaluator 호출 경계가 확인되고 guard/RangeError 변환 이후 process와 REPL이 정상 동작한다. 테스트하지 못한 환경은 명시하며 호환성 검증 완료라고 보고하지 않는다.
7. src explicit any는 0개다. strict를 우회하는 unchecked assertion, 임시 unsupported branch, 테스트를 통과시키려는 하드코딩을 제거한다. TypeScript compiler API 사용은 check:any 도구에 한정하며 Mini-Lang parser 구현을 외부 라이브러리에 위임하지 않는다.
8. Git에 주요 단계가 실제 커밋으로 남고 미완료 변경·남은 제한사항이 PROGRESS에 드러난다. 이 세션의 설계 검토를 구현 커밋이나 구현 완료로 보고하지 않는다.
9. 최종 보고는 구현 기능, 실제 테스트 수/결과, 타입 검사·any 검사 결과, example 목록, 실제 주요 commit 목록, 알려진 제한사항을 간결히 제시한다. 추측이나 계획을 실행 결과처럼 표기하지 않는다.

문서 최종 검증: A~K 11개 섹션, R01~R40의 대응 테스트 연결 및 J2의 테스트 ID 정의를 대조했다. C와 E/F/G/H의 의미론, precedence·대입·호출 체인, closure·return·재귀 제한, 배열 규칙, 오류 위치 예시, 15개 예제 출력, 18단계의 선행 조건 및 Markdown 구조를 확인했다. 이번 검증은 문서 정합성 검증이며, interpreter 실행·언어 테스트 통과·Node 스택 실측은 구현 세션에서 수행한다.

완료 확인: [x] A. Executive Review · [x] B. Requirements Gaps & Ambiguities · [x] C. Final Language Decisions · [x] D. Recommended Architecture · [x] E. Parser Strategy · [x] F. Runtime Strategy · [x] G. Source Location & Error Strategy · [x] H. REPL Strategy · [x] I. Risk Register · [x] J. Test Strategy · [x] K. Recommended Implementation Order
