# Mini-Lang Performance Baseline


측정일: 2026-10-03. Production 기준 커밋: 7d483488dc570753af1a270680815cfb8ca0a8d4. 56 workload 각각을 별도 child process로 측정했다. Production 수정·최적화 및 의미론 변경 없음.

## Environment

| 항목 | 측정 환경 |
| --- | --- |
| OS / architecture | win32 10.0.26200 / x64 |
| CPU | AMD Ryzen 5 3600 6-Core Processor |
| Logical CPUs | 12 |
| RAM | 31.91 GiB |
| Node | v20.20.2 / v24.16.0 |
| V8 | 11.3.244.8-node.38 / 13.6.233.17-node.49 |
| Node24 UTC start/end | 2026-10-03T06:35:29.814Z / 2026-10-03T06:36:12.088Z |
| Node20 UTC start/end | 2026-10-03T06:36:12.204Z / 2026-10-03T06:37:20.729Z |

```sh
npm run benchmark
# 더 긴 측정: warm-up 5회, measurement 15회 (이번 baseline에서는 실행하지 않음)
npm run benchmark:extended
```

두 버전은 병렬로 실행하지 않았다. Node24에서 빌드한 동일 JS를 Node20으로 실행했다. Node20의 실제 명령은 PowerShell에서 다음과 같다.

```powershell
& '<Node 20 node.exe 경로>' .tmp/benchmark/benchmarks/run.js
```

다른 환경에서는 해당 Node20 executable로 같은 entry point를 실행한다. 결과는 benchmarks/results/node-<version>-baseline.json에 저장한다. 이 문서는 두 baseline JSON을 읽어 `node .tmp/benchmark/benchmarks/report.js`로 재생성할 수 있다.

## Methodology

- 표의 시간 단위는 ms이며 **median [min, max]**다. raw JSON에는 7개 측정값 전체를 저장했다.
- workload별 새 Node process에서 입력을 먼저 생성하고 warm-up 3회 후 measurement 7회를 수행했다. timer는 performance.now(). baseline 재실행은 결과 파일을 덮어쓴다.
- 각 sample에 fresh session을 준비하며 REPL은 sample 내에서만 persistent state를 유지한다. 각 실행 결과를 독립 기대값과 비교하고 불일치하면 중단한다.
- Lexer는 SourceUnit/line table 사전 생성, Parser는 tokens 사전 생성, Interpreter는 AST 사전 컴파일이다. 해당 준비 작업은 각각 측정에서 제외한다.
- compile은 SourceUnit 생성+Lexer+Parser, execute는 사전 컴파일 AST 실행, pipeline은 SourceUnit 생성+compile+execute다. session/builtin 초기화는 execute/pipeline 측정에서도 제외한다. 파일 I/O·프로세스 시작·터미널 렌더링은 측정하지 않는다.
- 짧은 compile은 sample당 10회, 오류 경로는 100회 batch 후 1회당 시간으로 나눈다. 나머지는 sample당 1회 실행한다. REPL 한 operation은 100/1,000 submissions다.
- 출력은 주입 callback에 수집하고 사용한다. 일반 결과 assert는 타이머 밖, 오류 경로의 오류 class/code 검사는 타이머 안이다. GC 강제 실행, 스택 크기 조정, 최적화 flag는 사용하지 않는다. child timeout은 60초다.
- paired Lexer/Parser는 정확히 같은 세 종류 원문을 사용한다. 초기 47-workload 탐색 결과는 비교 입력을 보완한 최종 56-workload 결과로 대체했다.

## Lexer Results

mixed는 1,000/10,000/100,000줄이다. 나머지는 Parser와 동일한 100/1,000/10,000개 block 입력이다. token 수는 EOF 하나를 포함한다.

