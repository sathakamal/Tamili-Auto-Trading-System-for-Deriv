
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface CciSettings {
    period: number;
    level: number;
}

export interface CciArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface CciResult {
    cciLine: LineData[];
    arrows: CciArrow[];
}

// --- Main CCI Calculation ---
export function calculateCCI(
    ohlc: OHLC[],
    settings: CciSettings
): CciResult {
    const { period, level } = settings;
    if (ohlc.length < period) {
        return { cciLine: [], arrows: [] };
    }
    
    const typicalPrices = ohlc.map(d => (d.high + d.low + d.close) / 3);
    const cciLine: LineData[] = [];
    const arrows: CciArrow[] = [];
    const cciValues: (number|undefined)[] = new Array(period - 1).fill(undefined);

    for (let i = period - 1; i < ohlc.length; i++) {
        const slice = typicalPrices.slice(i - period + 1, i + 1);
        const sma = slice.reduce((sum, val) => sum + val, 0) / period;
        const meanDeviation = slice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
        
        let cci = 0;
        if (meanDeviation !== 0) {
            cci = (typicalPrices[i] - sma) / (0.015 * meanDeviation);
        }
        cciValues.push(cci);
        cciLine.push({ time: ohlc[i].time, value: cci });

        const prevCci = cciValues[i - 1];
        if (prevCci !== undefined) {
            if (prevCci <= level && cci > level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].low, type: 'buy', text: `CCI Cross Buy (${level})` });
            }
            if (prevCci >= level && cci < level) {
                arrows.push({ time: ohlc[i].time, price: ohlc[i].high, type: 'sell', text: `CCI Cross Sell (${level})` });
            }
        }
    }
    return { cciLine, arrows };
};
