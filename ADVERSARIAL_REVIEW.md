# Adversarial Review — 2026-10-03

기준 커밋: `f26c413`. 기존 175개 테스트의 성공이나 Risk ID의 존재를 정확성의 증거로 전제하지 않고 소스·명세에서 독립적으로 기대값을 도출했다. 기능 및 확정 언어 설계는 변경하지 않았다.

## 결과

| 심각도 | 확인된 버그 수 | 상태 |
|---|---:|---|
| Critical | 0 | 발견 없음 |
| High | 0 | 발견 없음 |
| Medium | 1 | 수정 완료 |
| Low | 1 | 수정 완료 |

실제 버그는 **2개**다. 수정 전 추가 테스트 18개 중 5개가 실패했고, 실패는 아래 두 원인으로 묶인다. 나머지 13개는 통과했으며 해당 구현을 변경하지 않았다. 버그 재현 5개와 추가 경계 검증 13개를 모두 회귀 검사로 유지한다. 432개 산술 조합은 하나의 테스트 내부 사례이며 테스트 개수를 432개로 부풀려 세지 않는다.

## AR-01 — Medium: child 출력의 UTF-8 청크 경계 손상

- 위치: `tests/helpers/child.ts`, stdout/stderr data handler.
- 근거: SPEC C 및 DESIGN_REVIEW J3/J4의 출력 전체 문자열 비교 계약. 스트림 청크 경계는 문자의 경계라는 보장이 없다.
- 재현: `Buffer.from('한😀글\n')`의 첫 바이트를 stdout 또는 stderr에 쓰고, 250ms 후 나머지 바이트를 쓴 child를 `runChild`로 실행한다.
- 기대: `한😀글\n`. 수정 전 실제: `���😀글\n`. child 자체는 exit 0이었다.
- 원인: 각 Buffer에 독립적으로 `toString()`을 적용하여 미완성 UTF-8 시퀀스를 대체 문자로 바꿨다.
- 영향: 올바른 언어 출력/진단을 통합 테스트가 잘못 수집해 거짓 실패를 만들 수 있다. Mini-Lang의 print 자체에서 발견한 버그는 아니다.
- 수정: 두 스트림에 `setEncoding('utf8')`을 적용해 청크 사이의 decoder 상태를 유지한다. 기존 deadline 및 출력 크기 제한은 유지한다.
- 재현 테스트: `tests/adversarial.test.ts`, ADV-02 stdout/stderr **2개**, 수정 전 둘 다 실패.

## AR-02 — Low: 표시 이름을 source ID로 사용해 서로 다른 소스가 충돌

- 위치: `src/source-location.ts` constructor 및 `src/repl.ts` source 생성.
- 근거: SPEC G1 / DESIGN_REVIEW G1의 unique source ID와 H3의 미완성 submission 재파싱 시 동일 ID 유지 계약.
- 재현: 서로 다른 텍스트로 `new SourceUnit(text, 'same.lang')`를 두 번 생성하면 두 ID 모두 `same.lang`이었다. 기본 표시 이름도 같은 문제가 있었고, 독립 REPL 두 개의 첫 submission ID도 모두 `<repl:1>`이었다.
- 기대: 서로 다른 논리 소스는 다른 기본 ID를 갖는다. 동일 pending submission의 재파싱은 같은 ID를 유지한다.
- 영향: 공개 SourceUnit ID 계약 위반. 현재 formatter는 SourceUnit 객체를 직접 보유하므로 기존 오류 메시지가 잘못된 파일을 표시했다는 주장은 하지 않는다.
- 수정: 기본 ID는 프로세스 내 생성 순번으로 분리한다. REPL은 pending ID를 저장하고 완료·실패·취소 후 비운다. 표시 이름, line/column, 명시적으로 전달한 ID는 보존한다. 명시 ID의 충돌 방지는 이를 지정하는 호출자의 책임이다.
- 재현 테스트: ADV-01의 기본 이름/동일 파일명/독립 REPL **3개**, 수정 전 모두 실패. 명시 ID 보존은 별도 정상 대조 테스트다.

## 검토 범위와 확인한 경계

`src/` 전체 16개 모듈, 테스트 전체와 helpers, scripts/check-any.mjs, package/TypeScript/Vitest 설정, 15개 예제와 expected 계약을 검토했다. SPEC C/F/G/H, ARCHITECTURE, GRAMMAR EBNF, DESIGN_REVIEW A~K와 Risk/Test 연결 및 기존 테스트의 실제 assertion을 대조했다.

새 검사 ADV-03~14는 다음을 다룬다.

- argument가 함수 이름을 재대입해도 이미 구한 callee로 호출하는지.
- index 식이 배열 변수를 재대입해도 기존 base에 쓰는지.
- 늦은 인자가 배열을 변경할 때 앞선 인자의 참조가 유지되는지.
- 65번째 call을 거절하기 전에 인자 효과가 발생하고 오류 후 카운터가 복원되는지. guard가 없어져도 종료하는 유한 재귀 fixture를 사용한다.
- persistent global 충돌 전에 출력·함수 hoisting·새 이름 예약이 일어나지 않는지.
- 반환 후 sibling closure가 같은 parameter binding을 갱신하는지.
- 뒤 인자의 오류에서 앞 인자의 효과는 남고 함수 body는 실행되지 않는지.
- BOM·CRLF·emoji·tab 조합의 정확한 offset/line/column과 원래 source 참조.
- 잘못된 nested function 입력 후 REPL function context 복원.
- 순차 형제 nesting 비누적, postfix Program AST height 128/129 경계 및 REPL 분류.
- remainder, 음수 0, overflow 및 독립 precedence oracle에 대한 산술 432조합.

이 사례에서는 추가 의미론 버그를 발견하지 않았다. 전체 테스트 통과를 모든 가능한 입력/환경에 대한 무결성 증명으로 해석하지 않는다.

## 버그로 확정하지 않아 변경하지 않은 사항

- `++x`는 문법상 unary plus 두 번이다. 증감 연산자를 잘못 허용한 것으로 판정하지 않았다.
- runtime 실패 후 TDZ cell 유지, 비교식의 왼쪽 결합, 인자 평가 후 call-depth 검사, 배열 참조가 늦은 인자 mutation을 반영하는 출력은 명세에 따른 동작이다.
- 끝 backslash나 escaped raw newline은 여러 lexical 제약을 동시에 위반한다. 현재 backslash anchor의 escape 오류도 명세가 금지한 입력을 거절하므로 임의로 다른 오류 우선순위로 바꾸지 않았다.
- README 테스트의 nonempty 출력 assertion 및 Risk ID 문자열 검색은 단독으로 충분한 동작 검증이 아니다. 이를 기능 버그라고 집계하지 않았으며 실제 코드와 독립 oracle을 대조했다.
- 사용자 요청의 버전 명칭은 v1.0.0이지만 package/lockfile 버전은 0.1.0이다. 이번 요청은 release/version 변경이 아니므로 메타데이터를 임의로 변경하거나 언어 버그 수에 포함하지 않았다.

## 검증

검사 결과와 커밋은 PROGRESS.md의 adversarial review 기록에 남긴다. 재현 명령은 `npm test -- tests/adversarial.test.ts`, 전체 검증은 `npm run check`다. 새 의존성이나 언어 기능은 추가하지 않았다.