| 입력/규모 | chars / UTF-8 bytes | tokens | Node20 ms | Node24 ms | tokens/s 20 / 24 |
| --- | --- | --- | --- | --- | --- |
| mixed/1000 | 29399 / 30199 | 14401 | 9.605 [7.066, 16.118] | 7.153 [5.510, 11.239] | 1,499,323 / 2,013,366 |
| mixed/10000 | 293999 / 301999 | 144001 | 122.438 [108.933, 148.308] | 74.690 [60.835, 96.545] | 1,176,109 / 1,927,977 |
| mixed/100000 | 2939999 / 3019999 | 1440001 | 1265.342 [1239.816, 1470.295] | 987.397 [850.875, 1167.989] | 1,138,033 / 1,458,381 |
| expression/100 | 5299 / 5299 | 3601 | 2.916 [2.169, 3.747] | 2.432 [1.062, 3.359] | 1,234,911 / 1,480,796 |
| expression/1000 | 52999 / 52999 | 36001 | 27.370 [23.642, 31.159] | 13.487 [11.756, 19.435] | 1,315,364 / 2,669,410 |
| expression/10000 | 529999 / 529999 | 360001 | 352.103 [308.799, 371.347] | 205.192 [171.971, 229.608] | 1,022,431 / 1,754,459 |
| statement/100 | 7809 / 7809 | 4601 | 2.675 [1.979, 4.074] | 2.923 [1.739, 4.470] | 1,720,257 / 1,574,068 |
| statement/1000 | 87009 / 87009 | 46001 | 28.312 [24.912, 37.366] | 19.030 [16.369, 24.957] | 1,624,794 / 2,417,276 |
| statement/10000 | 960009 / 960009 | 460001 | 405.234 [371.094, 446.024] | 249.592 [234.230, 307.400] | 1,135,150 / 1,843,014 |
| function/100 | 8079 / 8079 | 4101 | 2.873 [1.373, 3.206] | 2.560 [1.357, 3.391] | 1,427,328 / 1,602,141 |
| function/1000 | 82779 / 82779 | 41001 | 19.726 [18.203, 25.672] | 17.978 [15.369, 21.975] | 2,078,505 / 2,280,621 |
| function/10000 | 847779 / 847779 | 410001 | 226.312 [215.856, 270.826] | 211.693 [178.064, 232.396] | 1,811,663 / 1,936,770 |

## Parser Results

Expression-heavy는 산술·논리·group·array·call/index chain, statement-heavy는 block/let/assignment/if/while, function-heavy는 nested block과 closure 선언 및 chained call이다. Lexer 시간은 제외한다.

| 입력/blocks | chars / bytes | 최상위 statements | Node20 ms | Node24 ms | tokens/s 20 / 24 |
| --- | --- | --- | --- | --- | --- |
| expression/100 | 5299 / 5299 | 300 | 4.072 [3.485, 7.437] | 1.770 [1.166, 3.023] | 884,289 / 2,034,808 |
| expression/1000 | 52999 / 52999 | 3000 | 35.381 [33.716, 37.460] | 10.443 [8.114, 12.997] | 1,017,524 / 3,447,348 |
| expression/10000 | 529999 / 529999 | 30000 | 368.487 [360.802, 482.135] | 107.572 [106.620, 120.106] | 976,970 / 3,346,621 |
| statement/100 | 7809 / 7809 | 100 | 4.475 [3.946, 7.405] | 1.873 [1.179, 2.435] | 1,028,133 / 2,456,749 |
| statement/1000 | 87009 / 87009 | 1000 | 44.708 [42.511, 50.171] | 15.398 [9.946, 17.167] | 1,028,926 / 2,987,466 |
| statement/10000 | 960009 / 960009 | 10000 | 438.800 [410.112, 532.492] | 130.466 [123.354, 133.681] | 1,048,317 / 3,525,830 |
| function/100 | 8079 / 8079 | 200 | 4.330 [3.333, 7.595] | 1.255 [1.028, 1.931] | 947,091 / 3,267,729 |
| function/1000 | 82779 / 82779 | 2000 | 26.181 [25.538, 28.836] | 9.991 [8.284, 12.034] | 1,566,053 / 4,103,629 |
| function/10000 | 847779 / 847779 | 20000 | 276.279 [266.915, 310.486] | 107.118 [95.178, 111.425] | 1,484,012 / 3,827,550 |

## Interpreter Results

