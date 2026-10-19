/** "box cricket (Medium (Tennis))" -> "Box cricket, medium (tennis)" */
export function formatLabel(f: string | null): string {
  if (!f) return "Standard";
  const m = /^(.*?)\s*\((.*)\)$/.exec(f.trim());
  const base = m ? m[1] : f.trim();
  const size = m ? m[2].toLowerCase() : "";
  const head = base.charAt(0).toUpperCase() + base.slice(1);
  return size ? `${head}, ${size}` : head;
}
