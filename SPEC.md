# Mini-Lang Specification

확정 설계 DESIGN_REVIEW.md를 그대로 적용한다. 구현 변경이 필요한 경우 이 문서에 먼저 근거를 기록한다.

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

기본 스택의 Node 20.20.2와 Node 24.16.0에서 실제 compiled evaluator로 깊이 63/64 성공, 65 실패를 별도 process에서 검증한다. 단순 tail-shaped 재귀, 비-tail 재귀, 중첩 if/while 경유 재귀를 구분한다. 실제 실패가 guard보다 먼저 발생하면 helper 프레임 구조부터 줄이고, 불가피하게 한도를 변경할 때는 C/F/SPEC/LIMITATIONS 및 테스트 기대값을 함께 변경하고 측정 근거를 남긴다. 해당 경계와 중첩 평가 제한의 실행 검증은 tests/integration/cli.test.ts 및 safety.test.ts에 있으며, 환경별 실제 결과는 PROGRESS.md에 기록한다.

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

메시지에 실제 이름·숫자·타입을 넣는다. EOF는 `EOF`, 다른 token은 원 lexeme를 single quote로 감싼다. Lexer의 추가 진단은 아래 구현 세부 진단 표에 고정한다. 테스트는 kind/code/정확한 line/column과 대표 메시지 전체를 검사하며 메시지 전체를 느슨한 substring 하나로 대체하지 않는다.

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

## 구현 절차 보충

- 명시적 any 예외는 허용하지 않는다.
- 마스터 프롬프트의 무한 루프 테스트 금지에 따라 watchdog 자체 테스트는 무한 while 대신 제한 시간보다 긴 유한 지연 child를 사용한다. 언어 의미론 변경은 없다.

## 구현 세부 진단 및 변경 이력

언어 의미론 변경 없음. Parser 중복 이름은 선언 이름을 읽는 즉시 검사하고, 호스트 RangeError의 cause는 내부 진단에 보존한다. 선행 BOM 예외는 첫 source 줄에만 적용한다.

| Code | 메시지 | 위치 |
|---|---|---|
| E_CHARACTER | unexpected character '문자' | 불법 문자 |
| E_NUMBER | invalid numeric suffix | 첫 suffix 문자 |
| E_NUMBER | numeric literal is not finite | 숫자 시작 |
| E_STRING | newline in string literal | raw newline |
| E_STRING | unterminated string literal | 여는 큰따옴표 |
| E_ESCAPE | invalid string escape | backslash |
| E_INPUT_LIMIT | host syntax limit exceeded | 현재 token 또는 lexer offset |

이 값들은 DESIGN_REVIEW의 오류 종류와 anchor 규칙을 구체화한다. DESIGN_REVIEW.md 원본은 변경하지 않는다.
