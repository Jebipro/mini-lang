# 13 Benchmark와 성능

[학습 목차](README.md) · 이전: [검증](12-testing-review.md) · 다음: [설계 대안](14-design-tradeoffs.md)

## 1. 이 개념이 왜 필요한가

느리거나 빠르다는 말은 무엇을 측정했는지 없으면 의미가 약하다. 언어 실행에는 원문 처리, AST 생성, 변수 검색, 함수 호출, 출력이 섞여 있다. 이 장은 수치를 외우기보다 측정 구간과 해석의 한계를 읽는 연습이다.

## 2. 일반적인 CS 개념

Benchmark는 정해진 workload의 비용을 측정한다. Warm-up은 JIT와 실행 환경의 초기 변화를 줄이려는 준비이며 완전한 안정 상태를 보장하지 않는다. Median은 표본의 중앙값, throughput은 단위 시간당 처리량이다. 측정 setup과 실제 대상 구간을 나누어야 비교가 공정해진다.

Microbenchmark는 실제 사용 전체를 대표하지 않을 수 있다. 성능 측정은 정확성 검사나 복잡도 증명과도 다르다.

## 3. Mini-Lang에서는 어떻게 설계했는가

56 workload를 각각 별도 child process에서 측정한다. 기본 warm-up 3회, 측정 7회이며 extended는 5/15회다. 각 sample에서 실행 상태를 준비하고 결과를 기대값과 비교한다. performance.now로 시간을 측정하고 raw samples와 median/min/max를 저장한다.

| 측정 종류 | 구간에 포함 | 준비 단계에서 제외 |
|---|---|---|
| lexer | lex | SourceUnit·line table 생성 |
| parser | new Parser(tokens).program | 토큰 생성 |
| interpreter/execute | 미리 만든 AST 실행 | compile, session 생성 |
| compile | SourceUnit 생성 + lex + parse | 입력 문자열 생성 |
| pipeline | SourceUnit 생성 + compile + execute | session/builtin 생성 |
| REPL | 여러 submission 처리 | 세션 생성·prepopulation |

pipeline도 파일 I/O, Node 시작, 터미널 렌더링을 포함하는 전체 CLI latency는 아니다. 오류 경로는 예상 오류 class/code를 확인하며 진단 렌더링·stderr는 제외한다.

## 4. 실제 저장소의 파일 / 함수 / 타입

- [benchmarks/workloads.ts](../../benchmarks/workloads.ts): Definition, Workload, definitions, workload, runtimeSource. prepare가 실행할 함수를 반환한다.
- [worker.ts](../../benchmarks/worker.ts): warmup/measurements, 타이머, 결과 assert, samplesMs.
- [run.ts](../../benchmarks/run.ts): 별도 worker 실행, 결과 파일 저장.
- [report.ts](../../benchmarks/report.ts): 결과 JSON에서 보고서 구성.
- [BENCHMARK.md](../../BENCHMARK.md): 환경·방법·수치·한계.
- [Node20 결과](../../benchmarks/results/node-20.20.2-baseline.json), [Node24 결과](../../benchmarks/results/node-24.16.0-baseline.json): 원시 측정 자료.

실제 worker의 순서에서 prepare는 타이머 앞, 일반 결과 assert는 타이머 뒤다. 오류 workload 내부의 오류 검증은 타이머 안이다. 작은 compile은 10회 batch, 오류는 100회 batch를 1회당 시간으로 나눈다.

## 5. 짧은 Mini-Lang 예제를 이용한 실행 추적

실제 arithmetic workload를 작은 N=3으로 줄인 교육용 예제:

```mini-lang
let i=0;
let sum=0;
while(i<3){sum=sum+1;i=i+1;}
print(sum);
```

i와 sum은 0→1→2→3으로 변한다. 세 번의 while body 실행에서 block 환경은 매번 새로 생기지만 i/sum은 부모의 cell을 갱신한다.

```text
3
```

compile 측정이라면 반복문은 실제로 돌지 않고 AST만 만든다. execute 측정은 같은 모양의 사전 컴파일 AST를 새 세션에서 실행한다. pipeline은 파싱과 실행을 함께 포함한다. workload의 실제 큰 N에서 루프 시간과 컴파일 시간을 분리해 볼 수 있다.

보고서의 예: arithmetic/10000 execute median은 Node20 약 10.362ms, Node24 약 9.319ms다. 이는 해당 머신·시점·설정의 관찰이며 현재 환경에서 재측정한 값이 아니다. 다른 workload에도 같은 비율을 적용할 수 없다.

## 6. 흔히 헷갈리는 부분

별도 프로세스에서 측정한 compile median과 execute median을 더해 pipeline median을 정확히 예측할 수 없다. JIT·GC·할당 상태가 다르다. fixed/prepopulated/growing REPL 차이를 lookup 비용만으로 해석할 수 없다. growing은 선언 등 작업 자체가 더 많다.

전체 시간/N의 median은 개별 submission latency 분포의 median이 아니다. Function loop와 arithmetic loop의 차이도 순수 함수 호출 한 번의 비용으로 단정하지 않는다.

## 7. 이 프로젝트의 설계 선택과 가능한 대안

독립 benchmark 명령을 두어 환경 잡음 때문에 일반 테스트가 불안정해지지 않게 했다. 성능 threshold는 일반 suite에 넣지 않았다. 통제된 전용 머신에서 반복 측정하는 대안은 작은 regression을 찾기 좋지만 운영 비용이 든다. profiler는 내부 병목을 조사할 후속 도구이며 현재 수치만으로 특정 함수가 병목이라고 확정하지 않는다.

보고서는 Windows의 동일 머신에서 Node20/24를 순차 측정했다. 메모리 peak·cold start·터미널 출력·비종료 loop는 측정 목표가 아니다. baseline 명령은 결과 파일을 덮어쓸 수 있으므로 학습 중 수치를 보기 위해 굳이 재실행할 필요는 없다.

## 8. 반드시 기억할 핵심 3~5개

- 성능 수치는 측정 구간과 함께 설명한다.
- compile과 execute는 다른 비용이다.
- median끼리 단순 합산하지 않는다.
- 결과값 검증 없는 빠른 실행은 의미가 없다.
- 작은 표본으로 병목·일반적 우위를 단정하지 않는다.

## 9. 확인 문제

1. 현재 pipeline 측정에 파일 읽기가 포함되는가?
2. 같은 AST를 같은 global에서 계속 재실행하면 선언 충돌이 생길 수 있는데 benchmark는 어떻게 피하는가?
3. 7개 sample 중 가장 작은 값만 성능 대표로 말하는 것이 보고서 방식인가?

<details>
<summary>해설</summary>

1. 아니다.
2. 각 sample/operation의 prepare에서 새 세션을 준비한다.
3. 아니다. median과 min/max 및 raw samples를 보관한다.
</details>

## 10. 내 말로 설명해볼 질문

- 성능 결과 하나를 측정 환경·입력·포함/제외 비용·한계 순서로 설명해보자.
- 최적화 전에 정답 검사와 측정 범위 정의가 필요한 이유를 설명해보자.
