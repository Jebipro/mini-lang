# Cross-Model Review: Astra vs Claude

비교 대상은 두 모델의 결과다.

- **Astra**: `DESIGN_REVIEW.md`(설계·위험 40개·테스트 계획), `ADVERSARIAL_REVIEW.md`(AR-01/02), `FUZZ_REVIEW.md`(18,432 사례), `BENCHMARK.md`, 그리고 맥락 확인용 `PROGRESS.md`.
- **Claude**: `CLAUDE_BLIND_REVIEW.md`(BR-01/02, 테스트 문제 T1~T16).

새 대규모 리뷰는 반복하지 않았다. 두 리뷰의 차이에서 나온 구체적 가설만 추가로 검증했다(§8).

## 0. 요약

| 항목 | 결과 |
|---|---|
| 새로 확인된 production 버그 | **0** |
| 차이 분석에서 새로 드러난 테스트 공백 | 2: 식별자 대입 순서 미검증, `T-STATIC-2`가 tautological |
| 추가 테스트 | 3 (`BRC-06`, `tests/blind-review.test.ts`) |
| production 코드 변경 | 없음 |
| 전체 회귀 | 문서가 모두 있는 상태에서 Node v22.22.0과 v20.20.2 모두 **25 files / 258 tests 통과**. typecheck와 `check:any`도 통과 |

이번에 추가 문서가 생기면서 blind review 때 실패하던 `docs.test.ts` 2건도 통과한다.

## 1. 두 모델이 모두 발견한 문제

