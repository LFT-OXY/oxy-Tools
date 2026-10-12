// OXY 大标志：照终端里那五行方块画成的像素图形，单色，颜色跟着所在的文字走。
const ROWS = [' ██████  ██   ██ ██    ██', '██    ██  ██ ██   ██  ██', '██    ██   ███     ████', '██    ██  ██ ██     ██', ' ██████  ██   ██    ██'];
// 每个方块：终端里一格是一份宽、两份高。多出的 0.02 盖住相邻方块之间的缝
const BLOCKS = ROWS.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '█' ? [{ x, y }] : [])));

/** staggered：每个方块带着自己的行号和列号，开场动画按它们错开 */
export function Logo({ staggered = false }: { staggered?: boolean }) {
  return (
    // 方块的边对齐到像素：放大了也看不到方块之间的缝
    <svg class="logo" viewBox="0 0 25 10" shape-rendering="crispEdges" role="img" aria-label="OXY">
      {BLOCKS.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y * 2} width="1.02" height="2.02" style={staggered ? { '--x': x, '--y': y } : undefined} />
      ))}
    </svg>
  );
}
