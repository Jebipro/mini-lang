# Claude Blind Review

독립 reviewer 관점의 구현·테스트 감사 결과다. 기존 리뷰 문서, git history, 기존 fuzz 결과(`.tmp/fuzz-results`, `.tmp/fuzz-failures`)는 참조하지 않았다. 판단 근거는 `SPEC.md`, `GRAMMAR.md`, `ARCHITECTURE.md`, `LIMITATIONS.md`, `README.md`, `src/`, `tests/`, `examples/`, 설정 파일뿐이다.

## 1. 요약

| 항목 | 결과 |
|---|---|
| Critical / High | 0 / 0 |
| Medium | 1 (BR-02, 수정) |
| Low | 1 (BR-01, 수정) + 미수정 설계 메모 3 |
| 실제 재현·수정한 버그 | 2 |
| 테스트 자체의 문제 | 16 |
| 새 테스트 | 55개 (실패 선행 regression 4개 포함) |
| 수정한 production 파일 | `src/lexer.ts`, `src/cli/run.ts`, `src/cli/repl.ts` |
| 최종 테스트 | 253 통과 / 2 실패 (두 실패는 blind 복사본에 없는 문서 때문, 기존부터 실패) |

언어 핵심(파서 우선순위·결합, 대입 순서, scope/TDZ/hoisting, closure, return 전파, short-circuit, 배열 identity, 깊이 guard)에서는 명세 위반을 찾지 못했다. 독립 oracle로 무작위 식 20,000개를 비교했을 때 불일치가 0건이었다. 두 버그는 모두 경계(진단 문자열, 호스트 stdout)에 있다.

## 2. 방법

1. 문서 전체와 `src/` 전체를 읽고 SPEC C 표의 각 행을 구현 위치와 대조했다.
2. 컴파일된 `dist`로 probe 스크립트를 돌렸다. 의미론 약 60건, lexer/Unicode 약 55건, REPL 시나리오 약 45건이다.
3. CLI 경계를 실제 child process로 확인했다. CRLF/CR/BOM 입력 pipe, 잘못된 UTF-8, 디렉터리 인자, `| head`(EPIPE), Linux pty를 통한 TTY prompt, Ctrl+C, Ctrl+D를 다뤘다.
4. 호스트 스택 압박을 확인했다. `--stack-size=60/100/200`에서 깊은 block, 인자, 괄호 입력이 언어 오류로 변환되는지 봤다.
5. 무작위 검증을 돌렸다.
   - 독립 JS oracle(산술·비교·논리·단항, 타입 오류, 0 나눗셈, 비유한)로 20,000개 식을 차등 비교했고 불일치는 0이었다.
   - 프로젝트 fuzz harness를 새 seed 1~4, seed당 3,000개(총 12,000)로 돌렸고 실패는 0이었다.
6. 버그 후보마다 최소 재현 → 실패 테스트 추가 → 기존 구현에서 실패 확인 → 수정 → 전체 재실행 순서로 진행했다.
7. 실행 환경은 Linux, Node v22.22.0과 v20.20.2다. Node 24와 Windows는 실행하지 못했다.

## 3. 발견 사항

### Critical / High

없음.

### Medium — BR-02 stdout/stderr가 닫히면 Node stack trace가 새고 exit code 1이 된다 (수정)

- **명세**: C의 exit code 행은 "사용법/파일 I/O/호스트 내부 오류 2"이고 G2는 host stack 노출을 금지한다. 사용자가 지정한 감사 항목 "host exception leakage", "CLI/stdout 경계"에도 해당한다.
- **재현**: `node dist/cli/run.js many.lang | head -2`, 이때 `many.lang`은 `let i=0;while(i<100000){print(i);i=i+1;}`이다.
- **기존 결과**: `node:events ... Unhandled 'error' event ... Error: write EPIPE`와 전체 stack이 출력되고 exit 1이다. exit 1은 "언어 오류"와 구분되지 않는다. REPL adapter도 같다.
- **원인**: `process.stdout`/`process.stderr`에 `'error'` listener가 없다.
- **수정**: 두 CLI adapter에 listener를 추가해 `IOError: write EPIPE`를 출력하고 exit 2로 끝낸다. REPL은 입력도 닫는다.
- **수정 후 결과**: `IOError: write EPIPE`, exit 2.
- **한계**: 동기 실행 중인 무한 loop는 EPIPE를 관찰할 수 없다. 기존 LIMITATIONS(시간 제한 없음)의 범위이며 바꾸지 않았다.

### Low — BR-01 non-BMP 불법 문자를 lone surrogate로 보고한다 (수정)

