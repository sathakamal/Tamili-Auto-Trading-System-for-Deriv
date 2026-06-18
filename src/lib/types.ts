
import { z } from "zod";
import { type Arrow as IndicatorArrow } from './indicators';
import { type AllChartTimeframes } from './indicators/indicator-types';

export interface Trade {
  id: string;
  time: string;
  asset: string;
  type: string;
  stake: number;
  result: number;
  status: "Won" | "Lost" | "Ongoing" | "Placing";
  durationUnit: 't' | 'm';
  profit: number;
  isWin: boolean;
  entry: number;
  exit: number;
  duration: string;
  timestamp: string;
}

export interface BotStats {
  balance: number;
  sessionProfit: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  derivId: string;
}

export type Tick = {
  epoch: number;
  price: number;
}

export type Candle = {
    epoch: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
};

export interface OHLC {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineData { time: number; value: number; color?: string };
export interface HistogramData { time: number; value: number; color?: string };

export type Arrow = IndicatorArrow;

export interface TrendLine {
    id: string;
    time1: number;
    price1: number;
    time2: number;
    price2: number;
    color: string;
    width: number;
    style: number; // lightweight-charts LineStyle
}

export interface IndicatorWeights {
    rsiWeight: number;
    stochasticWeight: number;
    macdWeight: number;
    bollingerWeight: number;
    emaWeight: number;
    smaWeight: number;
    momentumWeight: number;
    reversalWeight: number;
    trendAnalysisWeight: number;
    multiTimeframeAnalysisWeight: number;
    volatilityFilterWeight: number;
    superSignalsWeight: number;
    skyrexReversalWeight: number;
    squeezeMomentumWeight: number;
    dpoWeight: number;
    pmoWeight: number;
    deltaRsiWeight: number;
    supportResistanceWeight: number;
    peakFilterWeight: number;
    atrTrailingStopWeight: number;
    volumeProfileWeight: number;
    emaAdxTrendWeight: number;
    ultimatePullbackWeight: number;
}

export type RsiStrategy = 'default' | 'crossover50';
export type StochasticStrategy = 'default' | 'crossover';
export type BollingerStrategy = 'default' | 'midBandCrossover' | 'midBandBounce';
export type OneTwoThreeStrategy = 'classic' | 'aggressive' | '2b';
export type DpoStrategy = 'disabled' | 'breakout' | 'mean-reversion' | 'mid-band-cross' | 'inner-band-breakout' | 'all' | 'outer-mean-reversion';
export type PmoStrategy = 'disabled' | 'signal-cross' | 'zero-cross';
export type DeltaRsiStrategy = 'disabled' | 'zero-crossing' | 'signal-crossing' | 'direction-change';
export type MomentumStrategy = 'positive-negative' | 'zero-crossing';
export type VolumeProfileStrategy = 'mean-reversion' | 'poc-bounce';
export type ThreeMAStrategy = 'trend-agreement' | 'crossover';

// --- Indicator Settings ---
export interface IndicatorSettings {
  enableRsi: boolean;
  rsiStrategy: RsiStrategy;
  rsiPeriod: number;
  rsiUpperLevel: number;
  rsiLowerLevel: number;
  
  enableStochastic: boolean;
  stochasticStrategy: StochasticStrategy;
  stochasticKPeriod: number;
  stochasticDPeriod: number;
  stochasticSlowing: number;
  stochasticUpperLevel: number;
  stochasticLowerLevel: number;
  
  enableMacd: boolean;
  macdFastPeriod: number;
  macdSlowPeriod: number;
  macdSignalPeriod: number;
  
  enableBollinger: boolean;
  bollingerStrategy: BollingerStrategy;
  bollingerPeriod: number;
  bollingerStdDev: number;
  
  enableEma: boolean;
  emaPeriod: number;
  
  enableSma: boolean;
  smaPeriod: number;
  
  enableMomentum: boolean;
  momentumStrategy: MomentumStrategy;
  momentumPeriod: number;

  enableOneTwoThreeReversal: boolean;
  oneTwoThreeStrategy: OneTwoThreeStrategy;
  
