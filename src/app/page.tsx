
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Activity, Bot, CheckCircle, Clock, Play, StopCircle, XCircle, FileText, Wallet, History, User, LogOut, Settings, ArrowUp, ArrowDown, TrendingUp, Zap, BarChart3, Star, Percent, Flame, Gauge, BrainCircuit, PauseCircle, SlidersHorizontal, Waves, GitCompareArrows, Pause, Maximize, Minus, Plus, LineChart, Cpu, Sparkles, Volume, Dna, RotateCcw, Mountain, ShieldCheck, Cuboid, Target } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { type Trade, type BotStats, type Tick, type PredictionResult, type IndicatorSettings, type Candle, RsiStrategy, BollingerStrategy, OneTwoThreeStrategy, StochasticStrategy, IndicatorSignal, TrendLine, Arrow, DpoStrategy, PmoStrategy, DeltaRsiStrategy, MomentumStrategy, VolumeProfileStrategy, type AllChartTimeframes } from "@/lib/types";
import useLocalStorage from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { DerivAPI, type ProposalOpenContract } from "@/lib/deriv-api";
import LightweightLiveChart, { type ChartApi as LiveChartApi } from "@/components/lightweight-live-chart";
import { analyzeMarketAndPredict } from "@/lib/analysis-engine";
import dynamic from 'next/dynamic'

const TradeHistory = dynamic(() => import('@/components/trade-history').then(mod => mod.TradeHistory), { ssr: false });
const EventLog = dynamic(() => import('@/components/event-log').then(mod => mod.EventLog), { ssr: false });


type Market = {
    value: string;
    label: string;
};

type RiseFallDurationUnit = 't' | 'm';

type TradeMode = 'tick' | 'minute';

type ChartTimeframe =
  | 'ticks'
  | '2s'
  | '5s'
  | '10s'
  | '15s'
  | '30s'
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h';


const getErrorMessage = (error: unknown): string => {
    console.log('=== getErrorMessage called with:', { type: typeof error, value: error });
    // If it's an Error object, JSON.stringify returns {} because message/stack are not enumerable
    if (error instanceof Error) {
        console.log('Error object:', { message: error.message, stack: error.stack });
        return error.message;
    }

    if (error === null || error === undefined) {
        return 'An unknown error occurred.';
    }

    if (typeof error === 'string') {
        return error;
    }
    
    // Check for Deriv's specific error format (response.error)
    if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        if (errObj.error) {
            const derivError = errObj.error;
            let msg = '';
            if (typeof derivError.message === 'string') {
                msg = derivError.message;
            }
            if (derivError.details) {
                msg += ' Details: ' + JSON.stringify(derivError.details);
            }
            if (msg) return msg;
            if (typeof derivError.code === 'string') {
                return derivError.code;
            }
        }
        // If we have a message directly on the object
        if (typeof errObj.message === 'string') {
            return errObj.message;
        }
        // If nothing else, stringify the whole error!
        return JSON.stringify(errObj);
    }
    
    return 'An unknown error occurred.';
};

const defaultIndicatorSettings: IndicatorSettings = {
  enableRsi: true,
  rsiStrategy: 'default',
  rsiPeriod: 9,
  rsiUpperLevel: 70,
  rsiLowerLevel: 30,
  enableStochastic: false,
  stochasticStrategy: 'default',
  stochasticKPeriod: 9,
  stochasticDPeriod: 2,
  stochasticSlowing: 2,
  stochasticUpperLevel: 80,
  stochasticLowerLevel: 20,
  enableMacd: true,
  macdFastPeriod: 5,
  macdSlowPeriod: 13,
  macdSignalPeriod: 5,
  enableBollinger: false,
  bollingerStrategy: 'default',
  bollingerPeriod: 10,
  bollingerStdDev: 2,
  enableEma: true,
  emaPeriod: 10,
  enableSma: true,
  smaPeriod: 20,
  enableMomentum: true,
  momentumStrategy: 'zero-crossing',
  momentumPeriod: 5,
  enableOneTwoThreeReversal: false,
  oneTwoThreeStrategy: 'classic',
  enableMultiTimeframeAnalysis: true,
  mtfTrendPeriod: 15,
  enableTickAnalysis: false,
  tickFastCandleTimeframe: 1,
  tickConfirmationCandleTimeframe: 2,
  enableTrendAnalysis: true,
  trendPeriod: 15,
  enableVolatilityFilter: true,
  minVolatility: 0.02,
  enableSuperSignals: false,
  superSignalsPeriod: 21,
  superSignalsAtrPeriod: 50,
  enableSuperTrendFilter: true,
  superTrendFilterPeriod: 50,
  enableSkyrexReversal: false,
  skyrexEnableMfi: false,
  skyrexEnableAo: true,
  skyrexTrendPeriod: 7,
  enableSqueezeMomentum: false,
  squeezeMomentumBbLength: 20,
  squeezeMomentumKcLength: 20,
  squeezeMomentumBbMult: 2,
  squeezeMomentumKcMult: 1.5,
  dpoStrategy: 'disabled',
  dpoLength: 33,
  dpoSmooth: 5,
  pmoStrategy: 'disabled',
  pmoLength1: 35,
  pmoLength2: 20,
  pmoSigLength: 10,
  deltaRsiStrategy: 'disabled',
  deltaRsiPeriod: 21,
  deltaRsiWindow: 21,
  deltaRsiDegree: 2,
  deltaRsiSignalLength: 9,
  deltaRsiUseRmseFilter: false,
  deltaRsiRmseThreshold: 10,
  enableSupportResistance: true,
  supportResistancePeriod: 50,
  supportResistanceSensitivity: 3,
  enablePeakFilter: false,
  peakFilterFastEma: 5,
  peakFilterSlowEma: 15,
  peakFilterRsi: 14,
  peakFilterRsiUpper: 55,
  peakFilterRsiLower: 45,
  peakFilterLookback: 8,
  peakFilterUseTrendConfirmation: false,
  peakFilterUseStrictPivots: false,
  peakFilterUseRsiDirection: false,
  enableAtrTrailingStop: false,
  atrTrailingStopSensitivity: 1.0,
  atrTrailingStopPeriod: 10,
  enableVolumeProfile: false,
  volumeProfileStrategy: 'mean-reversion',
  volumeProfilePeriod: 200,
  volumeProfileValueArea: 70,
  enableEmaAdxTrend: false,
  emaAdxTrendFastPeriod: 9,
  emaAdxTrendMediumPeriod: 21,
  emaAdxTrendSlowPeriod: 50,
  emaAdxTrendAdxPeriod: 14,
  emaAdxTrendAdxThreshold: 25,
  enableUltimatePullback: false,
  ultimatePullbackEmaFast: 8,
  ultimatePullbackEmaSlow: 21,
  ultimatePullbackRsiPeriod: 14,
  ultimatePullbackRsiLower: 45,
  ultimatePullbackRsiUpper: 55,
  ultimatePullbackScoreThreshold: 60,
  weights: {
    rsiWeight: 10,
    stochasticWeight: 15,
    macdWeight: 10,
    bollingerWeight: 10,
    emaWeight: 10,
    smaWeight: 10,
    momentumWeight: 10,
    reversalWeight: 20,
    trendAnalysisWeight: 25,
    multiTimeframeAnalysisWeight: 50,
    volatilityFilterWeight: 20,
    superSignalsWeight: 10,
    skyrexReversalWeight: 30,
    squeezeMomentumWeight: 45,
    dpoWeight: 25,
    pmoWeight: 25,
    deltaRsiWeight: 30,
    supportResistanceWeight: 25,
    peakFilterWeight: 35,
    atrTrailingStopWeight: 40,
    volumeProfileWeight: 30,
    emaAdxTrendWeight: 50,
    ultimatePullbackWeight: 60,
  }
};

const NumberInputWithSteppers = ({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  value: string | number;
  onChange: (value: string) => void;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
}) => {
  const handleStep = (direction: 'up' | 'down') => {
    const numericValue = parseFloat(String(value));
    const stepValue = parseFloat(String(step || 1));
    if (isNaN(numericValue)) return;
    
    let newValue = direction === 'up' ? numericValue + stepValue : numericValue - stepValue;
    
    const minValue = min !== undefined ? parseFloat(String(min)) : -Infinity;
    const maxValue = max !== undefined ? parseFloat(String(max)) : Infinity;

    if (newValue < minValue) newValue = minValue;
    if (newValue > maxValue) newValue = maxValue;

    const precision = String(stepValue).includes('.') ? String(stepValue).split('.')[1].length : 0;
    onChange(newValue.toFixed(precision));
  };
  
  return (
    <div className="relative flex items-center">
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="pr-8" 
      />
      <div className="absolute right-1 flex flex-col h-full justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:bg-transparent"
          onClick={() => handleStep('up')}
          disabled={disabled}
          tabIndex={-1}
        >
          <Plus size={12} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:bg-transparent"
          onClick={() => handleStep('down')}
          disabled={disabled}
          tabIndex={-1}
        >
          <Minus size={12} />
        </Button>
      </div>
    </div>
  );
};


const PredictionCard = React.memo(({ predictionResult, minConfidence }: { predictionResult: PredictionResult | null; minConfidence: string; }) => {
    if (!predictionResult) {
        return (
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                  <Activity size={14} />
                </div>
                <h3 className="font-semibold text-sm">Tamili Signal Prediction</h3>
              </div>
              
              <div className="flex flex-col items-center py-2">
                <p className="text-sm text-muted-foreground">Waiting for market data...</p>
              </div>
            </div>
        );
    }
    
    const canTrade = predictionResult.confidence >= parseFloat(minConfidence);
    const signal = canTrade ? predictionResult.prediction : 'HOLD';

    const getSignalStyle = () => {
        switch (signal) {
            case 'RISE':
                return {
                    icon: <ArrowUp size={32} className="text-green-900" />,
                    bgGradient: 'bg-gradient-to-br from-green-500 to-green-600 border-green-400',
                    textColor: 'text-green-900',
                };
            case 'FALL':
                return {
                    icon: <ArrowDown size={32} className="text-red-900" />,
                    bgGradient: 'bg-gradient-to-br from-red-500 to-red-600 border-red-400',
                    textColor: 'text-red-900',
                };
            default: // HOLD
                return {
                    icon: <Pause size={32} className="text-yellow-900" />,
                    bgGradient: 'bg-gradient-to-br from-yellow-500 to-yellow-600 border-yellow-400',
                    textColor: 'text-yellow-900',
                };
        }
    };
    
    const { icon, bgGradient, textColor } = getSignalStyle();

    return (
        <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                <Activity size={14} />
                </div>
                <h3 className="font-semibold text-sm">Tamili Signal Prediction</h3>
            </div>
            
            <div className="flex flex-col items-center py-1">
                <div className={cn("rounded-lg border-2 mb-3 w-full flex items-center justify-center gap-4 py-2", bgGradient)}>
                    {icon}
                    <p className={cn("text-4xl font-black", textColor)}>{signal}</p>
                </div>
                 <div className="w-full px-1">
                    <Progress value={predictionResult.confidence} className="h-2 bg-input" indicatorClassName="bg-primary" />
                    <p className="text-xs text-muted-foreground text-center mt-1.5">
                        {predictionResult.confidence.toFixed(1)}% Confidence
                        {predictionResult.reason && !canTrade && <span className="ml-1">({predictionResult.reason})</span>}
                    </p>
                </div>
            </div>
        </div>
    );
});
PredictionCard.displayName = 'PredictionCard';

const AnalysisCard = React.memo(({ predictionResult, minVolatilityThreshold }: { predictionResult: PredictionResult | null, minVolatilityThreshold: number }) => {
    const getAnalysisTexts = () => {
        if (!predictionResult) return { momentumText: '-', volatilityText: '-', strengthText: 'Neutral', trendDirection: 'Sideways' };
        const { analysis, signalStrength } = predictionResult;
        const momentumText = analysis.momentum > 0 ? 'Positive' : 'Negative';
        const volatilityText = analysis.volatility > minVolatilityThreshold ? 'High' : 'Low';
        return { momentumText, volatilityText, strengthText: signalStrength, trendDirection: analysis.trendDirection };
    };
    const { momentumText, volatilityText, strengthText, trendDirection } = getAnalysisTexts();

    const trendColor = trendDirection === 'Uptrend' ? 'text-green-400' : trendDirection === 'Downtrend' ? 'text-red-400' : 'text-yellow-400';
    const momentumColor = (predictionResult?.analysis.momentum || 0) > 0 ? 'text-green-400' : 'text-red-400';
    const volatilityColor = (predictionResult?.analysis.volatility || 0) > minVolatilityThreshold ? 'text-green-400' : 'text-yellow-400';
    const strengthColor = strengthText.includes('Buy') ? 'text-green-400' : strengthText.includes('Sell') ? 'text-red-400' : 'text-yellow-400';

    return (
        <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="text-cyan-400" size={18} />
                <h3 className="font-semibold text-sm">Technical Analysis</h3>
            </div>
            
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                <div className="bg-accent rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">TREND</p>
                    <p className={cn("font-bold text-sm", trendColor)}>{trendDirection}</p>
                </div>
                <div className="bg-accent rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">MOMENTUM</p>
                    <p className={cn("font-bold text-sm", momentumColor)}>{momentumText}</p>
                </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                <div className="bg-accent rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">VOLATILITY</p>
                    <p className={cn("font-bold text-sm", volatilityColor)}>{volatilityText}</p>
                </div>
                <div className="bg-accent rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">SIGNAL STRENGTH</p>
                    <p className={cn("font-bold text-sm", strengthColor)}>{strengthText}</p>
                </div>
                </div>
            </div>
        </div>
    );
});
AnalysisCard.displayName = 'AnalysisCard';

