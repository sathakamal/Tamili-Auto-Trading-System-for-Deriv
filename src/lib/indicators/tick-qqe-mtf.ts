// tickQQE_MTF.ts
import { type OHLC } from '@/lib/types';


export function resampleOHLC(ohlc: OHLC[], tfSeconds: number): OHLC[] {
    if (!tfSeconds || tfSeconds <= 0) return ohlc;
    const result: OHLC[] = [];
    let bucket: OHLC | null = null;
    for (const bar of ohlc) {
        const bucketStartEpoch = Math.floor(bar.time / tfSeconds) * tfSeconds;
        if (!bucket || bucket.time !== bucketStartEpoch) {
            if (bucket) result.push(bucket);
            bucket = { 
                time: bucketStartEpoch, 
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close
             };
        } else {
            bucket.high = Math.max(bucket.high, bar.high);
            bucket.low = Math.min(bucket.low, bar.low);
            bucket.close = bar.close;
        }
    }
    if (bucket) result.push(bucket);
    return result;
}
