# 분리 이미지 검증 결과

검증일: 2026-10-30
- 개별 PNG: 25개 (캐릭터 16개, 소품 9개)
- 모든 PNG의 상하좌우 테두리가 알파 0인 것을 확인했습니다.
- 원본 아틀라스의 고정 칸이 아니라 각 그림의 연결된 전체 실루엣으로 분리했습니다.
- 말하는 앵무새의 날개가 627px 칸 경계를 넘어 있어도 전체 날개를 보존합니다.
- 말하는 부엉이는 x684부터 시작하는 독립 실루엣만 포함하며 왼쪽의 파란 앵무새 조각이 없습니다.
- 손 들기 소품에는 옆 칸의 휴식 쿠션 조각이 없습니다.
- owl-talk, pipi-talk, hand 파일은 직접 시각 확인했습니다.
- index.html과 CSS는 수정하지 않았습니다.

원본 픽셀을 다시 그리지 않고 추출·패딩만 수행했습니다. 프로그램: work/split-assets.ps1.

| 파일 | 크기 | 주 실루엣 알파 픽셀 |
|---|---:|---:|
| images/characters/mong-neutral.png | 289×366 | 51716 |
| images/characters/ruru-neutral.png | 280×372 | 58639 |
| images/characters/boogi-neutral.png | 215×336 | 42680 |
| images/characters/mong-worried.png | 291×368 | 52014 |
| images/characters/ruru-worried.png | 282×366 | 58400 |
| images/characters/boogi-worried.png | 216×342 | 43958 |
| images/characters/mong-cross.png | 292×377 | 52862 |
| images/characters/ruru-cross.png | 282×379 | 59133 |
| images/characters/boogi-cross.png | 220×351 | 46608 |
| images/characters/mong-raise.png | 296×375 | 55515 |
| images/characters/ruru-raise.png | 302×378 | 61836 |
| images/characters/boogi-raise.png | 250×346 | 49354 |
| images/characters/pipi-neutral.png | 510×591 | 136656 |
| images/characters/owl-neutral.png | 400×589 | 145350 |
| images/characters/pipi-talk.png | 629×582 | 158603 |
| images/characters/owl-talk.png | 534×580 | 164637 |
| images/objects/broccoli.png | 399×395 | 81082 |
| images/objects/tablet.png | 408×357 | 95783 |
| images/objects/clay.png | 400×297 | 63102 |
| images/objects/puzzle.png | 409×350 | 83052 |
| images/objects/paper.png | 409×385 | 94062 |
| images/objects/pineapple.png | 314×424 | 67501 |
| images/objects/cross.png | 414×396 | 73653 |
| images/objects/hand.png | 230×434 | 40058 |
| images/objects/rest.png | 441×281 | 67374 |