const ALL_INDICATORS: (IndicatorSignal['name'])[] = [
    'RSI', 'Stochastic', 'MACD', 'Bollinger', 'EMA', 'SMA', 'Momentum', 
    '1-2-3 Reversal', 'S/R', 'Peak Filter', 'ATR Stop', 'Volume Profile',
    'Trend', 'MTF Trend', 'Volatility', 'Super Signals', 'Skyrex Reversal', 'Squeeze', 'DPO', 'PMO', 'D-RSI',
    'EMA/ADX Trend', 'Ultimate Pullback'
];

const IndicatorsCard = React.memo(({ predictionResult }: { predictionResult: PredictionResult | null }) => {
    
    const renderIndicatorSignal = (signal: string) => {
        const classes = {
            BULLISH: 'bg-green-900/50 text-green-300',
            BEARISH: 'bg-red-900/50 text-red-300',
            NEUTRAL: 'bg-muted text-muted-foreground',
        }[signal] || 'bg-muted text-muted-foreground';
        return <div className={cn("mt-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase", classes)}>{signal}</div>;
    };
    
    const signalMap = new Map(predictionResult?.signals.map(s => [s.name, s]));

    const sortedIndicators = [...ALL_INDICATORS].sort((a, b) => {
        const signalA = signalMap.get(a);
        const signalB = signalMap.get(b);
        const scoreA = (signalA && signalA.signal !== 'NEUTRAL') ? 2 : (signalA ? 1 : 0);
        const scoreB = (signalB && signalB.signal !== 'NEUTRAL') ? 2 : (signalB ? 1 : 0);
        
        if (scoreB !== scoreA) {
            return scoreB - scoreA;
        }
        
        return a.localeCompare(b);
    });

    return (
         <div className="bg-card rounded-lg border p-3 w-full">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="text-cyan-400" size={16} />
              <h3 className="font-semibold text-sm">Technical Indicators</h3>
            </div>
            <div className="bg-background rounded p-2 min-h-[90px]">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                    {sortedIndicators.map(name => {
                        const signal = signalMap.get(name);
                        
                        const displayName = name.replace('1-2-3-', '123 ');
                        return (
                            <div key={name} className="bg-accent border rounded-md p-1 text-center">
                                <div className="text-[10px] font-semibold text-muted-foreground truncate" title={displayName}>{displayName}</div>
                                <div className="text-xs font-bold my-0.5">{signal ? (typeof signal.value === 'number' ? signal.value.toFixed(2) : '--') : '--'}</div>
                                {renderIndicatorSignal(signal ? signal.signal : 'NEUTRAL')}
                            </div>
                        );
                    })}
                </div>
            </div>
          </div>
    );
});
IndicatorsCard.displayName = 'IndicatorsCard';

const MemoizedLightweightLiveChart = React.memo(LightweightLiveChart);

const fastCandleOptions = [
    { value: "1", label: "1 second" },
    { value: "2", label: "2 seconds" },
    { value: "5", label: "5 seconds" },
    { value: "10", label: "10 seconds" },
    { value: "15", label: "15 seconds" },
    { value: "30", label: "30 seconds" },
];

const confirmationCandleOptions = [
    { value: "2", label: "2 seconds" },
    { value: "5", label: "5 seconds" },
    { value: "10", label: "10 seconds" },
    { value: "15", label: "15 seconds" },
    { value: "30 seconds" },
    { value: "60", label: "1 minute" },
];

const mtfOptions = [
    { value: '1s', label: '1 Second' },
    { value: '2s', label: '2 Seconds' },
    { value: '5s', label: '5 Seconds' },
    { value: '10s', label: '10 Seconds' },
    { value: '15s', label: '15 Seconds' },
    { value: '30s', label: '30 Seconds' },
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '1h', label: '1 Hour' },
];

const useGuaranteedLocalStorage = (key: string, initialValue: IndicatorSettings): [IndicatorSettings, (value: IndicatorSettings | ((val: IndicatorSettings) => IndicatorSettings)) => void] => {
  const [storedValue, setStoredValue] = useLocalStorage<IndicatorSettings>(key, initialValue);

  const mergedValue = React.useMemo(() => {
    const loadedValue = storedValue || initialValue;
    return {
      ...initialValue,
      ...loadedValue,
      weights: {
        ...initialValue.weights,
        ...(loadedValue.weights || {}),
      },
    };
  }, [storedValue, initialValue]);

  return [mergedValue, setStoredValue];
};

const generateCandlesFromTicks = (ticks: Tick[], timeframeSeconds: number): Candle[] => {
    if (ticks.length === 0 || timeframeSeconds <= 0) return [];

    const buckets = new Map<number, Tick[]>();
    for (const tick of ticks) {
        const bucketEpoch = Math.floor(tick.epoch / timeframeSeconds) * timeframeSeconds;
        if (!buckets.has(bucketEpoch)) {
            buckets.set(bucketEpoch, []);
        }
        buckets.get(bucketEpoch)!.push(tick);
    }

    const candles: Candle[] = [];
    const sortedEpochs = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const epoch of sortedEpochs) {
        const bucketTicks = buckets.get(epoch)!;
        candles.push({
            epoch: epoch,
            open: bucketTicks[0].price,
            high: Math.max(...bucketTicks.map(t => t.price)),
            low: Math.min(...bucketTicks.map(t => t.price)),
            close: bucketTicks[bucketTicks.length - 1].price,
        });
    }
    
    return candles;
};

const tickChartTimeframeOptions: { value: ChartTimeframe, label: string }[] = [
    { value: 'ticks', label: 'Ticks' },
    { value: '2s', label: '2s' },
    { value: '5s', label: '5s' },
    { value: '10s', label: '10s' },
    { value: '15s', label: '15s' },
    { value: '30s', label: '30s' },
    { value: '1m', label: '1m' },
];

const minuteChartTimeframeOptions: { value: ChartTimeframe, label: string }[] = [
    { value: 'ticks', label: 'Ticks' },
    { value: '30s', label: '30s' },
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
];

const useBotState = (initialStake: string) => {
    const [state, setState] = useState({
        stats: {
            balance: 0,
            sessionProfit: 0,
            winRate: 0,
            totalTrades: 0,
            winningTrades: 0,
            derivId: "",
        } as BotStats,
        tradeHistory: [] as Trade[],
        nextTradeStake: parseFloat(initialStake),
    });

    const stateRef = useRef(state);
    stateRef.current = state;

    const updateState = useCallback(<K extends keyof typeof state>(key: K, value: (typeof state)[K] | ((prev: (typeof state)[K]) => (typeof state)[K])) => {
        setState(prevState => {
            const nextValue = typeof value === 'function' ? (value as (prev: (typeof state)[K]) => (typeof state)[K])(prevState[key]) : value;
            return { ...prevState, [key]: nextValue };
        });
    }, []);

    const getState = useCallback(() => stateRef.current, []);

    return { state, updateState, getState };
};


