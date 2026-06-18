
import { type OHLC, type LineData } from '@/lib/types';
import { type MAType, getMA } from './gssl'; // Reuse MA logic from GSSL

// --- Type Definitions ---
export interface BollingerBandsSettings {
    period: number;
    stdDev: number;
    maPeriod: number;
    maType: MAType;
}

export interface BollingerBandsArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface BollingerBandsResult {
    middleLine: LineData[];
    upperLine: LineData[];
    lowerLine: LineData[];
    maLine: LineData[];
    arrows: BollingerBandsArrow[];
}

// --- Helper: Simple Moving Average ---
const sma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        result.push(sum / period);
    }
    return result;
};

// --- Helper: Standard Deviation ---
const standardDeviation = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = slice.reduce((acc, val) => acc + val, 0) / period;
        const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
        result.push(Math.sqrt(variance));
    }
    return result;
};


// --- Main Bollinger Bands Calculation ---
export function calculateBollingerBands(
    ohlc: OHLC[],
    settings: BollingerBandsSettings
): BollingerBandsResult {
    const { period, stdDev, maPeriod, maType } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    const maxPeriod = Math.max(period, maPeriod);
    if (closePrices.length < maxPeriod) {
        return { middleLine: [], upperLine: [], lowerLine: [], maLine: [], arrows: [] };
    }

    // BB Calculation
    const middleLineValues = sma(closePrices, period);
    const stdDevValues = standardDeviation(closePrices, period);

    const middleLine: LineData[] = [];
    const upperLine: LineData[] = [];
    const lowerLine: LineData[] = [];
    const arrows: BollingerBandsArrow[] = [];

    // Additional MA Calculation
    const maLineValues = getMA(maType, closePrices, maPeriod);
    const maLine: LineData[] = [];

    for (let i = 1; i < ohlc.length; i++) {
        const time = ohlc[i].time;
        
        // Lines
        const middle = middleLineValues[i];
        const std = stdDevValues[i];
        const ma = maLineValues[i];

        if (time !== undefined && middle !== undefined && std !== undefined) {
            middleLine.push({ time, value: middle });
            upperLine.push({ time, value: middle + (std * stdDev) });
            lowerLine.push({ time, value: middle - (std * stdDev) });
        }
        if (ma !== undefined) {
            maLine.push({ time, value: ma });
        }

        // Arrow Logic
        const prevMa = maLineValues[i - 1];
        const prevMiddle = middleLineValues[i - 1];

        if (ma !== undefined && middle !== undefined && prevMa !== undefined && prevMiddle !== undefined) {
            // Buy Signal: MA crosses over midline
            if (prevMa <= prevMiddle && ma > middle) {
                arrows.push({ time, price: ohlc[i].low, type: 'buy', text: 'BB MA Cross Buy' });
            }
            // Sell Signal: MA crosses under midline
            if (prevMa >= prevMiddle && ma < middle) {
                arrows.push({ time, price: ohlc[i].high, type: 'sell', text: 'BB MA Cross Sell' });
            }
        }
    }

    return { middleLine, upperLine, lowerLine, maLine, arrows };
}
