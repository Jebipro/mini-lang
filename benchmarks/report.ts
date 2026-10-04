import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}
function number(row: Record<string, unknown>, key: string): number {
  const value = row[key]; assert.ok(typeof value === 'number' && Number.isFinite(value), key); return value;
}
function load(version: string) {
  const data: unknown = JSON.parse(readFileSync(`benchmarks/results/node-${version}-baseline.json`, 'utf8'));
  const metadata = record(data); assert.ok(Array.isArray(metadata.results));
  return { metadata, rows: metadata.results.map(record) };
}
const older = load('20.20.2'), newer = load('24.16.0');
assert.equal(older.rows.length, newer.rows.length);
function match(row: Record<string, unknown>, rows = newer.rows): Record<string, unknown> {
  const found = rows.find(item => item.id === row.id); assert.ok(found); return found;
}
function timing(row: Record<string, unknown>): string {
  return `${number(row, 'medianMs').toFixed(3)} [${number(row, 'minMs').toFixed(3)}, ${number(row, 'maxMs').toFixed(3)}]`;
}
function rate(row: Record<string, unknown>): string { return Math.round(number(row, 'throughputPerSecond')).toLocaleString('en-US'); }
function table(headers: string[], rows: string[][]): string {
  return ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n');
}
const sections: string[] = ['# Mini-Lang Performance Baseline', `\n측정일: 2026-10-03. Production 기준 커밋: ${String(newer.metadata.sourceCommit)}. 56 workload 각각을 별도 child process로 측정했다. Production 수정·최적화 및 의미론 변경 없음.`,
  '## Environment',
  table(['항목', '측정 환경'], [
    ['OS / architecture', `${String(newer.metadata.platform)} ${String(newer.metadata.osRelease)} / ${String(newer.metadata.arch)}`],
    ['CPU', String(newer.metadata.cpu).trim()], ['Logical CPUs', String(newer.metadata.logicalCpus)],
    ['RAM', `${(number(newer.metadata, 'memoryBytes') / 1024 ** 3).toFixed(2)} GiB`],
    ['Node', `${String(older.metadata.node)} / ${String(newer.metadata.node)}`],
    ['V8', `${String(older.metadata.v8)} / ${String(newer.metadata.v8)}`],
    ['Node24 UTC start/end', `${String(newer.metadata.startedAt)} / ${String(newer.metadata.finishedAt)}`],
    ['Node20 UTC start/end', `${String(older.metadata.startedAt)} / ${String(older.metadata.finishedAt)}`]
  ]),
  '```sh\nnpm run benchmark\n# 더 긴 측정: warm-up 5회, measurement 15회 (이번 baseline에서는 실행하지 않음)\nnpm run benchmark:extended\n```',
  '두 버전은 병렬로 실행하지 않았다. Node24에서 빌드한 동일 JS를 Node20으로 실행했다. Node20의 실제 명령은 PowerShell에서 다음과 같다.',
  "```powershell\n& '<Node 20 node.exe 경로>' .tmp/benchmark/benchmarks/run.js\n```",
  '다른 환경에서는 해당 Node20 executable로 같은 entry point를 실행한다. 결과는 benchmarks/results/node-<version>-baseline.json에 저장한다. 이 문서는 두 baseline JSON을 읽어 `node .tmp/benchmark/benchmarks/report.js`로 재생성할 수 있다.',
  '## Methodology',
  '- 표의 시간 단위는 ms이며 **median [min, max]**다. raw JSON에는 7개 측정값 전체를 저장했다.\n- workload별 새 Node process에서 입력을 먼저 생성하고 warm-up 3회 후 measurement 7회를 수행했다. timer는 performance.now(). baseline 재실행은 결과 파일을 덮어쓴다.\n- 각 sample에 fresh session을 준비하며 REPL은 sample 내에서만 persistent state를 유지한다. 각 실행 결과를 독립 기대값과 비교하고 불일치하면 중단한다.\n- Lexer는 SourceUnit/line table 사전 생성, Parser는 tokens 사전 생성, Interpreter는 AST 사전 컴파일이다. 해당 준비 작업은 각각 측정에서 제외한다.\n- compile은 SourceUnit 생성+Lexer+Parser, execute는 사전 컴파일 AST 실행, pipeline은 SourceUnit 생성+compile+execute다. session/builtin 초기화는 execute/pipeline 측정에서도 제외한다. 파일 I/O·프로세스 시작·터미널 렌더링은 측정하지 않는다.\n- 짧은 compile은 sample당 10회, 오류 경로는 100회 batch 후 1회당 시간으로 나눈다. 나머지는 sample당 1회 실행한다. REPL 한 operation은 100/1,000 submissions다.\n- 출력은 주입 callback에 수집하고 사용한다. 일반 결과 assert는 타이머 밖, 오류 경로의 오류 class/code 검사는 타이머 안이다. GC 강제 실행, 스택 크기 조정, 최적화 flag는 사용하지 않는다. child timeout은 60초다.\n- paired Lexer/Parser는 정확히 같은 세 종류 원문을 사용한다. 초기 47-workload 탐색 결과는 비교 입력을 보완한 최종 56-workload 결과로 대체했다.',
  '## Lexer Results',
  'mixed는 1,000/10,000/100,000줄이다. 나머지는 Parser와 동일한 100/1,000/10,000개 block 입력이다. token 수는 EOF 하나를 포함한다.',
  table(['입력/규모', 'chars / UTF-8 bytes', 'tokens', 'Node20 ms', 'Node24 ms', 'tokens/s 20 / 24'], older.rows.filter(row => row.group === 'lexer').map(row => {
    const other = match(row); return [`${String(row.variant)}/${String(row.size)}`, `${String(row.chars)} / ${String(row.bytes)}`, String(row.tokens), timing(row), timing(other), `${rate(row)} / ${rate(other)}`];
  })),
  '## Parser Results',
  'Expression-heavy는 산술·논리·group·array·call/index chain, statement-heavy는 block/let/assignment/if/while, function-heavy는 nested block과 closure 선언 및 chained call이다. Lexer 시간은 제외한다.',
  table(['입력/blocks', 'chars / bytes', '최상위 statements', 'Node20 ms', 'Node24 ms', 'tokens/s 20 / 24'], older.rows.filter(row => row.group === 'parser').map(row => [`${String(row.variant)}/${String(row.size)}`, `${String(row.chars)} / ${String(row.bytes)}`, String(row.topLevelStatements), timing(row), timing(match(row)), `${rate(row)} / ${rate(match(row))}`])),
  '## Interpreter Results',
  'Arithmetic는 sum+1, function은 동일 loop에서 inc(sum)을 호출한다. factorial은 fact(12)를 1,000회 실행하고 Fibonacci는 fib(20) 한 번이다. 배열은 1,000/10,000/100,000 elements를 한 번씩 순회하거나 갱신한다. 배열 literal의 runtime allocation/초기화는 포함하지만 소스 생성·파싱은 제외한다.',
  table(['입력/규모', 'chars / bytes', 'Node20 ms', 'Node24 ms', 'unit', 'units/s 20 / 24'], older.rows.filter(row => row.group === 'interpreter').map(row => [`${String(row.variant)}/${String(row.size)}`, `${String(row.chars)} / ${String(row.bytes)}`, timing(row), timing(match(row)), String(row.unit), `${rate(row)} / ${rate(match(row))}`])),
  '## End-to-End Results',
  '모두 10,000회 반복 또는 10,000개 배열이다. 각 phase는 별도 process에서 독립 측정했으므로 median을 더해 pipeline 시간을 예측하지 않는다. 작은 loop source와 큰 array literal source는 compile 비용이 다르다.',
  table(['입력 / phase', 'chars / bytes', 'Node20 ms', 'Node24 ms'], older.rows.filter(row => ['compile', 'execute', 'pipeline'].includes(String(row.group))).map(row => [`${String(row.variant)} / ${String(row.group)}`, `${String(row.chars)} / ${String(row.bytes)}`, timing(row), timing(match(row))])),
  '## REPL Results',
  'fixed/prepopulated는 x=x+1을 반복한다. prepopulated는 같은 global scope에 10,000개 이름을 미리 추가하며 이 setup은 측정에서 제외한다. growing은 submission마다 이름을 하나 선언하고 x에 대입한다. 따라서 growing과 fixed의 차이를 lookup 비용만으로 해석할 수 없다. 표의 per-submission 값은 전체 시간/N의 median과 mean이며 개별 요청 latency 분포의 median은 아니다.',
  table(['유형/N', 'globals 전→후', 'Node20 전체 ms', 'Node24 전체 ms', '20 per-sub ms median / mean', '24 per-sub ms median / mean'], older.rows.filter(row => row.group === 'repl').map(row => {
    const other = match(row), per = (item: Record<string, unknown>) => `${number(item, 'medianAmortizedSubmissionMs').toFixed(5)} / ${number(item, 'meanAmortizedSubmissionMs').toFixed(5)}`;
    return [`${String(row.variant)}/${String(row.size)}`, `${String(row.globalsBefore)}→${String(row.globalsAfter)}`, timing(row), timing(other), per(row), per(other)];
  })),
  '## Error-path Results',
  'Lexer/Parser는 해당 단계만, runtime 오류는 미리 컴파일한 AST의 실행만 측정한다. 진단 문자열 렌더링·stderr 출력은 제외한다. 각 오류 class/code가 예상과 같은지 검사한다.',
  table(['오류', 'code', 'Node20 ms/error', 'Node24 ms/error', 'errors/s 20 / 24'], older.rows.filter(row => row.group === 'error').map(row => [String(row.variant), String(row.expectedCode), timing(row), timing(match(row)), `${rate(row)} / ${rate(match(row))}`])),
  '## Node 20 vs Node 24',
  '동일 머신·입력·설정의 관찰값이다. 아래 ratio는 Node24 median / Node20 median이며 속도 우열의 일반적인 결론이나 통계적 유의성을 뜻하지 않는다.',
  table(['workload', 'Node24 / Node20'], older.rows.filter(row => ['lexer/mixed/100000', 'parser/expression/10000', 'interpreter/arithmetic/100000', 'interpreter/function/100000', 'pipeline/traversal/10000', 'repl/fixed/1000'].includes(String(row.id))).map(row => [String(row.id), (number(match(row), 'medianMs') / number(row, 'medianMs')).toFixed(3)])),
  '## Observations',
  ...[older, newer].map(dataset => {
    const get = (id: string) => { const row = dataset.rows.find(item => item.id === id); assert.ok(row); return number(row, 'medianMs'); };
    return `- ${String(dataset.metadata.node)}: mixed Lexer 1k→10k→100k줄 시간 배율은 ${(get('lexer/mixed/10000') / get('lexer/mixed/1000')).toFixed(2)}×, ${(get('lexer/mixed/100000') / get('lexer/mixed/10000')).toFixed(2)}×. 동일 10k-block expression에서 Parser/Lexer 비용 비율은 ${(get('parser/expression/10000') / get('lexer/expression/10000')).toFixed(2)}×.\n- ${String(dataset.metadata.node)}: 100k loop의 function/arithmetic 시간 비율 ${(get('interpreter/function/100000') / get('interpreter/arithmetic/100000')).toFixed(2)}×. 이는 전체 loop 비교이며 순수 call 하나의 비용이 아니다. 배열 traversal 10k→100k 배율 ${(get('interpreter/traversal/100000') / get('interpreter/traversal/10000')).toFixed(2)}×, mutation 배율 ${(get('interpreter/mutation/100000') / get('interpreter/mutation/10000')).toFixed(2)}×.\n- ${String(dataset.metadata.node)}: 1,000 submissions의 prepopulated/fixed 시간 비율 ${(get('repl/prepopulated/1000') / get('repl/fixed/1000')).toFixed(2)}×. global 수가 1→10,001로 늘어도 그 증가율에 비례하는 lookup 비용은 관찰되지 않았다.`;
  }),
  '- Loop 중심의 작은 원문은 execution이 compile보다 큰 비용이다. 배열 원소를 원문 literal로 넣으면 compile도 무시할 수 없는 비용을 갖는다. 독립 실행한 pipeline과 compile+execute의 차이는 allocator/GC/JIT 상태가 달라질 수 있어 단순 오차 또는 최적화 효과로 단정하지 않는다.\n- 큰 입력의 10배 증가에 대응하는 시간 배율은 위 표와 같다. 전체적으로 규모와 함께 증가하지만 작은 sample의 JIT와 GC noise 때문에 엄밀한 선형성/복잡도를 이 측정만으로 증명하지 않는다. 오류 workload에서는 timeout이나 잘못된 결과를 발견하지 않았다.',
  '## Potential Optimization Areas',
  '- 같은 입력의 token/AST 생성 allocation과 source-position 변환을 profiler로 분리 측정할 후보가 있다. 이 benchmark만으로 어느 내부 함수가 병목인지 단정하지 않는다.\n- user call과 frame/scope 준비 비용은 paired loop 차이의 후속 조사 대상이다. 배열 allocation과 순회 비용도 별도로 나눌 수 있다.\n- REPL은 대규모 global의 단일 lookup 외에 깊은 parent-chain 조건을 후속 측정할 수 있다. 이번에는 실제 최적화·리팩터링을 하지 않았다.',
  '## Limitations',
  '- Microbenchmark는 실제 전체 사용자 workload를 대표하지 않는다. 고정 실행 순서, 짧은 warm-up, GC, OS scheduling, CPU 전력/온도, JIT tiering이 결과에 영향을 준다. 완전한 steady state를 보장하지 않는다.\n- 서로 다른 process/phase median은 가산적이지 않으며 작은 시간 차이는 noise일 수 있다. timer와 결과 수집 overhead를 차감하지 않았다. 다른 머신·Node 패치 버전에서는 결과가 달라질 수 있다.\n- 메모리 peak, 파일 I/O, cold start, 터미널 rendering, 무한 loop, 깊이 제한 초과 workload는 성능 목표에 포함하지 않았다. 실행 제한을 늘려 benchmark를 통과시키지 않았다.\n- JSON의 sourceCommit은 측정 당시 production 기준 HEAD이다. 추가된 benchmark 코드는 이 보고서를 포함한 benchmark commit에 보존된다.',
  '## Validation',
  '작업 전과 작업 후 npm run check: 전체 200개 테스트(23 files), strict typecheck, explicit any 검사 모두 exit 0. 작업 후 integration 25개, example 검사 16개, extended fuzz 16,384건 및 각 build도 exit 0. CI fuzz 2,048건은 전체 테스트에 포함된다. 각 benchmark는 warm-up과 measurement 모두 결과값을 확인했다. 성능 threshold를 일반 테스트 suite에 넣지 않았으며 benchmark는 별도 명령으로만 실행한다. 상세 재개·커밋 기록은 PROGRESS.md에 보존한다.',
  '원시 데이터: [Node20](benchmarks/results/node-20.20.2-baseline.json), [Node24](benchmarks/results/node-24.16.0-baseline.json).'
];
writeFileSync('BENCHMARK.md', sections.join('\n\n') + '\n');
