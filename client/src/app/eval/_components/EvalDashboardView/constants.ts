/** Sparkline needs at least two points: it divides by `length - 1`. */
export const MIN_SPARKLINE_POINTS = 2;

/** Column templates shared by the header and the rows of each grid. */
export const AGENT_GRID = "minmax(160px,1.4fr) minmax(150px,1.1fr) minmax(190px,1.5fr) 90px repeat(3, 64px) 110px 70px";
export const RECENT_GRID = "minmax(140px,1.4fr) 60px minmax(130px,1fr) 80px repeat(3, 70px) 80px";

export const SPARKLINE_SIZE = { w: 80, h: 24 } as const;
