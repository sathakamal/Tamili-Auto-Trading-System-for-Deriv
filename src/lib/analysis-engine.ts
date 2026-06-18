

import type { PredictionResult, IndicatorSignal, Analysis, IndicatorSettings, Candle, SignalStrength, StochasticStrategy, DpoStrategy, PmoStrategy, DeltaRsiStrategy, MomentumStrategy, VolumeProfileStrategy } from './types';
import { calculateOneTwoThreeReversal } from './indicators/one-two-three-reversal';
import { calculateSuperSignal } from './indicators/super-signal';
import { calculateSkyrexReversal } from './indicators/skyrex-reversal';
import { calculateSqueezeMomentum } from './indicators/squeeze-momentum';
import { calculateDPO } from './indicators/dynamic-price-oscillator';
import { calculatePMO } from './indicators/pmo';
import { calculateDeltaRsi } from './indicators/delta-rsi';
import { calculateSupportResistance } from './indicators/support-resistance';
import { calculatePeakFilter } from './indicators/peak-filter';
import { calculateAtrTrailingStop } from './indicators/atr-trailing-stop';
import { calculateVolumeProfile } from './indicators/volume-profile';
import { calculateEmaAdxTrend } from './indicators/ema-adx-trend';
import { calculateUltimatePullback } from './indicators/ultimate-pullback';


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
    
    // First RSI
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));
    rsiValues.push(rsi);
    
    for (let i = period + 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i-1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
    }
    
    const validRsiValues = candles.map((_, index) => {
        const rsiIndex = index - period;
        return rsiIndex >= 0 ? rsiValues[rsiIndex] : undefined;
    });

    return {
        values: validRsiValues.filter(v => v !== undefined) as number[],
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

// --- Main Analysis Engine ---

export function analyzeMarketAndPredict(
    candleHistory: Candle[], 
    settings: IndicatorSettings,
    tradeMode: 'tick' | 'minute',
    longTermCandleHistory?: Candle[]
): PredictionResult {
    const { weights } = settings;
    let score = 0;
    const signals: IndicatorSignal[] = [];
    let allArrows: PredictionResult['arrows'] = [];
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
        settings.enableSkyrexReversal,
        settings.enableSqueezeMomentum,
        settings.dpoStrategy !== 'disabled',
        settings.pmoStrategy !== 'disabled',
        settings.deltaRsiStrategy !== 'disabled',
        settings.enableSupportResistance,
        settings.enablePeakFilter,
        settings.enableAtrTrailingStop,
        settings.enableVolumeProfile,
        settings.enableEmaAdxTrend,
        settings.enableUltimatePullback,
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
            analysis: { trendDirection, momentum: 0, volatility: 0 },
            reason: 'Insufficient Data'
        };
    }
    
    const currentPrice = candleHistory[candleHistory.length - 1].close;
    const latestCandle = candleHistory[candleHistory.length - 1];
    const prevCandle = candleHistory[candleHistory.length - 2];

    // Ultimate Pullback Strategy
    if (settings.enableUltimatePullback) {
        const upResult = calculateUltimatePullback(candleHistory, {
            emaFastPeriod: settings.ultimatePullbackEmaFast,
            emaSlowPeriod: settings.ultimatePullbackEmaSlow,
            rsiPeriod: settings.ultimatePullbackRsiPeriod,
            rsiUpper: settings.ultimatePullbackRsiUpper,
            rsiLower: settings.ultimatePullbackRsiLower,
            scoreThreshold: settings.ultimatePullbackScoreThreshold,
        });
        allArrows = [...allArrows, ...upResult.arrows];
        const upSignal = upResult.signal;

        if (upSignal === 'BULLISH') score += weights.ultimatePullbackWeight;
        if (upSignal === 'BEARISH') score -= weights.ultimatePullbackWeight;
        signals.push({ name: 'Ultimate Pullback', value: upResult.value, signal: upSignal });
    } else {
        signals.push({ name: 'Ultimate Pullback', value: 0, signal: 'NEUTRAL' });
    }
    
    // EMA + ADX Trend Strategy
    if (settings.enableEmaAdxTrend) {
        const emaAdxResult = calculateEmaAdxTrend(candleHistory, {
            fastEmaPeriod: settings.emaAdxTrendFastPeriod,
            mediumEmaPeriod: settings.emaAdxTrendMediumPeriod,
            slowEmaPeriod: settings.emaAdxTrendSlowPeriod,
            adxPeriod: settings.emaAdxTrendAdxPeriod,
            adxThreshold: settings.emaAdxTrendAdxThreshold,
        });
        allArrows = [...allArrows, ...emaAdxResult.arrows];
        const emaAdxSignal = emaAdxResult.signal;

        if (emaAdxSignal === 'BULLISH') score += weights.emaAdxTrendWeight;
        if (emaAdxSignal === 'BEARISH') score -= weights.emaAdxTrendWeight;
        signals.push({ name: 'EMA/ADX Trend', value: emaAdxResult.value, signal: emaAdxSignal });
    } else {
        signals.push({ name: 'EMA/ADX Trend', value: 0, signal: 'NEUTRAL' });
    }

    // Volume Profile Strategy
    if (settings.enableVolumeProfile) {
        const vpResult = calculateVolumeProfile(candleHistory, {
            period: settings.volumeProfilePeriod,
            valueAreaPercentage: settings.volumeProfileValueArea,
            strategy: settings.volumeProfileStrategy,
            trendPeriod: settings.trendPeriod,
        });
        allArrows = [...allArrows, ...vpResult.arrows];
        const vpSignal = vpResult.signal;

        if (vpSignal === 'BULLISH') score += weights.volumeProfileWeight;
        if (vpSignal === 'BEARISH') score -= weights.volumeProfileWeight;
        signals.push({ name: 'Volume Profile', value: vpResult.value, signal: vpSignal });
    } else {
        signals.push({ name: 'Volume Profile', value: 0, signal: 'NEUTRAL' });
    }

    // ATR Trailing Stop
    if (settings.enableAtrTrailingStop) {
        const atrResult = calculateAtrTrailingStop(candleHistory, {
            sensitivity: settings.atrTrailingStopSensitivity,
            atrPeriod: settings.atrTrailingStopPeriod,
        });
        allArrows = [...allArrows, ...atrResult.arrows];
        const atrSignal = atrResult.signal;

        if (atrSignal === 'BULLISH') score += weights.atrTrailingStopWeight;
        if (atrSignal === 'BEARISH') score -= weights.atrTrailingStopWeight;
        signals.push({ name: 'ATR Stop', value: atrSignal === 'BULLISH' ? 1 : atrSignal === 'BEARISH' ? -1 : 0, signal: atrSignal });
    } else {
        signals.push({ name: 'ATR Stop', value: 0, signal: 'NEUTRAL' });
    }

    // Peak Filter Strategy
    if (settings.enablePeakFilter) {
        const peakFilterResult = calculatePeakFilter(candleHistory, {
            fastEmaPeriod: settings.peakFilterFastEma,
            slowEmaPeriod: settings.peakFilterSlowEma,
            rsiPeriod: settings.peakFilterRsi,
            rsiUpper: settings.peakFilterRsiUpper,
            rsiLower: settings.peakFilterRsiLower,
            peakLookback: settings.peakFilterLookback,
            useTrendConfirmation: settings.peakFilterUseTrendConfirmation,
            useStrictPivots: settings.peakFilterUseStrictPivots,
            useRsiDirection: settings.peakFilterUseRsiDirection,
        });
        allArrows = [...allArrows, ...peakFilterResult.arrows];
        const peakSignal = peakFilterResult.signal;

        if (peakSignal === 'BULLISH') score += weights.peakFilterWeight;
        if (peakSignal === 'BEARISH') score -= weights.peakFilterWeight;
        signals.push({ name: 'Peak Filter', value: peakFilterResult.value, signal: peakSignal });
    } else {
        signals.push({ name: 'Peak Filter', value: 0, signal: 'NEUTRAL' });
    }

    // Support and Resistance
    if (settings.enableSupportResistance) {
        const srResult = calculateSupportResistance(candleHistory, {
            period: settings.supportResistancePeriod,
            sensitivity: settings.supportResistanceSensitivity,
        });
        allArrows = [...allArrows, ...srResult.arrows];
        const srSignal = srResult.signal;

        if (srSignal === 'BULLISH') score += weights.supportResistanceWeight;
        if (srSignal === 'BEARISH') score -= weights.supportResistanceWeight;
        signals.push({ name: 'S/R', value: srSignal === 'BULLISH' ? 1 : srSignal === 'BEARISH' ? -1 : 0, signal: srSignal });
    } else {
        signals.push({ name: 'S/R', value: 0, signal: 'NEUTRAL' });
    }

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
        
        if (deltaRsiSignal === 'BULLISH') score += weights.deltaRsiWeight;
        if (deltaRsiSignal === 'BEARISH') score -= weights.deltaRsiWeight;
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

        if (pmoSignal === 'BULLISH') score += weights.pmoWeight;
        if (pmoSignal === 'BEARISH') score -= weights.pmoWeight;
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

        if (skyrexSignal === 'BULLISH') score += weights.skyrexReversalWeight;
        if (skyrexSignal === 'BEARISH') score -= weights.skyrexReversalWeight;
        signals.push({ name: 'Skyrex Reversal', value: skyrexSignal === 'BULLISH' ? 1 : (skyrexSignal === 'BEARISH' ? -1 : 0), signal: skyrexSignal });
    } else {
        signals.push({ name: 'Skyrex Reversal', value: 0, signal: 'NEUTRAL' });
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

        if (squeezeSignal === 'BULLISH') score += weights.squeezeMomentumWeight;
        if (squeezeSignal === 'BEARISH') score -= weights.squeezeMomentumWeight;
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

        if (dpoSignal === 'BULLISH') score += weights.dpoWeight;
        if (dpoSignal === 'BEARISH') score -= weights.dpoWeight;
        signals.push({ name: 'DPO', value: dpoResult.value, signal: dpoSignal });
    } else {
        signals.push({ name: 'DPO', value: 0, signal: 'NEUTRAL' });
    }


    // 1. RSI
    if (settings.enableRsi) {
        const rsiResult = calculateRSI(candleHistory, settings.rsiPeriod);
        const rsiHistory = rsiResult.values;
        const rsi = rsiHistory[rsiHistory.length - 1] || 50;
        let rsiSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        
        // Find the last signal state by iterating backwards
        let lastSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        for (let i = rsiHistory.length - 1; i >= 0; i--) {
            const currentRsi = rsiHistory[i];
            const prevRsi = rsiHistory[i - 1] || 50;

            if (settings.rsiStrategy === 'crossover50') {
                if (currentRsi > 50 && prevRsi <= 50) { lastSignal = 'BULLISH'; break; }
                if (currentRsi < 50 && prevRsi >= 50) { lastSignal = 'BEARISH'; break; }
            } else { // default strategy
                if (currentRsi > settings.rsiLowerLevel && prevRsi <= settings.rsiLowerLevel) { lastSignal = 'BULLISH'; break; }
                if (currentRsi < settings.rsiUpperLevel && prevRsi >= settings.rsiUpperLevel) { lastSignal = 'BEARISH'; break; }
            }
        }
        rsiSignal = lastSignal;


        if (rsiSignal === 'BULLISH') score += weights.rsiWeight;
        if (rsiSignal === 'BEARISH') score -= weights.rsiWeight;
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

        if (stochSignal === 'BULLISH') score += weights.stochasticWeight;
        if (stochSignal === 'BEARISH') score -= weights.stochasticWeight;
        signals.push({ name: 'Stochastic', value: stochasticK, signal: stochSignal });
    } else {
        signals.push({ name: 'Stochastic', value: 0, signal: 'NEUTRAL' });
    }

    // 3. MACD
    if (settings.enableMacd) {
        const { macd, signal: macdSignalVal, histogram: macdHistogram } = calculateMACD(candleHistory, settings.macdFastPeriod, settings.macdSlowPeriod, settings.macdSignalPeriod);
        const macdSignal = macd > macdSignalVal ? 'BULLISH' : 'BEARISH';
        
        if (macdSignal === 'BULLISH') score += weights.macdWeight;
        else score -= weights.macdWeight;
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
        } else if (settings.bollingerStrategy === 'midBandBounce') {
            const isUptrend = currentPrice > bb.middle;
            const isDowntrend = currentPrice < bb.middle;
            const touchedMiddleFromAbove = prevCandle.low <= bb.middle;
            const touchedMiddleFromBelow = prevCandle.high >= bb.middle;

            if (isUptrend && touchedMiddleFromAbove && currentPrice > prevCandle.close) {
                bbSignal = 'BULLISH';
                allArrows.push({ time: latestCandle.epoch, price: latestCandle.low, direction: 'up', type: 'level', tooltip: 'BB Bounce' });
            }
            if (isDowntrend && touchedMiddleFromBelow && currentPrice < prevCandle.close) {
                bbSignal = 'BEARISH';
                 allArrows.push({ time: latestCandle.epoch, price: latestCandle.high, direction: 'down', type: 'level', tooltip: 'BB Rejection' });
            }
            bbValue = bb.middle;
        } else { // 'default' strategy
            if (currentPrice < bb.lower) bbSignal = 'BULLISH';
            if (currentPrice > bb.upper) bbSignal = 'BEARISH';
            const pos = (currentPrice - bb.lower) / (bb.upper - bb.lower) * 100;
            bbValue = isNaN(pos) ? 50 : pos;
        }

        if (bbSignal === 'BULLISH') score += weights.bollingerWeight;
        if (bbSignal === 'BEARISH') score -= weights.bollingerWeight;
        signals.push({ name: 'Bollinger', value: bbValue, signal: bbSignal });
    } else {
         signals.push({ name: 'Bollinger', value: 0, signal: 'NEUTRAL' });
    }

    // 5. EMA
    if (settings.enableEma) {
        const ema = calculateEMA(candleHistory, settings.emaPeriod);
        const emaSignal = currentPrice > ema ? 'BULLISH' : 'BEARISH';

        if (emaSignal === 'BULLISH') score += weights.emaWeight;
        else score -= weights.emaWeight;
        signals.push({ name: 'EMA', value: ema, signal: emaSignal });
    } else {
        signals.push({ name: 'EMA', value: 0, signal: 'NEUTRAL' });
    }

    // 6. SMA
    if (settings.enableSma) {
        const sma = calculateSMA(candleHistory, settings.smaPeriod);
        const smaSignal = currentPrice > sma ? 'BULLISH' : 'BEARISH';

        if (smaSignal === 'BULLISH') score += weights.smaWeight;
        else score -= weights.smaWeight;
        signals.push({ name: 'SMA', value: sma, signal: smaSignal });
    } else {
        signals.push({ name: 'SMA', value: 0, signal: 'NEUTRAL' });
    }
    
    // 7. Recent Momentum
    if (settings.enableMomentum && candleHistory.length > settings.momentumPeriod) {
        const currentMomentum = candleHistory[candleHistory.length - 1].close - candleHistory[candleHistory.length - 1 - settings.momentumPeriod].close;
        const prevMomentum = candleHistory[candleHistory.length - 2].close - candleHistory[candleHistory.length - 2 - settings.momentumPeriod].close;

        let momSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        
        if (settings.momentumStrategy === 'zero-crossing') {
            if (currentMomentum > 0 && prevMomentum <= 0) {
                momSignal = 'BULLISH';
            } else if (currentMomentum < 0 && prevMomentum >= 0) {
                momSignal = 'BEARISH';
            }
        } else { // 'positive-negative'
            if (currentMomentum > 0) momSignal = 'BULLISH';
            if (currentMomentum < 0) momSignal = 'BEARISH';
        }
        
        if (momSignal === 'BULLISH') score += weights.momentumWeight;
        if (momSignal === 'BEARISH') score -= weights.momentumWeight;
        signals.push({ name: 'Momentum', value: currentMomentum, signal: momSignal });
    } else {
        signals.push({ name: 'Momentum', value: 0, signal: 'NEUTRAL' });
    }

    // 8. 1-2-3 Reversal
    if (settings.enableOneTwoThreeReversal) {
        const reversalSignal = calculateOneTwoThreeReversal(candleHistory, settings.oneTwoThreeStrategy);
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
        
        if (revSignal === 'BULLISH') score += weights.reversalWeight;
        if (revSignal === 'BEARISH') score -= weights.reversalWeight;
        signals.push({ name: '1-2-3 Reversal', value: revValue, signal: revSignal });
    } else {
        signals.push({ name: '1-2-3 Reversal', value: 0, signal: 'NEUTRAL'});
    }
    
    // 9. Multi-Timeframe Analysis
    if (settings.enableMultiTimeframeAnalysis && longTermCandleHistory && longTermCandleHistory.length >= settings.mtfTrendPeriod) {
        const mtfTrendDirection = getTrendFromCandles(longTermCandleHistory, settings.mtfTrendPeriod);
        let mtfSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

        if (mtfTrendDirection === 'Uptrend') {
            mtfSignal = 'BULLISH';
        }
        if (mtfTrendDirection === 'Downtrend') {
            mtfSignal = 'BEARISH';
        }
        
        if (mtfSignal === 'BULLISH') score += weights.multiTimeframeAnalysisWeight;
        if (mtfSignal === 'BEARISH') score -= weights.multiTimeframeAnalysisWeight;
        signals.push({ name: 'MTF Trend', value: mtfSignal === 'BULLISH' ? 1 : mtfSignal === 'BEARISH' ? -1 : 0, signal: mtfSignal });

    } else {
        signals.push({ name: 'MTF Trend', value: 0, signal: 'NEUTRAL' });
    }
    
    // 10. Short-Term Trend Analysis
    if (settings.enableTrendAnalysis) {
        let trendSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (trendDirection === 'Uptrend') trendSignal = 'BULLISH';
        if (trendDirection === 'Downtrend') trendSignal = 'BEARISH';
        
        if (trendSignal === 'BULLISH') score += weights.trendAnalysisWeight;
        if (trendSignal === 'BEARISH') score -= weights.trendAnalysisWeight;
        signals.push({ name: 'Trend', value: trendSignal === 'BULLISH' ? 1 : (trendSignal === 'BEARISH' ? -1 : 0), signal: trendSignal });
    } else {
        signals.push({ name: 'Trend', value: 0, signal: 'NEUTRAL' });
    }

     // 11. Super Signals
    if (settings.enableSuperSignals) {
        const superSignalResult = calculateSuperSignal(candleHistory, { period: settings.superSignalsPeriod, atrPeriod: settings.superSignalsAtrPeriod, useFilter: settings.enableSuperTrendFilter, filterPeriod: settings.superTrendFilterPeriod });
        const latestSuperSignal = superSignalResult.signals[superSignalResult.signals.length - 1];
        const superSignal = latestSuperSignal ? latestSuperSignal.signal : 'NEUTRAL';
        allArrows = [...allArrows, ...superSignalResult.arrows];

        if (superSignal === 'BULLISH') score += weights.superSignalsWeight;
        if (superSignal === 'BEARISH') score -= weights.superSignalsWeight;
        signals.push({ name: 'Super Signals', value: latestSuperSignal.value, signal: superSignal });
    } else {
        signals.push({ name: 'Super Signals', value: 0, signal: 'NEUTRAL' });
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
        analysis,
        reason,
    };
}
