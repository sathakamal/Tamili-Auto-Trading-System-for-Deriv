
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface MomentumSettings {
    period: number;
    level: number;
}

export interface MomentumArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface MomentumResult {
    momentumLine: LineData[];
    arrows: MomentumArrow[];
}

// --- Main Momentum Calculation ---
export function calculateMomentum(
    ohlc: OHLC[],
    settings: MomentumSettings
): MomentumResult {
    const { period, level } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    if (closePrices.length < period) {
        return { momentumLine: [], arrows: [] };
    }

    const momentumLine: LineData[] = [];
    const arrows: MomentumArrow[] = [];
    const momentumValues: (number|undefined)[] = new Array(period).fill(undefined);

    for (let i = period; i < closePrices.length; i++) {
        const momentum = closePrices[i] - closePrices[i - period];
        momentumValues.push(momentum);
        momentumLine.push({ time: ohlc[i].time, value: momentum });

        const prevMomentum = momentumValues[i - 1];
        if (prevMomentum !== undefined) {
            if (prevMomentum <= level && momentum > level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: `Momentum Cross Buy (${level})` });
            }
            if (prevMomentum >= level && momentum < level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: `Momentum Cross Sell (${level})` });
            }
        }
    }

    return { momentumLine, arrows };
}
