export interface TradeLog {
  time: string;
  tag: string;
  side: string;
  outcome: string;
  size: string;
  price: string;
  slug: string;
  extra?: string;
  targetAddress?: string;
  copyStatus?: string;
}

export interface PositionSummary {
  slug: string;
  outcome: string;
  size: number;
  curPrice: number;
  /** Size change since last poll (+ / -) for UI highlight */
  delta?: number;
  /** ISO timestamp when delta was first observed (for sort-to-top duration) */
  deltaAt?: string;
}

const MAX_LOGS = 100;
const logs: TradeLog[] = [];
let status: { mode: string; targets: number; wallet?: string; targetAddresses?: string[] } = {
  mode: "",
  targets: 0,
};
let uiConfig: { deltaHighlightSec: number; deltaAnimationSec: number } = {
  deltaHighlightSec: 10,
  deltaAnimationSec: 2,
};
const positionsByUser: Record<string, PositionSummary[]> = {};
/** prev size by user and "slug|outcome" for delta computation */
const prevSizes: Record<string, Record<string, number>> = {};

export function pushTrade(
  tag: string,
  trade: { side: string; size: string; price: string; asset_id: string; slug?: string; outcome?: string },
  opts?: string | { targetAddress?: string; copyStatus?: string }
): void {
  let targetAddress: string | undefined;
  let copyStatus: string | undefined;
  if (typeof opts === "string") {
    const m = opts.match(/^from\s+(0x[a-fA-F0-9]+)\s+(.+)$/);
    if (m) {
      targetAddress = m[1];
      copyStatus = m[2];
    } else {
      copyStatus = opts;
    }
  } else if (opts) {
    targetAddress = opts.targetAddress;
    copyStatus = opts.copyStatus;
  }
  logs.push({
    time: new Date().toISOString(),
    tag,
    side: trade.side,
    outcome: trade.outcome ?? "?",
    size: trade.size,
    price: trade.price,
    slug: trade.slug ?? trade.asset_id.slice(0, 12) + "…",
    targetAddress,
    copyStatus,
  });
  if (logs.length > MAX_LOGS) logs.shift();
}

export function setStatus(mode: string, targets: number, wallet?: string, targetAddresses?: string[]): void {
  status = { mode, targets, wallet, targetAddresses };
}

export function setUiConfig(config: { deltaHighlightSec: number; deltaAnimationSec: number }): void {
  uiConfig = config;
}

export function setPositions(user: string, positions: { slug?: string; outcome?: string; size: number; curPrice: number }[]): void {
  const prev = prevSizes[user] ?? {};
  const now = new Date().toISOString();
  positionsByUser[user] = positions.map((p) => {
    const slug = p.slug ?? "?";
    const outcome = p.outcome ?? "?";
    const key = `${slug}|${outcome}`;
    const prevSize = prev[key];
    const delta = prevSize !== undefined ? p.size - prevSize : undefined;
    prev[key] = p.size;
    const hasDelta = delta !== 0 && delta !== undefined;
    return {
      slug,
      outcome,
      size: p.size,
      curPrice: p.curPrice,
      delta: hasDelta ? delta : undefined,
      deltaAt: hasDelta ? now : undefined,
    };
  });
  prevSizes[user] = prev;
  for (const k of Object.keys(prev)) {
    if (!positions.some((p) => `${p.slug ?? "?"}|${p.outcome ?? "?"}` === k)) delete prev[k];
  }
}

export function getState(): { logs: TradeLog[]; status: typeof status; positions: typeof positionsByUser; ui: typeof uiConfig } {
  return { logs: [...logs], status, positions: { ...positionsByUser }, ui: { ...uiConfig } };
}