Arithmetic는 sum+1, function은 동일 loop에서 inc(sum)을 호출한다. factorial은 fact(12)를 1,000회 실행하고 Fibonacci는 fib(20) 한 번이다. 배열은 1,000/10,000/100,000 elements를 한 번씩 순회하거나 갱신한다. 배열 literal의 runtime allocation/초기화는 포함하지만 소스 생성·파싱은 제외한다.

| 입력/규모 | chars / bytes | Node20 ms | Node24 ms | unit | units/s 20 / 24 |
| --- | --- | --- | --- | --- | --- |
| arithmetic/10000 | 61 / 61 | 9.608 [9.224, 10.932] | 8.601 [8.241, 9.164] | iterations | 1,040,767 / 1,162,601 |
| arithmetic/100000 | 62 / 62 | 96.687 [94.170, 98.014] | 78.740 [77.526, 80.410] | iterations | 1,034,271 / 1,269,996 |
| function/10000 | 86 / 86 | 14.843 [14.318, 15.818] | 13.972 [13.414, 16.589] | iterations | 673,727 / 715,707 |
| function/100000 | 87 / 87 | 147.781 [143.553, 151.260] | 130.582 [126.946, 132.756] | iterations | 676,679 / 765,805 |
| factorial/1000 | 117 / 117 | 15.557 [14.790, 16.851] | 12.261 [12.004, 14.758] | factorials | 64,281 / 81,559 |
| fibonacci/20 | 69 / 69 | 24.015 [22.822, 30.721] | 14.316 [13.437, 16.738] | programs | 42 / 70 |
| traversal/1000 | 3963 / 3963 | 3.840 [3.066, 5.226] | 1.733 [1.486, 2.042] | iterations | 260,451 / 576,967 |
| traversal/10000 | 48963 / 48963 | 20.673 [19.644, 21.506] | 13.327 [12.120, 15.373] | iterations | 483,713 / 750,351 |
| traversal/100000 | 588963 / 588963 | 219.054 [214.019, 237.584] | 127.060 [126.289, 129.866] | iterations | 456,508 / 787,029 |
| mutation/1000 | 2058 / 2058 | 2.876 [2.497, 3.219] | 1.414 [1.211, 1.720] | iterations | 347,717 / 707,064 |
| mutation/10000 | 20060 / 20060 | 16.669 [15.317, 24.424] | 10.832 [8.993, 12.695] | iterations | 599,905 / 923,191 |
| mutation/100000 | 200062 / 200062 | 166.842 [160.112, 174.188] | 82.965 [79.763, 94.790] | iterations | 599,371 / 1,205,325 |

## End-to-End Results

모두 10,000회 반복 또는 10,000개 배열이다. 각 phase는 별도 process에서 독립 측정했으므로 median을 더해 pipeline 시간을 예측하지 않는다. 작은 loop source와 큰 array literal source는 compile 비용이 다르다.

| 입력 / phase | chars / bytes | Node20 ms | Node24 ms |
| --- | --- | --- | --- |
| arithmetic / compile | 61 / 61 | 0.129 [0.086, 0.152] | 0.045 [0.027, 0.102] |
| control / compile | 89 / 89 | 0.150 [0.108, 0.232] | 0.058 [0.041, 0.100] |
| function / compile | 86 / 86 | 0.152 [0.093, 0.174] | 0.057 [0.035, 0.122] |
| traversal / compile | 48963 / 48963 | 36.550 [35.392, 42.909] | 11.729 [11.073, 12.441] |
| arithmetic / execute | 61 / 61 | 10.362 [9.617, 11.614] | 9.319 [9.137, 10.320] |
| control / execute | 89 / 89 | 15.670 [15.241, 17.969] | 12.655 [12.368, 14.129] |
| function / execute | 86 / 86 | 14.915 [14.708, 15.449] | 13.309 [12.928, 15.092] |
| traversal / execute | 48963 / 48963 | 21.087 [20.535, 22.562] | 13.540 [12.188, 16.316] |
| arithmetic / pipeline | 61 / 61 | 8.802 [8.713, 8.915] | 9.292 [8.797, 12.091] |
| control / pipeline | 89 / 89 | 14.917 [14.122, 15.674] | 14.190 [13.484, 15.855] |
| function / pipeline | 86 / 86 | 15.776 [15.341, 18.154] | 13.127 [12.909, 14.159] |
| traversal / pipeline | 48963 / 48963 | 52.367 [50.297, 63.119] | 26.945 [24.575, 28.795] |

