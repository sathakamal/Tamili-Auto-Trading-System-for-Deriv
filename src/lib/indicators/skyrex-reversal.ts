

import { type Candle, type Arrow } from '@/lib/types';

// --- Type Definitions ---
export interface SkyrexReversalSettings {
    enableMfi: boolean;
    enableAo: boolean;
    trendPeriod: number;
}

export interface SkyrexReversalResult {
    arrows: Arrow[];
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// --- Helper Functions ---

// Smoothed Moving Average for Alligator
const smma = (data: (number|undefined)[], length: number): (number|undefined)[] => {
    if (!data || data.length < length) return new Array(data.length).fill(undefined);

    const result: (number|undefined)[] = [];
    let prevSmma: number | undefined = undefined;

    for (let i = 0; i < data.length; i++) {
        const currentValue = data[i];

        if (currentValue === undefined) {
            result.push(prevSmma);
            continue;
        }

        if (prevSmma === undefined) {
            // Calculate initial SMA for the first valid chunk
            const initialSlice = data.slice(0, i + 1).filter(d => d !== undefined) as number[];
            if (initialSlice.length >= length) {
                prevSmma = initialSlice.slice(-length).reduce((sum, val) => sum + val, 0) / length;
            }
        } else {
            prevSmma = (prevSmma * (length - 1) + currentValue) / length;
        }
        result.push(prevSmma);
    }
    return result;
};


const sma = (data: (number|undefined)[], period: number): (number|undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    
    // Create a version of the data that only contains valid numbers, with original indices
    const validData = data.map((d, i) => d !== undefined ? { value: d, index: i } : null).filter(Boolean) as { value: number; index: number }[];
    if (validData.length < period) return new Array(data.length).fill(undefined);

    const smaResults: { [index: number]: number } = {};
    
    // Initial sum for the first window
    let sum = 0;
    for(let i=0; i<period; i++) {
        sum += validData[i].value;
    }
    smaResults[validData[period-1].index] = sum / period;

    // Slide the window
    for (let i = period; i < validData.length; i++) {
        sum = sum - validData[i-period].value + validData[i].value;
        smaResults[validData[i].index] = sum / period;
    }

    // Map results back to an array of the original length
    const result: (number|undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
        result.push(smaResults[i]);
    }

    return result;
};

// Money Flow Index (MFI) calculation
const calculateMfi = (ohlc: Candle[], period: number): (number|undefined)[] => {
    if (ohlc.length < period + 1) return new Array(ohlc.length).fill(undefined);

    const typicalPrice = ohlc.map(c => (c.high + c.low + c.close) / 3);
    const rawMoneyFlow = ohlc.map((c, i) => typicalPrice[i] * (c.volume || 1));

    const positiveMoneyFlow: (number|undefined)[] = [undefined];
    const negativeMoneyFlow: (number|undefined)[] = [undefined];
    
    for (let i = 1; i < ohlc.length; i++) {
        if (typicalPrice[i] > typicalPrice[i-1]) {
            positiveMoneyFlow.push(rawMoneyFlow[i]);
            negativeMoneyFlow.push(0);
        } else if (typicalPrice[i] < typicalPrice[i-1]) {
            positiveMoneyFlow.push(0);
            negativeMoneyFlow.push(rawMoneyFlow[i]);
        } else {
            positiveMoneyFlow.push(0);
            negativeMoneyFlow.push(0);
        }
    }

    const mfiValues: (number|undefined)[] = [];

    for (let i = 0; i < ohlc.length; i++) {
        if (i < period) {
            mfiValues.push(undefined);
            continue;
        }
        
        const positiveSlice = positiveMoneyFlow.slice(i - period + 1, i + 1);
        const negativeSlice = negativeMoneyFlow.slice(i - period + 1, i + 1);

        const positiveSum = positiveSlice.reduce((a, b) => a + (b || 0), 0);
        const negativeSum = negativeSlice.reduce((a, b) => a + (b || 0), 0);
        
        if (negativeSum === 0) {
            mfiValues.push(100);
            continue;
        }
        
        const moneyFlowRatio = positiveSum / negativeSum;
        mfiValues.push(100 - (100 / (1 + moneyFlowRatio)));
    }
    
    return mfiValues;
};


// --- Main Skyrex Reversal Calculation ---
export function calculateSkyrexReversal(
    ohlc: Candle[],
    settings: SkyrexReversalSettings
): SkyrexReversalResult {
    const { enableAo, enableMfi, trendPeriod } = settings;
    const arrows: Arrow[] = [];
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    
    if (ohlc.length < 50) { // Need enough data for Alligator, AO, etc.
        return { arrows, signal };
    }

    // --- Calculations ---

    const hl2 = ohlc.map(c => (c.high + c.low) / 2);
    
    // Consolidation Filter (MFI)
    const mfiValues = calculateMfi(ohlc, 14); // Standard MFI period is 14

    // Awesome Oscillator
    const aoValues = sma(hl2, 5)!.map((v, i) => (v !== undefined && sma(hl2, 34)![i] !== undefined) ? v - sma(hl2, 34)![i]! : undefined);
    const aoDiffs = aoValues.map((v, i) => (i > 0 && v !== undefined && aoValues[i-1] !== undefined) ? v - aoValues[i-1]! : undefined);

    // Alligator
    const jaw = smma(hl2, 13);
    const teeth = smma(hl2, 8);
    const lips = smma(hl2, 5);

    // Shift the alligator lines back as per the original script
    const jawShifted = [ ...new Array(8).fill(undefined), ...jaw.slice(0, jaw.length - 8)];
    const teethShifted = [ ...new Array(5).fill(undefined), ...teeth.slice(0, teeth.length - 5)];
    const lipsShifted = [ ...new Array(3).fill(undefined), ...lips.slice(0, lips.length - 3)];

    
    // --- Signal Logic ---
    // Only check the most recent, completed bar
    const i = ohlc.length - 2; // Index of the last completed bar to check for a formed swing
    const signalCandle = ohlc[i];
    if (!signalCandle || i < 2) {
         return { arrows, signal };
    }
    
    // 1. Check for a minor swing point at index `i`
    const isMinorSwingLow = signalCandle.low < ohlc[i-1].low && signalCandle.low < ohlc[i+1].low;
    const isMinorSwingHigh = signalCandle.high > ohlc[i-1].high && signalCandle.high > ohlc[i+1].high;


    // 2. Check filters
    const mfiVal = mfiValues[i];
    const consolidationCondition = !enableMfi || (mfiVal !== undefined && mfiVal > 20 && mfiVal < 80);

    const aoDiff = aoDiffs[i];
    const jawVal = jawShifted[i];
    const teethVal = teethShifted[i];
    const lipsVal = lipsShifted[i];
    
    let isTrueBullishReversalBar = false;
    let isTrueBearishReversalBar = false;
    
    // Bullish signal logic
    if (isMinorSwingLow && jawVal && teethVal && lipsVal && signalCandle.high < jawVal && signalCandle.high < teethVal && signalCandle.high < lipsVal) {
        const aoCondition = !enableAo || (aoDiff !== undefined && aoDiff < 0); // Bullish AO must be negative
        if (aoCondition && consolidationCondition) {
            isTrueBullishReversalBar = true;
        }
    }

    // Bearish signal logic
    if (isMinorSwingHigh && jawVal && teethVal && lipsVal && signalCandle.low > jawVal && signalCandle.low > teethVal && signalCandle.low > lipsVal) {
        const aoCondition = !enableAo || (aoDiff !== undefined && aoDiff > 0); // Bearish AO must be positive
        if (aoCondition && consolidationCondition) {
            isTrueBearishReversalBar = true;
        }
    }


    if (isTrueBullishReversalBar) {
        signal = 'BULLISH';
        arrows.push({
            time: signalCandle.epoch,
            price: signalCandle.low,
            direction: 'up',
            type: 'crossover',
            tooltip: 'BULL',
        });
    }

    if (isTrueBearishReversalBar) {
        signal = 'BEARISH';
        arrows.push({
            time: signalCandle.epoch,
            price: signalCandle.high,
            direction: 'down',
            type: 'crossover',
            tooltip: 'BEAR',
        });
    }

    return { arrows, signal };
}
