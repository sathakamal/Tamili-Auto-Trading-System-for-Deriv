

import { type Candle, type Arrow, type DpoStrategy } from '@/lib/types';

// --- Type Definitions ---
export interface DpoSettings {
    length: number;
    smooth: number;
    strategy: DpoStrategy; 
}

export interface DpoResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    value: number; // The main oscillator value
    arrows: Arrow[];
}


// --- Helper Functions ---

const ema = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    if (data.length === 0) return [];
    const result: (number | undefined)[] = [];
    const multiplier = 2 / (period + 1);
    
    let firstValidIndex = data.findIndex(d => d !== undefined);
    if (firstValidIndex === -1) return new Array(data.length).fill(undefined);

    for (let i = 0; i < firstValidIndex; i++) {
        result.push(undefined);
    }
    
    let currentEma = data[firstValidIndex]!;
    result.push(currentEma);

    for (let i = firstValidIndex + 1; i < data.length; i++) {
        const value = data[i];
        if (value !== undefined) {
            currentEma = (value - currentEma) * multiplier + currentEma;
        }
        result.push(currentEma);
    }
    return result;
};

const sma = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
     if (data.length < period) return new Array(data.length).fill(undefined);
    
    const validData = data.filter(v => v !== undefined) as number[];
    if (validData.length === 0) return new Array(data.length).fill(undefined);

    const smaValues: number[] = [];
    if(validData.length >= period) {
        let sum = validData.slice(0, period).reduce((acc, val) => acc + val, 0);
        smaValues.push(sum / period);
        for (let i = period; i < validData.length; i++) {
            sum = sum - validData[i - period] + validData[i];
            smaValues.push(sum / period);
        }
    }
    
    // Align smaValues back to the original data's length and positions
    let smaIndex = 0;
    let validDataCount = 0;
    for (let i = 0; i < data.length; i++) {
        if(data[i] !== undefined) {
            validDataCount++;
            if(validDataCount >= period) {
                result.push(smaValues[smaIndex++]);
            } else {
                 result.push(undefined);
            }
        } else {
            result.push(undefined);
        }
    }

    return result;
};

const stdev = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);

    const result: (number | undefined)[] = [];
    let dataIndex = 0;

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(undefined);
            continue;
        }

        const slice = data.slice(i - period + 1, i + 1).filter(v => v !== undefined) as number[];
        if (slice.length < period) {
            result.push(undefined);
            continue;
        }
        
        const mean = slice.reduce((acc, val) => acc + val, 0) / period;
        const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
        result.push(Math.sqrt(variance));
    }
    
    return result;
};


