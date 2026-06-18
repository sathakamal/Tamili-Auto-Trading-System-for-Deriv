

import type { PredictionResult, IndicatorSignal, Analysis, IndicatorSettings, Candle, SignalStrength, StochasticStrategy, FibonacciResult, FibonacciStrategy, PmoStrategy, DeltaRsiStrategy } from './types';
import { calculateOneTwoThreeReversal } from './indicators/one-two-three-reversal';
import { calculateSuperSignal } from './indicators/super-signal';
import { calculateFractalTrend } from './indicators/fractal-trend';
import { calculateSkyrexReversal } from './indicators/skyrex-reversal';
import { calculateFractalWave } from './indicators/fractal-wave';
import { calculateSqueezeMomentum } from './indicators/squeeze-momentum';
import { calculateDPO } from './indicators/dynamic-price-oscillator';
import { calculatePMO } from './indicators/pmo';
import { calculateDeltaRsi } from './indicators/delta-rsi';


// --- Technical Indicator Calculations ---

function calculateRSI(candles: Candle[], period: number): { values: number[], latest: number } {
    if (candles.length < period + 1) return { values: [], latest: 50 };
    const closePrices = candles.map(c => c.close);
    
    const rsiValues = [];
    let avgGain = 0;
    let avgLoss = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i-1];
        if (change > 0) {
            avgGain += change;
        } else {
            avgLoss -= change;
        }
    }
    
    avgGain /= period;
    avgLoss /= period;
    
    for (let i = period + 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i-1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
    }
    
    return {
        values: rsiValues,
        latest: rsiValues[rsiValues.length - 1] || 50,
    };
}


function calculateSMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1]?.close || 0;
    const slice = candles.slice(-period);
    return slice.reduce((a, b) => a + b.close, 0) / period;
}

function calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1]?.close || 0;
    const closePrices = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);
    
    let ema = closePrices.slice(0, period).reduce((a, b) => a + b, 0) / period; // Start with SMA

    for (let i = period; i < closePrices.length; i++) {
        ema = (closePrices[i] - ema) * multiplier + ema;
    }
    return ema;
}

function calculateStochastic(candles: Candle[], kPeriod: number, dPeriod: number, slowing: number): { kValues: number[], dValues: number[] } {
    if (candles.length < kPeriod + dPeriod + slowing - 2) return { kValues: [], dValues: [] };

    const kValuesRaw: number[] = [];
    
    for (let i = kPeriod -1; i < candles.length; i++) {
        const slice = candles.slice(i - kPeriod + 1, i + 1);
        const high = Math.max(...slice.map(c => c.high));
        const low = Math.min(...slice.map(c => c.low));
        const currentClose = candles[i].close;
        
        if (high === low) {
            kValuesRaw.push(50);
        } else {
            kValuesRaw.push(((currentClose - low) / (high - low)) * 100);
        }
    }

    const smoothedKValues: number[] = [];
    for (let i = slowing - 1; i < kValuesRaw.length; i++) {
        const slice = kValuesRaw.slice(i - slowing + 1, i + 1);
        smoothedKValues.push(slice.reduce((a, b) => a + b, 0) / slowing);
    }
    
    const dValues: number[] = [];
    for (let i = dPeriod - 1; i < smoothedKValues.length; i++) {
        const slice = smoothedKValues.slice(i - dPeriod + 1, i + 1);
        dValues.push(slice.reduce((a, b) => a + b, 0) / dPeriod);
    }

    // Align dValues with smoothedKValues
    const alignedDValues = new Array(smoothedKValues.length - dValues.length).fill(NaN).concat(dValues);

    return {
        kValues: smoothedKValues,
        dValues: alignedDValues,
    };
}


