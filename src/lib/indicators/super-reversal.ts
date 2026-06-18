
import { type Candle, type Arrow } from '@/lib/types';

export interface SuperReversalSettings {
    period: number;
}

export interface SuperReversalResult {
    arrows: Arrow[];
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export function calculateSuperReversal(
    ohlc: Candle[],
    settings: SuperReversalSettings
): SuperReversalResult {
    const { period } = settings;
    const arrows: Arrow[] = [];
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

    if (ohlc.length < period + 2) {
        return { arrows, signal };
    }

    let trend = 0; // -1 for Bearish, 1 for Bullish
    let lastTrendChangeBar = 0;

    for (let i = period; i < ohlc.length; i++) {
        const windowSlice = ohlc.slice(i - period, i);
        const highestHigh = Math.max(...windowSlice.map(c => c.high));
        const lowestLow = Math.min(...windowSlice.map(c => c.low));
        const currentCandle = ohlc[i];
        const prevCandle = ohlc[i - 1];

        // Step 1: Trend Filter (SuperTrend logic)
        let newTrend = trend;
        if (currentCandle.close > highestHigh) {
            newTrend = -1; // Bearish trend established
        } else if (currentCandle.close < lowestLow) {
            newTrend = 1; // Bullish trend established
        }

        if (newTrend !== trend) {
            trend = newTrend;
            lastTrendChangeBar = i;
        }

        // Step 2: Confirmation Filter (Reversal Bar) - only check the latest bar
        if (i === ohlc.length - 1) {
            if (trend === 1) { // Looking for a Bullish entry
                const isBullishReversalBar = currentCandle.close > prevCandle.close && currentCandle.low > prevCandle.low;
                if (isBullishReversalBar && i > lastTrendChangeBar) {
                    signal = 'BULLISH';
                    arrows.push({
                        time: currentCandle.epoch,
                        price: currentCandle.low,
                        direction: 'up',
                        type: 'crossover',
                        tooltip: 'Super Reversal Buy'
                    });
                }
            } else if (trend === -1) { // Looking for a Bearish entry
                const isBearishReversalBar = currentCandle.close < prevCandle.close && currentCandle.high < prevCandle.high;
                if (isBearishReversalBar && i > lastTrendChangeBar) {
                    signal = 'BEARISH';
                    arrows.push({
                        time: currentCandle.epoch,
                        price: currentCandle.high,
                        direction: 'down',
                        type: 'crossover',
                        tooltip: 'Super Reversal Sell'
                    });
                }
            }
        }
    }

    return { arrows, signal };
}
