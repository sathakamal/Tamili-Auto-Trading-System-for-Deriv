
import { type Candle, type Arrow, type VolumeProfileStrategy } from '@/lib/types';

// --- Helper Functions ---
function calculateSMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1]?.close || 0;
    const slice = candles.slice(-period);
    return slice.reduce((a, b) => a + b.close, 0) / period;
}


// --- Type Definitions ---
export interface VolumeProfileSettings {
    period: number;
    valueAreaPercentage: number;
    strategy: VolumeProfileStrategy;
    trendPeriod: number;
}

export interface VolumeProfileResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // PoC price level
    arrows: Arrow[];
}

interface VolumeBin {
    price: number;
    volume: number;
}

// --- Main Indicator Calculation ---
export function calculateVolumeProfile(
    ohlc: Candle[],
    settings: VolumeProfileSettings
): VolumeProfileResult {
    const { period, valueAreaPercentage, strategy, trendPeriod } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];
    
    const lookback = Math.min(ohlc.length, period);
    if (lookback < 20) {
        return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    const relevantCandles = ohlc.slice(-lookback);
    const high = Math.max(...relevantCandles.map(c => c.high));
    const low = Math.min(...relevantCandles.map(c => c.low));
    const priceRange = high - low;
    const numBins = Math.min(100, Math.floor(priceRange / (ohlc[ohlc.length-1].close * 0.0001) || 1)); // Heuristic for bins
    if (numBins <= 0) {
      return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }
    const step = priceRange / numBins;

    const bins: VolumeBin[] = Array.from({ length: numBins }, (_, i) => ({
        price: low + i * step,
        volume: 0,
    }));

    let totalVolume = 0;
    for (const candle of relevantCandles) {
        const volume = candle.volume || 1; // Default to 1 if volume not available
        totalVolume += volume;
        const binIndex = Math.min(numBins - 1, Math.max(0, Math.floor((candle.close - low) / step)));
        if(bins[binIndex]) {
            bins[binIndex].volume += volume;
        }
    }
    
    if(totalVolume === 0) {
       return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    // --- Find PoC ---
    const pocBin = bins.reduce((max, bin) => bin.volume > max.volume ? bin : max, bins[0]);
    const poc = pocBin.price;

    // --- Find Value Area ---
    const targetVolume = totalVolume * (valueAreaPercentage / 100);
    const sortedBins = [...bins].sort((a, b) => b.volume - a.volume);
    
    let accumulatedVolume = 0;
    let valueAreaBins: VolumeBin[] = [];
    for (const bin of sortedBins) {
        accumulatedVolume += bin.volume;
        valueAreaBins.push(bin);
        if (accumulatedVolume >= targetVolume) break;
    }
    
    const vah = Math.max(...valueAreaBins.map(b => b.price));
    const val = Math.min(...valueAreaBins.map(b => b.price));

    // --- Apply Strategy ---
    const latestCandle = ohlc[ohlc.length - 1];
    const prevCandle = ohlc[ohlc.length - 2];

    if (strategy === 'mean-reversion') {
        // Buy: Re-entering VA from below
        if (prevCandle.close <= val && latestCandle.close > val) {
            signal = 'BULLISH';
            arrows.push({ time: latestCandle.epoch, price: latestCandle.low, direction: 'up', type: 'level', tooltip: `VA Reclaim (${val.toFixed(4)})` });
        }
        // Sell: Re-entering VA from above
        if (prevCandle.close >= vah && latestCandle.close < vah) {
            signal = 'BEARISH';
            arrows.push({ time: latestCandle.epoch, price: latestCandle.high, direction: 'down', type: 'level', tooltip: `VA Rejection (${vah.toFixed(4)})` });
        }
    } else if (strategy === 'poc-bounce') {
        const smaTrend = calculateSMA(ohlc, trendPeriod);
        const priceIsAboveTrend = latestCandle.close > smaTrend;
        const priceIsBelowTrend = latestCandle.close < smaTrend;

        const isNearPoc = Math.abs(latestCandle.low - poc) / poc < 0.001 || Math.abs(latestCandle.high - poc) / poc < 0.001;
        const isBouncingUp = latestCandle.close > prevCandle.close;
        const isBouncingDown = latestCandle.close < prevCandle.close;

        // Buy: In uptrend, touches PoC and bounces up
        if (priceIsAboveTrend && isNearPoc && isBouncingUp) {
             signal = 'BULLISH';
             arrows.push({ time: latestCandle.epoch, price: latestCandle.low, direction: 'up', type: 'level', tooltip: `PoC Bounce (${poc.toFixed(4)})` });
        }
        // Sell: In downtrend, touches PoC and bounces down
        if (priceIsBelowTrend && isNearPoc && isBouncingDown) {
            signal = 'BEARISH';
            arrows.push({ time: latestCandle.epoch, price: latestCandle.high, direction: 'down', type: 'level', tooltip: `PoC Rejection (${poc.toFixed(4)})` });
        }
    }

    return { signal, value: poc, arrows };
}
