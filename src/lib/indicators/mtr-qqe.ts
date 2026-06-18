
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface MtrQqeSettings {
    rsiPeriod: number;
    slowFactor: number;
    qqe: number;
}

export interface MtrQqeArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface MtrQqeResult {
    rsiMaLine: LineData[];
    fastAtrRsiTlLine: LineData[];
    arrows: MtrQqeArrow[];
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

// --- Main MTR QQE Calculation ---
export function calculateMtrQqe(
    ohlc: OHLC[],
    settings: MtrQqeSettings
): MtrQqeResult {
    const { rsiPeriod, slowFactor, qqe } = settings;
    const closePrices = ohlc.map(d => d.close);
    
    const wildersPeriod = rsiPeriod * 2 - 1;
    if (closePrices.length < wildersPeriod) {
        return { rsiMaLine: [], fastAtrRsiTlLine: [], arrows: [] };
    }

    const rsiValues = calculateRSI(closePrices, rsiPeriod);
    const rsiMaValues = ema(rsiValues, slowFactor);

    const atrRsiValues: (number | undefined)[] = [undefined];
    for (let i = 1; i < rsiMaValues.length; i++) {
        const prev = rsiMaValues[i-1];
        const curr = rsiMaValues[i];
        if (prev !== undefined && curr !== undefined) {
            atrRsiValues.push(Math.abs(curr - prev));
        } else {
            atrRsiValues.push(undefined);
        }
    }
    
    const maAtrRsiValues = ema(atrRsiValues, wildersPeriod);
    const darValues = ema(maAtrRsiValues, wildersPeriod).map(v => v !== undefined ? v * qqe : undefined);

    const rsiMaLine: LineData[] = [];
    const fastAtrRsiTlLine: LineData[] = [];
    const arrows: MtrQqeArrow[] = [];

    let longband: number | undefined;
    let shortband: number | undefined;
    let trend = 1;

    for (let i = 1; i < ohlc.length; i++) {
        const time = ohlc[i].time;
        const rsIndex = rsiMaValues[i];
        const prevRsIndex = rsiMaValues[i-1];
        const dar = darValues[i];

        if (rsIndex === undefined || dar === undefined || prevRsIndex === undefined) continue;

        const newshortband = rsIndex + dar;
        const newlongband = rsIndex - dar;

        const prevLongband = longband;
        const prevShortband = shortband;
        
        longband = (prevRsIndex > prevLongband! && rsIndex > prevLongband!) 
            ? Math.max(prevLongband!, newlongband) 
            : newlongband;

        shortband = (prevRsIndex < prevShortband! && rsIndex < prevShortband!)
            ? Math.min(prevShortband!, newshortband)
            : newshortband;
        
        const prevTrend = trend;
        if (rsIndex > prevShortband!) trend = 1;
        if (rsIndex < prevLongband!) trend = -1;

        const fastAtrRsiTl = trend === 1 ? longband : shortband;
        
        rsiMaLine.push({ time, value: rsIndex });
        fastAtrRsiTlLine.push({ time, value: fastAtrRsiTl });
        
        // Signal Logic
        const prevFastAtrRsiTl = i > 1 ? (trend === 1 ? prevLongband : prevShortband) : undefined;
        
        if(prevFastAtrRsiTl !== undefined) {
            // Buy Signal: RsiMa crosses above FastAtrRsiTL
            if (prevRsIndex <= prevFastAtrRsiTl && rsIndex > fastAtrRsiTl) {
                arrows.push({ time, price: ohlc[i].low, type: 'buy', text: 'MTR QQE Buy' });
            }
            // Sell Signal: RsiMa crosses below FastAtrRsiTL
            if (prevRsIndex >= prevFastAtrRsiTl && rsIndex < fastAtrRsiTl) {
                arrows.push({ time, price: ohlc[i].high, type: 'sell', text: 'MTR QQE Sell' });
            }
        }
    }

    return { rsiMaLine, fastAtrRsiTlLine, arrows };
}
