
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface RsiSettings {
    period: number;
    level: number;
}

export interface RsiArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface RsiResult {
    rsiLine: LineData[];
    arrows: RsiArrow[];
}

// --- Main RSI Calculation ---
export function calculateRSI(
    ohlc: OHLC[],
    settings: RsiSettings
): RsiResult {
    const { period, level } = settings;
    const closePrices = ohlc.map(d => d.close);

    if (closePrices.length < period) {
        return { rsiLine: [], arrows: [] };
    }

    const rsiLine: LineData[] = [];
    const arrows: RsiArrow[] = [];
    let avgGain = 0;
    let avgLoss = 0;
    const rsiValues: (number|undefined)[] = new Array(period).fill(undefined);

    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        if (change > 0) {
            avgGain += change;
        } else {
            avgLoss -= change;
        }
    }
    avgGain /= period;
    avgLoss /= period;
    
    for (let i = period; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss; // Avoid division by zero
        const rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
        
        rsiLine.push({ time: ohlc[i].time, value: rsi });
        
        const prevRsi = rsiValues[i - 1];
        if (prevRsi !== undefined) {
            if (prevRsi <= level && rsi > level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: `RSI Cross Buy (${level})` });
            }
            if (prevRsi >= level && rsi < level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: `RSI Cross Sell (${level})` });
            }
        }
    }
    
    return { rsiLine, arrows };
}
