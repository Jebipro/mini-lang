# 01 Runner와 실행 Pipeline

[학습 목차](README.md) · 이전: [전체 지도](00-project-map.md) · 다음: [Lexer](02-source-token-lexer.md)

## 1. 이 개념이 왜 필요한가

세부 알고리즘보다 먼저 입력과 실행 상태를 누가 만들고 연결하는지 알아야 한다. Runner는 핵심 모듈을 조립하는 짧은 코드다. 이 장에서는 함수 이름을 외우기보다 각 함수가 받는 것과 넘기는 것을 구분한다.

## 2. 일반적인 CS 개념

Pipeline은 한 단계의 결과를 다음 단계에 전달하는 처리 흐름이다. Session은 여러 작업이 공유할 실행 상태의 묶음이다. Callback 주입은 모듈이 직접 출력 장치를 고르지 않고 외부에서 전달한 함수를 호출하는 방식이다. 프로그램 분석과 실행을 분리하면 분석 결과를 관찰하거나 재사용할 수 있다.

## 3. Mini-Lang에서는 어떻게 설계했는가

runScript는 이미 읽어 온 문자열과 표시 이름, 출력 함수를 받는다. 새 SourceUnit과 새 Session을 만들어 runSource에 전달한다. runSource는 compile을 완료한 뒤 execute를 호출한다. compile은 AST를 반환하며, execute는 세션의 interpreter에 프로그램과 global을 전달한다.

Session에는 global과 interpreter가 있다. 소스나 출력 문자열의 컨테이너가 아니다. createSession은 builtin 부모 환경을 만든 뒤 사용자 global을 그 자식으로 만든다. 출력 callback은 builtin 생성에 연결된다.

## 4. 실제 저장소의 파일 / 함수 / 타입

[runner.ts](../../src/runner.ts)의 실제 핵심 코드:

```ts
export function runSource(source: SourceUnit, session: Session): void {
  execute(compile(source), session);
}
```

줄바꿈만 바꾼 인용이다. 위 한 줄은 먼저 Program을 얻은 뒤 실행한다는 뜻이다.

| 함수·타입 | 입력 → 결과 |
|---|---|
| Session | global: Environment, interpreter: Interpreter |
| createSession(output) | 출력 함수 → 새 Session |
| compile(source, mode) | SourceUnit → parse의 Program |
| execute(program, session, echo?) | AST와 세션 → 실행 효과, 반환 void |
| runSource(source, session) | 분석과 실행 연결 |
| runScript(text, name, output) | 소스와 세션 생성 후 runSource |

[index.ts](../../src/index.ts)는 runner API, SourceUnit, 오류 API를 재수출한다. 함수를 export하는 것과 호출하는 것은 다르다. [cli/run.ts](../../src/cli/run.ts)의 main이 파일을 읽고 runScript를 호출한다. [runner.test.ts](../../tests/runner.test.ts)는 같은 세션에서 여러 소스를 실행하는 사례다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

[01-hello-world.lang](../../examples/01-hello-world.lang):

```mini-lang
print("Hello, World!");
```

| 순서 | 호출 / 생성 | 상태 |
|---|---|---|
| 1 | CLI 파일 읽기 | 원문 문자열 확보 |
| 2 | runScript | SourceUnit(text, name) 생성 |
| 3 | createSession | print/len 환경, global, Interpreter 생성 |
| 4 | runSource → compile → parse | 호출 문장을 나타내는 Program 생성 |
| 5 | execute → interpreter.execute | global에서 print 검색, 인수 평가 |
| 6 | builtin print → output | Hello, World!와 LF 출력 |

Program은 문자열 반환값이 아니라 구문 트리다. createSession 안의 빈 SourceUnit은 builtin 선언 위치용이며 사용자 소스와 별개다. 이 경로에서는 echo를 전달하지 않는다.

표준 출력:

```text
Hello, World!
```

## 6. 흔히 헷갈리는 부분

execute(compile(source), session)에서는 인수인 compile이 먼저 실행된다. compile이 실패하면 execute는 호출되지 않는다. runScript는 파일을 읽지 않으며 출력 문자열을 반환하지도 않는다. npm build가 TypeScript를 JavaScript로 바꾸는 것과 Mini-Lang compile이 AST를 만드는 것은 다른 작업이다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

출력을 callback으로 받으면 테스트는 문자열을 수집하고 CLI는 stdout에 쓸 수 있다. 직접 console.log에 의존하는 방식보다 조립 코드는 조금 늘지만 환경 의존성이 줄어든다. 매번 새 세션을 만드는 API와 기존 세션을 받는 API를 함께 두어 독립 파일 실행과 지속 REPL을 모두 표현한다. Program 재사용은 가능하나 같은 global에서 선언을 재실행하면 재선언 오류가 날 수 있다.

## 8. 반드시 기억할 핵심 3~5개

- SourceUnit은 원문, Program은 구조, Session은 실행 상태다.
- runScript는 새 세션을 만들고 runSource는 전달받은 세션을 쓴다.
- compile이 완료된 다음 execute가 시작된다.
- 출력은 반환 문자열이 아니라 callback 호출이다.

## 9. 확인 문제

1. 같은 Session에 runSource를 두 번 호출하면 global은 같은 객체인가?
2. compile만 호출했을 때 print가 실행되는가?
3. index.ts에서 runScript를 export하면 파일 실행도 시작되는가?

<details>
<summary>해설</summary>

1. 그렇다. runSource는 세션을 교체하지 않는다.
2. 아니다. AST 생성만 한다.
3. 아니다. 공개 이름을 연결하는 선언일 뿐이다.
</details>

## 10. 내 말로 설명해볼 질문

- Hello World를 실행할 때 생성되는 세 객체를 함수 호출 순서와 함께 설명해보자.
- 터미널과 테스트에서 같은 interpreter를 사용할 수 있는 이유를 설명해보자.
