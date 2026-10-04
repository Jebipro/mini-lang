# Mini-Lang Grammar

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
