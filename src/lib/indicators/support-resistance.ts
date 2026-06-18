
import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface SupportResistanceSettings {
    period: number;
    sensitivity: number; // Pivot strength (number of bars on each side)
}

export interface SupportResistanceResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    arrows: Arrow[];
}

interface Pivot {
    price: number;
    time: number;
    type: 'support' | 'resistance';
}

// --- Main Indicator Calculation ---
export function calculateSupportResistance(
    ohlc: Candle[],
    settings: SupportResistanceSettings
): SupportResistanceResult {
    const { period, sensitivity } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];

    const lookback = Math.min(ohlc.length, period);
    if (lookback < (sensitivity * 2) + 1) {
        return { signal: 'NEUTRAL', arrows: [] };
    }

    const recentCandles = ohlc.slice(-lookback);
    const pivots: Pivot[] = [];

    // --- Identify Pivots ---
    for (let i = sensitivity; i < recentCandles.length - sensitivity; i++) {
        const centerCandle = recentCandles[i];
        
        let isPivotHigh = true;
        let isPivotLow = true;

        for (let j = 1; j <= sensitivity; j++) {
            if (recentCandles[i - j].high > centerCandle.high || recentCandles[i + j].high > centerCandle.high) {
                isPivotHigh = false;
            }
            if (recentCandles[i - j].low < centerCandle.low || recentCandles[i + j].low < centerCandle.low) {
                isPivotLow = false;
            }
        }

        if (isPivotHigh) {
            pivots.push({ price: centerCandle.high, time: centerCandle.epoch, type: 'resistance' });
        }
        if (isPivotLow) {
            pivots.push({ price: centerCandle.low, time: centerCandle.epoch, type: 'support' });
        }
    }
    
    // --- Check for Bounces off recent pivots ---
    const latestCandle = ohlc[ohlc.length - 1];
    const prevCandle = ohlc[ohlc.length - 2];

    if (!latestCandle || !prevCandle) {
        return { signal: 'NEUTRAL', arrows: [] };
    }
    
    const recentPivots = pivots.slice(-10); // Check against the last 10 found pivots

    for (const pivot of recentPivots) {
        const isCloseToLevel = Math.abs(prevCandle.low - pivot.price) / pivot.price < 0.001; // within 0.1%

        if (pivot.type === 'support' && isCloseToLevel) {
            // Price touched support on prev candle and reversed up on the latest candle
            if (latestCandle.close > prevCandle.close && latestCandle.low >= prevCandle.low) {
                signal = 'BULLISH';
                arrows.push({
                    time: latestCandle.epoch,
                    price: latestCandle.low,
                    direction: 'up',
                    type: 'level',
                    tooltip: `S/R Bounce Buy (${pivot.price.toFixed(4)})`
                });
                break; // Stop after first signal
            }
        }
        
        const isCloseToResistance = Math.abs(prevCandle.high - pivot.price) / pivot.price < 0.001;

        if (pivot.type === 'resistance' && isCloseToResistance) {
            // Price touched resistance on prev candle and reversed down on the latest candle
            if (latestCandle.close < prevCandle.close && latestCandle.high <= prevCandle.high) {
                signal = 'BEARISH';
                arrows.push({
                    time: latestCandle.epoch,
                    price: latestCandle.high,
                    direction: 'down',
                    type: 'level',
                    tooltip: `S/R Bounce Sell (${pivot.price.toFixed(4)})`
                });
                break; // Stop after first signal
            }
        }
    }
    
    return { signal, arrows };
}