function Home() {
  const { toast } = useToast();
  const [apiToken, setApiToken] = useLocalStorage("deriv-api-token", "");
  const [appId, setAppId] = useLocalStorage("deriv-app-id", "1089");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [accounts, setAccounts] = useState<{ account_id: string; account_type: 'demo' | 'real'; currency: string; balance: number }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useLocalStorage('deriv-account-id', '');
  
  const [isBotActive, setIsBotActive] = useState(false);
  const isBotActiveRef = useRef(false);
  const isStoppingRef = useRef(false);
  const [isBotStopping, setIsBotStopping] = useState(false);
  const isProcessingRef = useRef(false);

  const [markets, setMarkets] = useState<Market[]>([]);
  
  const liveChartApiRef = useRef<LiveChartApi | null>(null);

  const derivApiRef = useRef<DerivAPI | null>(null);
  const activeTradeRef = useRef<Partial<Trade> | null>(null);
  const finishedContractIds = useRef<Set<number>>(new Set());

  const [tickHistory, setTickHistory] = useState<Tick[]>([]);
  const candleHistoryRef = useRef<Candle[]>([]);
  const longTermCandleHistoryRef = useRef<Candle[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  
  const [stake, setStake] = useLocalStorage("stake", "0.35");
  const [stopLoss, setStopLoss] = useLocalStorage("stopLoss", "50");
  const [targetProfit, setTargetProfit] = useLocalStorage("targetProfit", "20");
  const [selectedMarket, setSelectedMarket] = useLocalStorage('selectedMarket', '');
  
  // Clean up invalid localStorage entries on mount
  useEffect(() => {
    const savedMarket = window.localStorage.getItem('selectedMarket');
    if (savedMarket === "undefined" || savedMarket === "null") {
      console.warn('Clearing invalid selectedMarket from localStorage');
      window.localStorage.removeItem('selectedMarket');
      setSelectedMarket('');
    }
  }, []);
  
  const [minConfidence, setMinConfidence] = useLocalStorage("minConfidence", "20");
  
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [allChartArrows, setAllChartArrows] = useState<Arrow[]>([]);
  
  const tickSubscriptionId = useRef<string | null>(null);
  const isLoadingTicks = useRef(false); // Prevent double subscriptions
  
  // Load tick history and subscribe when connected and selected market changes!
  useEffect(() => {
    if (isConnected && selectedMarket && derivApiRef.current && !isLoadingTicks.current) {
      isLoadingTicks.current = true;
      const loadTicks = async () => {
        try {
          // Unsubscribe from old tick first if needed
          if (tickSubscriptionId.current) {
            await derivApiRef.current!.unsubscribeFromStream(tickSubscriptionId.current);
          }
          
          addLog(`Loading tick history for ${selectedMarket}...`);
          try {
            const history = await derivApiRef.current!.getTickHistory(selectedMarket, 1000);
            setTickHistory(history);
          } catch (historyError) {
            console.warn('Failed to load tick history, but will still subscribe to live ticks', historyError);
            // Don't throw here—keep going to subscribe
          }
          
          addLog(`Subscribing to live ticks for ${selectedMarket}...`);
          const subId = await derivApiRef.current!.subscribeToTicks(selectedMarket, (tick) => {
            handleNewTickRef.current(tick);
          });
          tickSubscriptionId.current = subId;
          addLog(`Successfully subscribed to ticks for ${selectedMarket}.`);
        } catch (tickError) {
          console.error('Error loading/subscribing to ticks:', tickError);
          addLog(`Error with tick data: ${getErrorMessage(tickError)}`);
        } finally {
          isLoadingTicks.current = false;
        }
      };
      
      loadTicks();
    }
    
    // Cleanup function
    return () => {
      if (tickSubscriptionId.current && derivApiRef.current) {
        derivApiRef.current.unsubscribeFromStream(tickSubscriptionId.current).catch(console.error);
        tickSubscriptionId.current = null;
        isLoadingTicks.current = false;
      }
    };
  }, [isConnected, selectedMarket]);

  const [riseFallDuration, setRiseFallDuration] = useLocalStorage("riseFallDuration", "5");
  const [riseFallDurationUnit, setRiseFallDurationUnit] = useLocalStorage<RiseFallDurationUnit>('riseFallDurationUnit', 't');
  const [enableMartingale, setEnableMartingale] = useLocalStorage("enableMartingale", true);
  const [martingaleMultiplier, setMartingaleMultiplier] = useLocalStorage("martingaleMultiplier", "2.1");
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [indicatorSettings, setIndicatorSettings] = useGuaranteedLocalStorage("indicator-settings", defaultIndicatorSettings);
  const indicatorSettingsRef = useRef(indicatorSettings);
  indicatorSettingsRef.current = indicatorSettings;
  
  const [tempIndicatorSettings, setTempIndicatorSettings] = useState<IndicatorSettings>(indicatorSettings);

  const [tradeMode, setTradeMode] = useLocalStorage<TradeMode>('tradeMode', 'tick');
  const [chartDisplayTimeframe, setChartDisplayTimeframe] = useLocalStorage<ChartTimeframe>('chartDisplayTimeframe', 'ticks');
  
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const { state: botState, updateState, getState } = useBotState(stake);
  const { stats, tradeHistory, nextTradeStake } = botState;

  useEffect(() => {
    isBotActiveRef.current = isBotActive;
  }, [isBotActive]);
  
  useEffect(() => {
      isStoppingRef.current = isBotStopping;
  }, [isBotStopping]);

  useEffect(() => {
    updateState('nextTradeStake', parseFloat(stake));
  }, [stake, updateState]);

  useEffect(() => {
    if (isClient) {
      setRiseFallDurationUnit(tradeMode === 'minute' ? 'm' : 't');
    }
  }, [tradeMode, setRiseFallDurationUnit, isClient]);
  
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEventLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 199)]);
  }, []);
  
  const checkStopConditions = useCallback(() => {
      const currentSessionProfit = getState().stats.sessionProfit;
      const stopLossAmount = parseFloat(stopLoss);
      const targetProfitAmount = parseFloat(targetProfit);

      if (currentSessionProfit <= -stopLossAmount) {
          return 'stop loss';
      }
      if (currentSessionProfit >= targetProfitAmount) {
          return 'target profit';
      }
      return null;
  }, [getState, stopLoss, targetProfit]);

  const completeStop = useCallback((reason: string) => {
    isBotActiveRef.current = false;
    setIsBotActive(false);
    isStoppingRef.current = false;
    setIsBotStopping(false);
    isProcessingRef.current = false;
    activeTradeRef.current = null;
    finishedContractIds.current.clear();
    
    let toastDescription = `The bot has been stopped ${reason}.`;
    if (reason === 'due to stop loss') {
        toastDescription = `Your stop loss of $${stopLoss} has been triggered.`;
        toast({ title: "Stop Loss Triggered", description: toastDescription, variant: "destructive" });
    } else if (reason === 'due to target profit') {
        toastDescription = `Your target profit of $${targetProfit} has been reached.`;
        toast({ title: "Target Profit Reached", description: toastDescription });
    } else {
        toast({ title: "Bot Stopped", description: toastDescription });
    }
    addLog(`Bot stopped ${reason}.`);
    updateState('nextTradeStake', parseFloat(stake));
  }, [addLog, toast, stopLoss, targetProfit, stake, updateState]);

  const handleFinishedContract = useCallback((contract: ProposalOpenContract) => {
      if (contract.is_sold !== 1 || finishedContractIds.current.has(contract.contract_id)) {
          return;
      }
      finishedContractIds.current.add(contract.contract_id);
          
      const isWin = contract.status === 'won';
      const finalProfit = parseFloat(contract.profit as any) || 0;

      addLog(`Trade #${contract.contract_id} finished. Result: ${isWin ? 'Won' : 'Lost'}. Profit: $${finalProfit.toFixed(2)}`);
      
      const currentState = getState();

      updateState('stats', prevStats => {
          const newStats = {
              ...prevStats,
              sessionProfit: prevStats.sessionProfit + finalProfit,
              totalTrades: prevStats.totalTrades + 1,
              winningTrades: prevStats.winningTrades + (isWin ? 1 : 0),
              balance: prevStats.balance + finalProfit,
          };
          newStats.winRate = newStats.totalTrades > 0 ? (newStats.winningTrades / newStats.totalTrades) * 100 : 0;
          return newStats;
      });
      
      updateState('tradeHistory', prev => {
          const tradeDetailsIndex = prev.findIndex(t => t.id === String(contract.contract_id));
          if (tradeDetailsIndex !== -1) {
              const newHistory = [...prev];
              newHistory[tradeDetailsIndex] = {
                  ...newHistory[tradeDetailsIndex],
                  result: finalProfit,
                  profit: finalProfit,
                  status: isWin ? "Won" : "Lost",
                  isWin: isWin,
                  exit: contract.sell_price || 0,
              };
              return newHistory;
          }
          return prev;
      });
      
      let nextStake = parseFloat(stake);
      if (enableMartingale) {
          if (isWin) {
              addLog("Trade won. Resetting stake for next trade.");
              nextStake = parseFloat(stake);
          } else {
              const newStakeValue = currentState.nextTradeStake * parseFloat(martingaleMultiplier);
              const roundedStake = Math.round(newStakeValue * 100) / 100;
              addLog(`Trade lost. Applying Martingale. Next stake: $${roundedStake.toFixed(2)}`);
              nextStake = roundedStake;
          }
      }
      updateState('nextTradeStake', nextStake);
      
      activeTradeRef.current = null;
      isProcessingRef.current = false; 
      
      if (isStoppingRef.current) {
          completeStop("after finishing trade");
      } else if (isBotActiveRef.current) {
          const stopReason = checkStopConditions();
          if (stopReason) {
              addLog(`Bot stop condition met: ${stopReason}. Stopping.`);
              completeStop(`due to ${stopReason}`);
          }
      }
  }, [addLog, checkStopConditions, completeStop, enableMartingale, getState, martingaleMultiplier, stake, updateState, toast]);
  
  const handleFinishedContractRef = useRef(handleFinishedContract);
  handleFinishedContractRef.current = handleFinishedContract;

  const runAnalysisAndTrade = useCallback(async () => {
    if (!isBotActiveRef.current || activeTradeRef.current || isProcessingRef.current) {
        return;
    }
    
    isProcessingRef.current = true;
    
    try {
        const requiredCandles = 20;
        const candles = candleHistoryRef.current;
        if (candles.length < requiredCandles) {
            addLog(`Collecting candle data... (${candles.length}/${requiredCandles})`);
            setPredictionResult(null);
            return;
        }
        
        addLog(`Analyzing market...`);

        const analysisResult = analyzeMarketAndPredict(
            candles,
            indicatorSettingsRef.current,
            tradeMode,
            indicatorSettingsRef.current.enableMultiTimeframeAnalysis ? longTermCandleHistoryRef.current : undefined
        );
        
        setPredictionResult(analysisResult);
        if (analysisResult.arrows.length > 0) {
            setAllChartArrows(analysisResult.arrows);
        }

        if (!analysisResult) {
            return;
        }
        
        const isTradeSignal = analysisResult.confidence >= parseFloat(minConfidence);

        if (!isTradeSignal) {
             if (analysisResult.reason) {
                addLog(`Holding. Reason: ${analysisResult.reason}`);
             } else if (analysisResult.confidence < parseFloat(minConfidence)) {
                 addLog(`Holding. Confidence ${analysisResult.confidence.toFixed(1)}% is below minimum of ${minConfidence}%.`);
             } else {
                addLog(`Holding. Signal strength is '${analysisResult.signalStrength}'.`);
             }
             return;
        }

        const stopReason = checkStopConditions();
        if (stopReason) {
            addLog(`Stop condition met (${stopReason}), preventing new trade.`);
            if (!isStoppingRef.current) completeStop(`due to ${stopReason}`);
            return;
        }

        const api = derivApiRef.current;
        if (!api) {
            return;
        }
        
        const finalPrediction = analysisResult.prediction;
        const contractTypeDisplay = finalPrediction;
        const tradeStake = getState().nextTradeStake;
        const duration = parseInt(riseFallDuration);
        const durationUnit = riseFallDurationUnit;
        
        addLog(`New signal: ${contractTypeDisplay}. Confidence: ${analysisResult.confidence.toFixed(1)}%. Placing trade with stake $${tradeStake.toFixed(2)}.`);

        const response = await api.buyContract(
            selectedMarket,
            String(tradeStake),
            duration,
            durationUnit,
            finalPrediction
        );

        if (response.error) {
            throw new Error(response.error.message);
        }

        const contractId = response.buy.contract_id;
        addLog(`Trade #${contractId} placed successfully.`);
        
        const fullTradeDetails: Trade = {
            id: String(contractId),
            time: new Date().toLocaleTimeString(),
            timestamp: new Date().toLocaleString(),
            asset: selectedMarket,
            type: contractTypeDisplay,
            stake: response.buy.buy_price || tradeStake,
            status: 'Ongoing',
            durationUnit: durationUnit,
            duration: `${duration}${durationUnit}`,
            isWin: false, 
            profit: 0, 
            entry: response.buy.buy_price || 0,
            exit: 0, 
            result: 0,
        };

        activeTradeRef.current = fullTradeDetails;
        updateState('tradeHistory', prev => [fullTradeDetails, ...prev.slice(0, 49)]);

        api.subscribeToContract(contractId, (contract) => handleFinishedContractRef.current(contract));

    } catch (error) {
        const errorMessage = getErrorMessage(error);
        addLog(`Failed to place trade: ${errorMessage}`);
        toast({ title: "Trade Error", description: `Could not place trade: ${errorMessage}`, variant: "destructive" });
        activeTradeRef.current = null;
    } finally {
        if (!activeTradeRef.current) {
            isProcessingRef.current = false;
        }
    }
  }, [addLog, toast, checkStopConditions, completeStop, minConfidence, riseFallDuration, riseFallDurationUnit, selectedMarket, getState, updateState, tradeMode]);
  const runAnalysisAndTradeRef = useRef(runAnalysisAndTrade);
  runAnalysisAndTradeRef.current = runAnalysisAndTrade;

  const handleNewTick = useCallback((tick: Tick) => {
    if (!derivApiRef.current) return;

    setTickHistory(prev => [...prev.slice(-4999), tick]);
    
    const getChartDisplayTimeframe = (): ChartTimeframe => {
      if (typeof window !== 'undefined') {
        try {
          const item = window.localStorage.getItem('chartDisplayTimeframe');
          if (item === null || item === undefined) return 'ticks';
          const parsed = JSON.parse(item);
          const validTimeframes: ChartTimeframe[] = [
            'ticks', '2s', '5s', '10s', '15s', '30s', '1m', '5m', '15m', '30m', '1h'
          ];
          return validTimeframes.includes(parsed) ? parsed : 'ticks';
        } catch (e) {
          console.error("Failed to parse chartDisplayTimeframe from localStorage", e);
          return 'ticks';
        }
      }
      return 'ticks';
    }
    const currentChartDisplayTimeframe = getChartDisplayTimeframe();

    const updateCandleHistory = (historyRef: React.MutableRefObject<Candle[]>, granularity: number, isPrimary: boolean) => {
        let isNewCandle = false;
        const currentCandles = historyRef.current;
        const lastCandle = currentCandles.length > 0 ? currentCandles[currentCandles.length - 1] : null;
        let updatedCandle: Candle | null = null;

        if (!lastCandle || tick.epoch >= lastCandle.epoch + granularity) {
            const newCandleEpoch = Math.floor(tick.epoch / granularity) * granularity;
            updatedCandle = { epoch: newCandleEpoch, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
            historyRef.current = [...currentCandles.slice(-499), updatedCandle];
            isNewCandle = true;
        } else {
            updatedCandle = { ...lastCandle, high: Math.max(lastCandle.high, tick.price), low: Math.min(lastCandle.low, tick.price), close: tick.price };
            currentCandles[currentCandles.length - 1] = updatedCandle;
            isNewCandle = false;
        }
        
        if (currentChartDisplayTimeframe !== 'ticks') {
            const timeframeString = currentChartDisplayTimeframe.replace(/[smh]/, '');
            const timeframeUnit = currentChartDisplayTimeframe.slice(-1);
            let multiplier = 1;
            if (timeframeUnit === 'm') multiplier = 60;
            if (timeframeUnit === 'h') multiplier = 3600;
            const chartGranularity = parseInt(timeframeString) * multiplier;

            if (chartGranularity === granularity) {
                liveChartApiRef.current?.update(updatedCandle);
            }
        }
        
        return isNewCandle;
    };
    
    const tickAsCandle: Candle = { epoch: tick.epoch, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 1 };
    if (currentChartDisplayTimeframe === 'ticks') {
        liveChartApiRef.current?.update(tickAsCandle);
    }
    
    const currentIndicatorSettings = indicatorSettingsRef.current;
    const primaryGranularity = tradeMode === 'minute' ? 60 : parseInt(String(currentIndicatorSettings.tickFastCandleTimeframe));
    const secondaryGranularity = tradeMode === 'minute' ? 300 : parseInt(String(currentIndicatorSettings.tickConfirmationCandleTimeframe));
    const shouldRunMtf = currentIndicatorSettings.enableMultiTimeframeAnalysis;
    const useTickAnalysis = tradeMode === 'tick' && currentIndicatorSettings.enableTickAnalysis;

    if (shouldRunMtf || tradeMode === 'minute') {
        updateCandleHistory(longTermCandleHistoryRef, secondaryGranularity, false);
    }

    if (useTickAnalysis) {
        candleHistoryRef.current = [...candleHistoryRef.current.slice(-499), tickAsCandle];
        if (isBotActiveRef.current) {
            runAnalysisAndTradeRef.current();
        }
    } else {
        const isNewPrimaryCandle = updateCandleHistory(candleHistoryRef, primaryGranularity, true);
        if (isBotActiveRef.current && isNewPrimaryCandle) {
            const mode = tradeMode;
            const logMsg = mode === 'tick' ? `New ${primaryGranularity}s candle detected.` : 'New 1-minute candle detected.';
            addLog(logMsg);
            runAnalysisAndTradeRef.current();
        }
    }
  }, [addLog, tradeMode]);
  const handleNewTickRef = useRef(handleNewTick);
  handleNewTickRef.current = handleNewTick;


  useEffect(() => {
    const api = derivApiRef.current;
    if (!isConnected || !selectedMarket || !api) {
        return;
    }
    
    if (tickSubscriptionId.current) {
        api.unsubscribeFromStream(tickSubscriptionId.current).catch(e => addLog(`Error unsubscribing from previous stream: ${getErrorMessage(e)}`));
        tickSubscriptionId.current = null;
    }
    
    setTickHistory([]);
    candleHistoryRef.current = [];
    longTermCandleHistoryRef.current = [];
    setPredictionResult(null);

    let isSubscribed = true;

    const fetchInitialDataAndSubscribe = async () => {
        if (!api || !isSubscribed) return;
        
        const primaryGranularity = tradeMode === 'minute' ? 60 : parseInt(String(indicatorSettings.tickFastCandleTimeframe));
        const secondaryGranularity = tradeMode === 'minute' ? 300 : parseInt(String(indicatorSettings.tickConfirmationCandleTimeframe));
        const shouldRunMtf = indicatorSettings.enableMultiTimeframeAnalysis;

        try {
            addLog(`Fetching initial 5000 ticks for ${selectedMarket} to build history...`);
            const historicalTicks = await api.getTickHistory(selectedMarket, 5000);
            if (!isSubscribed) return;
            setTickHistory(historicalTicks);
            addLog(`Initial tick history loaded (${historicalTicks.length} ticks).`);

            if (tradeMode === 'tick' && historicalTicks.length > 0) {
                const fastCandles = generateCandlesFromTicks(historicalTicks, primaryGranularity);
                candleHistoryRef.current = fastCandles.slice(-500);
                addLog(`Initial ${primaryGranularity}s candle history built (${candleHistoryRef.current.length} candles).`);

                if (shouldRunMtf) {
                    const mtfCandles = generateCandlesFromTicks(historicalTicks, secondaryGranularity);
                    longTermCandleHistoryRef.current = mtfCandles.slice(-500);
                    addLog(`Initial MTF ${secondaryGranularity}s candle history built (${longTermCandleHistoryRef.current.length} candles).`);
                }
            } else if (tradeMode === 'minute') {
                addLog(`Fetching initial ${primaryGranularity}s candles for ${selectedMarket}...`);
                const candles = await api.getOHLCHistory(selectedMarket, primaryGranularity, 500);
                if (!isSubscribed) return;
                if (candles.length > 0) {
                    candleHistoryRef.current = candles;
                    addLog(`Initial ${primaryGranularity}s candle history loaded (${candles.length} candles).`);
                } else if (historicalTicks.length > 0) {
                    addLog(`No ${primaryGranularity}s candle history received. Building from ticks.`);
                    candleHistoryRef.current = generateCandlesFromTicks(historicalTicks, primaryGranularity).slice(-500);
                }

                if (shouldRunMtf) {
                    addLog(`Fetching initial ${secondaryGranularity}s candles for ${selectedMarket}...`);
                    const longTermCandles = await api.getOHLCHistory(selectedMarket, secondaryGranularity, 500);
                    if (!isSubscribed) return;
                    if(longTermCandles.length > 0) {
                        longTermCandleHistoryRef.current = longTermCandles;
                        addLog(`Initial ${secondaryGranularity}s candle history loaded (${longTermCandles.length} candles).`);
                    } else if (historicalTicks.length > 0) {
                        addLog(`No ${secondaryGranularity}s candle history received. Building from ticks.`);
                        longTermCandleHistoryRef.current = generateCandlesFromTicks(historicalTicks, secondaryGranularity).slice(-500);
                    }
                }
            }
        } catch (err) {
             if (!isSubscribed) return;
             const errorMessage = getErrorMessage(err);
             addLog(`Error fetching initial data: ${errorMessage}`);
             toast({ title: "History Error", description: `Could not fetch initial data: ${errorMessage}`, variant: 'destructive'});
        }
        
        addLog(`Subscribing to tick stream for ${selectedMarket}...`);
        try {
            const subId = await api.subscribeToTicks(selectedMarket, (tick) => handleNewTickRef.current(tick));
            if (!isSubscribed) {
                api.unsubscribeFromStream(subId).catch(() => {});
                return;
            };
            tickSubscriptionId.current = subId;
            addLog(`Successfully subscribed to tick stream with ID: ${tickSubscriptionId.current}`);
        } catch (err) {
            if (!isSubscribed) return;
            const errorMessage = getErrorMessage(err);
             if (errorMessage.includes('AlreadySubscribed')) {
                addLog('Already subscribed to this tick stream.');
            } else {
                addLog(`Error subscribing to ticks: ${errorMessage}`);
                toast({ title: "Subscription Error", description: `Could not subscribe to ticks: ${errorMessage}`, variant: 'destructive'});
            }
        }
    };
    
    fetchInitialDataAndSubscribe();

    return () => {
        isSubscribed = false;
        if (tickSubscriptionId.current && api) {
            api.unsubscribeFromStream(tickSubscriptionId.current).catch(e => addLog(`Error unsubscribing from ticks on cleanup: ${getErrorMessage(e)}`));
            tickSubscriptionId.current = null;
        }
    };
  }, [
    isConnected,
    selectedMarket,
    tradeMode,
    indicatorSettings.tickFastCandleTimeframe,
    indicatorSettings.tickConfirmationCandleTimeframe,
    addLog,
    toast,
  ]);


  const handleStopBot = useCallback(() => {
    isStoppingRef.current = true;
    setIsBotStopping(true);

    if (activeTradeRef.current) {
        addLog("Stop requested. Waiting for current trade to finish...");
    } else {
        completeStop("by user");
    }
  }, [completeStop, addLog]);
  
  const handleConnect = async () => {
    console.log('handleConnect: called with raw values', { apiToken, appId });
    
    const trimmedToken = apiToken.trim();
    const trimmedAppId = appId.trim();
    
    console.log('handleConnect: trimmed values', { trimmedToken, trimmedAppId });

    if (!trimmedToken) {
      toast({ title: "Error", description: "Please enter your PAT token.", variant: "destructive" });
      addLog("Error: PAT token is missing.");
      return;
    }

    // App ID must be provided
    if (!trimmedAppId) {
      toast({
        title: "Missing App ID",
        description: "Please enter your PAT App ID from developers.deriv.com.",
        variant: "destructive"
      });
      addLog(`Error: App ID is missing. Raw appId was: ${JSON.stringify(appId)}`);
      return;
    }

    setIsConnecting(true);
    setIsLoadingAccounts(true);
    addLog(`Connecting to Deriv API...`);

    try {
      // Step 1: Fetch accounts
      addLog(`Fetching your Deriv accounts...`);
      const fetchedAccounts = await DerivAPI.getAccounts(trimmedAppId, trimmedToken);
      console.log('handleConnect: fetchedAccounts', fetchedAccounts);
      setAccounts(fetchedAccounts);
      addLog(`Found ${fetchedAccounts.length} account(s).`);
      
      // If no account selected yet, pick the first demo one or first one
      if (!selectedAccountId && fetchedAccounts.length > 0) {
        const defaultAccount = fetchedAccounts.find(a => a.account_type === 'demo') || fetchedAccounts[0];
        setSelectedAccountId(defaultAccount.account_id);
        addLog(`Selected account: ${defaultAccount.account_id} (${defaultAccount.account_type})`);
      }

      setIsLoadingAccounts(false);

      // If we have a selected account, proceed to connect
      if (selectedAccountId || fetchedAccounts.length > 0) {
        const accountIdToUse = selectedAccountId || (fetchedAccounts.length > 0 ? fetchedAccounts[0].account_id : '');
        await completeConnection(trimmedAppId, trimmedToken, accountIdToUse);
      }

    } catch (error: any) {
      console.log('Full error object in handleConnect:', JSON.stringify(error, null, 2));
      const raw = getErrorMessage(error);
      let hint = raw;
      if (/invalid.?token/i.test(raw) || raw === 'InvalidToken') {
        hint = 'PAT token is invalid. Make sure you created a PAT app at developers.deriv.com and generated a token with trade and account_manage scopes.';
      } else if (/invalid.?app/i.test(raw) || raw === 'InvalidAppID' || raw === 'AppIDInvalid') {
        hint = `App ID is invalid. Make sure you registered a PAT app at developers.deriv.com.`;
      }
      toast({ title: "Connection Failed", description: hint, variant: "destructive" });
      addLog(`Connection failed: ${hint}`);
      setIsConnecting(false);
      setIsLoadingAccounts(false);
    }
  }

  const completeConnection = async (appId: string, patToken: string, accountId: string) => {
    try {
      addLog(`Connecting to account ${accountId}...`);
      const api = new DerivAPI(appId, patToken, accountId);
      derivApiRef.current = api;

      await api.connect();
      addLog("WebSocket connected successfully!");

      // Authorize (optional, since OTP URL handles auth)
      addLog("Authorizing...");
      const authResponse = await api.authorize();
      updateState('stats', prev => ({ 
        ...prev, 
        balance: authResponse.authorize.balance,
        derivId: authResponse.authorize.loginid,
      }));
      addLog(`Authorized as ${authResponse.authorize.loginid}. Balance: $${authResponse.authorize.balance.toFixed(2)}`);
      
      // FIRST: Set default markets and selected market BEFORE any other steps!
      const defaultMarkets = [
        { value: '1HZ10V', label: 'Volatility 10 Index' },
        { value: '1HZ25V', label: 'Volatility 25 Index' },
        { value: '1HZ50V', label: 'Volatility 50 Index' },
        { value: '1HZ75V', label: 'Volatility 75 Index' },
        { value: '1HZ100V', label: 'Volatility 100 Index' },
        { value: 'R_10', label: 'Boom 500 Index' },
        { value: 'R_25', label: 'Crash 500 Index' },
      ];
      setMarkets(defaultMarkets);
      const defaultMarket = defaultMarkets[0];
      setSelectedMarket(defaultMarket.value);
      addLog(`Default market: ${defaultMarket.label}`);
      
      // We'll just use our default markets for reliable testing!
      addLog("Using default test markets for reliable trading.");
      // We already set the markets and selected market above, so nothing else needed here!

      // Subscribe to balance updates
      api.subscribeToBalance((balance: number) => {
        updateState('stats', prev => ({...prev, balance}));
      });
      
      setIsConnected(true);
      setIsConnecting(false);
      toast({ title: "Connected!", description: `Logged in as ${authResponse.authorize.loginid}` });
      addLog("Successfully connected to Deriv API.");

    } catch (error: any) {
      const raw = getErrorMessage(error);
      console.log('completeConnection error:', raw);
      toast({ title: "Connection Failed", description: raw, variant: "destructive" });
      addLog(`Connection failed: ${raw}`);
      setIsConnected(false);
      setIsConnecting(false);
    }
  };


  const handleDisconnect = () => {
    if (isBotActiveRef.current) {
        handleStopBot();
    }
    // Unsubscribe from ticks first!
    if (tickSubscriptionId.current && derivApiRef.current) {
        derivApiRef.current.unsubscribeFromStream(tickSubscriptionId.current).catch(console.error);
        tickSubscriptionId.current = null;
    }
    derivApiRef.current?.close();
    derivApiRef.current = null;
    setIsConnected(false);
    // Don't clear markets or accounts - keep them for reconnection!
    updateState('stats', {
        balance: 0,
        sessionProfit: 0,
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        derivId: '',
    });
    setTickHistory([]);
    candleHistoryRef.current = [];
    longTermCandleHistoryRef.current = [];
    // Keep event logs for history
    addLog("Disconnected from Deriv API.");
    toast({ title: "Disconnected", description: "You have been logged out." });
  };
  
  const handleStartBot = () => {
    if (!derivApiRef.current || !selectedMarket ) {
        const errorMsg = "Please connect and select a market.";
        addLog(`Error starting bot: ${errorMsg}`);
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        return;
    }
    
    isBotActiveRef.current = true;
    setIsBotActive(true);
    isStoppingRef.current = false;
    setIsBotStopping(false);
    activeTradeRef.current = null;
    finishedContractIds.current.clear();
    isProcessingRef.current = false;
    setAllChartArrows([]);

    updateState('stats', prev => ({ ...prev, sessionProfit: 0, totalTrades: 0, winningTrades: 0, winRate: 0 }));
    updateState('tradeHistory', []);
    updateState('nextTradeStake', parseFloat(stake)); 
    addLog(`Bot started in ${tradeMode} mode.`);
    toast({ title: "Bot Started", description: `The bot is now live in ${tradeMode} mode.` });
    
    const requiredCandles = 20;
    if (candleHistoryRef.current.length < requiredCandles) {
        addLog(`Collecting candle data... Please wait for at least ${requiredCandles} candles.`);
    } else {
        addLog("Candle collection complete. Waiting for next signal...");
    }
  };

  
  const profitColor = stats.sessionProfit > 0 ? "text-green-400" : stats.sessionProfit < 0 ? "text-red-400" : "text-white";
  const botStatusColor = isBotActive ? "text-green-400" : "text-yellow-400";
  const botStatusRingColor = isBotActive ? "bg-green-400" : "bg-yellow-400";


  const openSettingsPanel = () => {
    setTempIndicatorSettings(prev => ({
      ...defaultIndicatorSettings,
      ...indicatorSettings,
      weights: {
        ...defaultIndicatorSettings.weights,
        ...(indicatorSettings.weights || {}),
      },
    }));
    setIsSettingsOpen(true);
  };
  
    const handleIndicatorSettingChange = (field: keyof IndicatorSettings, value: string | boolean | number) => {
        if (typeof value === 'boolean') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value }));
        } else if (field === 'rsiStrategy') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value as RsiStrategy }));
        } else if (field === 'bollingerStrategy') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value as BollingerStrategy }));
        } else if (field === 'oneTwoThreeStrategy') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value as OneTwoThreeStrategy }));
        } else if (field === 'stochasticStrategy') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value as StochasticStrategy }));
        } else if (field === 'momentumStrategy') {
             setTempIndicatorSettings(prev => ({...prev, [field]: value as MomentumStrategy }));
        } else if (field === 'dpoStrategy') {
            setTempIndicatorSettings(prev => ({...prev, [field]: value as DpoStrategy }));
        } else if (field === 'pmoStrategy') {
            setTempIndicatorSettings(prev => ({...prev, [field]: value as PmoStrategy }));
        } else if (field === 'deltaRsiStrategy') {
            setTempIndicatorSettings(prev => ({...prev, [field]: value as DeltaRsiStrategy }));
        } else if (field === 'volumeProfileStrategy') {
            setTempIndicatorSettings(prev => ({...prev, [field]: value as VolumeProfileStrategy }));
        } else {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
                 if (field === 'tickFastCandleTimeframe') {
                    if (numValue >= tempIndicatorSettings.tickConfirmationCandleTimeframe) {
                        const nextValidConfirmation = confirmationCandleOptions.find(opt => Number(opt.value) > numValue);
                        return setTempIndicatorSettings(prev => ({
                            ...prev, 
                            [field]: numValue,
                            tickConfirmationCandleTimeframe: nextValidConfirmation ? Number(nextValidConfirmation.value) : 60,
                        }));
                    }
                }
                setTempIndicatorSettings(prev => ({...prev, [field]: numValue }));
            }
        }
    }
    
    const handleWeightChange = (field: keyof IndicatorSettings['weights'], value: string) => {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
            setTempIndicatorSettings(prev => ({
                ...prev,
                weights: {
                    ...prev.weights,
                    [field]: numValue,
                }
            }));
        }
    };


    const saveIndicatorSettings = () => {
        if (JSON.stringify(tempIndicatorSettings) === JSON.stringify(indicatorSettings)) {
            toast({ title: 'No Changes', description: 'Indicator settings were not changed.' });
            setIsSettingsOpen(false);
            return;
        }
        setIndicatorSettings(tempIndicatorSettings);
        setIsSettingsOpen(false);
        toast({ title: 'Success', description: 'Indicator settings saved.' });
    }

    const resetIndicatorSettings = () => {
        setTempIndicatorSettings(defaultIndicatorSettings);
    }
    
    const handleResetIndicator = (indicator: keyof IndicatorSettings['weights']) => {
        const resetKeyMap: { [key: string]: (keyof IndicatorSettings)[] } = {
          rsiWeight: ['enableRsi', 'rsiStrategy', 'rsiPeriod', 'rsiUpperLevel', 'rsiLowerLevel'],
          stochasticWeight: ['enableStochastic', 'stochasticStrategy', 'stochasticKPeriod', 'stochasticDPeriod', 'stochasticSlowing', 'stochasticUpperLevel', 'stochasticLowerLevel'],
          macdWeight: ['enableMacd', 'macdFastPeriod', 'macdSlowPeriod', 'macdSignalPeriod'],
          bollingerWeight: ['enableBollinger', 'bollingerStrategy', 'bollingerPeriod', 'bollingerStdDev'],
          emaWeight: ['enableEma', 'emaPeriod'],
          smaWeight: ['enableSma', 'smaPeriod'],
          momentumWeight: ['enableMomentum', 'momentumStrategy', 'momentumPeriod'],
          reversalWeight: ['enableOneTwoThreeReversal', 'oneTwoThreeStrategy'],
          trendAnalysisWeight: ['enableTrendAnalysis', 'trendPeriod'],
          multiTimeframeAnalysisWeight: ['enableMultiTimeframeAnalysis', 'mtfTrendPeriod'],
          volatilityFilterWeight: ['enableVolatilityFilter', 'minVolatility'],
          superSignalsWeight: ['enableSuperSignals', 'superSignalsAtrPeriod', 'superSignalsPeriod', 'enableSuperTrendFilter', 'superTrendFilterPeriod'],
          skyrexReversalWeight: ['enableSkyrexReversal', 'skyrexEnableMfi', 'skyrexEnableAo', 'skyrexTrendPeriod'],
          squeezeMomentumWeight: ['enableSqueezeMomentum', 'squeezeMomentumBbLength', 'squeezeMomentumKcLength', 'squeezeMomentumBbMult', 'squeezeMomentumKcMult'],
          dpoWeight: ['dpoStrategy', 'dpoLength', 'dpoSmooth'],
          pmoWeight: ['pmoStrategy', 'pmoLength1', 'pmoLength2', 'pmoSigLength'],
          deltaRsiWeight: ['deltaRsiStrategy', 'deltaRsiPeriod', 'deltaRsiWindow', 'deltaRsiDegree', 'deltaRsiSignalLength', 'deltaRsiUseRmseFilter', 'deltaRsiRmseThreshold'],
          supportResistanceWeight: ['enableSupportResistance', 'supportResistancePeriod', 'supportResistanceSensitivity'],
          peakFilterWeight: ['enablePeakFilter', 'peakFilterFastEma', 'peakFilterSlowEma', 'peakFilterRsi', 'peakFilterRsiUpper', 'peakFilterRsiLower', 'peakFilterLookback', 'peakFilterUseTrendConfirmation', 'peakFilterUseStrictPivots', 'peakFilterUseRsiDirection'],
          atrTrailingStopWeight: ['enableAtrTrailingStop', 'atrTrailingStopSensitivity', 'atrTrailingStopPeriod'],
          volumeProfileWeight: ['enableVolumeProfile', 'volumeProfileStrategy', 'volumeProfilePeriod', 'volumeProfileValueArea'],
          emaAdxTrendWeight: ['enableEmaAdxTrend', 'emaAdxTrendFastPeriod', 'emaAdxTrendMediumPeriod', 'emaAdxTrendSlowPeriod', 'emaAdxTrendAdxPeriod', 'emaAdxTrendAdxThreshold'],
          ultimatePullbackWeight: ['enableUltimatePullback', 'ultimatePullbackEmaFast', 'ultimatePullbackEmaSlow', 'ultimatePullbackRsiPeriod', 'ultimatePullbackRsiLower', 'ultimatePullbackRsiUpper', 'ultimatePullbackScoreThreshold']
        };
        
        const settingsToReset = resetKeyMap[indicator as keyof typeof resetKeyMap];

        if (settingsToReset) {
            const newSettings = { ...tempIndicatorSettings };
            settingsToReset.forEach(key => {
                (newSettings as any)[key] = (defaultIndicatorSettings as any)[key];
            });
            (newSettings.weights as any)[indicator] = (defaultIndicatorSettings.weights as any)[indicator];
            
            setTempIndicatorSettings(newSettings);
        }
    };
    
    const chartDataType = chartDisplayTimeframe === 'ticks' ? 'ticks' : 'candles';
    
    const getChartData = React.useMemo(() => {
        if (chartDisplayTimeframe === 'ticks') {
            return tickHistory;
        }
        
        if (tradeMode === 'minute' && chartDisplayTimeframe === '1m') {
            return candleHistoryRef.current;
        }

        const timeframeString = chartDisplayTimeframe.replace(/[smh]/, '');
        const timeframeUnit = chartDisplayTimeframe.slice(-1);
        let multiplier = 1;
        if (timeframeUnit === 'm') multiplier = 60;
        if (timeframeUnit === 'h') multiplier = 3600;
        const timeframeSeconds = parseInt(timeframeString) * multiplier;
        
        return generateCandlesFromTicks(tickHistory, timeframeSeconds);
    }, [tickHistory, chartDisplayTimeframe, tradeMode]);

    const chartData = getChartData;
    
    const availableConfirmationOptions = confirmationCandleOptions.filter(opt => Number(opt.value) > tempIndicatorSettings.tickFastCandleTimeframe);
    
    const chartTimeframeOptions = tradeMode === 'minute' ? minuteChartTimeframeOptions : tickChartTimeframeOptions;

  // Hydration fix: Only render the full UI on the client
  if (!isClient) {
    return <div className="h-screen bg-background" />;
  }

  return (
    <div className="h-screen bg-background text-foreground p-4 font-body flex flex-col">
      <header className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-0.5">Tamili-Auto Bot</h1>
            <p className="text-sm text-muted-foreground">Multi Indicator Bot for Deriv</p>
          </div>
           <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", botStatusRingColor, isBotActive && "animate-pulse")}></div>
            <span className={cn("text-sm font-semibold", botStatusColor)}>{isBotStopping ? "Stopping..." : isBotActive ? "Active" : "Idle"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border rounded-lg p-1.5">
            <RadioGroup 
                value={tradeMode} 
                onValueChange={(value) => setTradeMode(value as TradeMode)}
                className="flex"
                disabled={isBotActive}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tick" id="tickMode" />
                <Label htmlFor="tickMode" className="text-sm font-medium">Tick Mode</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="minute" id="minuteMode" />
                <Label htmlFor="minuteMode" className="text-sm font-medium">Minute Mode</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center px-3 py-1.5 bg-card rounded border">
              <p className="text-xs text-muted-foreground">Session P/L</p>
              <p className={cn("text-lg font-bold", profitColor)}>${stats.sessionProfit.toFixed(2)}</p>
            </div>
            <div className="text-center px-3 py-1.5 bg-card rounded border">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-lg font-bold text-cyan-400">{stats.winRate.toFixed(1)}%</p>
            </div>
            <div className="text-center px-3 py-1.5 bg-card rounded border">
              <p className="text-xs text-muted-foreground">Wins / Total</p>
              <p className="text-lg font-bold text-purple-400">{stats.winningTrades} / {stats.totalTrades}</p>
            </div>
             <div className="text-center px-3 py-1.5 bg-card rounded border">
                <p className="text-xs text-muted-foreground">Next Stake</p>
                <p className="text-lg font-bold text-yellow-400">${nextTradeStake.toFixed(2)}</p>
            </div>
          </div>

          {isConnected && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded border">
                <Wallet size={20} className="text-muted-foreground" />
                <div className="text-right">
                <p className="text-xs text-muted-foreground">Balance:</p>
                <p className="text-base font-bold">${stats.balance.toFixed(2)}</p>
                </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {!isConnected && (
              <>
                <Input
                    id="appId"
                    type="text"
                    placeholder="PAT App ID"
                    className="w-64"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    disabled={isConnecting}
                    title="Your Deriv PAT App ID from developers.deriv.com"
                />
                <Input
                    id="apiToken"
                    type="password"
                    placeholder="PAT Token (starts with pat_)"
                    className="w-64"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    disabled={isConnecting}
                    title="Your Deriv Personal Access Token (PAT)"
                />
              </>
            )}
            
            {accounts.length > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="accountSelect" className="text-xs text-muted-foreground">Account:</Label>
                <Select 
                  value={selectedAccountId} 
                  onValueChange={(newAccountId) => {
                    setSelectedAccountId(newAccountId);
                    if (isConnected && newAccountId !== selectedAccountId) {
                      // If already connected, ask to switch
                      if (confirm(`Switch to account ${newAccountId}? This will disconnect the current session.`)) {
                        handleDisconnect();
                        // Wait a bit and reconnect
                        setTimeout(() => {
                          completeConnection(appId, apiToken, newAccountId);
                        }, 500);
                      }
                    }
                  }} 
                  disabled={isConnecting || isBotActive}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem key={account.account_id} value={account.account_id}>
                        {account.account_type} - {account.currency} ${typeof account.balance === 'number' ? account.balance.toFixed(2) : account.balance}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {!isConnected && selectedAccountId && (
                  <Button onClick={() => completeConnection(appId, apiToken, selectedAccountId)} disabled={isConnecting} className="bg-green-600 hover:bg-green-700">
                    {isConnecting ? "Connecting..." : "Connect to Account"}
                  </Button>
                )}
              </div>
            )}
            
            {!isConnected && accounts.length === 0 && (
              <Button onClick={handleConnect} disabled={isConnecting || isLoadingAccounts} className="w-36 bg-primary/90 hover:bg-primary">
                {isLoadingAccounts ? "Loading Accounts..." : isConnecting ? "Connecting..." : "Get Accounts"}
              </Button>
            )}
            
            {isConnected && (
              <Button variant="outline" size="icon" onClick={handleDisconnect} title="Disconnect">
                <LogOut size={18} />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-[1fr_2fr_1fr] gap-4 flex-grow min-h-0">
        <div className="flex flex-col gap-4 min-h-0">
          <PredictionCard predictionResult={predictionResult} minConfidence={minConfidence} />
          <AnalysisCard predictionResult={predictionResult} minVolatilityThreshold={indicatorSettings.minVolatility || 0} />
          <div className="flex-grow min-h-0">
            <TradeHistory tradeHistory={tradeHistory} />
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-4 min-h-0">
          <div className="bg-card rounded-lg border p-4 flex flex-col w-full flex-grow flex-1 min-h-[250px] h-0">
            <div className="flex items-center justify-between mb-3">
               <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Price Chart</h3>
                
                <Select value={chartDisplayTimeframe} onValueChange={(val) => setChartDisplayTimeframe(val as ChartTimeframe)}>
                    <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {chartTimeframeOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-primary">Live Data</span>
            </div>
            <div className="bg-background rounded-lg p-3 flex-grow">
              <MemoizedLightweightLiveChart 
                dataType={chartDataType}
                data={chartData}
                chartApiRef={liveChartApiRef}
                signals={allChartArrows}
              />
            </div>
          </div>
          <IndicatorsCard predictionResult={predictionResult} />
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="bg-card rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <Settings className="text-cyan-400" size={18} />
                <h3 className="font-semibold text-sm">Trade Parameters</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Market</Label>
                  <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={isBotActive || !isConnected}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {markets.map(market => (
                        <SelectItem key={market.value} value={market.value}>{market.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                 <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Stake ($)</Label>
                  <NumberInputWithSteppers
                    value={stake}
                    onChange={setStake}
                    min="0.35"
                    step="0.01"
                    disabled={isBotActive || !isConnected}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Target Profit ($)</Label>
                  <NumberInputWithSteppers
                    value={targetProfit}
                    onChange={setTargetProfit}
                    min="1"
                    step="1"
                    disabled={isBotActive}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Stop Loss ($)</Label>
                  <NumberInputWithSteppers
                    value={stopLoss}
                    onChange={setStopLoss}
                    min="1"
                    step="1"
                    disabled={isBotActive}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Min. Confidence (%)</Label>
                  <NumberInputWithSteppers
                    value={minConfidence}
                    onChange={setMinConfidence}
                    min="1"
                    max="95"
                    step="1"
                    disabled={isBotActive}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Trade Duration</Label>
                  <NumberInputWithSteppers
                    value={riseFallDuration}
                    onChange={setRiseFallDuration}
                    min="1"
                    step="1"
                    disabled={isBotActive}
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-accent rounded-lg p-3 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Enable Martingale</p>
                  <p className="text-xs text-muted-foreground">Auto-increase stake on loss</p>
                </div>
                <Switch checked={enableMartingale} onCheckedChange={setEnableMartingale} disabled={isBotActive} />
              </div>
              {enableMartingale && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Martingale Multiplier</Label>
                  <NumberInputWithSteppers
                    value={martingaleMultiplier}
                    onChange={setMartingaleMultiplier}
                    min="1.1"
                    step="0.1"
                    disabled={isBotActive}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2">
              <Button onClick={openSettingsPanel} className="w-full font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm" disabled={isBotActive}>
                <Settings size={18} />
                Indicator Settings
              </Button>
              <Button 
                onClick={isBotActive ? handleStopBot : handleStartBot} 
                disabled={!isConnected || isBotStopping}
                className={cn(
                    "w-full font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm",
                    isBotActive 
                        ? "bg-red-600 hover:bg-red-700 text-white" 
                        : "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                {isBotActive ? (
                    isBotStopping ? "Stopping..." : <><StopCircle size={18} /> Stop Bot</>
                ) : (
                    <><Play size={18} /> Start Bot</>
                )}
              </Button>
            </div>
          </div>
          <div className="flex-grow min-h-0">
             <EventLog eventLogs={eventLogs} />
          </div>
        </div>
      </main>

       <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <SheetContent 
              side="right" 
              className="p-0 w-full max-w-md sm:max-w-lg md:max-w-2xl bg-card flex flex-col"
          >
              <SheetHeader className="p-6 border-b">
                  <SheetTitle>Indicator Settings</SheetTitle>
                   <SheetDescription>
                    Adjust the parameters for the technical indicators used in the analysis engine.
                  </SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-grow">
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                      
                       <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableUltimatePullback} onCheckedChange={(c) => handleIndicatorSettingChange('enableUltimatePullback', c)} disabled={isBotActive} id="enableUltimatePullback" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableUltimatePullback" className="flex items-center gap-2"><Target className="h-4 w-4 text-orange-400" /> Ultimate Pullback Strategy</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Trend-following pullback entry system.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('ultimatePullbackWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 col-span-full">
                           <div className="space-y-2">
                               <Label htmlFor="ultimatePullbackEmaFast">Fast EMA</Label>
                               <Input id="ultimatePullbackEmaFast" type="number" value={tempIndicatorSettings.ultimatePullbackEmaFast} onChange={e => handleIndicatorSettingChange('ultimatePullbackEmaFast', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableUltimatePullback} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="ultimatePullbackEmaSlow">Slow EMA</Label>
                               <Input id="ultimatePullbackEmaSlow" type="number" value={tempIndicatorSettings.ultimatePullbackEmaSlow} onChange={e => handleIndicatorSettingChange('ultimatePullbackEmaSlow', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableUltimatePullback} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="ultimatePullbackRsiPeriod">RSI Period</Label>
                               <Input id="ultimatePullbackRsiPeriod" type="number" value={tempIndicatorSettings.ultimatePullbackRsiPeriod} onChange={e => handleIndicatorSettingChange('ultimatePullbackRsiPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableUltimatePullback} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="ultimatePullbackWeight">Weight</Label>
                               <Input id="ultimatePullbackWeight" type="number" value={tempIndicatorSettings.weights.ultimatePullbackWeight} onChange={e => handleWeightChange('ultimatePullbackWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableUltimatePullback} />
                           </div>
                        </div>

                       <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableEmaAdxTrend} onCheckedChange={(c) => handleIndicatorSettingChange('enableEmaAdxTrend', c)} disabled={isBotActive} id="enableEmaAdxTrend" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableEmaAdxTrend" className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-sky-400" /> EMA+ADX Trend Strategy</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Trade on EMA alignment with ADX confirmation.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('emaAdxTrendWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 col-span-full">
                           <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendFastPeriod">Fast EMA</Label>
                               <Input id="emaAdxTrendFastPeriod" type="number" value={tempIndicatorSettings.emaAdxTrendFastPeriod} onChange={e => handleIndicatorSettingChange('emaAdxTrendFastPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendMediumPeriod">Medium EMA</Label>
                               <Input id="emaAdxTrendMediumPeriod" type="number" value={tempIndicatorSettings.emaAdxTrendMediumPeriod} onChange={e => handleIndicatorSettingChange('emaAdxTrendMediumPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendSlowPeriod">Slow EMA</Label>
                               <Input id="emaAdxTrendSlowPeriod" type="number" value={tempIndicatorSettings.emaAdxTrendSlowPeriod} onChange={e => handleIndicatorSettingChange('emaAdxTrendSlowPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendWeight">Weight</Label>
                               <Input id="emaAdxTrendWeight" type="number" value={tempIndicatorSettings.weights.emaAdxTrendWeight} onChange={e => handleWeightChange('emaAdxTrendWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 col-span-full">
                             <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendAdxPeriod">ADX Period</Label>
                               <Input id="emaAdxTrendAdxPeriod" type="number" value={tempIndicatorSettings.emaAdxTrendAdxPeriod} onChange={e => handleIndicatorSettingChange('emaAdxTrendAdxPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="emaAdxTrendAdxThreshold">ADX Threshold</Label>
                               <Input id="emaAdxTrendAdxThreshold" type="number" value={tempIndicatorSettings.emaAdxTrendAdxThreshold} onChange={e => handleIndicatorSettingChange('emaAdxTrendAdxThreshold', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEmaAdxTrend} />
                           </div>
                        </div>

                       <div className="space-y-2 col-span-full mt-4 border-t pt-4">
                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Enable Multi-Timeframe Confirmation</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        {tradeMode === 'minute' ? 'Use 5-min candle data to confirm trend.' : 'Use confirmation candle to confirm trend.'}
                                    </p>
                                </div>
                                <Switch
                                    checked={tempIndicatorSettings.enableMultiTimeframeAnalysis}
                                    onCheckedChange={(checked) => handleIndicatorSettingChange('enableMultiTimeframeAnalysis', checked)}
                                    disabled={isBotActive}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="mtfTrendPeriod">MTF Trend Period</Label>
                           <Input id="mtfTrendPeriod" type="number" value={tempIndicatorSettings.mtfTrendPeriod} onChange={e => handleIndicatorSettingChange('mtfTrendPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMultiTimeframeAnalysis} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="multiTimeframeAnalysisWeight">Weight</Label>
                            <Input id="multiTimeframeAnalysisWeight" type="number" value={tempIndicatorSettings.weights.multiTimeframeAnalysisWeight} onChange={e => handleWeightChange('multiTimeframeAnalysisWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMultiTimeframeAnalysis} />
                        </div>
                        <div className="col-span-full"></div>


                      {tradeMode === 'tick' && (
                         <div className="space-y-4 col-span-full border-t border-b pb-4 mt-4">
                            <h3 className="text-lg font-semibold mt-4">Tick Trader Speed</h3>
                             <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Enable Fast Candle Analysis</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        If off, the bot will analyze every single tick.
                                    </p>
                                </div>
                                <Switch
                                    checked={!tempIndicatorSettings.enableTickAnalysis}
                                    onCheckedChange={(checked) => handleIndicatorSettingChange('enableTickAnalysis', !checked)}
                                    disabled={isBotActive}
                                />
                            </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <Label htmlFor="tickFastCandle">Fast Candle (Signal)</Label>
                                  <Select 
                                    value={String(tempIndicatorSettings.tickFastCandleTimeframe)} 
                                    onValueChange={(val) => handleIndicatorSettingChange('tickFastCandleTimeframe', val)} 
                                    disabled={isBotActive || tempIndicatorSettings.enableTickAnalysis}
                                  >
                                      <SelectTrigger><SelectValue/></SelectTrigger>
                                      <SelectContent>
                                          {fastCandleOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              </div>
                              <div className="space-y-2">
                                  <Label htmlFor="tickConfirmCandle">Confirmation Candle (Trend)</Label>
                                  <Select 
                                      value={String(tempIndicatorSettings.tickConfirmationCandleTimeframe)} 
                                      onValueChange={(val) => handleIndicatorSettingChange('tickConfirmationCandleTimeframe', val)}
                                      disabled={isBotActive || !tempIndicatorSettings.enableMultiTimeframeAnalysis}
                                  >
                                      <SelectTrigger><SelectValue/></SelectTrigger>
                                      <SelectContent>
                                          {availableConfirmationOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              </div>
                            </div>
                          </div>
                      )}

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableAtrTrailingStop} onCheckedChange={(c) => handleIndicatorSettingChange('enableAtrTrailingStop', c)} disabled={isBotActive} id="enableAtrTrailingStop" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableAtrTrailingStop" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> ATR Trailing Stop</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Volatility-based trend reversal signals.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('atrTrailingStopWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="atrTrailingStopPeriod">ATR Period</Label>
                            <Input id="atrTrailingStopPeriod" type="number" value={tempIndicatorSettings.atrTrailingStopPeriod} onChange={e => handleIndicatorSettingChange('atrTrailingStopPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableAtrTrailingStop} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="atrTrailingStopSensitivity">Key Value (Sensitivity)</Label>
                            <Input id="atrTrailingStopSensitivity" type="number" value={tempIndicatorSettings.atrTrailingStopSensitivity} onChange={e => handleIndicatorSettingChange('atrTrailingStopSensitivity', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableAtrTrailingStop} step="0.1" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="atrTrailingStopWeight">Weight</Label>
                            <Input id="atrTrailingStopWeight" type="number" value={tempIndicatorSettings.weights.atrTrailingStopWeight} onChange={e => handleWeightChange('atrTrailingStopWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableAtrTrailingStop} />
                        </div>

                        <div className="col-span-full mt-2 border-t pt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enablePeakFilter} onCheckedChange={(c) => handleIndicatorSettingChange('enablePeakFilter', c)} disabled={isBotActive} id="enablePeakFilter" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enablePeakFilter" className="flex items-center gap-2"><Mountain className="h-4 w-4 text-teal-400" /> Peak Filter Strategy</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Trend-following reversal/continuation logic.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('peakFilterWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 col-span-full">
                           <div className="space-y-2">
                               <Label htmlFor="peakFilterFastEma">Fast EMA</Label>
                               <Input id="peakFilterFastEma" type="number" value={tempIndicatorSettings.peakFilterFastEma} onChange={e => handleIndicatorSettingChange('peakFilterFastEma', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="peakFilterSlowEma">Slow EMA</Label>
                               <Input id="peakFilterSlowEma" type="number" value={tempIndicatorSettings.peakFilterSlowEma} onChange={e => handleIndicatorSettingChange('peakFilterSlowEma', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                            <div className="space-y-2">
                               <Label htmlFor="peakFilterRsi">RSI Period</Label>
                               <Input id="peakFilterRsi" type="number" value={tempIndicatorSettings.peakFilterRsi} onChange={e => handleIndicatorSettingChange('peakFilterRsi', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="peakFilterLookback">Peak Lookback</Label>
                               <Input id="peakFilterLookback" type="number" value={tempIndicatorSettings.peakFilterLookback} onChange={e => handleIndicatorSettingChange('peakFilterLookback', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="peakFilterRsiLower">RSI Lower</Label>
                               <Input id="peakFilterRsiLower" type="number" value={tempIndicatorSettings.peakFilterRsiLower} onChange={e => handleIndicatorSettingChange('peakFilterRsiLower', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="peakFilterRsiUpper">RSI Upper</Label>
                               <Input id="peakFilterRsiUpper" type="number" value={tempIndicatorSettings.peakFilterRsiUpper} onChange={e => handleIndicatorSettingChange('peakFilterRsiUpper', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                           <div className="space-y-2 col-span-2">
                                <Label htmlFor="peakFilterWeight">Weight</Label>
                                <Input id="peakFilterWeight" type="number" value={tempIndicatorSettings.weights.peakFilterWeight} onChange={e => handleWeightChange('peakFilterWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                           </div>
                        </div>

                         <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Use Trend Confirmation</Label>
                                </div>
                                <Switch checked={tempIndicatorSettings.peakFilterUseTrendConfirmation} onCheckedChange={(c) => handleIndicatorSettingChange('peakFilterUseTrendConfirmation', c)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                            </div>
                             <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Use Strict Pivots</Label>
                                </div>
                                <Switch checked={tempIndicatorSettings.peakFilterUseStrictPivots} onCheckedChange={(c) => handleIndicatorSettingChange('peakFilterUseStrictPivots', c)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <Label>Use RSI Direction</Label>
                                </div>
                                <Switch checked={tempIndicatorSettings.peakFilterUseRsiDirection} onCheckedChange={(c) => handleIndicatorSettingChange('peakFilterUseRsiDirection', c)} disabled={isBotActive || !tempIndicatorSettings.enablePeakFilter} />
                            </div>
                        </div>

                        <div className="col-span-full mt-2 border-t pt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSupportResistance} onCheckedChange={(c) => handleIndicatorSettingChange('enableSupportResistance', c)} disabled={isBotActive} id="enableSupportResistance" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSupportResistance">Support & Resistance</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Classic pivot bounce filter.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('supportResistanceWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="supportResistancePeriod">S/R Lookback Period</Label>
                            <Input id="supportResistancePeriod" type="number" value={tempIndicatorSettings.supportResistancePeriod} onChange={e => handleIndicatorSettingChange('supportResistancePeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSupportResistance}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="supportResistanceSensitivity">S/R Pivot Sensitivity</Label>
                            <Input id="supportResistanceSensitivity" type="number" value={tempIndicatorSettings.supportResistanceSensitivity} onChange={e => handleIndicatorSettingChange('supportResistanceSensitivity', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSupportResistance} min="1" max="10"/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="supportResistanceWeight">Weight</Label>
                            <Input id="supportResistanceWeight" type="number" value={tempIndicatorSettings.weights.supportResistanceWeight} onChange={e => handleWeightChange('supportResistanceWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSupportResistance} />
                        </div>

                        <div className="col-span-full mt-2 border-t pt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableVolumeProfile} onCheckedChange={(c) => handleIndicatorSettingChange('enableVolumeProfile', c)} disabled={isBotActive} id="enableVolumeProfile" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableVolumeProfile" className="flex items-center gap-2"><Cuboid className="h-4 w-4 text-blue-400" /> Volume Profile</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Trade based on high-volume price zones.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('volumeProfileWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="volumeProfileStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.volumeProfileStrategy} onValueChange={(val) => handleIndicatorSettingChange('volumeProfileStrategy', val as VolumeProfileStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableVolumeProfile}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                                    <SelectItem value="poc-bounce">PoC Bounce</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="volumeProfilePeriod">Lookback Period</Label>
                            <Input id="volumeProfilePeriod" type="number" value={tempIndicatorSettings.volumeProfilePeriod} onChange={e => handleIndicatorSettingChange('volumeProfilePeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableVolumeProfile}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="volumeProfileValueArea">Value Area (%)</Label>
                            <Input id="volumeProfileValueArea" type="number" value={tempIndicatorSettings.volumeProfileValueArea} onChange={e => handleIndicatorSettingChange('volumeProfileValueArea', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableVolumeProfile} min="1" max="100"/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="volumeProfileWeight">Weight</Label>
                            <Input id="volumeProfileWeight" type="number" value={tempIndicatorSettings.weights.volumeProfileWeight} onChange={e => handleWeightChange('volumeProfileWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableVolumeProfile} />
                        </div>


                       <div className="space-y-2 col-span-full mt-4 border-t pt-4">
                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="enableTrendAnalysis"
                                        checked={tempIndicatorSettings.enableTrendAnalysis}
                                        onCheckedChange={(checked) => handleIndicatorSettingChange('enableTrendAnalysis', checked)}
                                        disabled={isBotActive}
                                    />
                                    <div className="space-y-0.5">
                                        <Label htmlFor="enableTrendAnalysis">Enable Trend-Based Analysis</Label>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                           Use short-term trend direction to filter signals.
                                        </p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('trendAnalysisWeight')}><RotateCcw size={14}/></Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="trendPeriod">Trend Period</Label>
                            <Input id="trendPeriod" type="number" value={tempIndicatorSettings.trendPeriod} onChange={e => handleIndicatorSettingChange('trendPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableTrendAnalysis}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="trendAnalysisWeight">Weight</Label>
                            <Input id="trendAnalysisWeight" type="number" value={tempIndicatorSettings.weights.trendAnalysisWeight} onChange={e => handleWeightChange('trendAnalysisWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableTrendAnalysis} />
                        </div>
                        <div className="col-span-1 sm:col-span-2 lg:col-span-1"></div>

                        <div className="col-span-full mt-2 border-t pt-4">
                            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                     <Switch
                                        id="enableVolatilityFilter"
                                        checked={tempIndicatorSettings.enableVolatilityFilter}
                                        onCheckedChange={(checked) => handleIndicatorSettingChange('enableVolatilityFilter', checked)}
                                        disabled={isBotActive}
                                    />
                                    <div className="space-y-0.5">
                                        <Label htmlFor="enableVolatilityFilter" className="flex items-center gap-2"><Waves className="h-4 w-4" /> Volatility Filter</Label>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                           Avoid trading in sideways markets.
                                        </p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('volatilityFilterWeight')}><RotateCcw size={14}/></Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="minVolatility">Min Volatility (%)</Label>
                            <Input id="minVolatility" type="number" value={tempIndicatorSettings.minVolatility || 0} onChange={e => handleIndicatorSettingChange('minVolatility', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableVolatilityFilter} step="0.01"/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="volatilityFilterWeight">Weight</Label>
                            <Input id="volatilityFilterWeight" type="number" value={tempIndicatorSettings.weights.volatilityFilterWeight} onChange={e => handleWeightChange('volatilityFilterWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableVolatilityFilter} />
                        </div>
                         <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                             <div className="space-y-0.5">
                                <Label className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-pink-400" /> Delta-RSI Oscillator</Label>
                                <p className="text-[0.8rem] text-muted-foreground">Measures the acceleration of RSI momentum.</p>
                            </div>
                             <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('deltaRsiWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.deltaRsiStrategy} onValueChange={(val) => handleIndicatorSettingChange('deltaRsiStrategy', val as DeltaRsiStrategy)} disabled={isBotActive}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                    <SelectItem value="zero-crossing">Zero-Crossing</SelectItem>
                                    <SelectItem value="signal-crossing">Signal Line Crossing</SelectItem>
                                    <SelectItem value="direction-change">Direction Change</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiPeriod">RSI Length</Label>
                            <Input id="deltaRsiPeriod" type="number" value={tempIndicatorSettings.deltaRsiPeriod} onChange={e => handleIndicatorSettingChange('deltaRsiPeriod', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiWindow">Window</Label>
                            <Input id="deltaRsiWindow" type="number" value={tempIndicatorSettings.deltaRsiWindow} onChange={e => handleIndicatorSettingChange('deltaRsiWindow', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiDegree">Poly. Order</Label>
                            <Input id="deltaRsiDegree" type="number" value={tempIndicatorSettings.deltaRsiDegree} onChange={e => handleIndicatorSettingChange('deltaRsiDegree', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled'} min="1" max="5" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiSignalLength">Signal Length</Label>
                            <Input id="deltaRsiSignalLength" type="number" value={tempIndicatorSettings.deltaRsiSignalLength} onChange={e => handleIndicatorSettingChange('deltaRsiSignalLength', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy !== 'signal-crossing'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiWeight">Weight</Label>
                            <Input id="deltaRsiWeight" type="number" value={tempIndicatorSettings.weights.deltaRsiWeight} onChange={e => handleWeightChange('deltaRsiWeight', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled'} />
                        </div>
                        <div className="col-span-full mt-2 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <Label>Enable RMSE Filter</Label>
                                <p className="text-[0.8rem] text-muted-foreground">Filter signals by fit quality.</p>
                            </div>
                            <Switch checked={tempIndicatorSettings.deltaRsiUseRmseFilter} onCheckedChange={(c) => handleIndicatorSettingChange('deltaRsiUseRmseFilter', c)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deltaRsiRmseThreshold">Fit Error Threshold (%)</Label>
                            <Input id="deltaRsiRmseThreshold" type="number" value={tempIndicatorSettings.deltaRsiRmseThreshold} onChange={e => handleIndicatorSettingChange('deltaRsiRmseThreshold', e.target.value)} disabled={isBotActive || tempIndicatorSettings.deltaRsiStrategy === 'disabled' || !tempIndicatorSettings.deltaRsiUseRmseFilter} min="0" step="0.1" />
                        </div>
                        <div className="col-span-full"></div>


                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <Label className="flex items-center gap-2"><Dna className="h-4 w-4 text-purple-400" /> Price Momentum Oscillator</Label>
                                <p className="text-[0.8rem] text-muted-foreground">Double-smoothed Rate-of-Change oscillator.</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('pmoWeight')}><RotateCcw size={14}/></Button>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="pmoStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.pmoStrategy} onValueChange={(val) => handleIndicatorSettingChange('pmoStrategy', val as PmoStrategy)} disabled={isBotActive}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                    <SelectItem value="signal-cross">Signal Line Cross</SelectItem>
                                    <SelectItem value="zero-cross">Zero Line Cross</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pmoLength1">First Smoothing</Label>
                            <Input id="pmoLength1" type="number" value={tempIndicatorSettings.pmoLength1} onChange={e => handleIndicatorSettingChange('pmoLength1', e.target.value)} disabled={isBotActive || tempIndicatorSettings.pmoStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pmoLength2">Second Smoothing</Label>
                            <Input id="pmoLength2" type="number" value={tempIndicatorSettings.pmoLength2} onChange={e => handleIndicatorSettingChange('pmoLength2', e.target.value)} disabled={isBotActive || tempIndicatorSettings.pmoStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pmoSigLength">Signal Length</Label>
                            <Input id="pmoSigLength" type="number" value={tempIndicatorSettings.pmoSigLength} onChange={e => handleIndicatorSettingChange('pmoSigLength', e.target.value)} disabled={isBotActive || tempIndicatorSettings.pmoStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2 col-span-full">
                            <Label htmlFor="pmoWeight">Weight</Label>
                            <Input id="pmoWeight" type="number" value={tempIndicatorSettings.weights.pmoWeight} onChange={e => handleWeightChange('pmoWeight', e.target.value)} disabled={isBotActive || tempIndicatorSettings.pmoStrategy === 'disabled'} />
                        </div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <Label className="flex items-center gap-2"><Dna className="h-4 w-4 text-purple-400" /> Dynamic Price Oscillator</Label>
                                <p className="text-[0.8rem] text-muted-foreground">Momentum & volatility breakout/reversal.</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('dpoWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dpoStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.dpoStrategy} onValueChange={(val) => handleIndicatorSettingChange('dpoStrategy', val as DpoStrategy)} disabled={isBotActive}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                    <SelectItem value="breakout">Breakout</SelectItem>
                                    <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                                    <SelectItem value="outer-mean-reversion">Outer Mean Reversion</SelectItem>
                                    <SelectItem value="mid-band-cross">Mid-band Cross</SelectItem>
                                    <SelectItem value="inner-band-breakout">Inner Band Breakout</SelectItem>
                                    <SelectItem value="all">Use All Strategies</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dpoLength">Length</Label>
                            <Input id="dpoLength" type="number" value={tempIndicatorSettings.dpoLength} onChange={e => handleIndicatorSettingChange('dpoLength', e.target.value)} disabled={isBotActive || tempIndicatorSettings.dpoStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dpoSmooth">Smooth</Label>
                            <Input id="dpoSmooth" type="number" value={tempIndicatorSettings.dpoSmooth} onChange={e => handleIndicatorSettingChange('dpoSmooth', e.target.value)} disabled={isBotActive || tempIndicatorSettings.dpoStrategy === 'disabled'} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dpoWeight">Weight</Label>
                            <Input id="dpoWeight" type="number" value={tempIndicatorSettings.weights.dpoWeight} onChange={e => handleWeightChange('dpoWeight', e.target.value)} disabled={isBotActive || tempIndicatorSettings.dpoStrategy === 'disabled'} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSqueezeMomentum} onCheckedChange={(c) => handleIndicatorSettingChange('enableSqueezeMomentum', c)} disabled={isBotActive} id="enableSqueezeMomentum" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSqueezeMomentum" className="flex items-center gap-2"><Flame className="h-4 w-4 text-orange-400" /> Squeeze Momentum</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Catch explosive moves after consolidation.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('squeezeMomentumWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 col-span-full">
                           <div className="space-y-2">
                               <Label htmlFor="squeezeMomentumBbLength">BB Length</Label>
                               <Input id="squeezeMomentumBbLength" type="number" value={tempIndicatorSettings.squeezeMomentumBbLength} onChange={e => handleIndicatorSettingChange('squeezeMomentumBbLength', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSqueezeMomentum} />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="squeezeMomentumKcLength">KC Length</Label>
                               <Input id="squeezeMomentumKcLength" type="number" value={tempIndicatorSettings.squeezeMomentumKcLength} onChange={e => handleIndicatorSettingChange('squeezeMomentumKcLength', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSqueezeMomentum} />
                           </div>
                            <div className="space-y-2">
                               <Label htmlFor="squeezeMomentumBbMult">BB Multiplier</Label>
                               <Input id="squeezeMomentumBbMult" type="number" value={tempIndicatorSettings.squeezeMomentumBbMult} onChange={e => handleIndicatorSettingChange('squeezeMomentumBbMult', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSqueezeMomentum} step="0.1" />
                           </div>
                           <div className="space-y-2">
                               <Label htmlFor="squeezeMomentumKcMult">KC Multiplier</Label>
                               <Input id="squeezeMomentumKcMult" type="number" value={tempIndicatorSettings.squeezeMomentumKcMult} onChange={e => handleIndicatorSettingChange('squeezeMomentumKcMult', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSqueezeMomentum} step="0.1" />
                           </div>
                        </div>
                        <div className="space-y-2 col-span-full">
                            <Label htmlFor="squeezeMomentumWeight">Weight</Label>
                            <Input id="squeezeMomentumWeight" type="number" value={tempIndicatorSettings.weights.squeezeMomentumWeight} onChange={e => handleWeightChange('squeezeMomentumWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSqueezeMomentum} />
                        </div>

                        
                        <div className="col-span-full mt-2 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                           <div className="flex items-center gap-2">
                               <Switch checked={tempIndicatorSettings.enableOneTwoThreeReversal} onCheckedChange={(c) => handleIndicatorSettingChange('enableOneTwoThreeReversal', c)} disabled={isBotActive} id="enableOneTwoThreeReversal" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableOneTwoThreeReversal">1-2-3 Reversal Strategy</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Classic trend reversal pattern</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('reversalWeight')}><RotateCcw size={14}/></Button>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reversalStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.oneTwoThreeStrategy} onValueChange={(val) => handleIndicatorSettingChange('oneTwoThreeStrategy', val as OneTwoThreeStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableOneTwoThreeReversal}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="classic">Classic (Confirmation)</SelectItem>
                                    <SelectItem value="aggressive">Aggressive (Anticipation)</SelectItem>
                                    <SelectItem value="2b">2B (Failed Breakout)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reversalWeight">Weight</Label>
                            <Input id="reversalWeight" type="number" value={tempIndicatorSettings.weights.reversalWeight} onChange={e => handleWeightChange('reversalWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableOneTwoThreeReversal} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSuperSignals} onCheckedChange={(c) => handleIndicatorSettingChange('enableSuperSignals', c)} disabled={isBotActive} id="enableSuperSignals" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSuperSignals">Super Signals</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">High/low breakout filter</p>
                                </div>
                            </div>
                             <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('superSignalsWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="superSignalsAtrPeriod">ATR Period</Label>
                            <Input id="superSignalsAtrPeriod" type="number" value={tempIndicatorSettings.superSignalsAtrPeriod} onChange={e => handleIndicatorSettingChange('superSignalsAtrPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSuperSignals}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="superSignalsPeriod">Period</Label>
                            <Input id="superSignalsPeriod" type="number" value={tempIndicatorSettings.superSignalsPeriod} onChange={e => handleIndicatorSettingChange('superSignalsPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSuperSignals}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="superSignalsWeight">Weight</Label>
                            <Input id="superSignalsWeight" type="number" value={tempIndicatorSettings.weights.superSignalsWeight} onChange={e => handleWeightChange('superSignalsWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSuperSignals} />
                        </div>
                        <div className="col-span-full"></div>
                        <div className="col-span-full flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSuperTrendFilter} onCheckedChange={(c) => handleIndicatorSettingChange('enableSuperTrendFilter', c)} disabled={isBotActive || !tempIndicatorSettings.enableSuperSignals} id="enableSuperTrendFilter" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSuperTrendFilter">SuperTrend MA Filter</Label>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="superTrendFilterPeriod">Filter Period</Label>
                            <Input id="superTrendFilterPeriod" type="number" value={tempIndicatorSettings.superTrendFilterPeriod} onChange={e => handleIndicatorSettingChange('superTrendFilterPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSuperSignals || !tempIndicatorSettings.enableSuperTrendFilter}/>
                        </div>
                        <div className="col-span-full"></div>


                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSkyrexReversal} onCheckedChange={(c) => handleIndicatorSettingChange('enableSkyrexReversal', c)} disabled={isBotActive} id="enableSkyrexReversal"/>
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSkyrexReversal" className="flex items-center gap-2"><Cpu className="h-4 w-4" /> Skyrex Reversal</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Confluence-based reversal signals</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('skyrexReversalWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="skyrexTrendPeriod">Trend Period</Label>
                            <Input id="skyrexTrendPeriod" type="number" value={tempIndicatorSettings.skyrexTrendPeriod} onChange={e => handleIndicatorSettingChange('skyrexTrendPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSkyrexReversal} min="2" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="skyrexReversalWeight">Weight</Label>
                            <Input id="skyrexReversalWeight" type="number" value={tempIndicatorSettings.weights.skyrexReversalWeight} onChange={e => handleWeightChange('skyrexReversalWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSkyrexReversal} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 col-span-full">
                           <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                               <div className="space-y-0.5">
                                   <Label>Consolidation Filter</Label>
                               </div>
                               <Switch 
                                 checked={tempIndicatorSettings.skyrexEnableMfi} 
                                 onCheckedChange={(c) => handleIndicatorSettingChange('skyrexEnableMfi', c)} 
                                 disabled={isBotActive || !tempIndicatorSettings.enableSkyrexReversal} 
                               />
                           </div>
                           <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                               <div className="space-y-0.5">
                                   <Label>AO Filter</Label>
                               </div>
                               <Switch checked={tempIndicatorSettings.skyrexEnableAo} onCheckedChange={(c) => handleIndicatorSettingChange('skyrexEnableAo', c)} disabled={isBotActive || !tempIndicatorSettings.enableSkyrexReversal} />
                           </div>
                        </div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableRsi} onCheckedChange={(c) => handleIndicatorSettingChange('enableRsi', c)} disabled={isBotActive} id="enableRsi"/>
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableRsi">RSI</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Relative Strength Index</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('rsiWeight')}><RotateCcw size={14}/></Button>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="rsiStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.rsiStrategy} onValueChange={(val) => handleIndicatorSettingChange('rsiStrategy', val as RsiStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableRsi}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Default (Overbought/Oversold)</SelectItem>
                                    <SelectItem value="crossover50">50 Level Crossover</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rsiPeriod">Period</Label>
                            <Input id="rsiPeriod" type="number" value={tempIndicatorSettings.rsiPeriod} onChange={e => handleIndicatorSettingChange('rsiPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableRsi}/>
                        </div>
                         {tempIndicatorSettings.rsiStrategy === 'default' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="rsiUpperLevel">Upper Level</Label>
                                    <Input id="rsiUpperLevel" type="number" value={tempIndicatorSettings.rsiUpperLevel} onChange={e => handleIndicatorSettingChange('rsiUpperLevel', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableRsi}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rsiLowerLevel">Lower Level</Label>
                                    <Input id="rsiLowerLevel" type="number" value={tempIndicatorSettings.rsiLowerLevel} onChange={e => handleIndicatorSettingChange('rsiLowerLevel', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableRsi}/>
                                </div>
                            </>
                         )}
                         <div className="space-y-2">
                            <Label htmlFor="rsiWeight">Weight</Label>
                            <Input id="rsiWeight" type="number" value={tempIndicatorSettings.weights.rsiWeight} onChange={e => handleWeightChange('rsiWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableRsi} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableStochastic} onCheckedChange={(c) => handleIndicatorSettingChange('enableStochastic', c)} disabled={isBotActive} id="enableStochastic" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableStochastic">Stochastic</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Stochastic Oscillator</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('stochasticWeight')}><RotateCcw size={14}/></Button>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="stochasticStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.stochasticStrategy} onValueChange={(val) => handleIndicatorSettingChange('stochasticStrategy', val as StochasticStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableStochastic}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Default (Overbought/Oversold)</SelectItem>
                                    <SelectItem value="crossover">Crossover</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stochasticKPeriod">%K Period</Label>
                            <Input id="stochasticKPeriod" type="number" value={tempIndicatorSettings.stochasticKPeriod} onChange={e => handleIndicatorSettingChange('stochasticKPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableStochastic}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stochasticDPeriod">%D Period</Label>
                            <Input id="stochasticDPeriod" type="number" value={tempIndicatorSettings.stochasticDPeriod} onChange={e => handleIndicatorSettingChange('stochasticDPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableStochastic}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stochasticSlowing">Slowing</Label>
                            <Input id="stochasticSlowing" type="number" value={tempIndicatorSettings.stochasticSlowing} onChange={e => handleIndicatorSettingChange('stochasticSlowing', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableStochastic}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="stochasticWeight">Weight</Label>
                            <Input id="stochasticWeight" type="number" value={tempIndicatorSettings.weights.stochasticWeight} onChange={e => handleWeightChange('stochasticWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableStochastic} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableMacd} onCheckedChange={(c) => handleIndicatorSettingChange('enableMacd', c)} disabled={isBotActive} id="enableMacd" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableMacd">MACD</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Moving Average Convergence Divergence</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('macdWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="macdFastPeriod">Fast Period</Label>
                            <Input id="macdFastPeriod" type="number" value={tempIndicatorSettings.macdFastPeriod} onChange={e => handleIndicatorSettingChange('macdFastPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMacd}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="macdSlowPeriod">Slow Period</Label>
                            <Input id="macdSlowPeriod" type="number" value={tempIndicatorSettings.macdSlowPeriod} onChange={e => handleIndicatorSettingChange('macdSlowPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMacd}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="macdSignalPeriod">Signal Period</Label>
                            <Input id="macdSignalPeriod" type="number" value={tempIndicatorSettings.macdSignalPeriod} onChange={e => handleIndicatorSettingChange('macdSignalPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMacd}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="macdWeight">Weight</Label>
                            <Input id="macdWeight" type="number" value={tempIndicatorSettings.weights.macdWeight} onChange={e => handleWeightChange('macdWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMacd} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                           <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableBollinger} onCheckedChange={(c) => handleIndicatorSettingChange('enableBollinger', c)} disabled={isBotActive} id="enableBollinger" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableBollinger">Bollinger Bands</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Volatility Bands</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('bollingerWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bollingerStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.bollingerStrategy} onValueChange={(val) => handleIndicatorSettingChange('bollingerStrategy', val as BollingerStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableBollinger}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Reversal from Bands</SelectItem>
                                    <SelectItem value="midBandCrossover">Mid-Band Crossover</SelectItem>
                                    <SelectItem value="midBandBounce">Middle Band Bounce</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bollingerPeriod">Period</Label>
                            <Input id="bollingerPeriod" type="number" value={tempIndicatorSettings.bollingerPeriod} onChange={e => handleIndicatorSettingChange('bollingerPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableBollinger}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bollingerStdDev">Std. Deviation</Label>
                            <Input id="bollingerStdDev" type="number" value={tempIndicatorSettings.bollingerStdDev} onChange={e => handleIndicatorSettingChange('bollingerStdDev', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableBollinger} step="0.1"/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bollingerWeight">Weight</Label>
                            <Input id="bollingerWeight" type="number" value={tempIndicatorSettings.weights.bollingerWeight} onChange={e => handleWeightChange('bollingerWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableBollinger} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableEma} onCheckedChange={(c) => handleIndicatorSettingChange('enableEma', c)} disabled={isBotActive} id="enableEma" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableEma">EMA</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Exponential Moving Average</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('emaWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="emaPeriod">EMA Period</Label>
                            <Input id="emaPeriod" type="number" value={tempIndicatorSettings.emaPeriod} onChange={e => handleIndicatorSettingChange('emaPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEma}/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="emaWeight">Weight</Label>
                            <Input id="emaWeight" type="number" value={tempIndicatorSettings.weights.emaWeight} onChange={e => handleWeightChange('emaWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableEma} />
                        </div>
                        <div className="col-span-full"></div>

                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableSma} onCheckedChange={(c) => handleIndicatorSettingChange('enableSma', c)} disabled={isBotActive} id="enableSma" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableSma">SMA</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Simple Moving Average</p>                            </div>
                            </div>
                             <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('smaWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="smaPeriod">SMA Period</Label>
                            <Input id="smaPeriod" type="number" value={tempIndicatorSettings.smaPeriod} onChange={e => handleIndicatorSettingChange('smaPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSma}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="smaWeight">Weight</Label>
                            <Input id="smaWeight" type="number" value={tempIndicatorSettings.weights.smaWeight} onChange={e => handleWeightChange('smaWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableSma} />
                        </div>
                        <div className="col-span-full"></div>
                        
                        <div className="col-span-full mt-4 flex items-center justify-between rounded-lg border p-3 shadow-sm">
                             <div className="flex items-center gap-2">
                                <Switch checked={tempIndicatorSettings.enableMomentum} onCheckedChange={(c) => handleIndicatorSettingChange('enableMomentum', c)} disabled={isBotActive} id="enableMomentum" />
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableMomentum">Momentum</Label>
                                    <p className="text-[0.8rem] text-muted-foreground">Rate of Price Change</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResetIndicator('momentumWeight')}><RotateCcw size={14}/></Button>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="momentumStrategy">Strategy</Label>
                            <Select value={tempIndicatorSettings.momentumStrategy} onValueChange={(val) => handleIndicatorSettingChange('momentumStrategy', val as MomentumStrategy)} disabled={isBotActive || !tempIndicatorSettings.enableMomentum}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="positive-negative">Positive/Negative</SelectItem>
                                    <SelectItem value="zero-crossing">Zero-Line Cross</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="momentumPeriod">Momentum Period</Label>                                <Input id="momentumPeriod" type="number" value={tempIndicatorSettings.momentumPeriod} onChange={e => handleIndicatorSettingChange('momentumPeriod', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMomentum}/>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="momentumWeight">Weight</Label>
                            <Input id="momentumWeight" type="number" value={tempIndicatorSettings.weights.momentumWeight} onChange={e => handleWeightChange('momentumWeight', e.target.value)} disabled={isBotActive || !tempIndicatorSettings.enableMomentum} />
                        </div>
                  </div>
              </ScrollArea>
              <SheetFooter className="p-6 border-t bg-card">
                  <Button onClick={resetIndicatorSettings} variant="outline" disabled={isBotActive}>Reset All to Default</Button>
                  <Button onClick={saveIndicatorSettings} disabled={isBotActive}>Save Changes</Button>
              </SheetFooter>
          </SheetContent>
        </Sheet>
    </div>
  );
}

export default Home;
