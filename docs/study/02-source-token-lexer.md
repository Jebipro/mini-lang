# 02 SourceUnit / Token / Lexer

[학습 목차](README.md) · 이전: [Runner](01-runner-pipeline.md) · 다음: [AST](03-ast.md)

## 1. 이 개념이 왜 필요한가

문자열 자체만으로는 숫자 12와 식별자 x, 연산자 ==를 매번 구별해야 한다. Lexer가 의미 있는 단위로 잘라 주면 parser는 문자 대신 문법에 집중할 수 있다. 원문 위치를 함께 보관해야 잘못된 입력을 사용자에게 정확히 가리킬 수 있다.

## 2. 일반적인 CS 개념

Token은 종류, 원문 조각, 필요할 경우 해석된 값으로 이루어진다. Longest match는 겹치는 기호 중 긴 것을 우선 인식하는 규칙이다. EOF는 실제 문자라기보다 입력 종료를 나타내는 표식이다. 문자 인코딩의 byte, UTF-16 code unit, Unicode code point, 화면상의 글자 폭은 서로 다를 수 있다.

## 3. Mini-Lang에서는 어떻게 설계했는가

CLI가 UTF-8 파일을 문자열로 읽은 다음 SourceUnit이 원문을 보관한다. lineStarts에는 각 줄의 시작 offset이 들어가며 position은 이 배열을 이진 검색한다. CR, LF, CRLF를 줄바꿈으로 인식하고 원문을 정규화하지 않는다.

lex는 current로 읽기 위치를 관리한다. 공백과 // 주석을 넘기고 identifier, number, string, symbol 분기를 처리한다. ASCII 이름만 식별자이며 문자열 안의 Unicode 자체는 허용한다. 숫자는 정수 또는 소수 형식이며 지수 표기는 없다. 문자열 escape는 따옴표, 역슬래시, n, r, t만 지원한다. 두 글자 연산자를 한 글자보다 먼저 확인하고 마지막에 EOF 하나를 붙인다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [source-location.ts](../../src/source-location.ts): SourceUnit, Position, Span, position, span, lineText.
- [token.ts](../../src/token.ts): TokenKind, Token, keywords, symbols.
- [lexer.ts](../../src/lexer.ts): lex, 내부 emit, digit, letter.
- [source.test.ts](../../tests/source.test.ts), [lexer.test.ts](../../tests/lexer.test.ts): 위치·토큰·오류 사례.

Token의 lexeme는 원문 slice이고 literal은 해석한 number/string 값이다. 문자열의 따옴표와 escape는 lexeme에 남지만 literal에는 처리된 값이 담긴다. SourceUnit의 id는 기본적으로 생성 순번이며 displayName과 다르다.

lex의 실패는 code와 위치를 함께 읽는다. 아래는 모두 LangSyntaxError이며, 위치는 span.start 기준이다.

| 입력 문제 | code | 가리키는 위치 |
|---|---|---|
| 불법 문자 | E_CHARACTER | 해당 문자. 유효한 non-BMP 문자는 span에 UTF-16 두 단위를 포함 |
| 숫자 뒤 식별자 suffix | E_NUMBER | 첫 suffix 문자: 12abc의 a |
| 비유한 숫자 literal | E_NUMBER | 숫자 시작; span은 숫자 전체 |
| 문자열 안 raw CR 또는 LF | E_STRING | 해당 줄바꿈 문자 |
| 닫히지 않은 문자열 | E_STRING | 여는 따옴표 |
| 잘못된 escape | E_ESCAPE | 역슬래시. span은 가능하면 다음 문자도 포함 |

`1.`은 숫자 1 뒤의 점에서, `.5`는 첫 점에서 E_CHARACTER가 난다. 선행 0은 허용하므로 `0012`는 십진수 12다. `"abc`는 여는 따옴표의 E_STRING이지만 마지막 문자가 역슬래시인 미완성 escape는 그 역슬래시의 E_ESCAPE가 먼저 발생한다. CR 단독도 줄바꿈이며 CRLF를 두 줄로 세지 않는다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

```mini-lang
let x=12;
print(x);
```

첫 줄에서 대표 토큰은 다음과 같다. offset은 0-based, end는 미포함이다.

| kind | lexeme | literal | 첫 줄 offset |
|---|---|---|---|
| let | let | 없음 | [0,3) |
| identifier | x | 없음 | [4,5) |
| = | = | 없음 | [5,6) |
| number | 12 | 숫자 12 | [6,8) |
| ; | ; | 없음 | [8,9) |

current가 공백을 건너뛰어도 원문 위치는 유지된다. 두 번째 줄까지 읽고 EOF를 원문 끝의 폭 0 span으로 만든다. 이후 parser와 interpreter가 실행하면 출력은 다음과 같다.

```text
12
```

Lexer 자체는 x에 12를 저장하지 않는다. 저장은 실행 단계의 책임이다.

## 6. 흔히 헷갈리는 부분

- -12는 음수 토큰 하나가 아니라 '-'와 number 토큰이다.
- 키워드는 식별자와 비슷하게 읽은 뒤 keywordMap으로 종류를 구분한다.
- len("😀")가 2인 것과 identifier에 이모지를 허용하는지는 별개의 규칙이다.
- 시작 BOM 하나는 offset을 소비하지만 첫 코드의 column을 밀지 않는다.
- 잘못된 non-BMP 문자는 진단에 code point 전체를 표시하지만 위치 단위는 계속 UTF-16이다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

손으로 작성한 scanner는 현재의 작은 토큰 집합과 오류 위치를 직접 제어하기 쉽다. 정규식 기반 tokenizer나 lexer generator도 가능하지만 규칙 우선순위와 실패 위치를 별도 설계해야 한다. UTF-16 위치는 JavaScript 문자열 인덱스와 일치한다. code point나 grapheme 기준 column은 사용자의 시각에 가까울 수 있으나 변환 비용과 별도 규칙이 필요하며 현재 구현은 아니다.

## 8. 반드시 기억할 핵심 3~5개

- 원문·토큰·값은 다른 층이다.
- lexeme는 원문, literal은 해석된 payload다.
- EOF는 마지막에 하나이며 원문 끝을 가리킨다.
- 위치는 UTF-16 기준이며 원문을 보존한다.

## 9. 확인 문제

1. ==는 '=' 두 토큰인가?
2. // 뒤 텍스트가 AST의 주석 노드로 남는가?
3. 12abc는 number와 identifier로 정상 분리되는가?

<details>
<summary>해설</summary>

1. 아니다. 두 글자 symbol을 먼저 찾는다.
2. 아니다. lexer가 줄 끝까지 건너뛴다.
3. 아니다. 숫자 뒤 잘못된 suffix로 E_NUMBER를 낸다.
</details>

## 10. 내 말로 설명해볼 질문

- lexer가 진행한다는 것을 current와 emit으로 설명해보자.
- 오류가 나중에 발생해도 원문을 가리킬 수 있도록 토큰에 무엇을 남기는지 설명해보자.
