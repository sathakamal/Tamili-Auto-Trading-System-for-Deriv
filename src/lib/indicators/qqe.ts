
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface QqeSettings {
    rsiPeriod: number;
    smoothingFactor: number;
}

export interface QqeArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface QqeResult {
    rsiLine: LineData[];
    smoothedRsiLine: LineData[];
    arrows: QqeArrow[];
}

// --- Helper Functions ---
const calculateRSI = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period).fill(undefined);
    let avgGain = 0, avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));

    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    while(result.length < data.length) result.unshift(undefined);
    return result;
};

const ema = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    if (data.length === 0) return [];
    const result: (number | undefined)[] = [];
    const multiplier = 2 / (period + 1);
    let firstValidIndex = data.findIndex(d => d !== undefined);
    if(firstValidIndex === -1) return new Array(data.length).fill(undefined);

    for(let i=0; i<firstValidIndex; i++) result.push(undefined);

    let ema = data[firstValidIndex]!;
    result.push(ema);

    for (let i = firstValidIndex + 1; i < data.length; i++) {
        const value = data[i];
        if(value !== undefined) {
            ema = (value - ema) * multiplier + ema;
        }
        result.push(ema);
    }
    return result;
};

// --- Main QQE Calculation ---
export function calculateQQE(
    ohlc: OHLC[],
    settings: QqeSettings
): QqeResult {
    const { rsiPeriod, smoothingFactor } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    if (closePrices.length < rsiPeriod) {
        return { rsiLine: [], smoothedRsiLine: [], arrows: [] };
    }

    const rsiValues = calculateRSI(closePrices, rsiPeriod);
    const smoothedRsiValues = ema(rsiValues, smoothingFactor);

    const rsiLine: LineData[] = [];
    const smoothedRsiLine: LineData[] = [];
    const arrows: QqeArrow[] = [];

    for (let i = 1; i < ohlc.length; i++) {
        const rsiVal = rsiValues[i];
        const smoothedVal = smoothedRsiValues[i];
        const time = ohlc[i].time;

        if (rsiVal !== undefined) rsiLine.push({ time, value: rsiVal });
        if (smoothedVal !== undefined) smoothedRsiLine.push({ time, value: smoothedVal });

        const prevRsiVal = rsiValues[i-1];
        const prevSmoothedVal = smoothedRsiValues[i-1];

        if (rsiVal !== undefined && smoothedVal !== undefined && prevRsiVal !== undefined && prevSmoothedVal !== undefined) {
            if (prevRsiVal <= prevSmoothedVal && rsiVal > smoothedVal) {
                arrows.push({ time, price: ohlc[i].low, type: 'buy', text: 'QQE Cross Buy' });
            }
            if (prevRsiVal >= prevSmoothedVal && rsiVal < smoothedVal) {
                arrows.push({ time, price: ohlc[i].high, type: 'sell', text: 'QQE Cross Sell' });
            }
        }
    }

    return { rsiLine, smoothedRsiLine, arrows };
}