  enableMultiTimeframeAnalysis: boolean;
  mtfTrendPeriod: number;
  enableTickAnalysis: boolean;
  tickFastCandleTimeframe: number;
  tickConfirmationCandleTimeframe: number;
  
  enableTrendAnalysis: boolean;
  trendPeriod: number;

  enableVolatilityFilter: boolean;
  minVolatility?: number;

  enableSuperSignals: boolean;
  superSignalsAtrPeriod: number;
  superSignalsPeriod: number;
  enableSuperTrendFilter: boolean;
  superTrendFilterPeriod: number;

  enableSkyrexReversal: boolean;
  skyrexEnableMfi: boolean;
  skyrexEnableAo: boolean;
  skyrexTrendPeriod: number;

  enableSqueezeMomentum: boolean;
  squeezeMomentumBbLength: number;
  squeezeMomentumKcLength: number;
  squeezeMomentumBbMult: number;
  squeezeMomentumKcMult: number;

  dpoStrategy: DpoStrategy;
  dpoLength: number;
  dpoSmooth: number;
  
  pmoStrategy: PmoStrategy;
  pmoLength1: number;
  pmoLength2: number;
  pmoSigLength: number;

  deltaRsiStrategy: DeltaRsiStrategy;
  deltaRsiPeriod: number;
  deltaRsiWindow: number;
  deltaRsiDegree: number;
  deltaRsiSignalLength: number;
  deltaRsiUseRmseFilter: boolean;
  deltaRsiRmseThreshold: number;

  enableSupportResistance: boolean;
  supportResistancePeriod: number;
  supportResistanceSensitivity: number;

  enablePeakFilter: boolean;
  peakFilterFastEma: number;
  peakFilterSlowEma: number;
  peakFilterRsi: number;
  peakFilterRsiUpper: number;
  peakFilterRsiLower: number;
  peakFilterLookback: number;
  peakFilterUseTrendConfirmation: boolean;
  peakFilterUseStrictPivots: boolean;
  peakFilterUseRsiDirection: boolean;

  enableAtrTrailingStop: boolean;
  atrTrailingStopSensitivity: number;
  atrTrailingStopPeriod: number;

  enableVolumeProfile: boolean;
  volumeProfileStrategy: VolumeProfileStrategy;
  volumeProfilePeriod: number;
  volumeProfileValueArea: number;

  enableEmaAdxTrend: boolean;
  emaAdxTrendFastPeriod: number;
  emaAdxTrendMediumPeriod: number;
  emaAdxTrendSlowPeriod: number;
  emaAdxTrendAdxPeriod: number;
  emaAdxTrendAdxThreshold: number;

  enableUltimatePullback: boolean;
  ultimatePullbackEmaFast: number;
  ultimatePullbackEmaSlow: number;
  ultimatePullbackRsiPeriod: number;
  ultimatePullbackRsiUpper: number;
  ultimatePullbackRsiLower: number;
  ultimatePullbackScoreThreshold: number;

  weights: IndicatorWeights;
}


// Analysis Engine Types
export interface IndicatorSignal {
    name: 'RSI' | 'EMA' | 'SMA' | 'Stochastic' | 'MACD' | 'Bollinger' | 'Momentum' | 'Trend' | 'MTF Trend' | 'Volatility' | 'Super Signals' | '1-2-3 Reversal' | 'Skyrex Reversal' | 'Squeeze' | 'DPO' | 'PMO' | 'D-RSI' | 'S/R' | 'Peak Filter' | 'ATR Stop' | 'Volume Profile' | 'EMA/ADX Trend' | 'Ultimate Pullback';
    value: number;
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface Analysis {
    trendDirection: 'Uptrend' | 'Downtrend' | 'Sideways';
    momentum: number; // percentage
    volatility: number; // percentage
}

export type SignalStrength = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';

export interface PredictionResult {
    prediction: 'RISE' | 'FALL';
    confidence: number;
    score: number;
    signalStrength: SignalStrength;
    signals: IndicatorSignal[];
    arrows: Arrow[];
    analysis: Analysis;
    reason?: 'Insufficient Data' | 'Low Volatility' | 'Signal Conflict' | 'Trend Mismatch' | 'Sideways Market' | 'RMSE Filtered';
}

export type { AllChartTimeframes };
