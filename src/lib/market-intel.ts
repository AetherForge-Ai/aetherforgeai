/**
 * Market-intelligence engine.
 *
 * Institutional-grade, deterministic technical-analysis layer for AetherForge AI.
 * Ships a curated NZX / ASX / US universe and, for each security, synthesises a
 * realistic multi-month daily price series from a seeded RNG. From that series it
 * derives genuine technical indicators (SMA, RSI, MACD, Bollinger Bands), 1D/7D/30D
 * performance, a 7-day forward projection (linear regression + mean-reversion) and
 * an explicit BUY / SELL / HOLD signal with plain-English reasoning.
 *
 * Pure module — no external API keys, safe to import on client AND server. The
 * seeded RNG keeps output stable across renders so charts never jump.
 */

export type MarketCode = "NZX" | "ASX" | "US" | "CRYPTO";
export type AssetClass = "stock" | "crypto";

export interface UniverseEntry {
  ticker: string;
  name: string;
  sector: string;
  market: MarketCode;
  basePrice: number;
}

/** Which asset class a market code belongs to. */
export function assetClassForMarket(market: MarketCode): AssetClass {
  return market === "CRYPTO" ? "crypto" : "stock";
}

export interface SeriesPoint {
  label: string; // day label e.g. "D-29" or "May 12"
  price: number;
  projected?: boolean;
}

/** Market regime derived from trend + volatility structure. */
export type MarketRegime =
  | "Trending Up"
  | "Trending Down"
  | "Range-Bound"
  | "High Volatility";

/** Explicit conviction bucket for a signal (how much to trust it). */
export type ConvictionLevel = "High" | "Moderate" | "Low" | "Speculative";

/**
 * One scenario in a probabilistic 7-day outlook. Ranges are % moves over the
 * next 7 sessions, derived from the security's OWN recent realised volatility
 * (scaled to a 7-day horizon) and centred on the model's drift — never a single
 * point target. `probability` is the modelled chance this scenario plays out.
 */
export interface OutlookCase {
  label: "Base" | "Bull" | "Bear";
  lowPct: number; // lower bound of the % move range
  highPct: number; // upper bound of the % move range
  lowPrice: number; // price at the low bound
  highPrice: number; // price at the high bound
  probability: number; // 0-100
}

/** Volatility-scaled, regime-aware 7-day probabilistic outlook. */
export interface ProbabilisticOutlook {
  horizonDays: number; // 7
  expectedPct: number; // central (drift) estimate, %
  sigma7Pct: number; // 1σ 7-day move, %
  regime: MarketRegime;
  base: OutlookCase; // ~50% interquartile band
  bull: OutlookCase; // upside tail
  bear: OutlookCase; // downside tail
}

export interface SecurityIntel {
  ticker: string;
  name: string;
  sector: string;
  market: MarketCode;
  assetClass: AssetClass;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  change1d: number; // %
  change7d: number; // %
  change30d: number; // %
  history: SeriesPoint[]; // last 30 sessions
  projection: SeriesPoint[]; // next 7 sessions (continues from last history point)
  projected7dPct: number; // % move projected over the next 7 days
  confidence: number; // 0-100 confidence in the projection
  rsi: number; // 0-100
  macd: number;
  macdSignalLine: number;
  macdHistogram: number;
  macdSignal: "Bullish" | "Bearish" | "Neutral";
  bbPosition: number; // 0-100 position within the Bollinger band
  sma20: number;
  vsSma20: number; // % price is above/below its 20-day SMA
  sma50: number;
  vsSma50: number; // % price is above/below its 50-day SMA
  // Volatility & structure
  atrPct: number; // 14-period Average True Range as % of price (volatility)
  realizedVolPct: number; // annualised realised volatility, %
  dailyVolPct: number; // 1-day realised volatility, %
  regime: MarketRegime; // trend/volatility regime classification
  support: number; // nearest structural support below price
  resistance: number; // nearest structural resistance above price
  pivot: number; // classic floor-trader pivot (H+L+C)/3
  // Forward view
  outlook: ProbabilisticOutlook; // base/bull/bear ranges + probabilities
  signal: "Strong Buy" | "Buy" | "Hold" | "Reduce" | "Sell";
  score: number; // 0-100 conviction score
  conviction: ConvictionLevel; // explicit conviction bucket
  convictionReason: string; // short why for the conviction level
  reasoning: string;
}

/* ------------------------------ Universe -------------------------------- */

