

import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface OBVBollingerBandsSettings {
    smoothingPeriod: number;
    bandPeriod: number;
    bandDeviation: number;
}

export interface OBVBollingerBandsArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface OBVBollingerBandsResult {
    obvLine: (LineData & { isSqueezed?: boolean })[];
    upperBand: LineData[];
    lowerBand: LineData[];
    arrows: OBVBollingerBandsArrow[];
}


// --- Helper Functions ---

const sma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    result.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        result.push(sum / period);
    }
    return result;
};

// --- Main Indicator Calculation ---
export function calculateOBVBollingerBands(
    ohlc: OHLC[],
    settings: OBVBollingerBandsSettings
): OBVBollingerBandsResult {
    const { smoothingPeriod, bandPeriod, bandDeviation } = settings;

    if (ohlc.length < bandPeriod + smoothingPeriod) {
        return { obvLine: [], upperBand: [], lowerBand: [], arrows: [] };
    }

    // 1. Calculate Standard OBV based on close price changes
    const rawObvValues: number[] = new Array(ohlc.length).fill(0);
    if (ohlc.length > 0) {
        rawObvValues[0] = ohlc[0].volume ?? 1; // Start with first volume
        for (let i = 1; i < ohlc.length; i++) {
            const currentClose = ohlc[i].close;
            const prevClose = ohlc[i - 1].close;
            const prevObv = rawObvValues[i-1];
            // Use a constant volume of 1 if not available, which is common for tick data
            const volume = ohlc[i].volume ?? 1;

            if (currentClose > prevClose) {
                rawObvValues[i] = prevObv + volume;
            } else if (currentClose < prevClose) {
                rawObvValues[i] = prevObv - volume;
            } else {
                rawObvValues[i] = prevObv;
            }
        }
    }
    
    // 2. Smooth the OBV line
    const smoothedObvValues = sma(rawObvValues, smoothingPeriod);


    // 3. Calculate Bollinger Bands on the SMOOTHED OBV
    const obvSma = sma(smoothedObvValues.filter(v => v !== undefined) as number[], bandPeriod);
    
    const alignedObvSma: (number|undefined)[] = new Array(ohlc.length).fill(undefined);
    let smaIndex = 0;
    for (let i = 0; i < smoothedObvValues.length; i++) {
        if(smoothedObvValues[i] !== undefined) {
             if (smaIndex < obvSma.length) {
                alignedObvSma[i] = obvSma[smaIndex];
                smaIndex++;
             }
        }
    }


    const stdDevValues: (number | undefined)[] = [];
    for (let i = 0; i < ohlc.length; i++) {
        if (i < smoothingPeriod + bandPeriod - 2) {
            stdDevValues.push(undefined);
            continue;
        }
        
        const slice = smoothedObvValues.slice(i - bandPeriod + 1, i + 1).filter(v => v !== undefined) as number[];
        if (slice.length < bandPeriod) {
             stdDevValues.push(undefined);
             continue;
        }
        
        const mean = alignedObvSma[i]!;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / bandPeriod;
        stdDevValues.push(Math.sqrt(variance));
    }

    const upperBandValues: (number | undefined)[] = [];
    const lowerBandValues: (number | undefined)[] = [];


    for (let i = 0; i < ohlc.length; i++) {
        const smaVal = alignedObvSma[i];
        const stdDevVal = stdDevValues[i];
        if (smaVal !== undefined && stdDevVal !== undefined) {
            const upper = smaVal + (stdDevVal * bandDeviation);
            const lower = smaVal - (stdDevVal * bandDeviation);
            upperBandValues.push(upper);
            lowerBandValues.push(lower);
        } else {
            upperBandValues.push(undefined);
            lowerBandValues.push(undefined);
        }
    }

    // 4. Determine trend and generate arrows based on SMOOTHED OBV crossing bands
    const trend: (number | undefined)[] = new Array(ohlc.length).fill(undefined);
    const arrows: OBVBollingerBandsArrow[] = [];
    
    for (let i = 1; i < ohlc.length; i++) {
        const obv = smoothedObvValues[i];
        const upper = upperBandValues[i];
        const lower = lowerBandValues[i];

        let prevTrend = trend[i-1];

        if (prevTrend === undefined) {
            for (let j = i-2; j >=0; j--) {
                if (trend[j] !== undefined) {
                    prevTrend = trend[j];
                    break;
                }
            }
        }


        if (obv !== undefined && upper !== undefined && lower !== undefined) {
             if (obv > upper) {
                trend[i] = 1;
            } else if (obv < lower) {
                trend[i] = -1;
            } else {
                trend[i] = prevTrend;
            }

            if (trend[i] !== prevTrend) {
                if (trend[i] === 1) {
                    arrows.push({ 
                        time: ohlc[i].time, 
                        price: ohlc[i].low, 
                        type: 'buy', 
                        text: 'OBV BB Buy' 
                    });
                } else if (trend[i] === -1) {
                    arrows.push({ 
                        time: ohlc[i].time, 
                        price: ohlc[i].high, 
                        type: 'sell', 
                        text: 'OBV BB Sell' 
                    });
                }
            }
        } else {
            trend[i] = prevTrend;
        }
    }

    // 5. Format results for charting
    const obvLine: (LineData & { isSqueezed?: boolean })[] = [];
     for (let i = 0; i < ohlc.length; i++) {
        const value = smoothedObvValues[i];
        if (value !== undefined) {
            obvLine.push({ time: ohlc[i].time, value });
        }
    }

    const upperBand = upperBandValues.map((value, i) => ({ time: ohlc[i].time, value })).filter(d => d.value !== undefined && !isNaN(d.value)) as {time: number, value: number}[];
    const lowerBand = lowerBandValues.map((value, i) => ({ time: ohlc[i].time, value })).filter(d => d.value !== undefined && !isNaN(d.value)) as {time: number, value: number}[];

    return { obvLine, upperBand, lowerBand, arrows };
}
