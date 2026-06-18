
import { type Candle, type Arrow } from '@/lib/types';
import { calculateADX } from './adx';

// --- Type Definitions ---
export interface EmaAdxTrendSettings {
    fastEmaPeriod: number;
    mediumEmaPeriod: number;
    slowEmaPeriod: number;
    adxPeriod: number;
    adxThreshold: number;
}

export interface EmaAdxTrendResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // ADX value at the time of signal
    arrows: Arrow[];
}

// --- Helper Functions ---
const ema = (candles: Candle[], period: number): number[] => {
    const results: number[] = [];
    if (candles.length < period) return results;

    const closePrices = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);
    
    let emaValue = closePrices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // Fill initial values for alignment
    for (let i = 0; i < period -1; i++) {
        results.push(NaN);
    }
    results.push(emaValue);

    for (let i = period; i < closePrices.length; i++) {
        emaValue = (closePrices[i] - emaValue) * multiplier + emaValue;
        results.push(emaValue);
    }
    return results;
};


// --- Main Indicator Calculation ---
export function calculateEmaAdxTrend(
    ohlc: Candle[],
    settings: EmaAdxTrendSettings
): EmaAdxTrendResult {
    const { 
        fastEmaPeriod, mediumEmaPeriod, slowEmaPeriod, adxPeriod, adxThreshold 
    } = settings;

    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];
    
    const requiredBars = Math.max(fastEmaPeriod, mediumEmaPeriod, slowEmaPeriod) + adxPeriod;
    if (ohlc.length < requiredBars) {
        return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }
    
    const latestCandle = ohlc[ohlc.length - 1];
    const prevCandle = ohlc[ohlc.length - 2];

    // 1. Calculate Indicators
    const emaFast = ema(ohlc, fastEmaPeriod);
    const emaMedium = ema(ohlc, mediumEmaPeriod);
    const emaSlow = ema(ohlc, slowEmaPeriod);
    const { adx: adxValues } = calculateADX(ohlc, adxPeriod);
    
    // 2. Get latest values
    const latestEmaFast = emaFast[emaFast.length - 1];
    const latestEmaMedium = emaMedium[emaMedium.length - 1];
    const latestEmaSlow = emaSlow[emaSlow.length - 1];
    const latestAdx = adxValues[adxValues.length - 1];

    if ([latestEmaFast, latestEmaMedium, latestEmaSlow, latestAdx].some(v => isNaN(v) || v === undefined)) {
         return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    // 3. Check Strategy Conditions

    // Bullish Conditions
    const isBullishTrend = latestEmaFast > latestEmaMedium && latestEmaMedium > latestEmaSlow;
    const isStrongTrend = latestAdx > adxThreshold;
    const isBullishPullback = prevCandle.low <= latestEmaMedium && latestCandle.close > latestEmaMedium;

    if (isBullishTrend && isStrongTrend && isBullishPullback) {
        signal = 'BULLISH';
        arrows.push({
            time: latestCandle.epoch,
            price: latestCandle.low,
            direction: 'up',
            type: 'crossover',
            tooltip: `EMA/ADX Buy (ADX: ${latestAdx.toFixed(2)})`
        });
    }

    // Bearish Conditions
    const isBearishTrend = latestEmaFast < latestEmaMedium && latestEmaMedium < latestEmaSlow;
    const isBearishPullback = prevCandle.high >= latestEmaMedium && latestCandle.close < latestEmaMedium;

    if (isBearishTrend && isStrongTrend && isBearishPullback) {
        signal = 'BEARISH';
        arrows.push({
            time: latestCandle.epoch,
            price: latestCandle.high,
            direction: 'down',
            type: 'crossover',
            tooltip: `EMA/ADX Sell (ADX: ${latestAdx.toFixed(2)})`
        });
    }

    return { signal, value: latestAdx, arrows };
}
