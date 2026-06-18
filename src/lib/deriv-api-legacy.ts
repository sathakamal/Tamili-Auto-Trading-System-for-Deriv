

import { type Candle, type Tick } from '@/lib/types';

// How long (ms) to wait for any single request before rejecting
const REQUEST_TIMEOUT_MS = 10_000;

type AuthorizeResponse = {
  authorize: {
    balance: number;
    loginid: string;
  };
};

type BuyResponse = {
  buy: {
    contract_id: number;
    longcode: string;
    payout: number;
    purchase_time: number;
    shortcode: string;
    start_time: number;
    buy_price?: number;
  };
  error?: {
    message: string;
  }
};

export type ProposalOpenContract = {
    is_sold: number;
    profit: number;
    status: 'won' | 'lost' | 'open';
    contract_id: number;
    sell_price?: number;
}

type ActiveSymbol = {
    display_name: string;
    symbol: string;
    market: string;
};

type ActiveSymbolsResponse = {
    active_symbols: ActiveSymbol[];
};

type TickHistoryResponse = {
    history: {
        times: number[];
        prices: number[];
    }
}

type CandleHistoryResponse = {
    candles: Candle[];
}


export class DerivAPI {
  private ws: WebSocket;
  private messageQueue: string[] = [];
  private isSocketOpen = false;
  private isClosed = false;
  private messageCounter = 1;
  
  private requestHandlers: Map<number, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = new Map();

  private openContractSubscriptions: Map<number, { callback: (data: any) => void, subscriptionId?: string }> = new Map();
  private streamSubscriptions: Map<string, (data: any) => void> = new Map();
  private onBalanceChangeCallback: ((balance: number) => void) | null = null;

  constructor(appId: string = '1089') {
    // Deriv provides two equivalent endpoints — try the primary one
    this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);

    this.ws.onopen = () => {
      this.isSocketOpen = true;
      // Flush any messages queued before the socket opened
      this.messageQueue.forEach(msg => this.ws.send(msg));
      this.messageQueue = [];
    };

    this.ws.onmessage = (msg) => {
      let data: any;
      try {
        data = JSON.parse(msg.data.toString());
        console.log('DerivAPI: Incoming message', data);
      } catch {
        console.error('DerivAPI: Failed to parse message', msg.data);
        return;
      }

      // --- Subscription streams (no req_id in subsequent messages) ---
      if (data.subscription?.id) {
        const subId = data.subscription.id;
        if (this.streamSubscriptions.has(subId)) {
          const callback = this.streamSubscriptions.get(subId)!;
          if (data.msg_type === 'tick' && data.tick) {
            callback({ epoch: data.tick.epoch, price: data.tick.quote });
          } else if (data.msg_type === 'ohlc' && data.ohlc) {
            callback(data.ohlc);
          }
          return;
        }
      }

      // --- Open contract updates ---
      if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
        const contractResult = data.proposal_open_contract;
        const contractId = contractResult.contract_id;
        if (this.openContractSubscriptions.has(contractId)) {
          const subDetails = this.openContractSubscriptions.get(contractId)!;
          subDetails.callback(contractResult);
          if (contractResult.is_sold) {
            this.unsubscribeFromContract(contractId);
          }
          return;
        }
      }

      // --- Balance updates ---
      if (data.msg_type === 'balance' && data.balance?.balance !== undefined) {
        if (this.onBalanceChangeCallback) {
          this.onBalanceChangeCallback(data.balance.balance);
        }
        // Fall through — the initial balance request has a req_id to resolve
      }

