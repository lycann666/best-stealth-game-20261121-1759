// The three levels of the Lantern Archive. Each map is 20 columns by 11 rows of
// 64 px tiles:
//
//   #  wall — blocks movement and sight
//   C  crate — cover; blocks movement and sight
//   B  bush — walkable; a player inside one cannot be seen except up close
//   .  floor
//   S  where Milo the moth starts
//   E  the exit window (locked until every moonpetal is gathered)
//   *  a moonpetal to gather
//   G  a warden's post (a floor tile; the patrol below starts here)
//
// A guard's patrol is a list of [column, row] waypoints; the guard walks them in
// order, waits and scans at each one, then walks back the other way.

export const LEVELS = [
  {
    name: 'The Quiet Stacks',
    intro: 'Three moonpetals sleep among the shelves. Slip past the wardens, gather them all, and leave through the window.',
    par: 75,
    map: [
      '####################',
      '#S...C......*......#',
      '#.##...##..###..#..#',
      '#..#..B.#.....#.#..#',
      '#..#....#..G..#.#.*#',
      '#..###..#..#..#.#..#',
      '#....#.....#..#....#',
      '#.B..#..C..#..###..#',
      '#....#.....#....#..#',
      '#..*.#..G..#..B...E#',
      '####################',
    ],
    patrols: [
      [[11, 4], [13, 4], [9, 4]],
      [[8, 9], [10, 9], [6, 9]],
    ],
  },
  {
    name: 'Lantern Gallery',
    intro: 'The gallery glitters and the wardens walk in threes. Bushes are your friends — crouch in one and a cone will pass right over you.',
    par: 90,
    map: [
      '####################',
      '#S..B....#....*....#',
      '#.####..#.#.####.#.#',
      '#....#..#.#....#.#.#',
      '#.C..#.....G...#.#.#',
      '#....#..####...#...#',
      '#.##....#..#...#.###',
      '#..#..B.#..#.*.#...#',
      '#..#.......#...#.#.#',
      '#.*..G..#..C...#..E#',
      '####################',
    ],
    patrols: [
      [[11, 4], [14, 4], [9, 4]],
      [[5, 9], [7, 9], [3, 9]],
      [[17, 7], [18, 7], [16, 7]],
    ],
  },
  {
    name: "The Warden's Vault",
    intro: 'Four wardens, one vault, no mistakes. Sprint only when no cone is near — running is loud, and loud brings wardens.',
    par: 105,
    map: [
      '####################',
      '#S....#....B....*..#',
      '#.##..#..####..##..#',
      '#..#.....#..#..#.#.#',
      '#.C..##..#G.#..#.*.#',
      '#....#...#..#..#.#.#',
      '#.##.#.B.#..##.#...#',
      '#....#...#..#..#.###',
      '#..*.#..G#..#..#...#',
      '#.B..#...#..C..#..E#',
      '####################',
    ],
    patrols: [
      [[10, 4], [10, 6], [10, 5]],
      [[8, 8], [6, 8], [7, 8]],
      [[16, 1], [14, 1], [17, 1]],
      [[16, 9], [14, 9], [17, 9]],
    ],
  },
];