| 주제 | Astra | Claude |
|---|---|---|
| README 예제 테스트가 "출력이 비어 있지 않음"만 검사 | ADVERSARIAL "버그로 확정하지 않은 사항"에서 지적 | T11. `BRC-04`로 문서화된 출력과 정확히 비교하도록 보강 |
| 테스트가 private 내부 구조에 결합됨 (`callDepth`/`evaluationDepth`를 `Reflect.get`으로 읽음) | FUZZ_REVIEW "남은 한계"에서 직접 인정 | T13 |
| 소스 끝 `"abc\`의 오류 우선순위(`E_ESCAPE`인지 unterminated인지) | 명세가 금지한 입력이므로 바꾸지 않음 | S5. 같은 판단 |
| `++x`는 unary `+` 두 번 | 버그 아님 | 버그 아님 (probe) |
| runtime 실패 후 TDZ 유지, 비교 체인 TypeError, 인자 평가 후 call-depth 검사 | 명세 동작 | 명세 동작 (false positive 표) |
| 유한 corpus 통과가 안전성 증명은 아님. 모든 OS/Node를 검증하지 않음 | FUZZ/ADVERSARIAL 한계 | §10 남은 불확실성 |
| 핵심 의미론에서 버그 없음 | ADV-03~14 통과, fuzz 0 | probe·차등 oracle 20,000건·fuzz 12,000건 모두 0 |

## 2. Astra만 발견했던 문제

| ID | 내용 | Claude가 발견하지 못한 이유 |
|---|---|---|
| AR-01 (Medium) | test helper `runChild`가 Buffer 청크마다 따로 `toString()`해서 UTF-8 다중 바이트 문자가 깨짐 | blind 복사본에서는 이미 수정되어 있었다. Claude는 `ADV-02`를 오히려 "Node를 시험할 뿐"이라고 평가했다(§4 C3) |
| AR-02 (Low) | `SourceUnit` 기본 ID에 표시 이름을 써서, 이름이 같은 소스나 서로 다른 REPL 세션의 ID가 충돌 | 이미 수정된 상태였다. Claude는 `ADV-01`을 "구현에 결합된 spy"로만 평가했다 |
| 설계 단계의 위험 40개 | R01~R40을 사전에 식별하고 테스트 ID와 연결 | blind 범위 밖이었다. 구현이 이 위험들을 막고 있는지는 Claude probe에서도 확인됐다 |
| 성능 기준선 | 56 workload, Node20/24 | Claude는 성능을 측정하지 않았다 |

## 3. Claude만 발견한 문제

| ID | 내용 | Astra가 놓친 이유 (문서 기준 추정) |
|---|---|---|
| BR-02 (Medium) | stdout이나 stderr가 닫히면(`\| head`) Node stack trace가 새고 exit 1이 된다. 수정 후에는 `IOError`와 exit 2 | fuzz는 in-process API만 대상으로 한다. CLI 테스트에는 정상 pipe만 있다. FUZZ_REVIEW의 "host exception leakage 0"은 CLI adapter와 스트림 경계를 포함하지 않는다 |
| BR-01 (Low) | 이모지 같은 non-BMP 불법 문자를 lone surrogate로 보고해서 화면에 `'�'`가 나온다 | fuzz의 arbitrary-utf16 lane이 이 입력을 실제로 만든다. 그러나 invariant가 진단 메시지 내용을 검사하지 않고, lexer 테스트는 `toThrow()`만 쓴다 |
| 오류 계약 미검증 | 15개 오류 code와 kind/anchor가 테스트에서 단언되지 않음 (T2/T3/T5) | DESIGN_REVIEW J2에는 code·위치 oracle이 적혀 있지만 구현된 테스트는 substring 검사로 약해졌다. 문서 테스트는 ID 문자열이 존재하는지만 보므로 이 약화를 잡지 못한다 |
| 정확한 경계 미검증 | max-depth 64/65, 평가 256/257, 6종 nesting 64/65 (T6~T8) | J2 `T-SAFE-5`/`T-FMT-1`의 경계 oracle이 `toContain`이나 "충분히 깊은 입력"으로 구현되었다 |
| CLI 출력 형식 미검증 | stdout/stderr 전체 문자열과 BOM/CRLF 스크립트 (T4/T10) | J2 `T-CLI-1`은 "stdout/stderr 정확"을 요구했지만 실제 테스트는 `toContain`이다 |
| 설계 메모 N1/N2 | `RangeError` 일괄 변환이 내부 버그를 가릴 수 있음. operator가 `string` 타입이라 exhaustiveness가 약함 | — |

## 4. 한쪽의 분석이 false positive였던 경우

### Claude 측

| # | Claude의 주장 | 정정 |
|---|---|---|
| C1 | T1: `docs.test.ts`는 환경 의존 테스트이고 2건 실패 | blind 복사본에서 문서를 제거한 데 따른 착시였다. 원 저장소 구성(현재 폴더)에서는 통과한다. **false positive** |
| C2 | S9: SPEC/README가 존재하지 않는 `DESIGN_REVIEW.md`와 `PROGRESS.md`를 참조 | C1과 같은 원인이다. **false positive** |
| C3 | T12: `ADV-02`는 Node와 helper만 시험하므로 제품 regression을 막지 못한다 | 부분 오류다. `ADV-02`는 실제로 있었던 harness 버그 AR-01의 회귀 테스트다. harness가 출력을 잘못 수집하면 제품 테스트 전체가 거짓 실패하므로 유지할 가치가 있다. `watchdog.test`는 helper 자체 검증으로 보는 것이 맞다 |
| C4 | T13: `ADV-01`은 구현에 결합된 spy | 결합은 사실이다. 다만 AR-02의 "pending submission은 같은 ID 유지" 계약을 공개 API만으로 관찰할 방법이 마땅치 않아 택한 수단이다. 문제 제기는 유지하되 심각도는 Low로 충분하다 |

### Astra 측

엄밀한 false positive(버그가 아닌 것을 버그로 판정한 경우)는 없다. 다만 과대 주장이 세 가지 있다.

| # | 내용 |
|---|---|
| A1 | FUZZ_REVIEW의 "예상하지 못한 host exception leakage 0"은 in-process API 범위에서만 참이다. 같은 시점의 CLI에는 BR-02가 존재했다 |
| A2 | `RISK_COVERAGE`가 R31(strict narrowing)을 `T-STATIC-2`로 대응한다고 적었다. 그러나 이 테스트는 tautological이다(§8 H2). 실제 방어는 `tsc` 게이트다 |
| A3 | `PROGRESS.md`/`LIMITATIONS.md`의 "알려진 미해결 기능 버그 없음"은 그 시점 기준으로는 사실이었지만 BR-01/02가 존재했다. 현재는 둘 다 수정되어 다시 사실이다 |

AR-01을 Medium으로 본 것(제품이 아닌 test helper)은 판단의 문제이고 오류로 보지 않는다.

## 5. 두 모델 모두 충분히 검증하지 못한 영역

| 영역 | 상태 |
|---|---|
| **식별자 대입의 평가 순서** | 두 suite 모두 미검증이었다. mutation으로 발견했다(§8 H1). 이번에 `BRC-06`으로 보강했다 |
| Windows에서의 BR-02 (EPIPE) | Claude는 Linux에서만 검증했고, Astra는 Windows 환경이었지만 이 시나리오가 없었다. Windows의 비동기 named pipe에서 한 번 실행해야 한다 |
| Node 24 + 신규 테스트 | Astra는 Node24에서 기존 suite를 검증했고, Claude는 Node20/22에서 신규를 검증했다. 신규 테스트를 Node24에서 돌린 결과는 없다 |
| REPL TTY와 Ctrl+C | Astra는 piped smoke만 했고 Claude는 Linux pty만 했다. Windows 콘솔과 "stdin은 TTY, stdout은 redirect" 혼합 모드(S8)는 둘 다 다루지 않았다 |
| piped REPL에서 CR과 LF가 다른 청크로 나뉘는 경우(readline `crlfDelay`) | 둘 다 미검증 |
| 잘못된 UTF-8 입력 (S4) | 둘 다 정책이 없고 테스트도 없다 |
| scope·closure·REPL 다중 submission에 대한 독립 oracle | 두 모델 모두 식 수준 oracle(산술 432조합, 식 20,000건)만 있다. statement와 scope 의미론은 사례 테스트에 의존한다. fuzz는 사례 하나를 독립적으로 classify할 뿐 REPL 세션 순서를 생성하지 않는다 |
| 비종료 프로그램 + 닫힌 pipe, OOM, 거대 출력 | 언어 한계(시간 제한 없음)와 겹친다. 둘 다 범위 밖으로 두었다 |
| benchmark 결과의 재현성 | Claude는 재실행하지 않았다. Astra는 단일 Windows 머신에서 7 sample만 측정했다 |

## 6. 테스트 전략의 차이

| 관점 | Astra | Claude |
|---|---|---|
| 출발점 | 설계 우선: 위험 40개 → 테스트 ID → `RISK_COVERAGE` 자동 연결 | 명세 표의 행 단위 감사 + 실행 probe |
| 강점 | crash/hang 안전성. child process 격리와 deadline. 결정적 fuzz와 replay. span/AST height/EOF/counter 같은 구조 invariant. 평가 순서의 교묘한 사례(ADV-03~05, 09). 성능 기준선 | **계약의 정밀도**: kind/code/line/column/메시지 전체, off-by-one 경계, CLI stdout/stderr 전체 문자열. 호스트 I/O 경계. 차등 oracle |
| 약점 | 테스트 ID가 "존재"하는지만 문서 테스트가 확인해서, assertion 강도는 측정하지 못한다. J2의 정확한 oracle이 구현 단계에서 substring/`toThrow()`로 약해졌다. adapter의 비정상 I/O는 검증하지 않았다 | 지속 가능한 fuzz 인프라가 없다. Linux만 검증했다. 이미 수정된 버그(AR-01/02)는 원리상 관찰할 수 없었다. 문서가 빠져 있어 일부 테스트 의도를 오판했다(C1~C3) |
| 오류 판정 | 버그 수를 원인 단위로 세고, 동일 원인의 여러 실패는 합산하지 않는다 | 같은 방식 |
| 커버리지의 성격 | 넓다 (입력 공간, 깊이) | 깊다 (관찰 가능한 계약 각각) |

### mutation으로 비교한 실제 탐지력 (§8 H1)

14개 mutant를 대상으로 했다. 수치는 각 suite에서 실패한 테스트 수다.

| mutant | 기존(Astra) suite | Claude 신규 |
|---|---|---|
| M1 max-depth 63 | 0 | 1 |
| M2 평가 한도 257 | 0 | 1 |
| M3 parse nesting 65 | 5 | 6 |
| M4 BR-01 되돌림 | 0 | 2 |
| M5 EPIPE handler 제거 | 0 | 1 |
| M6 식별자 대입 RHS 선평가 | **0** | **0** (BRC-06 추가 후 3) |
| M7 call depth 65 | 8 | 1 |
| M8 E_INDEX_TYPE을 RuntimeError로 | 0 | 2 |
| M9 escape anchor 이동 | 0 | 1 |
| M10 REPL이 null도 echo | 2 | 0 |
| M11 floored modulo | 3 | 0 |
| M12 TDZ code 이름 변경 | 0 | 1 |
| M13 not-callable anchor를 callee로 | 1 | 1 |
| M14 unterminated anchor를 EOF로 | 0 | 1 |

- 기존 suite는 14개 중 5개를 잡았다. Claude 신규는 11개, BRC-06 추가 후 12개를 잡았다. 두 suite를 합치면 14개 전부를 잡는다.
- **주의할 편향**: mutant는 Claude가 리뷰 중 의심한 계약 위주로 골랐으므로 Claude 쪽에 유리한 표본이다. 반대로 M10/M11처럼 의미론의 핵심을 건드리는 mutant는 기존 suite만 잡았다. 결론은 "두 suite가 상호 보완적"이며 어느 한쪽의 우위로 읽어서는 안 된다.

## 7. 향후 regression suite에 반드시 유지할 테스트

### 평가 순서·참조 의미론 (가장 깨지기 쉬움)

- `T-ASG-3`, `T-ASG-4`, `ADV-03`(callee 고정), `ADV-04`(index 중 base 재대입), `ADV-05`(operand 참조), `ADV-09`(인자 실패 시 앞 효과 유지)
- `BRC-06`(식별자 대입 target 선검증). 유일하게 M6을 잡는 테스트다
- `T-NUM-1 / T-LOC-3`(`null+print(1)`: 두 피연산자 평가 후 타입 검사), `T-LOG-2`(단락 평가의 관찰 가능 효과)

### scope·closure·return

- `T-SCOPE-1/3/4`, `T-CLOS-1~3`, `T-CLOS-2`(loop 반복마다 독립 cell), `ADV-08`, `T-REC-1/2`, `T-RET-1~4`

### 자원 한계 (child process 격리 포함)

- `T-SAFE-1`(integration, 기본 스택에서 63/64/65), `safety.test.ts` 3건, `T-SAFE-2`(RangeError 주입), `T-SAFE-4`, `ADV-06`
- `T-SAFE-5`, `ADV-12`, 그리고 `BRC-02`의 정확한 경계: 256/257, 6종 nesting 64/65, max-depth 64/65. M1·M2를 잡는 테스트는 BRC-02뿐이다

### REPL

- `T-REPL-1~7`, `runner.test`(preflight 원자성), `ADV-07`, `ADV-11`, `BRC-03`(복구 시도별 정확한 진단)
- `repl.test`의 "echoes only top-level non-null". M10을 잡는 유일한 테스트다

### 진단 계약과 Unicode

- `BRC-01` 표 전체(32건 + call-depth anchor + REPL 충돌), `BR-01`, `ADV-10`, `T-LOC-1~4`, `source.test`

### CLI와 harness

- `BR-02`(script/REPL), `BRC-05`(정확한 stdout/stderr, BOM+CRLF, CRLF piped REPL), `T-CLI-1`
- `ADV-02`: AR-01 회귀. harness가 깨지면 모든 integration 테스트의 신뢰성이 무너진다
- `ADV-01`: AR-02 회귀
- fuzz smoke 4건과 watchdog fault 2건, `T-EX-1/2`, `BRC-04`

### 수치 의미론

- `ADV-13`, `ADV-14`(독립 oracle 432조합), `T-NUM-2`. M11을 잡는 것은 이 계열뿐이다

### 개선 권고 (기존 테스트 삭제·약화 없이)

1. `T-STATIC-2`는 실제 보호 기능이 없다(§8 H2). exhaustiveness의 실제 방어는 `npm run check`의 `tsc`와 테스트 globalSetup의 build다. 따라서 typecheck 게이트를 suite 밖으로 빼지 말아야 한다. 가능하면 "case가 빠진 fixture 파일을 컴파일하면 실패하는지"를 확인하는 테스트로 보강한다.
2. fuzz invariant에 진단 메시지 well-formedness를 추가한다. 유효한 UTF-16 입력이면 메시지에 lone surrogate가 없어야 한다.
3. 기존 `toThrow()`/`toContain` 위주 테스트는 남겨 두고, 각 오류 code에 대해 `BRC-01` 수준의 정확한 단언이 최소 하나씩 존재하도록 유지한다.
4. `RISK_COVERAGE` 문서 테스트에 "ID가 존재하는가"뿐 아니라 assertion 강도를 보는 별도 지표를 둔다. 예를 들어 주기적인 mutation smoke를 돌린다.

## 8. 차이에서 드러난 가설의 추가 검증

### H1. 두 suite 모두 놓친 계약이 있는가 → 있음 (테스트 공백, 버그 아님)

- **방법**: `src/` 14곳에 단일 변경 mutant를 만들고 전체 suite를 실행했다. type error로 build가 중단된 mutant는 무효로 처리했다. M10은 처음 구성이 type error였기 때문에 타입상 유효한 형태로 다시 실행했다.
- **결과**: M6(식별자 대입에서 RHS를 target 검증보다 먼저 평가)은 두 suite 모두에서 살아남았다.
- **명세**: C "대입 순서"는 "target reference 결정·검증 후 RHS 평가"다.
- **구현 상태**: 현재 구현은 올바르다. probe에서 `missing = print(1);`은 출력 없이 `E_UNDEFINED`를 낸다. 그러므로 버그는 아니고 테스트 공백이다.
- **조치**: `BRC-06` 3건을 추가했다(`E_UNDEFINED`, `E_READONLY`, `E_TDZ`, 모두 출력 없음). 현재 구현에서는 통과하고, M6을 적용하면 3건 모두 실패하는 것을 확인했다.

### H2. `T-STATIC-2`가 실제로 누락된 variant를 잡는가 → 잡지 못함

- **방법**: `value-format.ts`에서 `case 'builtin'`을 제거했다.
- **결과**: `tsc --noEmit`은 `TS2345`로 실패한다. 반면 build를 거치지 않는 설정으로 `tests/regression.test.ts`만 실행하면 14/14 통과한다.
- **결론**: 이 테스트는 "RuntimeValue는 never에 대입할 수 없다"는 항상 참인 사실만 확인한다.
- **조치**: production 변경은 없다. §7 권고 1로 기록했다.

### H3. BR-01 수정이 fuzz가 생성하는 lone surrogate 입력에서 안전한가 → 안전

lone high/low surrogate와 끝에 홀로 남은 surrogate 입력에서 모두 폭 1 span과 해당 code unit 메시지를 낸다. crash나 범위 밖 offset은 없다. 전체 suite에 포함된 fuzz smoke 2,048건도 통과했다.

### H4. 문서 복원 후 `docs.test.ts`가 통과하는가 → 통과

Claude T1/S9가 blind 복사본의 착시였음을 확인했다(§4 C1, C2).

### 새 버그

없음. 따라서 production 수정 절차(실패 테스트 → 재현 → 수정)는 적용할 대상이 없었다.

## 9. 변경 내역과 검증

| 파일 | 변경 |
|---|---|
| `tests/blind-review.test.ts` | `BRC-06` 3건 추가 (기존 테스트 변경 없음) |
| `CROSS_MODEL_REVIEW.md` | 이 문서 |

production 코드, 명세, 기존 문서는 변경하지 않았다. `CLAUDE_BLIND_REVIEW.md`는 당시 기록으로 보존하고, 정정 사항은 §4에만 적었다. `PROGRESS.md`도 갱신하지 않았다.

| 검사 | Node v22.22.0 | Node v20.20.2 |
|---|---|---|
| `vitest run` | 25 files / **258 passed** | 25 files / **258 passed** |
| `tsc --noEmit` | 통과 | — |
| `check:any` | 0건 | — |
| mutation 14건 | 합산 suite에서 전부 탐지 (§6) | — |

## 10. 남은 불확실성

- Windows와 Node 24에서 `BR-02`, `BRC-05`, `BRC-06`을 실행한 결과가 없다. Astra의 검증 환경(Windows/Node24)에서 `npm run check`를 한 번 돌리는 것을 권한다.
- mutation 표본은 14개이고 선택 편향이 있다. 체계적인 mutation 도구(예: Stryker)를 쓴 결과가 아니다.
- statement와 scope 의미론에 대한 독립 차등 oracle은 여전히 어느 쪽에도 없다.
- benchmark 수치는 재현하지 않았다.