- **명세**: 구현 세부 진단 표의 `E_CHARACTER`는 `unexpected character '문자'`이고 anchor는 "불법 문자"다.
- **재현**: 소스 `😀;`.
- **기존 결과**: 메시지가 `unexpected character '\uD83D'`였다. UTF-8 stderr에서는 `'�'`로 보인다. span도 surrogate 반쪽(폭 1)만 덮었다.
- **수정**: `codePointAt`으로 code point 하나 전체를 메시지와 span에 사용한다. 시작 offset/line/column은 그대로다.

### 미수정 설계 메모 (Low, 명세 위반 아님)

- **N1**: lexer와 parser는 모든 `RangeError`를 `E_INPUT_LIMIT`로 바꾼다. 그런데 `SourceUnit.position`도 내부 불변식 위반을 `RangeError('invalid source offset')`로 던진다. 그런 내부 버그가 생기면 "host syntax limit exceeded"로 위장된다. 현재 코드에는 그런 경로가 없다.
- **N2**: AST의 `operator`가 `string` 타입이다. 그래서 `binary()`의 `switch (operator)`는 `never` exhaustiveness 대신 default throw에 의존한다. SPEC 85행의 취지("모든 union switch exhaustiveness")보다 약하다.
- **N3**: 폴더의 `dist/`는 오래된 빌드 산출물이다. 테스트는 globalSetup에서 다시 빌드하므로 영향이 없지만, 수정 후 CLI를 직접 실행하려면 `npm run build`가 필요하다.

## 4. False positive (조사 후 정상으로 판정)

| 후보 | 판정 근거 |
|---|---|
| `1e2`가 `invalid numeric suffix` | 지수 literal 미지원이고 숫자 뒤 식별자 문자는 suffix 오류다 (C, GRAMMAR E2) |
| `0/0`이 `division by zero` | `/0`은 피제수와 무관하게 RuntimeError다 (C) |
| `f`를 재대입하면 기존 재귀 호출 목적지도 바뀜 | C "함수 binding" 행에 명시되어 있다 |
| `let s="a";` 반복 `s=s+s` 결과가 `E_HOST_LIMIT` | JS `Invalid string length`는 RangeError이고, F5에 따라 host limit으로 변환된다 |
| 빈 배열 65단 중첩이 parse 성공 | edge 수는 64다. 괄호 64개·인자 64개 경계와 같은 기준이다 (S2 참고) |
| `--stack-size`를 줄이면 오류 종류가 달라짐 | 모두 `E_HOST_LIMIT` 또는 `E_INPUT_LIMIT`로 변환되고 crash는 없다 |
| piped REPL 첫 줄의 UTF-8 BOM | lexer가 text[0]의 BOM을 건너뛴다 |
| `node dist/cli/run.js -- file`이 usage 오류 | `npm run run -- file`은 npm이 `--`를 제거한다. 직접 실행에는 `--`가 필요 없다 |
| `a[i=i+1]=(i=i+10)`, `a[0]=(a=[9])` | target reference를 RHS 전에 한 번만 확정한다 (F4) |
| `(a)[0]=1` 허용, `(a)=1` 거부 | 최외곽 node 기준이다 (C) |
| REPL `if(...){...}` 다음 줄의 `else` | 명세상 즉시 제출되며 README에도 제한으로 적혀 있다 (H2) |

## 5. 명세 모호성 (임의로 바꾸지 않음)