export const MARKET_UNIVERSE: UniverseEntry[] = [
  // NZX (NZD)
  { ticker: "AIR.NZ", name: "Air New Zealand", sector: "Industrials", market: "NZX", basePrice: 0.68 },
  { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", sector: "Healthcare", market: "NZX", basePrice: 36.8 },
  { ticker: "MEL.NZ", name: "Meridian Energy", sector: "Utilities", market: "NZX", basePrice: 6.15 },
  { ticker: "SPK.NZ", name: "Spark New Zealand", sector: "Telecom", market: "NZX", basePrice: 4.2 },
  { ticker: "CEN.NZ", name: "Contact Energy", sector: "Utilities", market: "NZX", basePrice: 9.34 },
  { ticker: "MCY.NZ", name: "Mercury NZ", sector: "Utilities", market: "NZX", basePrice: 6.02 },
  { ticker: "AIA.NZ", name: "Auckland Airport", sector: "Industrials", market: "NZX", basePrice: 7.58 },
  { ticker: "EBO.NZ", name: "Ebos Group", sector: "Healthcare", market: "NZX", basePrice: 37.15 },
  { ticker: "MFT.NZ", name: "Mainfreight", sector: "Logistics", market: "NZX", basePrice: 68.4 },
  { ticker: "IFT.NZ", name: "Infratil", sector: "Infrastructure", market: "NZX", basePrice: 10.86 },
  { ticker: "ATM.NZ", name: "The a2 Milk Company", sector: "Consumer Staples", market: "NZX", basePrice: 5.62 },
  { ticker: "FBU.NZ", name: "Fletcher Building", sector: "Materials", market: "NZX", basePrice: 2.94 },
  { ticker: "GNE.NZ", name: "Genesis Energy", sector: "Utilities", market: "NZX", basePrice: 2.18 },
  { ticker: "POT.NZ", name: "Port of Tauranga", sector: "Industrials", market: "NZX", basePrice: 5.28 },
  { ticker: "CNU.NZ", name: "Chorus", sector: "Telecom", market: "NZX", basePrice: 8.42 },
  { ticker: "SUM.NZ", name: "Summerset Group", sector: "Real Estate", market: "NZX", basePrice: 11.35 },
  { ticker: "VCT.NZ", name: "Vector", sector: "Utilities", market: "NZX", basePrice: 3.94 },
  { ticker: "KMD.NZ", name: "KMD Brands", sector: "Consumer Discretionary", market: "NZX", basePrice: 0.42 },
  { ticker: "SKT.NZ", name: "Sky Network Television", sector: "Communication Services", market: "NZX", basePrice: 2.68 },
  { ticker: "SKC.NZ", name: "SkyCity Entertainment", sector: "Consumer Discretionary", market: "NZX", basePrice: 1.28 },
  { ticker: "PCT.NZ", name: "Precinct Properties", sector: "Real Estate", market: "NZX", basePrice: 1.16 },
  { ticker: "ARG.NZ", name: "Argosy Property", sector: "Real Estate", market: "NZX", basePrice: 1.02 },
  { ticker: "THL.NZ", name: "Tourism Holdings", sector: "Consumer Discretionary", market: "NZX", basePrice: 2.42 },
  { ticker: "TRA.NZ", name: "Turners Automotive Group", sector: "Consumer Discretionary", market: "NZX", basePrice: 5.35 },
  { ticker: "HLG.NZ", name: "Hallenstein Glasson", sector: "Consumer Discretionary", market: "NZX", basePrice: 8.15 },
  { ticker: "BGP.NZ", name: "Briscoe Group", sector: "Consumer Discretionary", market: "NZX", basePrice: 6.24 },
  { ticker: "WHS.NZ", name: "The Warehouse Group", sector: "Consumer Discretionary", market: "NZX", basePrice: 1.05 },
  { ticker: "NZX.NZ", name: "NZX Limited", sector: "Financials", market: "NZX", basePrice: 1.42 },
  { ticker: "RYM.NZ", name: "Ryman Healthcare", sector: "Real Estate", market: "NZX", basePrice: 3.28 },
  { ticker: "OCA.NZ", name: "Oceania Healthcare", sector: "Real Estate", market: "NZX", basePrice: 0.62 },
  { ticker: "PFI.NZ", name: "Property for Industry", sector: "Real Estate", market: "NZX", basePrice: 2.16 },
  { ticker: "KPG.NZ", name: "Kiwi Property Group", sector: "Real Estate", market: "NZX", basePrice: 0.88 },
  { ticker: "SPG.NZ", name: "Stride Property Group", sector: "Real Estate", market: "NZX", basePrice: 1.12 },
  { ticker: "VHP.NZ", name: "Vital Healthcare Property", sector: "Real Estate", market: "NZX", basePrice: 1.95 },
  { ticker: "GTK.NZ", name: "Gentrack Group", sector: "Technology", market: "NZX", basePrice: 11.4 },
  { ticker: "SKO.NZ", name: "Serko", sector: "Technology", market: "NZX", basePrice: 3.65 },
  { ticker: "VGL.NZ", name: "Vista Group International", sector: "Technology", market: "NZX", basePrice: 2.78 },
  { ticker: "PYS.NZ", name: "PaySauce", sector: "Technology", market: "NZX", basePrice: 0.32 },
  { ticker: "ERD.NZ", name: "EROAD", sector: "Technology", market: "NZX", basePrice: 1.02 },
  { ticker: "IKE.NZ", name: "ikeGPS Group", sector: "Technology", market: "NZX", basePrice: 0.85 },
  { ticker: "NPH.NZ", name: "Napier Port Holdings", sector: "Industrials", market: "NZX", basePrice: 2.78 },
  { ticker: "SCL.NZ", name: "Scales Corporation", sector: "Consumer Staples", market: "NZX", basePrice: 3.65 },
  { ticker: "SAN.NZ", name: "Sanford", sector: "Consumer Staples", market: "NZX", basePrice: 4.35 },
  { ticker: "DGL.NZ", name: "Delegat Group", sector: "Consumer Staples", market: "NZX", basePrice: 5.85 },
  { ticker: "FWL.NZ", name: "Foley Wines", sector: "Consumer Staples", market: "NZX", basePrice: 1.15 },
  { ticker: "SEK.NZ", name: "Seeka", sector: "Consumer Staples", market: "NZX", basePrice: 2.95 },
  { ticker: "PGW.NZ", name: "PGG Wrightson", sector: "Consumer Staples", market: "NZX", basePrice: 2.05 },
  { ticker: "SML.NZ", name: "Synlait Milk", sector: "Consumer Staples", market: "NZX", basePrice: 0.58 },
  { ticker: "MOV.NZ", name: "Move Logistics Group", sector: "Logistics", market: "NZX", basePrice: 0.42 },
  { ticker: "GXH.NZ", name: "Green Cross Health", sector: "Healthcare", market: "NZX", basePrice: 0.95 },
  { ticker: "PEB.NZ", name: "Pacific Edge", sector: "Healthcare", market: "NZX", basePrice: 0.12 },
  { ticker: "AFT.NZ", name: "AFT Pharmaceuticals", sector: "Healthcare", market: "NZX", basePrice: 3.45 },
  { ticker: "HGH.NZ", name: "Heartland Group Holdings", sector: "Financials", market: "NZX", basePrice: 0.88 },
  { ticker: "TWR.NZ", name: "Tower", sector: "Financials", market: "NZX", basePrice: 1.28 },
  { ticker: "STU.NZ", name: "Steel & Tube Holdings", sector: "Materials", market: "NZX", basePrice: 1.05 },
  { ticker: "SKL.NZ", name: "Skellerup Holdings", sector: "Industrials", market: "NZX", basePrice: 5.15 },
  { ticker: "CVT.NZ", name: "Comvita", sector: "Consumer Staples", market: "NZX", basePrice: 2.35 },
  { ticker: "MHJ.NZ", name: "Michael Hill International", sector: "Consumer Discretionary", market: "NZX", basePrice: 0.62 },
  { ticker: "CDI.NZ", name: "CDL Investments NZ", sector: "Real Estate", market: "NZX", basePrice: 0.82 },
  { ticker: "MPG.NZ", name: "Metroglass Holdings", sector: "Materials", market: "NZX", basePrice: 0.28 },
  // ASX (AUD)
  { ticker: "BHP.AX", name: "BHP Group", sector: "Materials", market: "ASX", basePrice: 40.12 },
  { ticker: "CBA.AX", name: "Commonwealth Bank", sector: "Financials", market: "ASX", basePrice: 158.7 },
  { ticker: "CSL.AX", name: "CSL Limited", sector: "Healthcare", market: "ASX", basePrice: 236.5 },
  { ticker: "NAB.AX", name: "National Australia Bank", sector: "Financials", market: "ASX", basePrice: 38.9 },
  { ticker: "WBC.AX", name: "Westpac Banking", sector: "Financials", market: "ASX", basePrice: 33.44 },
  { ticker: "WES.AX", name: "Wesfarmers", sector: "Consumer Discretionary", market: "ASX", basePrice: 75.2 },
  { ticker: "MQG.AX", name: "Macquarie Group", sector: "Financials", market: "ASX", basePrice: 224.6 },
  { ticker: "WOW.AX", name: "Woolworths Group", sector: "Consumer Staples", market: "ASX", basePrice: 30.15 },
  { ticker: "FMG.AX", name: "Fortescue", sector: "Materials", market: "ASX", basePrice: 19.06 },
  { ticker: "TLS.AX", name: "Telstra Group", sector: "Telecom", market: "ASX", basePrice: 4.05 },
  { ticker: "WDS.AX", name: "Woodside Energy", sector: "Energy", market: "ASX", basePrice: 24.3 },
  { ticker: "GMG.AX", name: "Goodman Group", sector: "Real Estate", market: "ASX", basePrice: 37.9 },
  { ticker: "ANZ.AX", name: "ANZ Group Holdings", sector: "Financials", market: "ASX", basePrice: 30.85 },
  { ticker: "RIO.AX", name: "Rio Tinto", sector: "Materials", market: "ASX", basePrice: 118.4 },
  { ticker: "TCL.AX", name: "Transurban Group", sector: "Industrials", market: "ASX", basePrice: 13.15 },
  { ticker: "WTC.AX", name: "WiseTech Global", sector: "Technology", market: "ASX", basePrice: 128.6 },
  { ticker: "XRO.AX", name: "Xero", sector: "Technology", market: "ASX", basePrice: 155.3 },
  { ticker: "ALL.AX", name: "Aristocrat Leisure", sector: "Consumer Discretionary", market: "ASX", basePrice: 64.8 },
  { ticker: "COL.AX", name: "Coles Group", sector: "Consumer Staples", market: "ASX", basePrice: 18.95 },
  { ticker: "STO.AX", name: "Santos", sector: "Energy", market: "ASX", basePrice: 6.72 },
  { ticker: "REA.AX", name: "REA Group", sector: "Communication Services", market: "ASX", basePrice: 218.5 },
  { ticker: "COH.AX", name: "Cochlear", sector: "Healthcare", market: "ASX", basePrice: 312.4 },
  { ticker: "RMD.AX", name: "ResMed", sector: "Healthcare", market: "ASX", basePrice: 38.6 },
  { ticker: "FPH.AX", name: "Fisher & Paykel Healthcare", sector: "Healthcare", market: "ASX", basePrice: 33.9 },
  { ticker: "QBE.AX", name: "QBE Insurance Group", sector: "Financials", market: "ASX", basePrice: 19.85 },
  { ticker: "SUN.AX", name: "Suncorp Group", sector: "Financials", market: "ASX", basePrice: 18.42 },
  { ticker: "IAG.AX", name: "Insurance Australia Group", sector: "Financials", market: "ASX", basePrice: 8.15 },
  { ticker: "ASX.AX", name: "ASX Limited", sector: "Financials", market: "ASX", basePrice: 66.2 },
  { ticker: "MFG.AX", name: "Magellan Financial Group", sector: "Financials", market: "ASX", basePrice: 9.85 },
  { ticker: "PPT.AX", name: "Perpetual", sector: "Financials", market: "ASX", basePrice: 21.4 },
  { ticker: "S32.AX", name: "South32", sector: "Materials", market: "ASX", basePrice: 3.24 },
  { ticker: "MIN.AX", name: "Mineral Resources", sector: "Materials", market: "ASX", basePrice: 42.6 },
  { ticker: "PLS.AX", name: "Pilbara Minerals", sector: "Materials", market: "ASX", basePrice: 2.85 },
  { ticker: "IGO.AX", name: "IGO Limited", sector: "Materials", market: "ASX", basePrice: 5.42 },
  { ticker: "NST.AX", name: "Northern Star Resources", sector: "Materials", market: "ASX", basePrice: 16.8 },
  { ticker: "NEM.AX", name: "Newmont Corporation", sector: "Materials", market: "ASX", basePrice: 62.4 },
  { ticker: "EVN.AX", name: "Evolution Mining", sector: "Materials", market: "ASX", basePrice: 4.35 },
  { ticker: "WHC.AX", name: "Whitehaven Coal", sector: "Energy", market: "ASX", basePrice: 6.85 },
  { ticker: "NHC.AX", name: "New Hope Corporation", sector: "Energy", market: "ASX", basePrice: 4.65 },
  { ticker: "YAL.AX", name: "Yancoal Australia", sector: "Energy", market: "ASX", basePrice: 6.12 },
  { ticker: "AMC.AX", name: "Amcor", sector: "Materials", market: "ASX", basePrice: 15.8 },
  { ticker: "BXB.AX", name: "Brambles", sector: "Industrials", market: "ASX", basePrice: 18.65 },
  { ticker: "QAN.AX", name: "Qantas Airways", sector: "Industrials", market: "ASX", basePrice: 8.95 },
  { ticker: "SGP.AX", name: "Stockland", sector: "Real Estate", market: "ASX", basePrice: 5.28 },
  { ticker: "GPT.AX", name: "GPT Group", sector: "Real Estate", market: "ASX", basePrice: 4.68 },
  { ticker: "DXS.AX", name: "Dexus", sector: "Real Estate", market: "ASX", basePrice: 7.15 },
  { ticker: "MGR.AX", name: "Mirvac Group", sector: "Real Estate", market: "ASX", basePrice: 2.18 },
  { ticker: "SCG.AX", name: "Scentre Group", sector: "Real Estate", market: "ASX", basePrice: 3.62 },
  { ticker: "VCX.AX", name: "Vicinity Centres", sector: "Real Estate", market: "ASX", basePrice: 2.28 },
  { ticker: "JBH.AX", name: "JB Hi-Fi", sector: "Consumer Discretionary", market: "ASX", basePrice: 88.4 },
  { ticker: "HVN.AX", name: "Harvey Norman Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 4.95 },
  { ticker: "NXT.AX", name: "NextDC", sector: "Technology", market: "ASX", basePrice: 17.6 },
  { ticker: "TNE.AX", name: "TechnologyOne", sector: "Technology", market: "ASX", basePrice: 24.8 },
  { ticker: "CAR.AX", name: "CAR Group", sector: "Communication Services", market: "ASX", basePrice: 38.4 },
  { ticker: "SEK.AX", name: "SEEK", sector: "Communication Services", market: "ASX", basePrice: 24.2 },
  { ticker: "CPU.AX", name: "Computershare", sector: "Technology", market: "ASX", basePrice: 32.5 },
  { ticker: "APA.AX", name: "APA Group", sector: "Utilities", market: "ASX", basePrice: 7.35 },
  { ticker: "ORG.AX", name: "Origin Energy", sector: "Utilities", market: "ASX", basePrice: 10.85 },
  { ticker: "AGL.AX", name: "AGL Energy", sector: "Utilities", market: "ASX", basePrice: 11.2 },
  { ticker: "RHC.AX", name: "Ramsay Health Care", sector: "Healthcare", market: "ASX", basePrice: 38.9 },
  { ticker: "SHL.AX", name: "Sonic Healthcare", sector: "Healthcare", market: "ASX", basePrice: 27.4 },
  { ticker: "PME.AX", name: "Pro Medicus", sector: "Healthcare", market: "ASX", basePrice: 245.6 },
  { ticker: "FLT.AX", name: "Flight Centre Travel", sector: "Consumer Discretionary", market: "ASX", basePrice: 17.85 },
  { ticker: "WEB.AX", name: "Webjet Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 4.65 },
  { ticker: "TAH.AX", name: "Tabcorp Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 0.62 },
  { ticker: "TLC.AX", name: "Lottery Corporation", sector: "Consumer Discretionary", market: "ASX", basePrice: 5.15 },
  { ticker: "EDV.AX", name: "Endeavour Group", sector: "Consumer Staples", market: "ASX", basePrice: 4.35 },
  { ticker: "TWE.AX", name: "Treasury Wine Estates", sector: "Consumer Staples", market: "ASX", basePrice: 11.6 },
  { ticker: "A2M.AX", name: "The a2 Milk Company", sector: "Consumer Staples", market: "ASX", basePrice: 6.05 },
  { ticker: "MTS.AX", name: "Metcash", sector: "Consumer Staples", market: "ASX", basePrice: 3.42 },
  { ticker: "ORA.AX", name: "Orora", sector: "Materials", market: "ASX", basePrice: 2.28 },
  { ticker: "JHX.AX", name: "James Hardie Industries", sector: "Materials", market: "ASX", basePrice: 52.4 },
  { ticker: "BSL.AX", name: "BlueScope Steel", sector: "Materials", market: "ASX", basePrice: 21.6 },
  { ticker: "SGM.AX", name: "Sims", sector: "Materials", market: "ASX", basePrice: 12.4 },
  { ticker: "ALD.AX", name: "Ampol", sector: "Energy", market: "ASX", basePrice: 27.8 },
  { ticker: "VEA.AX", name: "Viva Energy Group", sector: "Energy", market: "ASX", basePrice: 3.15 },
  { ticker: "KAR.AX", name: "Karoon Energy", sector: "Energy", market: "ASX", basePrice: 1.55 },
  { ticker: "BPT.AX", name: "Beach Energy", sector: "Energy", market: "ASX", basePrice: 1.42 },
  { ticker: "LYC.AX", name: "Lynas Rare Earths", sector: "Materials", market: "ASX", basePrice: 6.85 },
  { ticker: "ILU.AX", name: "Iluka Resources", sector: "Materials", market: "ASX", basePrice: 5.25 },
  { ticker: "SFR.AX", name: "Sandfire Resources", sector: "Materials", market: "ASX", basePrice: 9.85 },
  { ticker: "29M.AX", name: "29Metals", sector: "Materials", market: "ASX", basePrice: 0.28 },
  { ticker: "CIA.AX", name: "Champion Iron", sector: "Materials", market: "ASX", basePrice: 5.65 },
  { ticker: "GMD.AX", name: "Genesis Minerals", sector: "Materials", market: "ASX", basePrice: 2.35 },
  { ticker: "RRL.AX", name: "Regis Resources", sector: "Materials", market: "ASX", basePrice: 2.55 },
  { ticker: "PRU.AX", name: "Perseus Mining", sector: "Materials", market: "ASX", basePrice: 2.65 },
  { ticker: "WGX.AX", name: "Westgold Resources", sector: "Materials", market: "ASX", basePrice: 2.95 },
  { ticker: "RSG.AX", name: "Resolute Mining", sector: "Materials", market: "ASX", basePrice: 0.68 },
  { ticker: "BGL.AX", name: "Bellevue Gold", sector: "Materials", market: "ASX", basePrice: 1.35 },
  { ticker: "CMM.AX", name: "Capricorn Metals", sector: "Materials", market: "ASX", basePrice: 6.15 },
  { ticker: "CXO.AX", name: "Core Lithium", sector: "Materials", market: "ASX", basePrice: 0.12 },
  { ticker: "LTR.AX", name: "Liontown Resources", sector: "Materials", market: "ASX", basePrice: 0.85 },
  { ticker: "PDN.AX", name: "Paladin Energy", sector: "Energy", market: "ASX", basePrice: 8.45 },
  { ticker: "BOE.AX", name: "Boss Energy", sector: "Energy", market: "ASX", basePrice: 3.25 },
  { ticker: "DYL.AX", name: "Deep Yellow", sector: "Energy", market: "ASX", basePrice: 1.35 },
  { ticker: "MP1.AX", name: "Megaport", sector: "Technology", market: "ASX", basePrice: 8.65 },
  { ticker: "APX.AX", name: "Appen", sector: "Technology", market: "ASX", basePrice: 2.15 },
  { ticker: "IRE.AX", name: "Iress", sector: "Technology", market: "ASX", basePrice: 8.95 },
  { ticker: "DTL.AX", name: "Data#3", sector: "Technology", market: "ASX", basePrice: 7.85 },
  { ticker: "PNV.AX", name: "PolyNovo", sector: "Healthcare", market: "ASX", basePrice: 2.15 },
  { ticker: "MSB.AX", name: "Mesoblast", sector: "Healthcare", market: "ASX", basePrice: 1.85 },
  { ticker: "CU6.AX", name: "Clarity Pharmaceuticals", sector: "Healthcare", market: "ASX", basePrice: 5.45 },
  { ticker: "TLX.AX", name: "Telix Pharmaceuticals", sector: "Healthcare", market: "ASX", basePrice: 20.6 },
  { ticker: "NAN.AX", name: "Nanosonics", sector: "Healthcare", market: "ASX", basePrice: 3.85 },
  { ticker: "PBH.AX", name: "PointsBet Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 0.95 },
  { ticker: "IEL.AX", name: "IDP Education", sector: "Consumer Discretionary", market: "ASX", basePrice: 13.4 },
  { ticker: "DMP.AX", name: "Domino's Pizza Enterprises", sector: "Consumer Discretionary", market: "ASX", basePrice: 32.5 },
  { ticker: "PMV.AX", name: "Premier Investments", sector: "Consumer Discretionary", market: "ASX", basePrice: 32.8 },
  { ticker: "LOV.AX", name: "Lovisa Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 28.6 },
  { ticker: "SUL.AX", name: "Super Retail Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 15.4 },
  { ticker: "ARB.AX", name: "ARB Corporation", sector: "Consumer Discretionary", market: "ASX", basePrice: 40.2 },
  { ticker: "BAP.AX", name: "Bapcor", sector: "Consumer Discretionary", market: "ASX", basePrice: 5.15 },
  { ticker: "AX1.AX", name: "Accent Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 2.35 },
  { ticker: "NCK.AX", name: "Nick Scali", sector: "Consumer Discretionary", market: "ASX", basePrice: 15.8 },
  { ticker: "BRG.AX", name: "Breville Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 32.4 },
  { ticker: "GYG.AX", name: "Guzman y Gomez", sector: "Consumer Discretionary", market: "ASX", basePrice: 38.5 },
  { ticker: "IDX.AX", name: "Integral Diagnostics", sector: "Healthcare", market: "ASX", basePrice: 2.85 },
  { ticker: "HLS.AX", name: "Healius", sector: "Healthcare", market: "ASX", basePrice: 1.35 },
  { ticker: "ANN.AX", name: "Ansell", sector: "Healthcare", market: "ASX", basePrice: 32.6 },
  { ticker: "EBO.AX", name: "Ebos Group", sector: "Healthcare", market: "ASX", basePrice: 34.5 },
  { ticker: "AVH.AX", name: "Avita Medical", sector: "Healthcare", market: "ASX", basePrice: 3.15 },
  { ticker: "NEC.AX", name: "Nine Entertainment", sector: "Communication Services", market: "ASX", basePrice: 1.42 },
  { ticker: "SXL.AX", name: "Southern Cross Media", sector: "Communication Services", market: "ASX", basePrice: 0.85 },
  { ticker: "TPG.AX", name: "TPG Telecom", sector: "Telecom", market: "ASX", basePrice: 4.85 },
  { ticker: "UNI.AX", name: "Universal Store Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 6.85 },
  { ticker: "CNU.AX", name: "Chorus", sector: "Telecom", market: "ASX", basePrice: 7.65 },
  { ticker: "SPK.AX", name: "Spark New Zealand", sector: "Telecom", market: "ASX", basePrice: 3.85 },
  { ticker: "MND.AX", name: "Monadelphous Group", sector: "Industrials", market: "ASX", basePrice: 14.2 },
  { ticker: "WOR.AX", name: "Worley", sector: "Industrials", market: "ASX", basePrice: 14.85 },
  { ticker: "ALQ.AX", name: "ALS Limited", sector: "Industrials", market: "ASX", basePrice: 14.6 },
  { ticker: "DOW.AX", name: "Downer EDI", sector: "Industrials", market: "ASX", basePrice: 5.85 },
  { ticker: "LLC.AX", name: "Lendlease Group", sector: "Real Estate", market: "ASX", basePrice: 6.85 },
  { ticker: "CWY.AX", name: "Cleanaway Waste Management", sector: "Industrials", market: "ASX", basePrice: 2.85 },
  { ticker: "REH.AX", name: "Reece", sector: "Industrials", market: "ASX", basePrice: 24.6 },
  { ticker: "RWC.AX", name: "Reliance Worldwide", sector: "Industrials", market: "ASX", basePrice: 5.15 },
  { ticker: "GWA.AX", name: "GWA Group", sector: "Industrials", market: "ASX", basePrice: 2.65 },
  { ticker: "FBU.AX", name: "Fletcher Building", sector: "Materials", market: "ASX", basePrice: 2.98 },
  { ticker: "NUF.AX", name: "Nufarm", sector: "Materials", market: "ASX", basePrice: 4.35 },
  { ticker: "ELD.AX", name: "Elders", sector: "Consumer Staples", market: "ASX", basePrice: 8.65 },
  { ticker: "GNC.AX", name: "GrainCorp", sector: "Consumer Staples", market: "ASX", basePrice: 8.85 },
  { ticker: "PNI.AX", name: "Pinnacle Investment Management", sector: "Financials", market: "ASX", basePrice: 20.4 },
  { ticker: "GQG.AX", name: "GQG Partners", sector: "Financials", market: "ASX", basePrice: 2.45 },
  { ticker: "CGF.AX", name: "Challenger", sector: "Financials", market: "ASX", basePrice: 6.85 },
  { ticker: "AMP.AX", name: "AMP", sector: "Financials", market: "ASX", basePrice: 1.42 },
  { ticker: "BOQ.AX", name: "Bank of Queensland", sector: "Financials", market: "ASX", basePrice: 6.45 },
  { ticker: "BEN.AX", name: "Bendigo and Adelaide Bank", sector: "Financials", market: "ASX", basePrice: 12.4 },
  { ticker: "JDO.AX", name: "Judo Capital Holdings", sector: "Financials", market: "ASX", basePrice: 1.85 },
  { ticker: "MPL.AX", name: "Medibank Private", sector: "Financials", market: "ASX", basePrice: 3.85 },
  { ticker: "NHF.AX", name: "nib holdings", sector: "Financials", market: "ASX", basePrice: 6.15 },
  { ticker: "HUB.AX", name: "HUB24", sector: "Financials", market: "ASX", basePrice: 62.4 },
  { ticker: "NWL.AX", name: "Netwealth Group", sector: "Financials", market: "ASX", basePrice: 24.6 },
  { ticker: "ZIP.AX", name: "Zip Co", sector: "Financials", market: "ASX", basePrice: 2.85 },
  { ticker: "HMC.AX", name: "HMC Capital", sector: "Financials", market: "ASX", basePrice: 8.45 },
  { ticker: "CHC.AX", name: "Charter Hall Group", sector: "Real Estate", market: "ASX", basePrice: 14.2 },
  { ticker: "CQR.AX", name: "Charter Hall Retail REIT", sector: "Real Estate", market: "ASX", basePrice: 3.45 },
  { ticker: "CLW.AX", name: "Charter Hall Long WALE REIT", sector: "Real Estate", market: "ASX", basePrice: 3.85 },
  { ticker: "BWP.AX", name: "BWP Trust", sector: "Real Estate", market: "ASX", basePrice: 3.55 },
  { ticker: "CIP.AX", name: "Centuria Industrial REIT", sector: "Real Estate", market: "ASX", basePrice: 3.05 },
  { ticker: "COF.AX", name: "Centuria Office REIT", sector: "Real Estate", market: "ASX", basePrice: 1.25 },
  { ticker: "INA.AX", name: "Ingenia Communities Group", sector: "Real Estate", market: "ASX", basePrice: 5.15 },
  { ticker: "RGN.AX", name: "Region Group", sector: "Real Estate", market: "ASX", basePrice: 2.25 },
  { ticker: "ASK.AX", name: "Abacus Storage King", sector: "Real Estate", market: "ASX", basePrice: 1.15 },
  { ticker: "QUB.AX", name: "Qube Holdings", sector: "Industrials", market: "ASX", basePrice: 3.85 },
  { ticker: "AIA.AX", name: "Auckland International Airport", sector: "Industrials", market: "ASX", basePrice: 6.95 },
  { ticker: "SGR.AX", name: "The Star Entertainment Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 0.28 },
  { ticker: "ORI.AX", name: "Orica", sector: "Materials", market: "ASX", basePrice: 17.8 },
  { ticker: "IPH.AX", name: "IPH Limited", sector: "Industrials", market: "ASX", basePrice: 5.65 },
  { ticker: "SIQ.AX", name: "Smartgroup Corporation", sector: "Industrials", market: "ASX", basePrice: 8.15 },
  { ticker: "MAH.AX", name: "Macmahon Holdings", sector: "Industrials", market: "ASX", basePrice: 0.32 },
  { ticker: "NWH.AX", name: "NRW Holdings", sector: "Industrials", market: "ASX", basePrice: 3.45 },
  { ticker: "PWH.AX", name: "PWR Holdings", sector: "Consumer Discretionary", market: "ASX", basePrice: 8.65 },
  { ticker: "CCX.AX", name: "City Chic Collective", sector: "Consumer Discretionary", market: "ASX", basePrice: 0.15 },
  { ticker: "KGN.AX", name: "Kogan.com", sector: "Consumer Discretionary", market: "ASX", basePrice: 4.85 },
  { ticker: "TPW.AX", name: "Temple & Webster Group", sector: "Consumer Discretionary", market: "ASX", basePrice: 12.4 },
  { ticker: "CTD.AX", name: "Corporate Travel Management", sector: "Consumer Discretionary", market: "ASX", basePrice: 13.2 },
  { ticker: "EVT.AX", name: "EVT Limited", sector: "Consumer Discretionary", market: "ASX", basePrice: 11.4 },
  { ticker: "APE.AX", name: "Eagers Automotive", sector: "Consumer Discretionary", market: "ASX", basePrice: 10.8 },
  { ticker: "PXA.AX", name: "PEXA Group", sector: "Technology", market: "ASX", basePrice: 13.6 },
  { ticker: "LFS.AX", name: "Latitude Group Holdings", sector: "Financials", market: "ASX", basePrice: 1.25 },
  { ticker: "HLI.AX", name: "Helia Group", sector: "Financials", market: "ASX", basePrice: 4.35 },
  { ticker: "SDF.AX", name: "Steadfast Group", sector: "Financials", market: "ASX", basePrice: 6.15 },
  { ticker: "AUB.AX", name: "AUB Group", sector: "Financials", market: "ASX", basePrice: 31.4 },
  { ticker: "COG.AX", name: "COG Financial Services", sector: "Financials", market: "ASX", basePrice: 1.35 },
  { ticker: "FID.AX", name: "Fiducian Group", sector: "Financials", market: "ASX", basePrice: 8.65 },
  { ticker: "GNG.AX", name: "GR Engineering Services", sector: "Industrials", market: "ASX", basePrice: 2.85 },
  { ticker: "LYL.AX", name: "Lycopodium", sector: "Industrials", market: "ASX", basePrice: 12.4 },
  { ticker: "IMD.AX", name: "Imdex", sector: "Industrials", market: "ASX", basePrice: 2.65 },
  { ticker: "EMR.AX", name: "Emerald Resources", sector: "Materials", market: "ASX", basePrice: 3.85 },
  { ticker: "VAU.AX", name: "Vault Minerals", sector: "Materials", market: "ASX", basePrice: 0.42 },
  { ticker: "RMS.AX", name: "Ramelius Resources", sector: "Materials", market: "ASX", basePrice: 2.25 },
  { ticker: "AMI.AX", name: "Aurelia Metals", sector: "Materials", market: "ASX", basePrice: 0.18 },
  { ticker: "AGY.AX", name: "Argosy Minerals", sector: "Materials", market: "ASX", basePrice: 0.08 },
  { ticker: "GL1.AX", name: "Global Lithium Resources", sector: "Materials", market: "ASX", basePrice: 0.35 },
  { ticker: "WR1.AX", name: "Winsome Resources", sector: "Materials", market: "ASX", basePrice: 0.45 },
  { ticker: "MAD.AX", name: "Mader Group", sector: "Industrials", market: "ASX", basePrice: 6.15 },
  { ticker: "SLC.AX", name: "Superloop", sector: "Telecom", market: "ASX", basePrice: 1.95 },
  { ticker: "ABB.AX", name: "Aussie Broadband", sector: "Telecom", market: "ASX", basePrice: 3.85 },
  { ticker: "5GG.AX", name: "Pentanet", sector: "Telecom", market: "ASX", basePrice: 0.12 },
  { ticker: "LIC.AX", name: "Lifestyle Communities", sector: "Real Estate", market: "ASX", basePrice: 9.85 },
  { ticker: "PPE.AX", name: "PeopleIN", sector: "Industrials", market: "ASX", basePrice: 1.05 },
  { ticker: "AD8.AX", name: "Audinate Group", sector: "Technology", market: "ASX", basePrice: 8.45 },
  { ticker: "BVS.AX", name: "Bravura Solutions", sector: "Technology", market: "ASX", basePrice: 1.85 },
  { ticker: "PPS.AX", name: "Praemium", sector: "Technology", market: "ASX", basePrice: 0.65 },
  { ticker: "WBT.AX", name: "Weebit Nano", sector: "Technology", market: "ASX", basePrice: 2.85 },
  { ticker: "BRN.AX", name: "BrainChip Holdings", sector: "Technology", market: "ASX", basePrice: 0.25 },
  { ticker: "4DX.AX", name: "4DMedical", sector: "Healthcare", market: "ASX", basePrice: 0.55 },
  { ticker: "IMU.AX", name: "Imugene", sector: "Healthcare", market: "ASX", basePrice: 0.04 },
  { ticker: "OPT.AX", name: "Opthea", sector: "Healthcare", market: "ASX", basePrice: 0.65 },
  { ticker: "CYC.AX", name: "Cyclopharm", sector: "Healthcare", market: "ASX", basePrice: 1.85 },
  { ticker: "NEU.AX", name: "Neuren Pharmaceuticals", sector: "Healthcare", market: "ASX", basePrice: 14.6 },
  { ticker: "PYC.AX", name: "PYC Therapeutics", sector: "Healthcare", market: "ASX", basePrice: 0.15 },
  { ticker: "MX1.AX", name: "Micro-X", sector: "Healthcare", market: "ASX", basePrice: 0.12 },
  { ticker: "EBR.AX", name: "EBR Systems", sector: "Healthcare", market: "ASX", basePrice: 1.35 },
  { ticker: "SHV.AX", name: "Select Harvests", sector: "Consumer Staples", market: "ASX", basePrice: 4.15 },
  { ticker: "BGA.AX", name: "Bega Cheese", sector: "Consumer Staples", market: "ASX", basePrice: 4.85 },
  { ticker: "AAC.AX", name: "Australian Agricultural Company", sector: "Consumer Staples", market: "ASX", basePrice: 1.45 },
  { ticker: "IGL.AX", name: "IVE Group", sector: "Industrials", market: "ASX", basePrice: 2.35 },
  // ===================== US (USD) — Dow Jones 30 + Nasdaq-100 =====================
  // Comprehensive coverage of the two headline US indices so the ZENITH sweep
  // "considers all stocks" for top-movers across DOW JONES + NASDAQ. basePrice is
  // a plausible fallback only — live Yahoo/Twelve Data quotes overlay these.
  // — Mega-cap tech / Nasdaq leaders —
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", market: "US", basePrice: 229.87 },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", market: "US", basePrice: 441.58 },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors", market: "US", basePrice: 131.26 },
  { ticker: "GOOGL", name: "Alphabet Inc. (Class A)", sector: "Communication Services", market: "US", basePrice: 178.35 },
  { ticker: "GOOG", name: "Alphabet Inc. (Class C)", sector: "Communication Services", market: "US", basePrice: 179.6 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Discretionary", market: "US", basePrice: 201.44 },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", market: "US", basePrice: 594.12 },
  { ticker: "TSLA", name: "Tesla, Inc.", sector: "Automotive", market: "US", basePrice: 342.68 },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors", market: "US", basePrice: 176.9 },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", market: "US", basePrice: 122.18 },
  { ticker: "PLTR", name: "Palantir Technologies", sector: "Technology", market: "US", basePrice: 66.5 },
  { ticker: "NFLX", name: "Netflix, Inc.", sector: "Communication Services", market: "US", basePrice: 895.4 },
  { ticker: "ADBE", name: "Adobe Inc.", sector: "Technology", market: "US", basePrice: 512.3 },
  { ticker: "COST", name: "Costco Wholesale", sector: "Consumer Staples", market: "US", basePrice: 965.2 },
  { ticker: "PEP", name: "PepsiCo, Inc.", sector: "Consumer Staples", market: "US", basePrice: 152.8 },
  { ticker: "QCOM", name: "Qualcomm Incorporated", sector: "Semiconductors", market: "US", basePrice: 158.4 },
  { ticker: "TXN", name: "Texas Instruments", sector: "Semiconductors", market: "US", basePrice: 194.6 },
  { ticker: "INTC", name: "Intel Corporation", sector: "Semiconductors", market: "US", basePrice: 21.3 },
  { ticker: "AMAT", name: "Applied Materials", sector: "Semiconductors", market: "US", basePrice: 168.9 },
  { ticker: "MU", name: "Micron Technology", sector: "Semiconductors", market: "US", basePrice: 96.4 },
  { ticker: "LRCX", name: "Lam Research", sector: "Semiconductors", market: "US", basePrice: 78.2 },
  { ticker: "KLAC", name: "KLA Corporation", sector: "Semiconductors", market: "US", basePrice: 685.5 },
  { ticker: "ADI", name: "Analog Devices", sector: "Semiconductors", market: "US", basePrice: 216.7 },
  { ticker: "MRVL", name: "Marvell Technology", sector: "Semiconductors", market: "US", basePrice: 112.8 },
  { ticker: "NXPI", name: "NXP Semiconductors", sector: "Semiconductors", market: "US", basePrice: 214.5 },
  { ticker: "MCHP", name: "Microchip Technology", sector: "Semiconductors", market: "US", basePrice: 58.9 },
  { ticker: "ON", name: "ON Semiconductor", sector: "Semiconductors", market: "US", basePrice: 62.4 },
  { ticker: "ASML", name: "ASML Holding", sector: "Semiconductors", market: "US", basePrice: 715.3 },
  { ticker: "ARM", name: "Arm Holdings", sector: "Semiconductors", market: "US", basePrice: 138.6 },
  { ticker: "GFS", name: "GlobalFoundries", sector: "Semiconductors", market: "US", basePrice: 42.1 },
  { ticker: "INTU", name: "Intuit Inc.", sector: "Technology", market: "US", basePrice: 638.9 },
  { ticker: "CSCO", name: "Cisco Systems", sector: "Technology", market: "US", basePrice: 59.2 },
  { ticker: "AMGN", name: "Amgen Inc.", sector: "Healthcare", market: "US", basePrice: 267.4 },
  { ticker: "GILD", name: "Gilead Sciences", sector: "Healthcare", market: "US", basePrice: 92.8 },
  { ticker: "VRTX", name: "Vertex Pharmaceuticals", sector: "Healthcare", market: "US", basePrice: 442.6 },
  { ticker: "REGN", name: "Regeneron Pharmaceuticals", sector: "Healthcare", market: "US", basePrice: 712.5 },
  { ticker: "ISRG", name: "Intuitive Surgical", sector: "Healthcare", market: "US", basePrice: 528.9 },
  { ticker: "DXCM", name: "DexCom, Inc.", sector: "Healthcare", market: "US", basePrice: 78.3 },
  { ticker: "IDXX", name: "IDEXX Laboratories", sector: "Healthcare", market: "US", basePrice: 442.1 },
  { ticker: "GEHC", name: "GE HealthCare", sector: "Healthcare", market: "US", basePrice: 78.6 },
  { ticker: "AZN", name: "AstraZeneca", sector: "Healthcare", market: "US", basePrice: 68.4 },
  { ticker: "MELI", name: "MercadoLibre", sector: "Consumer Discretionary", market: "US", basePrice: 1885.0 },
  { ticker: "BKNG", name: "Booking Holdings", sector: "Consumer Discretionary", market: "US", basePrice: 5120.0 },
  { ticker: "ABNB", name: "Airbnb, Inc.", sector: "Consumer Discretionary", market: "US", basePrice: 132.7 },
  { ticker: "MAR", name: "Marriott International", sector: "Consumer Discretionary", market: "US", basePrice: 285.4 },
  { ticker: "LULU", name: "Lululemon Athletica", sector: "Consumer Discretionary", market: "US", basePrice: 342.8 },
  { ticker: "ORLY", name: "O'Reilly Automotive", sector: "Consumer Discretionary", market: "US", basePrice: 1185.0 },
  { ticker: "ROST", name: "Ross Stores", sector: "Consumer Discretionary", market: "US", basePrice: 148.2 },
  { ticker: "DASH", name: "DoorDash, Inc.", sector: "Consumer Discretionary", market: "US", basePrice: 168.9 },
  { ticker: "PDD", name: "PDD Holdings", sector: "Consumer Discretionary", market: "US", basePrice: 108.6 },
  { ticker: "SBUX", name: "Starbucks Corporation", sector: "Consumer Discretionary", market: "US", basePrice: 96.8 },
  { ticker: "MDLZ", name: "Mondelez International", sector: "Consumer Staples", market: "US", basePrice: 64.2 },
  { ticker: "KDP", name: "Keurig Dr Pepper", sector: "Consumer Staples", market: "US", basePrice: 33.4 },
  { ticker: "KHC", name: "Kraft Heinz", sector: "Consumer Staples", market: "US", basePrice: 31.2 },
  { ticker: "MNST", name: "Monster Beverage", sector: "Consumer Staples", market: "US", basePrice: 52.1 },
  { ticker: "CCEP", name: "Coca-Cola Europacific Partners", sector: "Consumer Staples", market: "US", basePrice: 82.6 },
  { ticker: "PYPL", name: "PayPal Holdings", sector: "Financials", market: "US", basePrice: 86.3 },
  { ticker: "CMCSA", name: "Comcast Corporation", sector: "Communication Services", market: "US", basePrice: 37.8 },
  { ticker: "CHTR", name: "Charter Communications", sector: "Communication Services", market: "US", basePrice: 355.2 },
  { ticker: "TMUS", name: "T-Mobile US", sector: "Communication Services", market: "US", basePrice: 232.6 },
  { ticker: "WBD", name: "Warner Bros. Discovery", sector: "Communication Services", market: "US", basePrice: 10.9 },
  { ticker: "EA", name: "Electronic Arts", sector: "Communication Services", market: "US", basePrice: 148.7 },
  { ticker: "TTWO", name: "Take-Two Interactive", sector: "Communication Services", market: "US", basePrice: 205.4 },
  { ticker: "TTD", name: "The Trade Desk", sector: "Technology", market: "US", basePrice: 118.9 },
  { ticker: "APP", name: "AppLovin Corporation", sector: "Technology", market: "US", basePrice: 342.5 },
  { ticker: "CRWD", name: "CrowdStrike Holdings", sector: "Technology", market: "US", basePrice: 358.4 },
  { ticker: "PANW", name: "Palo Alto Networks", sector: "Technology", market: "US", basePrice: 188.6 },
  { ticker: "FTNT", name: "Fortinet, Inc.", sector: "Technology", market: "US", basePrice: 98.2 },
  { ticker: "ZS", name: "Zscaler, Inc.", sector: "Technology", market: "US", basePrice: 208.4 },
  { ticker: "DDOG", name: "Datadog, Inc.", sector: "Technology", market: "US", basePrice: 138.7 },
  { ticker: "TEAM", name: "Atlassian Corporation", sector: "Technology", market: "US", basePrice: 245.8 },
  { ticker: "WDAY", name: "Workday, Inc.", sector: "Technology", market: "US", basePrice: 258.3 },
  { ticker: "SNPS", name: "Synopsys, Inc.", sector: "Technology", market: "US", basePrice: 485.6 },
  { ticker: "CDNS", name: "Cadence Design Systems", sector: "Technology", market: "US", basePrice: 302.4 },
  { ticker: "ROP", name: "Roper Technologies", sector: "Technology", market: "US", basePrice: 542.7 },
  { ticker: "ADSK", name: "Autodesk, Inc.", sector: "Technology", market: "US", basePrice: 298.5 },
  { ticker: "ADP", name: "Automatic Data Processing", sector: "Technology", market: "US", basePrice: 302.1 },
  { ticker: "PAYX", name: "Paychex, Inc.", sector: "Technology", market: "US", basePrice: 142.3 },
  { ticker: "CTSH", name: "Cognizant Technology", sector: "Technology", market: "US", basePrice: 78.9 },
  { ticker: "CDW", name: "CDW Corporation", sector: "Technology", market: "US", basePrice: 178.4 },
  { ticker: "CSGP", name: "CoStar Group", sector: "Real Estate", market: "US", basePrice: 74.2 },
  { ticker: "FAST", name: "Fastenal Company", sector: "Industrials", market: "US", basePrice: 76.8 },
  { ticker: "PCAR", name: "PACCAR Inc", sector: "Industrials", market: "US", basePrice: 102.4 },
  { ticker: "ODFL", name: "Old Dominion Freight", sector: "Industrials", market: "US", basePrice: 178.6 },
  { ticker: "CSX", name: "CSX Corporation", sector: "Industrials", market: "US", basePrice: 33.2 },
  { ticker: "CPRT", name: "Copart, Inc.", sector: "Industrials", market: "US", basePrice: 58.4 },
  { ticker: "CTAS", name: "Cintas Corporation", sector: "Industrials", market: "US", basePrice: 205.7 },
  { ticker: "VRSK", name: "Verisk Analytics", sector: "Industrials", market: "US", basePrice: 285.3 },
  { ticker: "BKR", name: "Baker Hughes", sector: "Energy", market: "US", basePrice: 44.6 },
  { ticker: "FANG", name: "Diamondback Energy", sector: "Energy", market: "US", basePrice: 168.2 },
  { ticker: "EXC", name: "Exelon Corporation", sector: "Utilities", market: "US", basePrice: 38.4 },
  { ticker: "XEL", name: "Xcel Energy", sector: "Utilities", market: "US", basePrice: 68.9 },
  { ticker: "AEP", name: "American Electric Power", sector: "Utilities", market: "US", basePrice: 98.7 },
  { ticker: "CEG", name: "Constellation Energy", sector: "Utilities", market: "US", basePrice: 248.6 },
  { ticker: "LIN", name: "Linde plc", sector: "Materials", market: "US", basePrice: 448.2 },
  // — Dow Jones 30 (constituents not already listed above) —
  { ticker: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", market: "US", basePrice: 243.75 },
  { ticker: "V", name: "Visa Inc.", sector: "Financials", market: "US", basePrice: 312.4 },
  { ticker: "GS", name: "The Goldman Sachs Group", sector: "Financials", market: "US", basePrice: 585.2 },
  { ticker: "AXP", name: "American Express", sector: "Financials", market: "US", basePrice: 298.6 },
  { ticker: "TRV", name: "The Travelers Companies", sector: "Financials", market: "US", basePrice: 258.4 },
  { ticker: "UNH", name: "UnitedHealth Group", sector: "Healthcare", market: "US", basePrice: 512.8 },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", market: "US", basePrice: 152.3 },
  { ticker: "MRK", name: "Merck & Co.", sector: "Healthcare", market: "US", basePrice: 98.6 },
  { ticker: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", market: "US", basePrice: 782.5 },
  { ticker: "HD", name: "The Home Depot", sector: "Consumer Discretionary", market: "US", basePrice: 385.4 },
  { ticker: "MCD", name: "McDonald's Corporation", sector: "Consumer Discretionary", market: "US", basePrice: 292.7 },
  { ticker: "NKE", name: "NIKE, Inc.", sector: "Consumer Discretionary", market: "US", basePrice: 72.8 },
  { ticker: "PG", name: "Procter & Gamble", sector: "Consumer Staples", market: "US", basePrice: 168.2 },
  { ticker: "KO", name: "The Coca-Cola Company", sector: "Consumer Staples", market: "US", basePrice: 62.4 },
  { ticker: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", market: "US", basePrice: 92.6 },
  { ticker: "DIS", name: "The Walt Disney Company", sector: "Communication Services", market: "US", basePrice: 112.3 },
  { ticker: "VZ", name: "Verizon Communications", sector: "Communication Services", market: "US", basePrice: 43.8 },
  { ticker: "IBM", name: "International Business Machines", sector: "Technology", market: "US", basePrice: 232.5 },
  { ticker: "CRM", name: "Salesforce, Inc.", sector: "Technology", market: "US", basePrice: 342.6 },
  { ticker: "HON", name: "Honeywell International", sector: "Industrials", market: "US", basePrice: 218.4 },
  { ticker: "CAT", name: "Caterpillar Inc.", sector: "Industrials", market: "US", basePrice: 388.9 },
  { ticker: "BA", name: "The Boeing Company", sector: "Industrials", market: "US", basePrice: 178.6 },
  { ticker: "MMM", name: "3M Company", sector: "Industrials", market: "US", basePrice: 138.4 },
  { ticker: "CVX", name: "Chevron Corporation", sector: "Energy", market: "US", basePrice: 158.2 },
  { ticker: "SHW", name: "The Sherwin-Williams Company", sector: "Materials", market: "US", basePrice: 358.7 },
];

/* --------------------------- Crypto universe ---------------------------- */

// Digital-asset universe (all quoted in USD). Same technical engine as equities,
// with a higher volatility profile reflecting 24/7 crypto markets.
export const CRYPTO_UNIVERSE: UniverseEntry[] = [
  { ticker: "BTC", name: "Bitcoin", sector: "Store of Value", market: "CRYPTO", basePrice: 96850 },
  { ticker: "ETH", name: "Ethereum", sector: "Smart Contract", market: "CRYPTO", basePrice: 3420 },
  { ticker: "SOL", name: "Solana", sector: "Smart Contract", market: "CRYPTO", basePrice: 198.4 },
  { ticker: "BNB", name: "BNB", sector: "Exchange", market: "CRYPTO", basePrice: 712 },
  { ticker: "XRP", name: "XRP", sector: "Payments", market: "CRYPTO", basePrice: 2.31 },
  { ticker: "ADA", name: "Cardano", sector: "Smart Contract", market: "CRYPTO", basePrice: 0.98 },
  { ticker: "AVAX", name: "Avalanche", sector: "Smart Contract", market: "CRYPTO", basePrice: 41.2 },
  { ticker: "DOGE", name: "Dogecoin", sector: "Meme", market: "CRYPTO", basePrice: 0.38 },
  { ticker: "LINK", name: "Chainlink", sector: "Oracle", market: "CRYPTO", basePrice: 24.7 },
  { ticker: "DOT", name: "Polkadot", sector: "Interoperability", market: "CRYPTO", basePrice: 8.15 },
  { ticker: "MATIC", name: "Polygon", sector: "Layer 2", market: "CRYPTO", basePrice: 0.62 },
  { ticker: "LTC", name: "Litecoin", sector: "Payments", market: "CRYPTO", basePrice: 108.5 },
  { ticker: "UNI", name: "Uniswap", sector: "DeFi", market: "CRYPTO", basePrice: 13.4 },
  { ticker: "ATOM", name: "Cosmos", sector: "Interoperability", market: "CRYPTO", basePrice: 7.9 },
  { ticker: "NEAR", name: "NEAR Protocol", sector: "Smart Contract", market: "CRYPTO", basePrice: 5.6 },
  { ticker: "APT", name: "Aptos", sector: "Smart Contract", market: "CRYPTO", basePrice: 9.8 },
  { ticker: "ARB", name: "Arbitrum", sector: "Layer 2", market: "CRYPTO", basePrice: 0.84 },
  { ticker: "OP", name: "Optimism", sector: "Layer 2", market: "CRYPTO", basePrice: 1.72 },
];

/** The universe for a given asset class. */
export function universeFor(assetClass: AssetClass): UniverseEntry[] {
  return assetClass === "crypto" ? CRYPTO_UNIVERSE : MARKET_UNIVERSE;
}

/* ----------------------- User-facing exchange buckets ------------------- */

/**
 * The 30 Dow Jones Industrial Average constituents. Used to split the single
 * "US" market code into the two headline indices ("Dow Jones" vs "NASDAQ") for
 * the ALL Markets selector and the projection exchange chips.
 */
export const DOW_JONES_TICKERS: ReadonlySet<string> = new Set([
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
]);

/** The four user-facing equity exchanges the dashboard surfaces. */
export type Exchange = "NZX" | "ASX" | "DOW" | "NASDAQ";

export const EXCHANGE_META: Record<
  Exchange,
  { label: string; sub: string; currency: "NZD" | "AUD" | "USD" }
> = {
  NZX: { label: "NZX", sub: "New Zealand Exchange", currency: "NZD" },
  ASX: { label: "ASX", sub: "Australian Securities Exchange", currency: "AUD" },
  DOW: { label: "Dow Jones", sub: "Dow Jones Industrial Average · 30", currency: "USD" },
  NASDAQ: { label: "NASDAQ", sub: "Nasdaq listed", currency: "USD" },
};

export const EXCHANGES: Exchange[] = ["NZX", "ASX", "DOW", "NASDAQ"];

/**
 * Resolve which user-facing exchange a ticker belongs to. NZX / ASX map by
 * their suffix-derived market; a US listing is bucketed into Dow Jones when it
 * is a Dow constituent, otherwise NASDAQ.
 */
export function resolveExchange(ticker: string, market: MarketCode): Exchange {
  if (market === "NZX") return "NZX";
  if (market === "ASX") return "ASX";
  return DOW_JONES_TICKERS.has(ticker.toUpperCase()) ? "DOW" : "NASDAQ";
}

/** All universe entries listed on a given user-facing exchange. */
export function entriesForExchange(ex: Exchange): UniverseEntry[] {
  return MARKET_UNIVERSE.filter((e) => resolveExchange(e.ticker, e.market) === ex);
}

const UNIVERSE_MAP: Record<string, UniverseEntry> = [...MARKET_UNIVERSE, ...CRYPTO_UNIVERSE].reduce(
  (acc, e) => {
    acc[e.ticker] = e;
    return acc;
  },
  {} as Record<string, UniverseEntry>
);

export function currencyForMarket(market: MarketCode): "NZD" | "AUD" | "USD" {
  return market === "NZX" ? "NZD" : market === "ASX" ? "AUD" : "USD";
}

/* --------------------------------- RNG ---------------------------------- */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A single monthly-stable salt keeps the whole app's "market state" coherent
// per calendar month without depending on Math.random / Date at import time.
const MARKET_EPOCH = "aetherforge-2026-07";

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/* ------------------------- Price-series synthesis ----------------------- */

/**
 * Deterministic daily close series of `days` sessions, ending exactly at
 * `basePrice`. Uses a mild drift + volatility random walk seeded per ticker.
 */
function dailySeries(ticker: string, basePrice: number, days = 140, volScale = 1): number[] {
  const rnd = mulberry32(hashSeed(MARKET_EPOCH + "|" + ticker));
  const drift = (rnd() - 0.45) * 0.6 * volScale; // total trend over the window
  const vol = (0.012 + rnd() * 0.02) * volScale; // daily volatility (scaled for crypto)
  const start = basePrice / (1 + drift);
  const out: number[] = [];
  let price = start;
  for (let i = 0; i < days; i++) {
    const step = drift / (days - 1) + (rnd() - 0.5) * vol * 2;
    price = Math.max(0.01, price * (1 + step));
    out.push(price);
  }
  out[out.length - 1] = basePrice; // pin the latest close to the quoted price
  return out;
}

/* --------------------------- Technical indicators ----------------------- */

function sma(series: number[], period: number): number {
  if (series.length < period) return average(series);
  const slice = series.slice(-period);
  return average(slice);
}

function average(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = average(xs);
  return Math.sqrt(average(xs.map((x) => (x - m) ** 2)));
}

function ema(series: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = series[0];
  series.forEach((v, i) => {
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

function computeRSI(series: number[], period = 14): number {
  if (series.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = series.length - period; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 1);
}

function computeMACD(series: number[]): { macd: number; signal: number; histogram: number } {
  const emaFast = ema(series, 12);
  const emaSlow = ema(series, 26);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd: round(macd, 3), signal: round(signal, 3), histogram: round(macd - signal, 3) };
}

function computeBollinger(series: number[], period = 20, mult = 2) {
  const slice = series.slice(-period);
  const mid = average(slice);
  const sd = stddev(slice);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const price = series[series.length - 1];
  const position = upper > lower ? clamp(((price - lower) / (upper - lower)) * 100, 0, 100) : 50;
  return { upper, lower, mid, position: round(position, 1) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------ Projection ------------------------------ */

/**
 * 7-day forward projection via **Ridge regression** (L2-regularized least
 * squares) on the last 30 sessions, blended with an RSI-driven mean-reversion
 * nudge. The time feature is standardised so the ridge penalty `lambda` is
 * scale-free; the penalty shrinks the trend toward flat when the recent tape is
 * noisy, which is materially more robust than plain OLS on volatile (esp.
 * crypto) series. Confidence is derived from the ridge fit's R².
 *
 * Closed form (centred/standardised x, so intercept = mean(y)):
 *   b_z = Σ(z·y') / (Σ(z²) + lambda)      where z = (x − x̄)/σ_x, y' = y − ȳ
 */
function projectForward(
  series: number[],
  rsi: number,
  opts: { lambda?: number; volScale?: number } = {}
): { path: number[]; pct: number; confidence: number } {
  const lambda = opts.lambda ?? 2.5; // ridge penalty (on standardised time units)
  const volScale = opts.volScale ?? 1;
  const window = series.slice(-30);
  const n = window.length;
  const meanX = (n - 1) / 2;
  const meanY = average(window);

  // Standardise the time axis so the penalty is independent of window length.
  const sigmaX = Math.sqrt(window.reduce((s, _, i) => s + (i - meanX) ** 2, 0) / n) || 1;

  let sZY = 0;
  let sZZ = 0;
  window.forEach((y, i) => {
    const z = (i - meanX) / sigmaX;
    sZY += z * (y - meanY);
    sZZ += z * z;
  });
  const slopeZ = sZZ + lambda === 0 ? 0 : sZY / (sZZ + lambda); // price per 1σ of time
  const dailySlope = slopeZ / sigmaX; // price move per session

  // R² of the ridge fit as a confidence proxy.
  let ssRes = 0;
  let ssTot = 0;
  window.forEach((y, i) => {
    const pred = meanY + slopeZ * ((i - meanX) / sigmaX);
    ssRes += (y - pred) ** 2;
    ssTot += (y - meanY) ** 2;
  });
  const r2 = ssTot === 0 ? 0 : clamp(1 - ssRes / ssTot, 0, 1);

  // Mean-reversion: overbought (RSI>70) drags the slope down, oversold lifts it.
  const reversion = (50 - rsi) / 50; // +ve when oversold
  const last = series[series.length - 1];
  const adjSlope = dailySlope * 0.8 + last * 0.004 * reversion;

  const path: number[] = [];
  let p = last;
  for (let d = 1; d <= 7; d++) {
    p = Math.max(0.01, p + adjSlope);
    path.push(round(p, last < 5 ? 4 : 2));
  }
  const pct = round(((path[path.length - 1] - last) / last) * 100, 2);
  // Crypto tolerates larger projected swings before confidence is discounted.
  const swingBudget = 10 * volScale;
  const confidence = Math.round(clamp(45 + r2 * 45 + (swingBudget - Math.abs(pct)) * 0.5, 40, 96));
  return { path, pct, confidence };
}

/* -------------------------- Volatility & structure ---------------------- */

/**
 * ATR-style volatility on a close-only series: the mean absolute session-to-
 * session move over `period` sessions, expressed as a % of the latest price.
 * (True ATR needs intraday high/low; on close-only data the absolute close-to-
 * close change is the standard, well-behaved proxy.)
 */
function computeATRpct(series: number[], period = 14): number {
  if (series.length < 2) return 0;
  const slice = series.slice(-(period + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    sum += Math.abs(slice[i] - slice[i - 1]);
    n++;
  }
  const atr = n ? sum / n : 0;
  const last = series[series.length - 1] || 1;
  return round((atr / last) * 100, 2);
}

/**
 * Realised volatility from daily log-returns over `lookback` sessions.
 * Returns both the 1-day σ and the annualised σ (×√252), in %.
 */
function computeRealizedVol(series: number[], lookback = 30): { daily: number; annual: number } {
  const slice = series.slice(-(lookback + 1));
  if (slice.length < 3) return { daily: 1, annual: 16 };
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0) rets.push(Math.log(slice[i] / slice[i - 1]));
  }
  const sd = stddev(rets); // fractional daily σ
  return {
    daily: round(sd * 100, 2),
    annual: round(sd * Math.sqrt(252) * 100, 1),
  };
}

/**
 * Nearest structural support/resistance from recent swing pivots, plus the
 * classic floor-trader pivot. Swings are local extrema (a close higher/lower
 * than its 2 neighbours either side) over the last ~60 sessions; support is the
 * highest swing-low below price, resistance the lowest swing-high above it.
 */
function computeLevels(
  series: number[],
  price: number
): { support: number; resistance: number; pivot: number } {
  const win = series.slice(-60);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < win.length - 2; i++) {
    const v = win[i];
    if (v >= win[i - 1] && v >= win[i - 2] && v >= win[i + 1] && v >= win[i + 2]) highs.push(v);
    if (v <= win[i - 1] && v <= win[i - 2] && v <= win[i + 1] && v <= win[i + 2]) lows.push(v);
  }
  const recent = series.slice(-20);
  const hi = Math.max(...recent);
  const lo = Math.min(...recent);
  const close = series[series.length - 1];
  const pivot = (hi + lo + close) / 3;

  const supportsBelow = lows.filter((l) => l < price);
  const resistAbove = highs.filter((h) => h > price);
  // Fall back to the recent low/high, then to a volatility-implied band.
  const atr = (computeATRpct(series) / 100) * price;
  const support = supportsBelow.length
    ? Math.max(...supportsBelow)
    : lo < price
      ? lo
      : round(price - 2 * atr, price < 5 ? 4 : 2);
  const resistance = resistAbove.length
    ? Math.min(...resistAbove)
    : hi > price
      ? hi
      : round(price + 2 * atr, price < 5 ? 4 : 2);

  const dp = price < 5 ? 4 : 2;
  return { support: round(support, dp), resistance: round(resistance, dp), pivot: round(pivot, dp) };
}

/** Classify the trend/volatility regime from trend alignment + realised vol. */
function deriveRegime(input: {
  vsSma20: number;
  vsSma50: number;
  dailyVolPct: number;
  projected7dPct: number;
  assetClass: AssetClass;
}): MarketRegime {
  const { vsSma20, vsSma50, dailyVolPct, projected7dPct, assetClass } = input;
  // Volatility that is high relative to the asset class dominates the label.
  const volHot = assetClass === "crypto" ? dailyVolPct > 5 : dailyVolPct > 2.6;
  if (volHot) return "High Volatility";
  const trendUp = vsSma20 > 1.2 && vsSma50 > 0 && projected7dPct > 0.4;
  const trendDown = vsSma20 < -1.2 && vsSma50 < 0 && projected7dPct < -0.4;
  if (trendUp) return "Trending Up";
  if (trendDown) return "Trending Down";
  return "Range-Bound";
}

/**
 * Build a volatility-scaled, regime-aware probabilistic 7-day outlook. Models
 * the 7-day return as roughly Normal(drift, σ7): the Base case is the ~50%
 * interquartile band (drift ± 0.674σ7); Bull/Bear are the tails out to the
 * ~10th/90th percentiles (±1.282σ7). Tail probabilities are skewed by the
 * signal score so a stronger regime tilts the odds — never a point target.
 */
function buildOutlook(input: {
  price: number;
  projected7dPct: number;
  dailyVolPct: number;
  score: number;
  regime: MarketRegime;
}): ProbabilisticOutlook {
  const { price, projected7dPct: drift, dailyVolPct, score, regime } = input;
  const dp = price < 5 ? 4 : 2;
  const sigma7 = Math.max(0.6, dailyVolPct * Math.sqrt(7)); // 1σ 7-day move, %
  const IQR = 0.674 * sigma7; // 25th–75th percentile half-width
  const TAIL = 1.282 * sigma7; // ~10th/90th percentile

  // Directional skew from the signal score (−1 bearish … +1 bullish).
  const bias = clamp((score - 50) / 50, -1, 1);
  const bullProb = Math.round(clamp(25 + bias * 12, 12, 40));
  const bearProb = 50 - bullProb; // Base is fixed at ~50%
  const baseProb = 50;

  const toPrice = (pct: number) => round(price * (1 + pct / 100), dp);
  const mk = (label: OutlookCase["label"], lo: number, hi: number, prob: number): OutlookCase => ({
    label,
    lowPct: round(lo, 2),
    highPct: round(hi, 2),
    lowPrice: toPrice(lo),
    highPrice: toPrice(hi),
    probability: prob,
  });

  return {
    horizonDays: 7,
    expectedPct: round(drift, 2),
    sigma7Pct: round(sigma7, 2),
    regime,
    base: mk("Base", drift - IQR, drift + IQR, baseProb),
    bull: mk("Bull", drift + IQR, drift + TAIL, bullProb),
    bear: mk("Bear", drift - TAIL, drift - IQR, bearProb),
  };
}

/**
 * Explicit conviction bucket: how much to trust the signal. Driven by the
 * distance of the score from neutral (edge), the projection confidence, and the
 * regime — a hot-volatility regime caps conviction at "Speculative".
 */
function deriveConviction(input: {
  score: number;
  confidence: number;
  regime: MarketRegime;
}): { level: ConvictionLevel; reason: string } {
  const { score, confidence, regime } = input;
  const edge = Math.abs(score - 50); // 0 (neutral) … 48 (extreme)
  if (regime === "High Volatility" || confidence < 48) {
    return {
      level: "Speculative",
      reason:
        regime === "High Volatility"
          ? "elevated realised volatility widens the outcome range — size positions small"
          : "low model confidence in the current tape",
    };
  }
  if (edge >= 20 && confidence >= 68) {
    return { level: "High", reason: `strong directional edge (score ${score}/100) with ${confidence}% model confidence` };
  }
  if (edge >= 10 && confidence >= 55) {
    return { level: "Moderate", reason: `a moderate edge (score ${score}/100) confirmed across indicators` };
  }
  return { level: "Low", reason: "signals are mixed with no decisive edge this week" };
}

/* ------------------------------ Signal logic ---------------------------- */

function deriveSignal(input: {
  rsi: number;
  macdHistogram: number;
  vsSma20: number;
  projected7dPct: number;
  bbPosition: number;
}): { signal: SecurityIntel["signal"]; score: number; reasoning: string } {
  const { rsi, macdHistogram, vsSma20, projected7dPct, bbPosition } = input;
  let score = 50;
  const notes: string[] = [];

  // Momentum (MACD)
  if (macdHistogram > 0) {
    score += 10;
    notes.push("MACD histogram is positive (bullish momentum)");
  } else {
    score -= 10;
    notes.push("MACD histogram is negative (fading momentum)");
  }

  // Trend vs SMA20
  if (vsSma20 > 2) {
    score += 8;
    notes.push(`trading ${round(vsSma20, 1)}% above its 20-day average`);
  } else if (vsSma20 < -2) {
    score -= 8;
    notes.push(`trading ${round(Math.abs(vsSma20), 1)}% below its 20-day average`);
  }

  // RSI extremes
  if (rsi >= 70) {
    score -= 12;
    notes.push(`RSI ${round(rsi, 0)} is overbought — pullback risk`);
  } else if (rsi <= 30) {
    score += 12;
    notes.push(`RSI ${round(rsi, 0)} is oversold — mean-reversion setup`);
  } else {
    notes.push(`RSI ${round(rsi, 0)} is neutral`);
  }

  // Bollinger position
  if (bbPosition >= 92) {
    score -= 6;
    notes.push("price is pinned to the upper Bollinger band");
  } else if (bbPosition <= 8) {
    score += 6;
    notes.push("price is pressing the lower Bollinger band");
  }

  // Forward projection (largest weight)
  score += clamp(projected7dPct * 3, -22, 22);
  if (projected7dPct > 1.5) notes.push(`7-day model projects +${projected7dPct}%`);
  else if (projected7dPct < -1.5) notes.push(`7-day model projects ${projected7dPct}%`);
  else notes.push("7-day model projects a broadly flat tape");

  score = Math.round(clamp(score, 2, 98));

  let signal: SecurityIntel["signal"];
  if (score >= 72) signal = "Strong Buy";
  else if (score >= 58) signal = "Buy";
  else if (score >= 42) signal = "Hold";
  else if (score >= 28) signal = "Reduce";
  else signal = "Sell";

  const reasoning = `${signal} · ${notes.join("; ")}.`;
  return { signal, score, reasoning };
}

/* --------------------------- Per-security intel ------------------------- */

const CACHE = new Map<string, SecurityIntel>();

/** Full technical intelligence for one ticker. Overridable current price. */
export function analyzeSecurity(
  ticker: string,
  priceOverride?: number,
  nameOverride?: string,
  marketOverride?: MarketCode
): SecurityIntel {
  const key = `${ticker}|${priceOverride ?? ""}|${marketOverride ?? ""}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const entry = UNIVERSE_MAP[ticker];
  const base = priceOverride ?? entry?.basePrice ?? 100;
  const market: MarketCode =
    entry?.market ??
    marketOverride ??
    (ticker.endsWith(".NZ") ? "NZX" : ticker.endsWith(".AX") ? "ASX" : "US");
  const assetClass = assetClassForMarket(market);
  const name = nameOverride ?? entry?.name ?? ticker;
  const sector = entry?.sector ?? (assetClass === "crypto" ? "Digital Assets" : "General");

  // Crypto swings ~2.2x harder than equities — feed that into the synthetic
  // series and the ridge projection so signals reflect 24/7 volatility.
  const volScale = assetClass === "crypto" ? 2.2 : 1;

  const series = dailySeries(ticker, base, 140, volScale);
  const last = series[series.length - 1];
  const prev = series[series.length - 2] ?? last;
  const wk = series[series.length - 8] ?? last;
  const mo = series[series.length - 31] ?? series[0];

  const rsi = computeRSI(series);
  const macd = computeMACD(series);
  const boll = computeBollinger(series);
  const sma20 = sma(series, 20);
  const vsSma20 = round(((last - sma20) / sma20) * 100, 2);
  const sma50 = sma(series, 50);
  const vsSma50 = round(((last - sma50) / sma50) * 100, 2);
  const projection = projectForward(series, rsi, { volScale });

  const macdSignal: SecurityIntel["macdSignal"] =
    macd.histogram > 0.001 ? "Bullish" : macd.histogram < -0.001 ? "Bearish" : "Neutral";

  // Volatility & structural levels.
  const atrPct = computeATRpct(series);
  const vol = computeRealizedVol(series, 30);
  const levels = computeLevels(series, last);

  const { signal, score, reasoning } = deriveSignal({
    rsi,
    macdHistogram: macd.histogram,
    vsSma20,
    projected7dPct: projection.pct,
    bbPosition: boll.position,
  });

  const regime = deriveRegime({
    vsSma20,
    vsSma50,
    dailyVolPct: vol.daily,
    projected7dPct: projection.pct,
    assetClass,
  });
  const outlook = buildOutlook({
    price: last,
    projected7dPct: projection.pct,
    dailyVolPct: vol.daily,
    score,
    regime,
  });
  const conviction = deriveConviction({ score, confidence: projection.confidence, regime });

  const dp = last < 5 ? 4 : 2;
  const history: SeriesPoint[] = series.slice(-30).map((p, i) => ({
    label: `D-${29 - i}`,
    price: round(p, dp),
  }));
  const projPath: SeriesPoint[] = projection.path.map((p, i) => ({
    label: `+${i + 1}d`,
    price: p,
    projected: true,
  }));

  const intel: SecurityIntel = {
    ticker,
    name,
    sector,
    market,
    assetClass,
    currency: currencyForMarket(market),
    price: round(last, dp),
    change1d: round(((last - prev) / prev) * 100, 2),
    change7d: round(((last - wk) / wk) * 100, 2),
    change30d: round(((last - mo) / mo) * 100, 2),
    history,
    projection: projPath,
    projected7dPct: projection.pct,
    confidence: projection.confidence,
    rsi,
    macd: macd.macd,
    macdSignalLine: macd.signal,
    macdHistogram: macd.histogram,
    macdSignal,
    bbPosition: boll.position,
    sma20: round(sma20, dp),
    vsSma20,
    sma50: round(sma50, dp),
    vsSma50,
    atrPct,
    realizedVolPct: vol.annual,
    dailyVolPct: vol.daily,
    regime,
    support: levels.support,
    resistance: levels.resistance,
    pivot: levels.pivot,
    outlook,
    signal,
    score,
    conviction: conviction.level,
    convictionReason: conviction.reason,
    reasoning,
  };
  CACHE.set(key, intel);
  return intel;
}

/* ------------------------------ Aggregations ---------------------------- */

const ALL_INTEL: Partial<Record<AssetClass, SecurityIntel[]>> = {};
function allIntel(assetClass: AssetClass = "stock"): SecurityIntel[] {
  if (!ALL_INTEL[assetClass]) {
    ALL_INTEL[assetClass] = universeFor(assetClass).map((e) => analyzeSecurity(e.ticker));
  }
  return ALL_INTEL[assetClass]!;
}

/**
 * Minimum share of a universe that must return a genuine live quote before we
 * switch to "live-only" mode (dropping tickers with no live price). Below this
 * we assume a transient data-feed outage and keep the full set. Shared with the
 * report sweep so both paths clean delisted names on the same rule.
 */
export const LIVE_COVERAGE_FLOOR = 0.4;

/**
 * Analyse a whole universe, anchoring each security to a live price (from the
 * market-data / CoinGecko provider). With no overrides this returns the cached
 * deterministic set. Keyed by the internal ticker (e.g. "BHP.AX").
 *
 * SELF-CLEANING: when live prices are supplied we return ONLY the securities
 * that came back with a genuine live quote today, so any delisted / suspended /
 * renamed ticker (no live price) is automatically dropped from every list
 * (snapshot, top movers, projection leaders). This is what keeps a name that
 * stops trading — e.g. an ASX company that gets acquired — from lingering in the
 * lists on stale synthetic data. Guarded: if live coverage collapses (a
 * transient data-feed outage), we fall back to the full deterministic set so the
 * dashboard can never go blank.
 */
export function analyzeUniverse(
  priceOverrides?: Record<string, number>,
  assetClass: AssetClass = "stock"
): SecurityIntel[] {
  const universe = universeFor(assetClass);
  if (!priceOverrides || !Object.keys(priceOverrides).length) return allIntel(assetClass);

  const priced = universe.map((e) => {
    const raw = priceOverrides[e.ticker] ?? priceOverrides[e.ticker.toUpperCase()];
    return { ticker: e.ticker, live: raw && raw > 0 ? raw : undefined };
  });

  const liveCount = priced.filter((p) => p.live !== undefined).length;
  const strict = liveCount >= Math.max(1, Math.floor(universe.length * LIVE_COVERAGE_FLOOR));
  if (!strict) {
    console.warn(
      `[market-intel] Live coverage low (${liveCount}/${universe.length}); keeping full ${assetClass} set to avoid a blank board.`
    );
  }

  return priced
    .filter((p) => (strict ? p.live !== undefined : true))
    .map((p) => analyzeSecurity(p.ticker, p.live));
}

/** The market columns present for an asset class (NZX/ASX/US, or CRYPTO). */
export function marketsForAssetClass(assetClass: AssetClass): MarketCode[] {
  return assetClass === "crypto" ? ["CRYPTO"] : ["NZX", "ASX", "US"];
}

/** Snapshot grouped by market, each sorted by 1-day change (desc). */
export function getMarketSnapshot(
  list: SecurityIntel[] = allIntel()
): Partial<Record<MarketCode, SecurityIntel[]>> {
  const markets = Array.from(new Set(list.map((s) => s.market)));
  const out: Partial<Record<MarketCode, SecurityIntel[]>> = {};
  for (const m of markets) {
    out[m] = list.filter((s) => s.market === m).sort((a, b) => b.change1d - a.change1d);
  }
  return out;
}

export type MoverWindow = "1d" | "7d" | "30d";

export function getTopMovers(
  window: MoverWindow,
  count = 6,
  list: SecurityIntel[] = allIntel()
): { gainers: SecurityIntel[]; losers: SecurityIntel[] } {
  const key = window === "1d" ? "change1d" : window === "7d" ? "change7d" : "change30d";
  const sorted = [...list].sort((a, b) => (b[key] as number) - (a[key] as number));
  return {
    gainers: sorted.slice(0, count),
    losers: sorted.slice(-count).reverse(),
  };
}

/** Highest-conviction 7-day projected movers across the whole universe. */
export function getProjectionLeaders(count = 6, list: SecurityIntel[] = allIntel()): SecurityIntel[] {
  return [...list]
    .sort((a, b) => b.projected7dPct * (b.confidence / 100) - a.projected7dPct * (a.confidence / 100))
    .slice(0, count);
}

/**
 * Top short-term projected movers in EITHER direction across the whole universe
 * (NZX + ASX + Dow Jones + NASDAQ), ranked by conviction-weighted absolute
 * projected 7-day move. Surfaces the strongest up- AND down-moves so the
 * dashboard's overall "Projected Movers" ranking reflects real market breadth.
 */
export function getProjectionMovers(count = 15, list: SecurityIntel[] = allIntel()): SecurityIntel[] {
  return [...list]
    .sort(
      (a, b) =>
        Math.abs(b.projected7dPct) * (b.confidence / 100) -
        Math.abs(a.projected7dPct) * (a.confidence / 100)
    )
    .slice(0, count);
}

/* --------------------------------- News --------------------------------- */

export interface NewsItem {
  headline: string;
  source: string;
  market: MarketCode | "Global";
  impact: "Bullish" | "Bearish" | "Neutral";
  relevance: number; // 0-100 relevance to NZ/AU investors
  time: string;
}

const NEWS_POOL: NewsItem[] = [
  { headline: "RBNZ holds the OCR at 3.25%; forward guidance turns dovish on cooling inflation", source: "NZ Markets Daily", market: "NZX", impact: "Bullish", relevance: 96, time: "2h ago" },
  { headline: "Fonterra lifts farmgate milk-price forecast, buoying NZX dairy exposure", source: "BusinessDesk", market: "NZX", impact: "Bullish", relevance: 88, time: "4h ago" },
  { headline: "Fisher & Paykel Healthcare guides FY revenue above consensus on hospital demand", source: "NZX Wire", market: "NZX", impact: "Bullish", relevance: 84, time: "5h ago" },
  { headline: "ASX resources rally as iron-ore firms above US$105/t on China stimulus", source: "ASX Wire", market: "ASX", impact: "Bullish", relevance: 82, time: "3h ago" },
  { headline: "Commonwealth Bank flags stable margins but cautious consumer outlook", source: "AFR", market: "ASX", impact: "Neutral", relevance: 78, time: "6h ago" },
  { headline: "Woodside Energy signs long-term LNG supply deal with Asian utility", source: "Reuters", market: "ASX", impact: "Bullish", relevance: 71, time: "7h ago" },
  { headline: "US CPI prints cooler than expected; rate-cut odds for the next FOMC firm up", source: "Bloomberg", market: "US", impact: "Bullish", relevance: 90, time: "1h ago" },
  { headline: "NVIDIA data-centre backlog extends; AI capex cycle shows no sign of peaking", source: "CNBC", market: "US", impact: "Bullish", relevance: 68, time: "8h ago" },
  { headline: "NZD/USD strengthens toward 0.61 as risk sentiment improves globally", source: "FX Observer", market: "Global", impact: "Neutral", relevance: 74, time: "2h ago" },
  { headline: "Global funds rotate into APAC value names as US mega-cap valuations stretch", source: "Morningstar", market: "Global", impact: "Bullish", relevance: 70, time: "9h ago" },
  { headline: "Oil eases on demand concerns, pressuring energy-heavy ASX index weightings", source: "MarketWatch", market: "ASX", impact: "Bearish", relevance: 62, time: "10h ago" },
  { headline: "Auckland Airport passenger volumes recover to 92% of pre-2020 levels", source: "NZ Herald", market: "NZX", impact: "Bullish", relevance: 66, time: "11h ago" },
];

const CRYPTO_NEWS_POOL: NewsItem[] = [
  { headline: "Spot Bitcoin ETFs log record weekly net inflows as institutional demand accelerates", source: "CoinDesk", market: "CRYPTO", impact: "Bullish", relevance: 95, time: "1h ago" },
  { headline: "Ethereum staking yield firms above 4% as validator queue clears post-upgrade", source: "The Block", market: "CRYPTO", impact: "Bullish", relevance: 88, time: "2h ago" },
  { headline: "Solana network hits new daily transaction high; DeFi TVL rotates higher", source: "Blockworks", market: "CRYPTO", impact: "Bullish", relevance: 84, time: "3h ago" },
  { headline: "Bitcoin funding rates cool from overheated levels, easing squeeze risk", source: "Glassnode", market: "CRYPTO", impact: "Neutral", relevance: 80, time: "4h ago" },
  { headline: "US regulator signals clearer digital-asset custody framework for banks", source: "Reuters", market: "CRYPTO", impact: "Bullish", relevance: 82, time: "5h ago" },
  { headline: "Stablecoin market cap expands as on-chain settlement volumes climb", source: "Kaiko", market: "CRYPTO", impact: "Bullish", relevance: 74, time: "6h ago" },
  { headline: "Layer-2 activity surges; Arbitrum and Optimism fees drop on throughput gains", source: "L2Beat", market: "CRYPTO", impact: "Bullish", relevance: 70, time: "7h ago" },
  { headline: "Long-dormant BTC supply stays put — long-term holder conviction intact", source: "CryptoQuant", market: "CRYPTO", impact: "Bullish", relevance: 72, time: "8h ago" },
  { headline: "Macro: softer US dollar and cooling yields lift risk appetite across digital assets", source: "Bloomberg", market: "Global", impact: "Bullish", relevance: 78, time: "2h ago" },
  { headline: "Options desks note elevated BTC implied volatility into month-end expiry", source: "Deribit Insights", market: "CRYPTO", impact: "Neutral", relevance: 64, time: "9h ago" },
  { headline: "Memecoin froth cools as capital rotates toward large-cap majors", source: "Messari", market: "CRYPTO", impact: "Bearish", relevance: 58, time: "10h ago" },
  { headline: "Corporate treasuries add BTC to balance sheets, citing diversification", source: "CoinTelegraph", market: "CRYPTO", impact: "Bullish", relevance: 68, time: "11h ago" },
];

export function getMarketNews(assetClass: AssetClass = "stock"): NewsItem[] {
  const pool = assetClass === "crypto" ? CRYPTO_NEWS_POOL : NEWS_POOL;
  return [...pool].sort((a, b) => b.relevance - a.relevance);
}

/** Format a price with its market currency (compact, NZ locale). */
export function formatMarketPrice(price: number, currency: "NZD" | "AUD" | "USD"): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 5 ? 4 : 2,
  }).format(price);
}