## REPL Results

fixed/prepopulated는 x=x+1을 반복한다. prepopulated는 같은 global scope에 10,000개 이름을 미리 추가하며 이 setup은 측정에서 제외한다. growing은 submission마다 이름을 하나 선언하고 x에 대입한다. 따라서 growing과 fixed의 차이를 lookup 비용만으로 해석할 수 없다. 표의 per-submission 값은 전체 시간/N의 median과 mean이며 개별 요청 latency 분포의 median은 아니다.

| 유형/N | globals 전→후 | Node20 전체 ms | Node24 전체 ms | 20 per-sub ms median / mean | 24 per-sub ms median / mean |
| --- | --- | --- | --- | --- | --- |
| fixed/100 | 1→1 | 2.395 [2.039, 3.033] | 1.208 [0.675, 1.569] | 0.02395 / 0.02467 | 0.01208 / 0.01145 |
| fixed/1000 | 1→1 | 11.647 [10.144, 12.904] | 6.097 [4.898, 7.202] | 0.01165 / 0.01174 | 0.00610 / 0.00606 |
| prepopulated/100 | 10001→10001 | 1.601 [1.378, 1.829] | 0.656 [0.515, 7.279] | 0.01601 / 0.01596 | 0.00656 / 0.01582 |
| prepopulated/1000 | 10001→10001 | 13.575 [10.737, 16.274] | 5.249 [4.157, 7.460] | 0.01357 / 0.01322 | 0.00525 / 0.00525 |
| growing/100 | 1→101 | 3.803 [2.678, 4.029] | 1.273 [1.070, 2.846] | 0.03803 / 0.03533 | 0.01273 / 0.01528 |
| growing/1000 | 1→1001 | 16.338 [15.185, 17.890] | 8.408 [7.016, 10.277] | 0.01634 / 0.01636 | 0.00841 / 0.00850 |

## Error-path Results

Lexer/Parser는 해당 단계만, runtime 오류는 미리 컴파일한 AST의 실행만 측정한다. 진단 문자열 렌더링·stderr 출력은 제외한다. 각 오류 class/code가 예상과 같은지 검사한다.

| 오류 | code | Node20 ms/error | Node24 ms/error | errors/s 20 / 24 |
| --- | --- | --- | --- | --- |
| lexer | E_ESCAPE | 0.012 [0.012, 0.019] | 0.014 [0.007, 0.017] | 80,141 / 71,767 |
| parser | E_EXPECTED | 0.022 [0.020, 0.024] | 0.020 [0.015, 0.026] | 44,823 / 49,039 |
| undefined | E_UNDEFINED | 0.018 [0.017, 0.022] | 0.015 [0.010, 0.017] | 55,142 / 65,920 |
| type | E_OPERAND | 0.022 [0.020, 0.027] | 0.020 [0.016, 0.022] | 45,673 / 50,692 |
| bounds | E_INDEX_RANGE | 0.024 [0.023, 0.031] | 0.021 [0.018, 0.024] | 41,293 / 47,304 |

## Node 20 vs Node 24

동일 머신·입력·설정의 관찰값이다. 아래 ratio는 Node24 median / Node20 median이며 속도 우열의 일반적인 결론이나 통계적 유의성을 뜻하지 않는다.

| workload | Node24 / Node20 |
| --- | --- |
| lexer/mixed/100000 | 0.780 |
| parser/expression/10000 | 0.292 |
| interpreter/arithmetic/100000 | 0.814 |
| interpreter/function/100000 | 0.884 |
| pipeline/traversal/10000 | 0.515 |
| repl/fixed/1000 | 0.523 |

## Observations