- **S1**: `'문자'`가 UTF-16 code unit인지 code point인지 명시되지 않았다. column은 code unit 기준이지만 메시지에 lone surrogate가 나오면 출력이 손상되므로, code point로 해석해 BR-01로 수정했다.
- **S2**: 중첩 edge 계산 방식이 구문마다 다르게 보인다. 괄호, 배열 요소, 인자, index, unary, 대입 RHS는 자식 edge를 센다. block은 Program/부모 → block edge를 센다. 결과적으로 `[[...]]` 65단(가장 안쪽이 비어 있음)은 허용되고 `{{...}}` 65단은 거부된다. "edge" 정의와는 일관되지만 직관과 다를 수 있다. 새 테스트(BRC-02)는 현재 동작을 고정한다.
- **S3**: REPL echo는 "한 줄 표시"인데, 최상위 string은 원문으로 출력된다. 그래서 `"a\nb"`의 echo는 두 줄이고, `"1"`과 `1`의 echo가 같아 보인다.
- **S4**: 잘못된 UTF-8 byte는 Node 디코딩에서 조용히 U+FFFD로 바뀐다. "UTF-8 텍스트" 위반 입력의 처리는 정의되어 있지 않다.
- **S5**: 소스 끝의 `"abc\`는 `E_ESCAPE`로 보고된다. `E_STRING`(unterminated)과의 우선순위는 정의되어 있지 않다.
- **S6**: Program span이 offset 0이 아니라 첫 token에서 시작한다. 최상위 `E_HOST_LIMIT` anchor 위치에만 영향이 있다.
- **S7**: 언어 오류(1)와 출력 I/O 오류(2)가 함께 발생할 때 어느 exit code가 우선인지 정의되어 있지 않다. 이번 수정에서는 늦게 도착하는 I/O 오류가 2로 덮어쓴다.
- **S8**: stdin은 TTY이고 stdout은 redirect인 경우, adapter가 `terminal=false`가 되어 Ctrl+C가 buffer 취소 대신 프로세스를 종료한다. H1/H3은 이 혼합 경우를 다루지 않는다.
- **S9**: SPEC은 `DESIGN_REVIEW.md`(표 E, I, J)와 `PROGRESS.md`를 규범 또는 기록으로 참조한다. README도 두 문서를 링크한다. 이 blind 복사본에는 두 파일이 없어 링크가 끊겨 있다.
- **S10**: 400자리 이하의 극소 literal(`0.000…1`)은 0으로 underflow된다. 그 결과 `1/0.000…1`이 `division by zero`가 된다. "finite binary64, 정밀도 손실은 한계"와 모순은 아니다.

## 6. 테스트 자체의 문제

| # | 심각도 | 내용 |
|---|---|---|
| T1 | Medium | `docs.test.ts`는 `PROGRESS.md`, `DESIGN_REVIEW.md`가 있어야 통과한다. 이 복사본에서는 ENOENT로 2건이 실패한다. 제품 동작과 무관한 환경 의존 테스트다 (수정하지 않음) |
| T2 | Medium | SPEC G2는 "kind/code/정확한 line/column"을 검사하라고 하지만, 15개 code(`E_TDZ`, `E_REDECLARE`, `E_READONLY`, `E_ARITY`, `E_INDEX_TYPE`, `E_INDEX_BASE`, `E_ZERO_DIVISION`, `E_NONFINITE`, `E_EXPECTED`, `E_ASSIGN_TARGET`, `E_RETURN_CONTEXT`, `E_CHARACTER`, `E_NUMBER`, `E_STRING`, `E_ESCAPE`)는 code를 한 번도 단언하지 않는다. TypeError/RuntimeError 구분도 거의 검사하지 않는다 |
| T3 | Medium | lexer 거부 테스트가 `toThrow()`만 쓴다. 오류 code, 문제 문자 anchor, 메시지를 확인하지 않아 BR-01이 통과됐다 |
| T4 | Medium | CLI의 stdout/stderr I/O 실패, BOM+CRLF 스크립트, CRLF piped REPL을 실제 process로 검증하지 않는다. BR-02가 통과됐다 |
| T5 | Low | `T-PARSE-2`, `T-SCOPE-4/T-RET-3` 거부 목록이 `toThrow()`만 쓴다. 엉뚱한 이유의 오류로도 통과한다 |
| T6 | Low | `T-FMT-1`의 `<max-depth>` 검사가 `toContain`이다. 64/65 off-by-one을 잡지 못한다 |
| T7 | Low | `T-SAFE-5`의 unary/대입/block은 65 실패만 검사하고 64 성공은 검사하지 않는다. 배열/인자/index 중첩은 테스트가 없다 |
| T8 | Low | 평가 중첩 256/257의 정확한 경계가 없다. "깊은 모양이 E_EVAL_DEPTH를 낸다"만 확인한다 |
| T9 | Low | `T-REPL-7`(repl.test)이 오류 개수(`toHaveLength(4)`)만 본다. TDZ와 REDECLARE가 다른 오류로 바뀌어도 통과한다 |
| T10 | Low | CLI의 `print(1);missing;` 검사가 stderr `toContain`뿐이다. exit 1, 이미 출력된 stdout `1\n`, 진단 전체 형식을 end-to-end로 확인하지 않는다 |
| T11 | Low | `docs.test`의 README 예제 실행이 "출력이 비어 있지 않음"만 확인한다. README에 적힌 출력과 비교하지 않는다 |
| T12 | Low | `ADV-02`와 `watchdog.test`는 Node와 test helper를 검증할 뿐 제품 regression을 막지 않는다 |
| T13 | Low | 구현 세부와 결합되어 있다. `ADV-01`은 `SourceUnit.prototype.position`을 spy하고, fuzz invariant는 private `callDepth`/`evaluationDepth`를 `Reflect.get`으로 읽는다. 리팩터링만으로 깨질 수 있다 |
| T14 | Low | fuzz invariant가 진단 메시지 내용을 검사하지 않는다. arbitrary-utf16 lane이 있어도 BR-01을 잡지 못했다 |
| T15 | Low | 일반 `npm test`가 fuzz fault 테스트를 거치면서 `.tmp/fuzz-failures/*.json`을 작업 트리에 쓴다 |
| T16 | Low | REPL echo의 최상위 string(원문)과 중첩 string(quote) 구분이 테스트되지 않았다 |

기존 테스트는 삭제하거나 약화하지 않았다.

## 7. 새 regression / contract 테스트 (55개)

`tests/blind-review.test.ts` (49개)

- **BR-01 (3)**: 이모지 불법 문자의 메시지·span·진단 전체 형식, CRLF 이후 줄의 anchor, BMP 문자 대조군. **앞의 2개는 수정 전 구현에서 실패했다.**
- **BRC-01 (34)**: 오류 code별 kind/code/line/column/메시지 전체 32건, 65번째 call의 `(` anchor, REPL 충돌 `E_REDECLARE` anchor.
- **BRC-02 (8)**: 평가 중첩 256 허용·257 거부(두 가지 모양), 6종 구문(unary/대입/block/배열/인자/index)의 64 허용·65 거부, 배열 표시 64/65 경계.
- **BRC-03 (3)**: REPL TDZ 복구 시도별 정확한 진단, 최상위·중첩 string echo, 미완성 EOF 진단 전체와 exit 1.
- **BRC-04 (1)**: README 예제 실행 결과가 README에 적힌 출력과 일치하는지.

`tests/integration/blind-review-cli.test.ts` (6개)

- **BR-02 (2)**: script와 REPL에서 stdout을 일찍 닫으면 exit 2, `IOError: ... EPIPE`, stack trace 없음. **둘 다 수정 전 구현에서 실패했다 (exit 1).**
- **BRC-05 (4)**: runtime 오류 전 stdout 보존과 진단 전체 형식, BOM+CRLF+tab 스크립트의 UTF-16 anchor, 구문 오류 시 무실행, CRLF piped REPL.

## 8. 수정 내역

| 파일 | 변경 |
|---|---|
| `src/lexer.ts` | `E_CHARACTER`가 `codePointAt`으로 code point 하나 전체를 메시지와 span에 사용 (BR-01) |
| `src/cli/run.ts` | stdout/stderr `'error'` listener 추가. `IOError: <message>`를 출력하고 exit 2 (BR-02) |
| `src/cli/repl.ts` | 위와 같고, 추가로 입력을 닫음 (BR-02) |

언어 의미론, 공개 API, 문서 규칙은 바꾸지 않았다.

## 9. 검증 결과

| 검사 | Node v22.22.0 | Node v20.20.2 |
|---|---|---|
| `vitest run` | 253 통과 / 2 실패 | 253 통과 / 2 실패 |
| 실패 2건 | `docs.test.ts` ENOENT(`PROGRESS.md`, `DESIGN_REVIEW.md`), 수정 전부터 실패 | 같음 |
| `tsc --noEmit` | 통과 | — |
| `check:any` | 0건 | — |
| `tsc -p tsconfig.build.json` | 통과 | — |
| blind-review CLI 테스트 반복 | 5회 연속 통과 | 통과 |
| fuzz (seed 1~4 × 3,000) | 실패 0 | — |
| 독립 oracle 차등 비교 20,000 식 | 불일치 0 | — |

수정 전 기준선은 200개 중 198 통과, 2 실패(같은 docs 테스트)였다.

## 10. 남은 불확실성

- **Windows/Node 24 미검증**: EPIPE 테스트는 Linux의 동기 pipe 동작에서 확인했다. Windows의 비동기 named pipe에서는 오류 시점이 다를 수 있다. listener 자체는 플랫폼과 무관하지만 Windows에서 BR-02 테스트를 한 번 돌려 보는 것을 권한다.
- **TTY**: Linux pty로만 확인했다. Windows 콘솔의 Ctrl+C와 prompt는 확인하지 않았다.
- **docs 테스트**: 원본 저장소에 `PROGRESS.md`, `DESIGN_REVIEW.md`가 있다면 통과할 것으로 보이지만, 이 복사본에서는 검증할 수 없다.
- **benchmarks/**: 코드 품질만 훑었고 실행 검증은 하지 않았다.
- 차등 oracle은 식 수준(산술·비교·논리)만 다룬다. scope와 closure는 수작업 probe와 기존·신규 테스트에 의존한다.
