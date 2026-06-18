import { type OHLC } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface CciT3Settings {
    cciPeriod: number;
    smoothingPeriod: number;
    t3Period: number;
    t3VFactor: number;
    levelUp: number;
    levelDown: number;
    useSmoothing: boolean;
}

export interface CciT3Arrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface CciT3Result {
    arrows: CciT3Arrow[];
}

// --- Helper Functions ---

// Standard CCI calculation
const calculateCCI = (ohlc: OHLC[], period: number): (number | undefined)[] => {
    if (ohlc.length < period) {
        return new Array(ohlc.length).fill(undefined);
    }
    
    const typicalPrices = ohlc.map(d => (d.high + d.low + d.close) / 3);
    const cciValues: (number | undefined)[] = new Array(period - 1).fill(undefined);

    for (let i = period - 1; i < ohlc.length; i++) {
        const slice = typicalPrices.slice(i - period + 1, i + 1);
        const sma = slice.reduce((sum, val) => sum + val, 0) / period;
        const meanDeviation = slice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
        
        if (meanDeviation === 0) {
            cciValues.push(0);
        } else {
            const cci = (typicalPrices[i] - sma) / (0.015 * meanDeviation);
            cciValues.push(cci);
        }
    }
    return cciValues;
};

// Simple Moving Average for smoothing
const sma = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    if (period <= 1) return data; // No smoothing if period is 1 or less

    const result: (number | undefined)[] = [];
    const validData = data.map((d, i) => (d !== undefined ? { value: d, index: i } : null)).filter(Boolean) as { value: number; index: number }[];
    
    if (validData.length < period) {
        return new Array(data.length).fill(undefined);
    }

    const smaResults: { [index: number]: number } = {};
    
    let sum = 0;
    for(let i=0; i<period; i++) {
        sum += validData[i].value;
    }
    smaResults[validData[period-1].index] = sum / period;

    for (let i = period; i < validData.length; i++) {
        sum = sum - validData[i-period].value + validData[i].value;
        smaResults[validData[i].index] = sum / period;
    }

    for (let i = 0; i < data.length; i++) {
        result.push(smaResults[i]);
    }

    return result;
};


// T3 EMA calculation helper
const t3Ema = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma: number | undefined = undefined;

    for (let i = 0; i < data.length; i++) {
        const currentValue = data[i];
        if (currentValue === undefined || currentValue === null) {
            result.push(prevEma);
        } else {
            if (prevEma === undefined) {
                 prevEma = currentValue;
            } else {
                prevEma = (currentValue - prevEma) * multiplier + prevEma;
            }
            result.push(prevEma);
        }
    }
    return result;
};


// T3MA calculation based on MQL4 logic
const calculateT3 = (cciValues: (number | undefined)[], period: number, vFactor: number): (number | undefined)[] => {
    if (cciValues.length === 0) return [];
    
    const e1 = t3Ema(cciValues, period);
    const e2 = t3Ema(e1, period);
    const e3 = t3Ema(e2, period);
    const e4 = t3Ema(e3, period);
    const e5 = t3Ema(e4, period);
    const e6 = t3Ema(e5, period);
    
    const c1 = -vFactor * vFactor * vFactor;
    const c2 = 3 * vFactor * vFactor + 3 * vFactor * vFactor * vFactor;
    const c3 = -6 * vFactor * vFactor - 3 * vFactor - 3 * vFactor * vFactor * vFactor;
    const c4 = 1 + 3 * vFactor + vFactor * vFactor * vFactor + 3 * vFactor * vFactor;
    
    const t3Result: (number | undefined)[] = [];
    for(let i = 0; i < cciValues.length; i++) {
        const val1 = e1[i];
        const val2 = e2[i];
        const val3 = e3[i];
        const val4 = e4[i];
        const val5 = e5[i];
        const val6 = e6[i];
        
        if (val1 === undefined || val2 === undefined || val3 === undefined || val4 === undefined || val5 === undefined || val6 === undefined) {
            t3Result.push(undefined);
        } else {
            const t3 = c4 * val3 + c3 * val4 + c2 * val5 + c1 * val6;
            t3Result.push(t3);
        }
    }
    return t3Result;
};


// --- Main CCI-T3 Calculation ---
export function calculateCciT3(
    ohlc: OHLC[],
    settings: CciT3Settings
): CciT3Result {
    const { cciPeriod, smoothingPeriod, useSmoothing, t3Period, t3VFactor, levelUp, levelDown } = settings;

    if (ohlc.length < cciPeriod + t3Period) {
        return { arrows: [] };
    }

    // 1. Calculate raw CCI
    const cciValues = calculateCCI(ohlc, cciPeriod);
    
    // 2. Calculate T3 of CCI
    const t3CciValues = calculateT3(cciValues, t3Period, t3VFactor);
    
    // 3. Optionally smooth the final T3 line
    const finalT3Values = useSmoothing ? sma(t3CciValues, smoothingPeriod) : t3CciValues;
    
    const arrows: CciT3Arrow[] = [];
    
    for (let i = 1; i < finalT3Values.length; i++) { // Start from 1 to have a previous value
        const t3cci = finalT3Values[i];
        const prevT3cci = finalT3Values[i-1];

        if (t3cci !== undefined && prevT3cci !== undefined) {
             // Up arrow condition: crosses above LevelUp
            if (t3cci > levelUp && prevT3cci <= levelUp) {
                arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].low, 
                    type: 'buy', 
                    text: `CCI-T3 Buy (${levelUp})` 
                });
            }

            // Down arrow condition: crosses below LevelDown
            if (t3cci < levelDown && prevT3cci >= levelDown) {
                 arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].high, 
                    type: 'sell', 
                    text: `CCI-T3 Sell (${levelDown})` 
                });
            }
        }
    }
    
    return { arrows };
}
