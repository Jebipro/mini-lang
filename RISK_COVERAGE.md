# Risk / Test Coverage

DESIGN_REVIEW.md I의 40개 위험과 실제 테스트 파일을 연결한다. 테스트 이름에 설계 Test ID를 유지한다. 하나의 테스트가 여러 관련 위험을 검증할 수 있다.

| Risk | 실행 테스트 |
|---|---|
| R01 | [T-PREC-1](tests/parser-expression.test.ts), [T-PREC-2](tests/parser-expression.test.ts) |
| R02 | [T-ASG-1](tests/regression.test.ts) |
| R03 | [T-ASG-2](tests/parser-expression.test.ts) |
| R04 | [T-ASG-3](tests/regression.test.ts), [T-ASG-4](tests/regression.test.ts) |
| R05 | [T-SCOPE-1](tests/functions.test.ts) |
| R06 | [T-CLOS-1](tests/functions.test.ts), [T-CLOS-3](tests/functions.test.ts) |
| R07 | [T-CLOS-2](tests/regression.test.ts) |
| R08 | [T-REC-1](tests/regression.test.ts) |
| R09 | [T-REC-2](tests/functions.test.ts) |
| R10 | [T-SCOPE-3](tests/functions.test.ts) |
| R11 | [T-SCOPE-2](tests/interpreter.test.ts), [T-SCOPE-4](tests/regression.test.ts) |
| R12 | [T-RET-1](tests/integration/cli.test.ts), [T-RET-2](tests/functions.test.ts) |
| R13 | [T-RET-3](tests/regression.test.ts) |
| R14 | [T-RET-4](tests/regression.test.ts) |
| R15 | [T-LOG-1](tests/interpreter.test.ts), [T-LOG-2](tests/regression.test.ts) |
| R16 | [T-LOG-3](tests/regression.test.ts), [T-VAL-1](tests/values.test.ts) |
| R17 | [T-ARR-1](tests/arrays.test.ts), [T-ARR-2](tests/functions.test.ts) |
| R18 | [T-ARR-3](tests/regression.test.ts), [T-ARR-4](tests/arrays.test.ts) |
| R19 | [T-IDX-1](tests/arrays.test.ts), [T-IDX-2](tests/arrays.test.ts) |
| R20 | [T-VAL-2](tests/values.test.ts), [T-FMT-1](tests/values.test.ts) |
| R21 | [T-CALL-1](tests/functions.test.ts), [T-CALL-2](tests/functions.test.ts) |
| R22 | [T-BI-1](tests/builtins.test.ts), [T-BI-2](tests/environment.test.ts) |
| R23 | [T-LOC-1](tests/parser-expression.test.ts), [T-LOC-2](tests/parser-expression.test.ts) |
| R24 | [T-LOC-3](tests/regression.test.ts), [T-REPL-6](tests/repl.test.ts) |
| R25 | [T-LEX-2](tests/source.test.ts), [T-LOC-4](tests/source.test.ts) |
| R26 | [T-PARSE-1](tests/parser-statement.test.ts), [T-SAFE-3](tests/watchdog.test.ts) |
| R27 | [T-PARSE-2](tests/parser-expression.test.ts) |
| R28 | [T-REPL-1](tests/repl.test.ts), [T-REPL-2](tests/repl.test.ts) |
| R29 | [T-REPL-3](tests/repl.test.ts), [T-REPL-4](tests/repl.test.ts) |
| R30 | [T-REPL-5](tests/repl.test.ts) |
| R31 | [T-STATIC-1](tests/tooling.test.ts), [T-STATIC-2](tests/regression.test.ts) |
| R32 | [T-CONTRACT-1](tests/environment.test.ts) |
| R33 | [T-SAFE-1](tests/integration/safety.test.ts), [T-SAFE-2](tests/functions.test.ts) |
| R34 | [T-SAFE-3](tests/watchdog.test.ts) |
| R35 | [T-SAFE-4](tests/integration/safety.test.ts), [T-REPL-2](tests/repl.test.ts) |
| R36 | [T-EX-1](tests/integration/examples.test.ts), [T-EX-2](tests/examples-harness.test.ts) |
| R37 | [T-NUM-1](tests/values.test.ts), [T-NUM-2](tests/values.test.ts) |
| R38 | [T-REPL-7](tests/runner.test.ts) |
| R39 | [T-SAFE-5](tests/regression.test.ts) |
| R40 | [T-DOC-1](tests/docs.test.ts), [T-CLI-1](tests/integration/cli.test.ts) |

기능별 happy/boundary/invalid/regression/integration 분류와 상세 oracle은 DESIGN_REVIEW.md J를 따른다. 테스트를 단순히 등록하는 것만으로 통과로 간주하지 않으며 npm run check의 실제 결과를 PROGRESS.md에 기록한다.

