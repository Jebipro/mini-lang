# Future Work

아래는 이후 버전에서 검토할 우선순위이며 현재 구현 범위에 포함하지 않습니다. 확장마다 SPEC·GRAMMAR와 기존 의미론의 호환성을 먼저 정하고 실패 테스트를 작성합니다.

1. 사용자 경험: 오류 진단의 Unicode 화면 폭 보정, REPL 입력 취소를 위한 별도 실행 worker, 선택적 실행 자원 한도. 기존 동기 API 및 부작용 정책과의 관계를 명시해야 합니다.
2. 언어 확장: objects와 property access, module system, 작은 표준 라이브러리. binding identity·배열 참조·builtin 호출 계약을 유지하고 암묵 변환을 무심코 추가하지 않습니다.
3. 도구: 별도 AST pass를 사용하는 static type checker, source span과 연결된 debugger. 현재 AST node에 evaluate 메서드를 추가하지 않습니다.
4. 성능: bytecode compiler/VM을 별도 backend로 구현하고 같은 예제·의미론 테스트를 적용합니다. stack/frame 및 return 동작을 비교 검증합니다.
5. 메모리: VM이 호스트 객체와 독립된 heap을 필요로 할 때만 garbage collector를 설계합니다. 현재는 JavaScript GC가 closure와 배열 생존을 관리합니다.

각 항목은 독립 제안과 승인된 범위로 진행하며 현재 프로젝트 완성을 위해 선행 구현하지 않습니다.
