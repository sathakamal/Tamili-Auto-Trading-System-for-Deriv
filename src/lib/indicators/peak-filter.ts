
import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface PeakFilterSettings {
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    rsiPeriod: number;
    rsiUpper: number;
    rsiLower: number;
    peakLookback: number;
    useTrendConfirmation: boolean;
    useStrictPivots: boolean;
    useRsiDirection: boolean;
}

export interface PeakFilterResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // The RSI value at the time of signal
    arrows: Arrow[];
}


// --- Helper Functions ---

const ema = (candles: Candle[], period: number): number[] => {
    const results: number[] = [];
    if (candles.length < period) return results;

    const closePrices = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);
    
    let emaValue = closePrices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    results.push(...new Array(period - 1).fill(emaValue), emaValue); // Fill initial values

    for (let i = period; i < closePrices.length; i++) {
        emaValue = (closePrices[i] - emaValue) * multiplier + emaValue;
        results.push(emaValue);
    }
    return results;
};

const rsi = (candles: Candle[], period: number): number[] => {
    const results: number[] = [];
    if (candles.length < period + 1) return results;

    const closePrices = candles.map(c => c.close);
    const rsiValues: number[] = [];

    let avgGain = 0;
    let avgLoss = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i-1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;
    
    rsiValues.push(...new Array(period).fill(50)); // Fill initial N/A values

    for (let i = period + 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i-1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues.push(100 - (100 / (1 + rs)));
    }
    return rsiValues;
};

const detectExtrema = (candles: Candle[], lookback: number, useStrict: boolean): 'high' | 'low' | null => {
    if (useStrict) {
        if (candles.length < lookback * 2 + 1) return null;
        const centerIndex = candles.length - 1 - lookback;
        const centerCandle = candles[centerIndex];

        let isPivotHigh = true;
        let isPivotLow = true;
        for (let i = 1; i <= lookback; i++) {
            if (candles[centerIndex - i].high > centerCandle.high || candles[centerIndex + i].high > centerCandle.high) isPivotHigh = false;
            if (candles[centerIndex - i].low < centerCandle.low || candles[centerIndex + i].low < centerCandle.low) isPivotLow = false;
        }
        if (isPivotHigh) return 'high';
        if (isPivotLow) return 'low';

    } else { // Original logic
        if (candles.length < lookback + 1) return null;
        const segment = candles.slice(-lookback);
        const currentPrice = candles[candles.length - 1].close;

        if (currentPrice === Math.max(...segment.map(c => c.close))) return 'high';
        if (currentPrice === Math.min(...segment.map(c => c.close))) return 'low';
    }
    
    return null;
}


// --- Main Indicator Calculation ---
export function calculatePeakFilter(
    ohlc: Candle[],
    settings: PeakFilterSettings
): PeakFilterResult {
    const { 
        fastEmaPeriod, slowEmaPeriod, rsiPeriod, rsiUpper, rsiLower, peakLookback,
        useTrendConfirmation, useStrictPivots, useRsiDirection
    } = settings;

    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];

    const requiredBars = Math.max(fastEmaPeriod, slowEmaPeriod, rsiPeriod, useStrictPivots ? peakLookback * 2 + 1 : peakLookback) + 2;
    if (ohlc.length < requiredBars) {
        return { signal: 'NEUTRAL', value: 50, arrows: [] };
    }

    const latestCandle = ohlc[ohlc.length - 1];
    
    // 1. Calculate indicators for the full history
    const allFastEma = ema(ohlc, fastEmaPeriod);
    const allSlowEma = ema(ohlc, slowEmaPeriod);
    const allRsi = rsi(ohlc, rsiPeriod);
    
    // Get the latest values
    const fastEma = allFastEma[allFastEma.length - 1];
    const slowEma = allSlowEma[allSlowEma.length - 1];
    const rsiValue = allRsi[allRsi.length - 1];
    const prevRsiValue = allRsi[allRsi.length - 2];
    
    // 2. Determine Trend Bias
    const trendBias = fastEma > slowEma ? 'UP' : 'DOWN';

    // 3. Detect Local Extrema
    const pivotCandleIndex = useStrictPivots ? ohlc.length - 1 - peakLookback : ohlc.length - 1;
    const pivotCandle = ohlc[pivotCandleIndex];
    const latestExtrema = detectExtrema(ohlc, peakLookback, useStrictPivots);

    // 4. Combine logic for signals
    let signalReason = '';

    const trendConfirmed = !useTrendConfirmation || (trendBias === 'UP' && latestCandle.close > slowEma) || (trendBias === 'DOWN' && latestCandle.close < slowEma);
    const rsiDirectionUp = !useRsiDirection || (rsiValue > prevRsiValue);
    const rsiDirectionDown = !useRsiDirection || (rsiValue < prevRsiValue);

    // Primary Reversal Signal
    if (latestExtrema === 'low' && trendBias === 'UP' && rsiValue < rsiLower && trendConfirmed) {
        signal = 'BULLISH';
        signalReason = `Low pivot + UP bias + RSI < ${rsiLower}`;
    } else if (latestExtrema === 'high' && trendBias === 'DOWN' && rsiValue > rsiUpper && trendConfirmed) {
        signal = 'BEARISH';
        signalReason = `High pivot + DOWN bias + RSI > ${rsiUpper}`;
    }
    // Secondary Continuation Signal
    else if (latestExtrema === null && trendBias === 'UP' && rsiValue > rsiLower && rsiValue < 60 && trendConfirmed && rsiDirectionUp) {
        signal = 'BULLISH';
        signalReason = 'Continuation Up';
    } else if (latestExtrema === null && trendBias === 'DOWN' && rsiValue < rsiUpper && rsiValue > 40 && trendConfirmed && rsiDirectionDown) {
        signal = 'BEARISH';
        signalReason = 'Continuation Down';
    }

    if (signal !== 'NEUTRAL') {
        arrows.push({
            time: pivotCandle.epoch,
            price: signal === 'BULLISH' ? pivotCandle.low : pivotCandle.high,
            direction: signal === 'BULLISH' ? 'up' : 'down',
            type: 'crossover', // Representing a signal event
            tooltip: `Peak Filter: ${signalReason}`
        });
    }

    return { signal, value: rsiValue, arrows };
}

    