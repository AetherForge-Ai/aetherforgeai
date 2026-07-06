import "server-only";

/**
 * Server-side glue for Totalum: loads a member's full cross-asset book
 * (equities + crypto from `stock`, physical metals from `precious_metal`),
 * resolves live metals spot + FX, and runs the pure `totalum-engine` synthesis.
 *
 * Kept separate from the route so both the synthesis endpoint and the Chief
 * Strategist chat endpoint share exactly the same portfolio picture.
 */

import { totalumSdk } from "@/lib/totalum";
import { getMetalsSpot } from "@/lib/metals";
import { getFxSnapshot } from "@/lib/fx";
import type { Stock } from "@/lib/portfolio";
import {
  buildSynthesis,
  type MetalHolding,
  type TotalumSynthesis,
} from "@/lib/totalum-engine";

export async function loadTotalumSynthesis(userId: string): Promise<TotalumSynthesis> {
  const [stocksRes, metalsRes, spot, fx] = await Promise.all([
    totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("precious_metal", { _filter: { user: userId }, _limit: 200 }),
    getMetalsSpot(),
    getFxSnapshot(),
  ]);

  const stocks = ((stocksRes?.data as any[]) || []) as Stock[];
  const metals = ((metalsRes?.data as any[]) || []) as MetalHolding[];

  console.log(
    `[totalum] Synthesising user ${userId}: ${stocks.length} securities, ${metals.length} metal holdings (spot live=${spot.live}, fx live=${fx.live})`
  );

  return buildSynthesis({
    stocks,
    metals,
    spot,
    fxToNZD: fx.ratesToNZD,
  });
}