      // --- Resolve/reject a specific pending request ---
      const req_id = data.req_id;
      if (req_id && this.requestHandlers.has(req_id)) {
        const handler = this.requestHandlers.get(req_id)!;
        clearTimeout(handler.timeoutId);
        this.requestHandlers.delete(req_id);
        if (data.error) {
          handler.reject(data.error);
        } else {
          handler.resolve(data);
        }
      }
    };

    this.ws.onerror = () => {
      // Reject all pending requests immediately so nothing hangs
      this._rejectAllPending(
        new Error(
          'WebSocket error — cannot reach Deriv servers. ' +
          'Check your App ID is a valid number and your internet connection.'
        )
      );
    };

    this.ws.onclose = (event) => {
      this.isSocketOpen = false;
      this.isClosed = true;
      if (this.requestHandlers.size > 0) {
        this._rejectAllPending(
          new Error(`WebSocket closed (code ${event.code}). Connection lost.`)
        );
      }
    };
  }

  private _rejectAllPending(err: Error) {
    this.requestHandlers.forEach(handler => {
      clearTimeout(handler.timeoutId);
      handler.reject(err);
    });
    this.requestHandlers.clear();
  }

  public on(event: 'open', callback: () => void): void {
    if (event === 'open') {
      if (this.isSocketOpen) {
        callback();
      } else {
        const originalOnOpen = this.ws.onopen;
        this.ws.onopen = (e) => {
          if (originalOnOpen) originalOnOpen.call(this.ws, e);
          callback();
        };
      }
    }
  }

  private sendMessage(data: any): number {
    const req_id = this.messageCounter++;
    const message = JSON.stringify({ ...data, req_id });
    console.log('DerivAPI: Sending message', { ...data, req_id });
    if (this.isSocketOpen) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
    return req_id;
  }

  private sendRequest<T>(data: any, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
      const req_id = this.sendMessage(data);

      const timeoutId = setTimeout(() => {
        if (this.requestHandlers.has(req_id)) {
          this.requestHandlers.delete(req_id);
          reject(
            new Error(
              `Request timed out after ${timeoutMs / 1000}s. ` +
              'Server did not respond. Check your App ID and network.'
            )
          );
        }
      }, timeoutMs);

      this.requestHandlers.set(req_id, { resolve, reject, timeoutId });
    });
  }

  /** Test basic connectivity before doing auth — useful for diagnostics */
  public ping(): Promise<any> {
    return this.sendRequest({ ping: 1 }, 5000);
  }

  public authorize(apiToken: string): Promise<AuthorizeResponse> {
    return this.sendRequest<AuthorizeResponse>({ authorize: apiToken });
  }

  public getActiveSymbols(): Promise<ActiveSymbolsResponse> {
    return this.sendRequest<ActiveSymbolsResponse>({ active_symbols: 'brief', product_type: 'basic' });
  }

  public async getTickHistory(symbol: string, count: number): Promise<Tick[]> {
    const response = await this.sendRequest<TickHistoryResponse>({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      style: 'ticks',
    });
    const { prices, times } = response.history;
    return prices.map((price, i) => ({ price, epoch: times[i] }));
  }

  public async subscribeToTicks(symbol: string, callback: (tick: Tick) => void): Promise<string> {
    const response = await this.sendRequest<{ subscription: { id: string } }>({
      ticks: symbol,
      subscribe: 1,
    });
    const subId = response.subscription.id;
    this.streamSubscriptions.set(subId, callback);
    return subId;
  }

  public unsubscribeFromStream(subscriptionId: string): Promise<any> {
    if (this.streamSubscriptions.has(subscriptionId)) {
      this.streamSubscriptions.delete(subscriptionId);
      return this.sendRequest({ forget: subscriptionId });
    }
    return Promise.resolve();
  }

  public async getOHLCHistory(symbol: string, timeframe: number, count: number): Promise<Candle[]> {
    const response = await this.sendRequest<CandleHistoryResponse>({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'candles',
      granularity: timeframe,
      adjust_start_time: 1,
    });
    return response.candles;
  }

  public buyContract(
    symbol: string,
    amount: string,
    duration: number,
    duration_unit: 't' | 'm',
    tradeType: 'RISE' | 'FALL'
  ): Promise<BuyResponse> {
    const contractType = tradeType === 'RISE' ? 'CALL' : 'PUT';
    return this.sendRequest<BuyResponse>({
      buy: '1',
      price: parseFloat(amount),
      parameters: {
        amount: parseFloat(amount),
        basis: 'stake',
        contract_type: contractType,
        currency: 'USD',
        duration,
        duration_unit,
        symbol,
      },
    });
  }

  public async subscribeToContract(contractId: number, callback: (data: ProposalOpenContract) => void) {
    if (this.openContractSubscriptions.has(contractId)) {
      console.warn(`Already subscribed to contract ${contractId}. Ignoring.`);
      return;
    }

    try {
      this.openContractSubscriptions.set(contractId, { callback });

      const response = await this.sendRequest<{
        proposal_open_contract: any;
        subscription?: { id: string };
      }>({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      });

      if (response?.subscription && this.openContractSubscriptions.has(contractId)) {
        this.openContractSubscriptions.get(contractId)!.subscriptionId = response.subscription.id;
      }

      if (response.proposal_open_contract?.is_sold) {
        this.unsubscribeFromContract(contractId);
      } else if (!response.subscription) {
        throw new Error('Subscription ID not received and no initial contract state.');
      }
    } catch (e) {
      console.error(`Failed to subscribe to contract ${contractId}`, e);
      this.openContractSubscriptions.delete(contractId);
    }
  }

  public unsubscribeFromContract(contractId: number) {
    const sub = this.openContractSubscriptions.get(contractId);
    if (sub?.subscriptionId) {
      this.sendRequest({ forget: sub.subscriptionId }).catch(e =>
        console.error(`Failed to forget subscription ${sub.subscriptionId}`, e)
      );
    }
    this.openContractSubscriptions.delete(contractId);
  }

  public sellContract(contractId: string | number) {
    return this.sendRequest({
      sell: contractId,
      price: 0, // Sells at current market price
    });
  }

  public subscribeToBalance(callback: (balance: number) => void) {
    this.onBalanceChangeCallback = callback;
    this.sendMessage({ balance: 1, subscribe: 1 });
  }

  public close() {
    if (!this.isClosed) {
      this.ws.close();
    }
  }
}