function calculateMACD(candles: Candle[], fastPeriod: number, slowPeriod: number, signalPeriod: number): { macd: number, signal: number, histogram: number } {
    const prices = candles.map(c => c.close);
    if (prices.length < slowPeriod + signalPeriod) return { macd: 0, signal: 0, histogram: 0 };
    
    const emaFastValues: number[] = [];
    const emaSlowValues: number[] = [];

    let fastEma = prices.slice(0, fastPeriod).reduce((a,b)=>a+b,0) / fastPeriod;
    let slowEma = prices.slice(0, slowPeriod).reduce((a,b)=>a+b,0) / slowPeriod;

    const fastMultiplier = 2 / (fastPeriod + 1);
    const slowMultiplier = 2 / (slowPeriod + 1);

    for(let i=fastPeriod; i<prices.length; i++) {
        fastEma = (prices[i] - fastEma) * fastMultiplier + fastEma;
        emaFastValues.push(fastEma);
    }

    for(let i=slowPeriod; i<prices.length; i++) {
        slowEma = (prices[i] - slowEma) * slowMultiplier + slowEma;
        emaSlowValues.push(slowEma);
    }
    
    const macdLine = emaFastValues.slice(emaFastValues.length - emaSlowValues.length).map((val, index) => val - emaSlowValues[index]);
    
    const signalMultiplier = 2 / (signalPeriod + 1);
    if(macdLine.length < signalPeriod) return { macd: 0, signal: 0, histogram: 0 };
    
    let signalEma = macdLine.slice(0, signalPeriod).reduce((a,b)=>a+b,0) / signalPeriod;

    const signalLine: number[] = [];
    
    for (let i = signalPeriod; i < macdLine.length; i++) {
        signalEma = (macdLine[i] - signalEma) * signalMultiplier + signalEma;
        signalLine.push(signalEma);
    }
    
    const macd = macdLine[macdLine.length - 1] || 0;
    const signal = signalLine[signalLine.length - 1] || 0;
    const histogram = macd - signal;

    return { macd, signal, histogram };
}