// --- Main Indicator Calculation ---
export function calculateDPO(
    ohlc: Candle[],
    settings: DpoSettings
): DpoResult {
    const { length, smooth, strategy } = settings;
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    const arrows: Arrow[] = [];
    
    if (strategy === 'disabled' || ohlc.length < length * 2) {
        return { signal: 'NEUTRAL', value: 0, arrows: [] };
    }

    // --- Indicator Calculations ---
    const trueRangeValues = ohlc.map((c, i) => i > 0 ? Math.max(c.high - c.low, Math.abs(c.high - ohlc[i-1].close), Math.abs(c.low - ohlc[i-1].close)) : c.high - c.low);
    const volAdjPrice = ema(trueRangeValues, length);

    const priceChange = ohlc.map((c, i) => i >= length ? c.close - ohlc[i - length].close : undefined);
    const priceDelta = ohlc.map((c, i) => volAdjPrice[i] !== undefined ? c.close - volAdjPrice[i]! : undefined);
    
    const oscillatorSource = ohlc.map((_, i) => (priceDelta[i] !== undefined && priceChange[i] !== undefined) ? (priceDelta[i]! + priceChange[i]!) / 2 : undefined);

    const oscillator = ema(oscillatorSource, smooth);
    
    const bbLength = length * 5;
    const basis = sma(oscillator, bbLength);
    const dev = stdev(oscillator, bbLength);
    
    const upperBB = basis.map((val, i) => val !== undefined && dev[i] !== undefined ? val + dev[i]! * 1 : undefined);
    const lowerBB = basis.map((val, i) => val !== undefined && dev[i] !== undefined ? val - dev[i]! * 1 : undefined);


    // --- Signal Logic ---
    const i = ohlc.length - 1;
    if (i < 1) return { signal, value: 0, arrows };

    const oscVal = oscillator[i];
    const prevOscVal = oscillator[i-1];
    
    const upperBandVal = upperBB[i];
    const prevUpperBandVal = upperBB[i-1];

    const lowerBandVal = lowerBB[i];
    const prevLowerBandVal = lowerBB[i-1];

    const basisVal = basis[i];
    const prevBasisVal = basis[i-1];
    
    const latestCandle = ohlc[i];

    const isDefined = (...vals: (number | undefined)[]) => vals.every(v => v !== undefined);

    const checkBreakout = (): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
        if (isDefined(oscVal, prevOscVal, upperBandVal, prevUpperBandVal) && oscVal! > upperBandVal! && prevOscVal! <= prevUpperBandVal!) {
            return 'BULLISH';
        }
        if (isDefined(oscVal, prevOscVal, lowerBandVal, prevLowerBandVal) && oscVal! < lowerBandVal! && prevOscVal! >= prevLowerBandVal!) {
            return 'BEARISH';
        }
        return 'NEUTRAL';
    };

    const checkMeanReversion = (): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
        if (isDefined(oscVal, prevOscVal, lowerBandVal, prevLowerBandVal) && oscVal! > lowerBandVal! && prevOscVal! <= lowerBandVal!) {
            return 'BULLISH';
        }
        if (isDefined(oscVal, prevOscVal, upperBandVal, prevUpperBandVal) && oscVal! < upperBandVal! && prevOscVal! >= upperBandVal!) {
            return 'BEARISH';
        }
        return 'NEUTRAL';
    };

    const checkMidBandCross = (): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
        if (isDefined(oscVal, prevOscVal, basisVal, prevBasisVal) && oscVal! > basisVal! && prevOscVal! <= prevBasisVal!) {
            return 'BULLISH';
        }
        if (isDefined(oscVal, prevOscVal, basisVal, prevBasisVal) && oscVal! < basisVal! && prevOscVal! >= prevBasisVal!) {
            return 'BEARISH';
        }
        return 'NEUTRAL';
    };

    const checkInnerBandBreakout = (): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
        // Buy: crosses from below to above the upper band
        if (isDefined(oscVal, prevOscVal, upperBandVal, prevUpperBandVal) && oscVal! > upperBandVal! && prevOscVal! <= prevUpperBandVal!) {
            return 'BULLISH';
        }
        // Sell: crosses from above to below the lower band
        if (isDefined(oscVal, prevOscVal, lowerBandVal, prevLowerBandVal) && oscVal! < lowerBandVal! && prevOscVal! >= prevLowerBandVal!) {
            return 'BEARISH';
        }
        return 'NEUTRAL';
    }

    const checkOuterMeanReversion = (): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
        // Buy: crosses from below to above the lower band (re-entering)
        if (isDefined(oscVal, prevOscVal, lowerBandVal, prevLowerBandVal) && oscVal! > lowerBandVal! && prevOscVal! <= lowerBandVal!) {
            return 'BULLISH';
        }
        // Sell: crosses from above to below the upper band (re-entering)
        if (isDefined(oscVal, prevOscVal, upperBandVal, prevUpperBandVal) && oscVal! < upperBandVal! && prevOscVal! >= upperBandVal!) {
            return 'BEARISH';
        }
        return 'NEUTRAL';
    };


    const addArrow = (direction: 'BULLISH' | 'BEARISH', strategyName: string) => {
        signal = direction;
        arrows.push({ 
            time: latestCandle.epoch, 
            price: direction === 'BULLISH' ? latestCandle.low : latestCandle.high, 
            direction: direction === 'BULLISH' ? 'up' : 'down', 
            type: 'crossover', 
            tooltip: `DPO ${strategyName} ${direction === 'BULLISH' ? 'Buy' : 'Sell'}`
        });
    };


    if (strategy === 'all') {
        const breakoutSignal = checkBreakout();
        if (breakoutSignal !== 'NEUTRAL') addArrow(breakoutSignal, 'Breakout');

        const meanReversionSignal = checkMeanReversion();
        if (meanReversionSignal !== 'NEUTRAL') addArrow(meanReversionSignal, 'Mean Reversion');
        
        const midBandCrossSignal = checkMidBandCross();
        if (midBandCrossSignal !== 'NEUTRAL') addArrow(midBandCrossSignal, 'Mid-band Cross');

        const innerBandBreakoutSignal = checkInnerBandBreakout();
        if (innerBandBreakoutSignal !== 'NEUTRAL') addArrow(innerBandBreakoutSignal, 'Inner Band Breakout');


    } else {
        let singleStrategySignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        let strategyName = '';
        switch (strategy) {
            case 'breakout':
                singleStrategySignal = checkBreakout();
                strategyName = 'Breakout';
                break;
            case 'mean-reversion':
                singleStrategySignal = checkMeanReversion();
                strategyName = 'Mean Reversion';
                break;
            case 'mid-band-cross':
                singleStrategySignal = checkMidBandCross();
                strategyName = 'Mid-band Cross';
                break;
            case 'inner-band-breakout':
                singleStrategySignal = checkInnerBandBreakout();
                strategyName = 'Inner Band Breakout';
                break;
            case 'outer-mean-reversion':
                singleStrategySignal = checkOuterMeanReversion();
                strategyName = 'Outer Mean Reversion';
                break;
        }
        if (singleStrategySignal !== 'NEUTRAL') {
            addArrow(singleStrategySignal, strategyName);
        }
    }
    
    return { signal, value: oscVal || 0, arrows };
}