- v20.20.2: mixed Lexer 1k→10k→100k줄 시간 배율은 12.75×, 10.33×. 동일 10k-block expression에서 Parser/Lexer 비용 비율은 1.05×.
- v20.20.2: 100k loop의 function/arithmetic 시간 비율 1.53×. 이는 전체 loop 비교이며 순수 call 하나의 비용이 아니다. 배열 traversal 10k→100k 배율 10.60×, mutation 배율 10.01×.
- v20.20.2: 1,000 submissions의 prepopulated/fixed 시간 비율 1.17×. global 수가 1→10,001로 늘어도 그 증가율에 비례하는 lookup 비용은 관찰되지 않았다.

- v24.16.0: mixed Lexer 1k→10k→100k줄 시간 배율은 10.44×, 13.22×. 동일 10k-block expression에서 Parser/Lexer 비용 비율은 0.52×.
- v24.16.0: 100k loop의 function/arithmetic 시간 비율 1.66×. 이는 전체 loop 비교이며 순수 call 하나의 비용이 아니다. 배열 traversal 10k→100k 배율 9.53×, mutation 배율 7.66×.
- v24.16.0: 1,000 submissions의 prepopulated/fixed 시간 비율 0.86×. global 수가 1→10,001로 늘어도 그 증가율에 비례하는 lookup 비용은 관찰되지 않았다.

- Loop 중심의 작은 원문은 execution이 compile보다 큰 비용이다. 배열 원소를 원문 literal로 넣으면 compile도 무시할 수 없는 비용을 갖는다. 독립 실행한 pipeline과 compile+execute의 차이는 allocator/GC/JIT 상태가 달라질 수 있어 단순 오차 또는 최적화 효과로 단정하지 않는다.
- 큰 입력의 10배 증가에 대응하는 시간 배율은 위 표와 같다. 전체적으로 규모와 함께 증가하지만 작은 sample의 JIT와 GC noise 때문에 엄밀한 선형성/복잡도를 이 측정만으로 증명하지 않는다. 오류 workload에서는 timeout이나 잘못된 결과를 발견하지 않았다.

## Potential Optimization Areas

- 같은 입력의 token/AST 생성 allocation과 source-position 변환을 profiler로 분리 측정할 후보가 있다. 이 benchmark만으로 어느 내부 함수가 병목인지 단정하지 않는다.
- user call과 frame/scope 준비 비용은 paired loop 차이의 후속 조사 대상이다. 배열 allocation과 순회 비용도 별도로 나눌 수 있다.
- REPL은 대규모 global의 단일 lookup 외에 깊은 parent-chain 조건을 후속 측정할 수 있다. 이번에는 실제 최적화·리팩터링을 하지 않았다.

## Limitations

- Microbenchmark는 실제 전체 사용자 workload를 대표하지 않는다. 고정 실행 순서, 짧은 warm-up, GC, OS scheduling, CPU 전력/온도, JIT tiering이 결과에 영향을 준다. 완전한 steady state를 보장하지 않는다.
- 서로 다른 process/phase median은 가산적이지 않으며 작은 시간 차이는 noise일 수 있다. timer와 결과 수집 overhead를 차감하지 않았다. 다른 머신·Node 패치 버전에서는 결과가 달라질 수 있다.
- 메모리 peak, 파일 I/O, cold start, 터미널 rendering, 무한 loop, 깊이 제한 초과 workload는 성능 목표에 포함하지 않았다. 실행 제한을 늘려 benchmark를 통과시키지 않았다.
- JSON의 sourceCommit은 측정 당시 production 기준 HEAD이다. 추가된 benchmark 코드는 이 보고서를 포함한 benchmark commit에 보존된다.

## Validation

작업 전과 작업 후 npm run check: 전체 200개 테스트(23 files), strict typecheck, explicit any 검사 모두 exit 0. 작업 후 integration 25개, example 검사 16개, extended fuzz 16,384건 및 각 build도 exit 0. CI fuzz 2,048건은 전체 테스트에 포함된다. 각 benchmark는 warm-up과 measurement 모두 결과값을 확인했다. 성능 threshold를 일반 테스트 suite에 넣지 않았으며 benchmark는 별도 명령으로만 실행한다. 상세 재개·커밋 기록은 PROGRESS.md에 보존한다.

원시 데이터: [Node20](benchmarks/results/node-20.20.2-baseline.json), [Node24](benchmarks/results/node-24.16.0-baseline.json).