function calculateBollingerBands(candles: Candle[], period: number, stdDev: number): { upper: number, middle: number, lower: number, allMiddles: number[] } {
    if (candles.length < period) return { upper: 0, middle: 0, lower: 0, allMiddles: [] };

    const closePrices = candles.map(c => c.close);
    const allMiddles: number[] = [];
    
    for (let i = period - 1; i < closePrices.length; i++) {
        const slice = closePrices.slice(i - period + 1, i + 1);
        const smaVal = slice.reduce((sum, price) => sum + price, 0) / period;
        allMiddles.push(smaVal);
    }

    const latestMiddle = allMiddles[allMiddles.length - 1] || 0;
    const latestSlice = closePrices.slice(-period);
    const variance = latestSlice.reduce((sum, price) => sum + Math.pow(price - latestMiddle, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
        upper: latestMiddle + (std * stdDev),
        middle: latestMiddle,
        lower: latestMiddle - (std * stdDev),
        allMiddles,
    };
}


function calculateVolatility(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;
    const slice = candles.slice(-period);
    const prices = slice.map(c => c.close);
    const highestHigh = Math.max(...slice.map(c => c.high));
    const lowestLow = Math.min(...slice.map(c => c.low));
    const lastClose = prices[prices.length - 1];

    if (lastClose === 0) return 0;

    // Calculate volatility as the percentage range of the lookback period
    return ((highestHigh - lowestLow) / lastClose) * 100;
}


function getTrendFromCandles(candles: Candle[], period: number): 'Uptrend' | 'Downtrend' | 'Sideways' {
    if (candles.length < period) return 'Sideways';
    
    const longSma = calculateSMA(candles, period);
    const shortSma = calculateSMA(candles, Math.floor(period / 2));
    const price = candles[candles.length - 1].close;

    if (price > longSma && shortSma > longSma) return 'Uptrend';
    if (price < longSma && shortSma < longSma) return 'Downtrend';
    return 'Sideways';
}

function calculateSignalStrength(score: number): SignalStrength {
    if (score >= 40) return 'Strong Buy';
    if (score >= 10) return 'Buy';
    if (score <= -40) return 'Strong Sell';
    if (score <= -10) return 'Sell';
    return 'Neutral';
}

function calculateFibonacciReversal(candles: Candle[], trend: 'Uptrend' | 'Downtrend', strategy: FibonacciStrategy): { signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL', fibResult: FibonacciResult | null } {
    const lookback = 100;
    if (candles.length < lookback) return { signal: 'NEUTRAL', fibResult: null };

    const recentCandles = candles.slice(-lookback);
    let swingHigh = recentCandles[0];
    let swingLow = recentCandles[0];

    for (const candle of recentCandles) {
        if (candle.high > swingHigh.high) swingHigh = candle;
        if (candle.low < swingLow.low) swingLow = candle;
    }

    const highPrice = swingHigh.high;
    const lowPrice = swingLow.low;
    const priceRange = highPrice - lowPrice;
    if (priceRange === 0) return { signal: 'NEUTRAL', fibResult: null };

    const fibLevels = [1, 0.79, 0.706, 0.618, 0];
    const fibResult: FibonacciResult = {
        levels: fibLevels.map(level => ({
            level,
            price: trend === 'Uptrend' ? highPrice - priceRange * (1 - level) : lowPrice + priceRange * (1 - level)
        })),
        trend,
    };
    
    const currentCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    
    if (strategy === 'golden-zone') {
        const goldenZoneUpper = Math.max(fibResult.levels.find(l => l.level === 0.79)!.price, fibResult.levels.find(l => l.level === 0.618)!.price);
        const goldenZoneLower = Math.min(fibResult.levels.find(l => l.level === 0.79)!.price, fibResult.levels.find(l => l.level === 0.618)!.price);
        
        if (trend === 'Uptrend') {
            if (prevCandle.low <= goldenZoneUpper && currentCandle.close > goldenZoneLower) {
                signal = 'BULLISH';
            }
        }

        if (trend === 'Downtrend') {
            if (prevCandle.high >= goldenZoneLower && currentCandle.close < goldenZoneUpper) {
                signal = 'BEARISH';
            }
        }
    } else if (strategy === 'breakout') {
        const breakoutHigh = highPrice;
        const breakoutLow = lowPrice;
        
        if (trend === 'Uptrend' && prevCandle.close <= breakoutHigh && currentCandle.close > breakoutHigh) {
            signal = 'BULLISH';
        }
        if (trend === 'Downtrend' && prevCandle.close >= breakoutLow && currentCandle.close < breakoutLow) {
            signal = 'BEARISH';
        }
    }


    return { signal, fibResult };
}

// --- Main Analysis Engine ---

export function analyzeMarketAndPredict(
    candleHistory: Candle[], 
    settings: IndicatorSettings,
    longTermCandleHistory?: Candle[]
): PredictionResult {
    const { weights } = settings;
    let score = 0;
    const signals: IndicatorSignal[] = [];
    let allArrows: PredictionResult['arrows'] = [];
    let allTrendLines: PredictionResult['trendLines'] = [];
    let fibonacciResult: FibonacciResult | null = null;
    let analysisReason: PredictionResult['reason'] = undefined;
    
    const noIndicatorsEnabled = ![
        settings.enableRsi,
        settings.enableStochastic,
        settings.enableMacd,
        settings.enableBollinger,
        settings.enableEma,
        settings.enableSma,
        settings.enableMomentum,
        settings.enableOneTwoThreeReversal,
        settings.enableSuperSignals,
        settings.enableFractalTrend,
        settings.enableSkyrexReversal,
        settings.enableFibonacci,
        settings.enableFractalWave,
        settings.enableSqueezeMomentum,
        settings.dpoStrategy !== 'disabled',
        settings.pmoStrategy !== 'disabled',
        settings.deltaRsiStrategy !== 'disabled',
    ].some(enabled => enabled);

    const trendAnalysisSlice = candleHistory.slice(-settings.trendPeriod);
    const trendDirection = getTrendFromCandles(trendAnalysisSlice, settings.trendPeriod);

    if ((noIndicatorsEnabled && !settings.enableMultiTimeframeAnalysis) || candleHistory.length < 2) {
        return {
            prediction: 'FALL',
            confidence: 0,
            score: 0,
            signalStrength: 'Neutral',
            signals: [],
            arrows: [],
            trendLines: [],
            fibonacci: null,
            analysis: { trendDirection, momentum: 0, volatility: 0 },
            reason: 'Insufficient Data'
        };
    }
    
    const currentPrice = candleHistory[candleHistory.length - 1].close;

    // --- MASTER FILTERS (Calculated first) ---
    let masterTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    
    if (settings.enableSuperSignals) {
        const superSignalResult = calculateSuperSignal(candleHistory, {
            period: settings.superSignalsPeriod,
            atrPeriod: settings.superSignalsAtrPeriod,
        });
        const latestSuperSignal = superSignalResult.signals[superSignalResult.signals.length - 1];
        masterTrend = latestSuperSignal ? latestSuperSignal.signal : 'NEUTRAL';
        allArrows = [...allArrows, ...superSignalResult.arrows];
        signals.push({ name: 'Super Signals', value: latestSuperSignal.value, signal: masterTrend });
        if (masterTrend === 'BULLISH') score += weights.superSignalsWeight;
        if (masterTrend === 'BEARISH') score -= weights.superSignalsWeight;
    } else {
        signals.push({ name: 'Super Signals', value: 0, signal: 'NEUTRAL' });
    }

    if (settings.enableFractalTrend) {
        const fractalTrendResult = calculateFractalTrend(candleHistory, {
          period: settings.fractalTrendPeriod,
          atrMultiplier: 0.2
        });
        const latestFractalSignal = fractalTrendResult.signals[fractalTrendResult.signals.length - 1];
        // If Super Signals is not active, Fractal Trend can set the master trend
        if (masterTrend === 'NEUTRAL' && latestFractalSignal) {
            masterTrend = latestFractalSignal.signal;
        }
        allArrows = [...allArrows, ...fractalTrendResult.arrows];
        allTrendLines = [...allTrendLines, ...fractalTrendResult.trendLines];
        signals.push({ name: 'Fractal Trend', value: latestFractalSignal.value, signal: latestFractalSignal.signal });
        if (latestFractalSignal.signal === 'BULLISH') score += weights.fractalTrendWeight;
        if (latestFractalSignal.signal === 'BEARISH') score -= weights.fractalTrendWeight;
    } else {
        signals.push({ name: 'Fractal Trend', value: 0, signal: 'NEUTRAL' });
    }


    const applyFilter = (signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): boolean => {
        // If a filter has made a signal neutral, it fails the filter check immediately.
        if (signal === 'NEUTRAL') {
            return false;
        }
        // If no master trend is active, all signals pass.
        if (masterTrend === 'NEUTRAL') {
            return true;
        }
        // Otherwise, the signal must match the master trend.
        return signal === masterTrend;
    };

    // Delta-RSI
    if (settings.deltaRsiStrategy !== 'disabled') {
        const deltaRsiResult = calculateDeltaRsi(candleHistory, {
            rsiLength: settings.deltaRsiPeriod,
            window: settings.deltaRsiWindow,
            degree: settings.deltaRsiDegree,
            signalLength: settings.deltaRsiSignalLength,
            strategy: settings.deltaRsiStrategy,
            useRmseFilter: settings.deltaRsiUseRmseFilter,
            rmseThreshold: settings.deltaRsiRmseThreshold,
        });
        allArrows = [...allArrows, ...deltaRsiResult.arrows];
        const deltaRsiSignal = deltaRsiResult.signal;

        if (deltaRsiResult.reason === 'RMSE Filtered') {
            if (!analysisReason) analysisReason = 'D-RSI signal filtered out due to high fit error (RMSE).';
        }
        
        if (applyFilter(deltaRsiSignal)) {
            if (deltaRsiSignal === 'BULLISH') score += weights.deltaRsiWeight;
            if (deltaRsiSignal === 'BEARISH') score -= weights.deltaRsiWeight;
        }
        signals.push({ name: 'D-RSI', value: deltaRsiResult.value, signal: deltaRsiSignal });
    } else {
        signals.push({ name: 'D-RSI', value: 0, signal: 'NEUTRAL' });
    }

    // Price Momentum Oscillator (PMO)
    if (settings.pmoStrategy !== 'disabled') {
        const pmoResult = calculatePMO(candleHistory, {
            strategy: settings.pmoStrategy,
            length1: settings.pmoLength1,
            length2: settings.pmoLength2,
            sigLength: settings.pmoSigLength,
        });
        allArrows = [...allArrows, ...pmoResult.arrows];
        const pmoSignal = pmoResult.signal;
        if (applyFilter(pmoSignal)) {
            if (pmoSignal === 'BULLISH') score += weights.pmoWeight;
            if (pmoSignal === 'BEARISH') score -= weights.pmoWeight;
        }
        signals.push({ name: 'PMO', value: pmoResult.value, signal: pmoSignal });
    } else {
        signals.push({ name: 'PMO', value: 0, signal: 'NEUTRAL' });
    }

    // New Skyrex Reversal Indicator
    if (settings.enableSkyrexReversal) {
        const skyrexResult = calculateSkyrexReversal(candleHistory, {
            enableMfi: settings.skyrexEnableMfi,
            enableAo: settings.skyrexEnableAo,
            trendPeriod: settings.skyrexTrendPeriod,
        });
        allArrows = [...allArrows, ...skyrexResult.arrows];
        const skyrexSignal = skyrexResult.signal;
        if (applyFilter(skyrexSignal)) {
             if (skyrexSignal === 'BULLISH') score += weights.skyrexReversalWeight;
             if (skyrexSignal === 'BEARISH') score -= weights.skyrexReversalWeight;
        }
        signals.push({ name: 'Skyrex Reversal', value: skyrexSignal === 'BULLISH' ? 1 : (skyrexSignal === 'BEARISH' ? -1 : 0), signal: skyrexSignal });
    } else {
        signals.push({ name: 'Skyrex Reversal', value: 0, signal: 'NEUTRAL' });
    }

    // New Fractal Wave Indicator
    if (settings.enableFractalWave) {
        const fractalWaveResult = calculateFractalWave(candleHistory, {
            fractalPeriod: settings.fractalTrendPeriod, // Use same period for consistency
            fastRsiPeriod: settings.fractalWaveFastRsiPeriod,
            fastRsiUpper: settings.fractalWaveFastRsiUpper,
            fastRsiLower: settings.fractalWaveFastRsiLower,
        });
        allArrows = [...allArrows, ...fractalWaveResult.arrows];
        const fractalWaveSignal = fractalWaveResult.signal;
        // This is a trend-following strategy, so we don't apply the master filter
        if (fractalWaveSignal === 'BULLISH') score += weights.fractalWaveWeight;
        if (fractalWaveSignal === 'BEARISH') score -= weights.fractalWaveWeight;
        signals.push({ name: 'Fractal Wave', value: fractalWaveSignal === 'BULLISH' ? 1 : (fractalWaveSignal === 'BEARISH' ? -1 : 0), signal: fractalWaveSignal });
    } else {
        signals.push({ name: 'Fractal Wave', value: 0, signal: 'NEUTRAL' });
    }

    // New Squeeze Momentum Indicator
    if (settings.enableSqueezeMomentum) {
        const squeezeResult = calculateSqueezeMomentum(candleHistory, {
            bbLength: settings.squeezeMomentumBbLength,
            bbMult: settings.squeezeMomentumBbMult,
            kcLength: settings.squeezeMomentumKcLength,
            kcMult: settings.squeezeMomentumKcMult,
        });
        allArrows = [...allArrows, ...squeezeResult.arrows];
        const squeezeSignal = squeezeResult.signal;
        if (applyFilter(squeezeSignal)) {
            if (squeezeSignal === 'BULLISH') score += weights.squeezeMomentumWeight;
            if (squeezeSignal === 'BEARISH') score -= weights.squeezeMomentumWeight;
        }
        signals.push({ name: 'Squeeze', value: squeezeResult.value, signal: squeezeSignal });
    } else {
        signals.push({ name: 'Squeeze', value: 0, signal: 'NEUTRAL' });
    }
    
    // New Dynamic Price Oscillator
    if (settings.dpoStrategy !== 'disabled') {
        const dpoResult = calculateDPO(candleHistory, {
            length: settings.dpoLength,
            smooth: settings.dpoSmooth,
            strategy: settings.dpoStrategy,
        });
        allArrows = [...allArrows, ...dpoResult.arrows];
        const dpoSignal = dpoResult.signal;
        if (applyFilter(dpoSignal)) {
            if (dpoSignal === 'BULLISH') score += weights.dpoWeight;
            if (dpoSignal === 'BEARISH') score -= weights.dpoWeight;
        }
        signals.push({ name: 'DPO', value: dpoResult.value, signal: dpoSignal });
    } else {
        signals.push({ name: 'DPO', value: 0, signal: 'NEUTRAL' });
    }


    // 1. RSI
    if (settings.enableRsi) {
        const rsiResult = calculateRSI(candleHistory, settings.rsiPeriod);
        const rsi = rsiResult.latest;
        let rsiSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        
        if (settings.rsiStrategy === 'crossover50') {
            const prevRsi = rsiResult.values[rsiResult.values.length - 2] || 50;
            if (rsi > 50 && prevRsi <= 50) rsiSignal = 'BULLISH';
            if (rsi < 50 && prevRsi >= 50) rsiSignal = 'BEARISH';
        } else {
            if (rsi < settings.rsiLowerLevel) rsiSignal = 'BULLISH';
            if (rsi > settings.rsiUpperLevel) rsiSignal = 'BEARISH';
        }

        if (applyFilter(rsiSignal)) {
            if (rsiSignal === 'BULLISH') score += weights.rsiWeight;
            if (rsiSignal === 'BEARISH') score -= weights.rsiWeight;
        }
        signals.push({ name: 'RSI', value: rsi, signal: rsiSignal });
    } else {
        signals.push({ name: 'RSI', value: 0, signal: 'NEUTRAL' });
    }

    // 2. Stochastic
    if (settings.enableStochastic) {
        const { kValues, dValues } = calculateStochastic(candleHistory, settings.stochasticKPeriod, settings.stochasticDPeriod, settings.stochasticSlowing);
        let stochSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        
        const stochasticK = kValues[kValues.length - 1] || 50;
        const stochasticD = dValues[dValues.length - 1] || 50;
        
        if(settings.stochasticStrategy === 'crossover') {
             let lastSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
             for(let i=1; i < kValues.length; i++) {
                if (kValues[i-1] <= dValues[i-1] && kValues[i] > dValues[i]) {
                    lastSignal = 'BULLISH';
                }
                 if (kValues[i-1] >= dValues[i-1] && kValues[i] < dValues[i]) {
                    lastSignal = 'BEARISH';
                }
             }
             stochSignal = lastSignal;
        } else { // default strategy
            if (stochasticK < settings.stochasticLowerLevel && stochasticD < settings.stochasticLowerLevel && stochasticK > stochasticD) {
                stochSignal = 'BULLISH';
            } else if (stochasticK > settings.stochasticUpperLevel && stochasticD > settings.stochasticUpperLevel && stochasticK < stochasticD) {
                stochSignal = 'BEARISH';
            }
        }

        if (applyFilter(stochSignal)) {
             if (stochSignal === 'BULLISH') score += weights.stochasticWeight;
             if (stochSignal === 'BEARISH') score -= weights.stochasticWeight;
        }
        signals.push({ name: 'Stochastic', value: stochasticK, signal: stochSignal });
    } else {
        signals.push({ name: 'Stochastic', value: 0, signal: 'NEUTRAL' });
    }

    // 3. MACD
    if (settings.enableMacd) {
        const { macd, signal: macdSignalVal, histogram: macdHistogram } = calculateMACD(candleHistory, settings.macdFastPeriod, settings.macdSlowPeriod, settings.macdSignalPeriod);
        const macdSignal = macd > macdSignalVal ? 'BULLISH' : 'BEARISH';
        
        if (applyFilter(macdSignal)) {
            if (macdSignal === 'BULLISH') score += weights.macdWeight;
            else score -= weights.macdWeight;
        }
        signals.push({ name: 'MACD', value: macdHistogram, signal: macdSignal });
    } else {
        signals.push({ name: 'MACD', value: 0, signal: 'NEUTRAL' });
    }

    // 4. Bollinger Bands
    if (settings.enableBollinger) {
        const bb = calculateBollingerBands(candleHistory, settings.bollingerPeriod, settings.bollingerStdDev);
        const prevPrice = candleHistory[candleHistory.length - 2]?.close || currentPrice;
        let bbSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let bbValue = 50;
        
        if (settings.bollingerStrategy === 'midBandCrossover') {
             const prevMiddle = bb.allMiddles[bb.allMiddles.length - 2] || bb.middle;
             if (currentPrice > bb.middle && prevPrice <= prevMiddle) bbSignal = 'BULLISH';
             if (currentPrice < bb.middle && prevPrice >= prevMiddle) bbSignal = 'BEARISH';
             bbValue = bb.middle;
        } else { // 'default' strategy
            if (currentPrice < bb.lower) bbSignal = 'BULLISH';
            if (currentPrice > bb.upper) bbSignal = 'BEARISH';
            const pos = (currentPrice - bb.lower) / (bb.upper - bb.lower) * 100;
            bbValue = isNaN(pos) ? 50 : pos;
        }

        if (applyFilter(bbSignal)) {
            if (bbSignal === 'BULLISH') score += weights.bollingerWeight;
            if (bbSignal === 'BEARISH') score -= weights.bollingerWeight;
        }
        signals.push({ name: 'Bollinger', value: bbValue, signal: bbSignal });
    } else {
         signals.push({ name: 'Bollinger', value: 0, signal: 'NEUTRAL' });
    }

    // 5. EMA
    if (settings.enableEma) {
        const ema = calculateEMA(candleHistory, settings.emaPeriod);
        const emaSignal = currentPrice > ema ? 'BULLISH' : 'BEARISH';
        if(applyFilter(emaSignal)) {
            if (emaSignal === 'BULLISH') score += weights.emaWeight;
            else score -= weights.emaWeight;
        }
        signals.push({ name: 'EMA', value: ema, signal: emaSignal });
    } else {
        signals.push({ name: 'EMA', value: 0, signal: 'NEUTRAL' });
    }

    // 6. SMA
    if (settings.enableSma) {
        const sma = calculateSMA(candleHistory, settings.smaPeriod);
        const smaSignal = currentPrice > sma ? 'BULLISH' : 'BEARISH';
        if(applyFilter(smaSignal)) {
            if (smaSignal === 'BULLISH') score += weights.smaWeight;
            else score -= weights.smaWeight;
        }
        signals.push({ name: 'SMA', value: sma, signal: smaSignal });
    } else {
        signals.push({ name: 'SMA', value: 0, signal: 'NEUTRAL' });
    }
    
    // 7. Recent Momentum
    if (settings.enableMomentum && candleHistory.length >= settings.momentumPeriod) {
        const recentCandles = candleHistory.slice(-settings.momentumPeriod);
        const momentum = recentCandles[recentCandles.length - 1].close - recentCandles[0].close;
        const momSignal = momentum > 0 ? 'BULLISH' : 'BEARISH';
        if(applyFilter(momSignal)) {
            if (momSignal === 'BULLISH') score += weights.momentumWeight;
            else score -= weights.momentumWeight;
        }
        signals.push({ name: 'Momentum', value: momentum, signal: momSignal });
    } else {
        signals.push({ name: 'Momentum', value: 0, signal: 'NEUTRAL' });
    }

    // 8. 1-2-3 Reversal
    if (settings.enableOneTwoThreeReversal) {
        const reversalSignal = calculateOneTwoThreeReversal(candleHistory, settings.oneTwoThreeStrategy);
        const strategyName = settings.oneTwoThreeStrategy === '2b' ? '2B' : (settings.oneTwoThreeStrategy.charAt(0).toUpperCase() + settings.oneTwoThreeStrategy.slice(1));
        const indicatorName = `1-2-3-${strategyName}` as IndicatorSignal['name'];
        let revSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let revValue = 0;

        if (reversalSignal) {
            if (reversalSignal.type === 'buy') {
                revSignal = 'BULLISH';
                revValue = 1;
            } else {
                revSignal = 'BEARISH';
                revValue = -1;
            }
        }
        
        if (applyFilter(revSignal)) {
            if (revSignal === 'BULLISH') score += weights.reversalWeight;
            if (revSignal === 'BEARISH') score -= weights.reversalWeight;
        }
        signals.push({ name: indicatorName, value: revValue, signal: revSignal });
    } else {
        signals.push({ name: '1-2-3-Classic', value: 0, signal: 'NEUTRAL'});
        signals.push({ name: '1-2-3-Aggressive', value: 0, signal: 'NEUTRAL'});
        signals.push({ name: '1-2-3-2B', value: 0, signal: 'NEUTRAL'});
    }
    
    // 9. Multi-Timeframe Analysis
    if (settings.enableMultiTimeframeAnalysis && longTermCandleHistory && longTermCandleHistory.length >= 20) {
        const mtfSettings = { ...settings, enableMultiTimeframeAnalysis: false };
        const mtfResult = analyzeMarketAndPredict(longTermCandleHistory, mtfSettings, undefined);
        const mtfScore = mtfResult.score;
        const mtfSignal = mtfScore >= 10 ? 'BULLISH' : (mtfScore <= -10 ? 'BEARISH' : 'NEUTRAL');

        if (applyFilter(mtfSignal)) {
             if (mtfSignal === 'BULLISH') score += weights.multiTimeframeAnalysisWeight;
             if (mtfSignal === 'BEARISH') score -= weights.multiTimeframeAnalysisWeight;
        }
        signals.push({ name: 'MTF Trend', value: mtfScore, signal: mtfSignal });

    } else {
        signals.push({ name: 'MTF Trend', value: 0, signal: 'NEUTRAL' });
    }
    
    // 10. Short-Term Trend Analysis
    if (settings.enableTrendAnalysis) {
        let trendSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (trendDirection === 'Uptrend') trendSignal = 'BULLISH';
        if (trendDirection === 'Downtrend') trendSignal = 'BEARISH';
        
        if(applyFilter(trendSignal)) {
             if (trendSignal === 'BULLISH') score += weights.trendAnalysisWeight;
             if (trendSignal === 'BEARISH') score -= weights.trendAnalysisWeight;
        }
        signals.push({ name: 'Trend', value: trendSignal === 'BULLISH' ? 1 : (trendSignal === 'BEARISH' ? -1 : 0), signal: trendSignal });
    } else {
        signals.push({ name: 'Trend', value: 0, signal: 'NEUTRAL' });
    }

    // 11. Fibonacci Reversal
    if (settings.enableFibonacci && trendDirection !== 'Sideways') {
        const { signal: fibSignal, fibResult } = calculateFibonacciReversal(candleHistory, trendDirection, settings.fibonacciStrategy);
        fibonacciResult = fibResult; // Assign to outer scope
        if (applyFilter(fibSignal)) {
            if (fibSignal === 'BULLISH') score += weights.fibonacciWeight;
            if (fibSignal === 'BEARISH') score -= weights.fibonacciWeight;
        }
        signals.push({ name: 'Fibonacci', value: fibSignal === 'NEUTRAL' ? 0 : 1, signal: fibSignal });
    } else {
        signals.push({ name: 'Fibonacci', value: 0, signal: 'NEUTRAL' });
    }

    const momentumPercent = trendAnalysisSlice.length > 1 
        ? ((trendAnalysisSlice[trendAnalysisSlice.length-1].close - trendAnalysisSlice[0].close) / trendAnalysisSlice[0].close * 100) 
        : 0;

    const volatility = calculateVolatility(candleHistory, 50);
    signals.push({ name: 'Volatility', value: volatility, signal: 'NEUTRAL'});

    const analysis: Analysis = {
        trendDirection: trendDirection,
        momentum: momentumPercent,
        volatility: volatility,
    };
    
    let finalPrediction = score >= 0 ? 'RISE' : 'FALL';
    let confidence = Math.min(95, Math.abs(score));
    let reason: PredictionResult['reason'] = analysisReason;
    
    if (settings.enableVolatilityFilter && analysis.volatility < (settings.minVolatility || 0)) {
        confidence = 0;
        reason = 'Low Volatility';
    }
    
    const finalSignalStrength = calculateSignalStrength(score);

    return {
        prediction: finalPrediction,
        confidence,
        score: score,
        signalStrength: finalSignalStrength,
        signals,
        arrows: allArrows,
        trendLines: allTrendLines,
        fibonacci: fibonacciResult,
        analysis,
        reason,
    };
}
