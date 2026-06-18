import { type Candle, type Tick } from '@/lib/types';

// How long (ms) to wait for any single request before rejecting
const REQUEST_TIMEOUT_MS = 10_000;
const API_BASE_URL = 'https://api.derivws.com';

type AuthorizeResponse = {
  authorize: {
    balance: number;
    loginid: string;
    currency: string;
  };
};

type BuyResponse = {
  buy: {
    contract_id: number;
    longcode: string;
    payout: number;
    purchase_time: number;
    shortcode: string;
    buy_price?: number;
  };
  error?: {
    message: string;
    code: string;
  };
};

export type ProposalOpenContract = {
  is_sold: number;
  profit: number;
  status: 'won' | 'lost' | 'open';
  contract_id: number;
  sell_price?: number;
};

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
  };
};

type CandleHistoryResponse = {
  candles: Candle[];
};

type OTPEndpointResponse = {
  url: string;
};

type Account = {
  account_id: string;
  account_type: 'demo' | 'real';
  currency: string;
  balance: number;
};

export class DerivAPI {
  private ws: WebSocket | null = null;
  private messageQueue: string[] = [];
  private isSocketOpen = false;
  private isClosed = false;
  private messageCounter = 1;
  private appId: string;
  private patToken: string;
  private accountId: string;

  private requestHandlers: Map<number, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = new Map();

  private openContractSubscriptions: Map<number, { callback: (data: any) => void, subscriptionId?: string }> = new Map();
  private streamSubscriptions: Map<string, (data: any) => void> = new Map();
  private currentTickSymbol: string | null = null; // Track current tick subscription
  private onBalanceChangeCallback: ((balance: number) => void) | null = null;

  constructor(appId: string, patToken: string, accountId: string) {
    this.appId = appId;
    this.patToken = patToken;
    this.accountId = accountId;
  }

  /**
   * Get authenticated WebSocket URL via OTP endpoint
   */
  public async getAuthenticatedWebSocketUrl(): Promise<string> {
    console.log('getAuthenticatedWebSocketUrl: calling with', { 
      accountId: this.accountId,
      appId: this.appId,
      patToken: this.patToken.substring(0, 10) + '...' 
    });
    
    const url = `${API_BASE_URL}/trading/v1/options/accounts/${this.accountId}/otp`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.patToken}`,
        'Deriv-App-ID': this.appId,
        'Content-Type': 'application/json'
      }
    });

    console.log('getAuthenticatedWebSocketUrl: response status', response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `Failed to get OTP URL: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        console.error('getAuthenticatedWebSocketUrl: error response body', errorData);
        if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } catch (e) {
        console.error('getAuthenticatedWebSocketUrl: could not parse error response');
      }
      throw new Error(errorMessage);
    }

    const data: any = await response.json();
    console.log('getAuthenticatedWebSocketUrl: success response', data);
    
    // The endpoint might return { url } or { data: { url } }
    if (data.url) return data.url;
    if (data.data?.url) return data.data.url;
    
    throw new Error('OTP endpoint did not return a valid URL');
  }

  /**
   * Initialize WebSocket connection
   */
  public async connect(): Promise<void> {
    // Get authenticated WebSocket URL
    const wsUrl = await this.getAuthenticatedWebSocketUrl();
    console.log('DerivAPI: Connecting to', wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isSocketOpen = true;
      console.log('DerivAPI: WebSocket opened');
      // Flush any messages queued before the socket opened
      this.messageQueue.forEach(msg => this.ws!.send(msg));
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

    this.ws.onerror = (error) => {
      console.error('DerivAPI: WebSocket error', error);
      // Reject all pending requests immediately so nothing hangs
      this._rejectAllPending(
        new Error(
          `WebSocket error — cannot reach Deriv servers. Error type: ${error.type}`
        )
      );
    };

    this.ws.onclose = (event) => {
      console.log('DerivAPI: WebSocket closed', event);
      this.isSocketOpen = false;
      this.isClosed = true;
      if (this.requestHandlers.size > 0) {
        let reason = 'Connection lost.';
        if (event.reason) reason = `Reason: ${event.reason}`;
        this._rejectAllPending(
          new Error(`WebSocket closed (code ${event.code}). ${reason}`)
        );
      }
    };

    // Wait for WebSocket to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timed out'));
      }, 10000);

      const originalOnOpen = this.ws!.onopen;
      this.ws!.onopen = (event) => {
        if (originalOnOpen) originalOnOpen.call(this.ws, event);
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  /**
   * Get account list using PAT
   */
  public static async getAccounts(appId: string, patToken: string): Promise<Account[]> {
    console.log('getAccounts: calling with', { appId, patToken: patToken.substring(0, 10) + '...' });
    
    const url = `${API_BASE_URL}/trading/v1/options/accounts`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${patToken}`,
        'Deriv-App-ID': appId,
        'Content-Type': 'application/json'
      }
    });

    console.log('getAccounts: response status', response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `Failed to get accounts: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        console.error('getAccounts: error response body', errorData);
        if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } catch (e) {
        console.error('getAccounts: could not parse error response');
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('getAccounts: success response', data);
    
    // Ensure balance is a number
    const accounts = (data.data || []).map((acc: any) => ({
      ...acc,
      balance: typeof acc.balance === 'number' ? acc.balance : parseFloat(acc.balance) || 0
    }));
    
    return accounts;
  }

  private _rejectAllPending(err: Error): void {
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
        const originalOnOpen = this.ws!.onopen;
        this.ws!.onopen = (e) => {
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
    if (this.isSocketOpen && this.ws) {
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
              `Request timed out after ${timeoutMs / 1000}s. Server did not respond.`
            )
          );
        }
      }, timeoutMs);

      this.requestHandlers.set(req_id, { resolve, reject, timeoutId });
    });
  }

  /** Test basic connectivity */
  public ping(): Promise<any> {
    return this.sendRequest({ ping: 1 }, 5000);
  }

  /** In new API, we don't need to call authorize manually - it's handled by the OTP URL */
  public async authorize(): Promise<AuthorizeResponse> {
    return this.sendRequest<AuthorizeResponse>({ authorize: 1 });
  }

  public getActiveSymbols(): Promise<ActiveSymbolsResponse> {
    return this.sendRequest<ActiveSymbolsResponse>({ active_symbols: 'brief' });
  }

  public async getTickHistory(symbol: string, count: number): Promise<Tick[]> {
    console.log('DerivAPI: getTickHistory called with', { symbol, count });
    try {
      const response = await this.sendRequest<TickHistoryResponse>({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: 'latest',
        style: 'ticks',
      });
      console.log('DerivAPI: getTickHistory response:', response);
      if (response.history && response.history.prices && response.history.times) {
        const { prices, times } = response.history;
        return prices.map((price, i) => ({ price, epoch: times[i] }));
      }
      // If response format is different, return empty array for now
      console.warn('DerivAPI: Unexpected tick history format, returning empty array');
      return [];
    } catch (error) {
      console.warn('DerivAPI: getTickHistory failed, returning empty array', error);
      return []; // Return empty array instead of throwing
    }
  }

  public async subscribeToTicks(symbol: string, callback: (tick: Tick) => void): Promise<string> {
    console.log('DerivAPI: subscribeToTicks called with', { symbol });
    // If we're already subscribed to this symbol, return the existing subId
    if (this.currentTickSymbol === symbol) {
      console.warn(`DerivAPI: Already subscribed to ticks for ${symbol}`);
      // Find existing subId
      for (const [subId, cb] of this.streamSubscriptions.entries()) {
        // Update the callback (in case it's a different one!)
        this.streamSubscriptions.set(subId, callback);
        return subId;
      }
      return ''; // Shouldn't reach here, but just in case!
    }
    // If we're subscribed to a different symbol, unsubscribe first
    if (this.currentTickSymbol) {
      console.log(`DerivAPI: Unsubscribing from ${this.currentTickSymbol} to switch to ${symbol}`);
      for (const [subId, cb] of this.streamSubscriptions.entries()) {
        await this.unsubscribeFromStream(subId);
      }
    }
    try {
      const response = await this.sendRequest<{ subscription: { id: string } }>({
        ticks: symbol,
        subscribe: 1,
      });
      console.log('DerivAPI: subscribeToTicks response:', response);
      const subId = response.subscription.id;
      this.streamSubscriptions.set(subId, callback);
      this.currentTickSymbol = symbol; // Track current symbol!
      return subId;
    } catch (error) {
      console.warn('DerivAPI: subscribeToTicks caught an error', error);
      // Check if it's "you are already subscribed"
      const errMsg = getErrorMessageDeriv(error);
      if (errMsg.toLowerCase().includes('already subscribed')) {
        console.log(`DerivAPI: Already subscribed to ${symbol}, using existing connection`);
        this.currentTickSymbol = symbol;
        // We don't have the subId, but we'll still get ticks because we're connected!
        // Just add the callback with a dummy key for now
        const dummyId = 'dummy_' + symbol;
        this.streamSubscriptions.set(dummyId, callback);
        return dummyId;
      }
      throw error; // Re-throw if it's another error!
    }
  }

  public unsubscribeFromStream(subscriptionId: string): Promise<any> {
    if (this.streamSubscriptions.has(subscriptionId)) {
      this.streamSubscriptions.delete(subscriptionId);
      // If this was the tick subscription, reset currentTickSymbol
      // We don't have a subId -> symbol map, but let's just clear it for now
      this.currentTickSymbol = null;
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

  public async getProposal(
    symbol: string,
    amount: string,
    duration: number,
    duration_unit: 't' | 'm',
    tradeType: 'RISE' | 'FALL'
  ): Promise<{ id: string; ask_price: number }> {
    const contractType = tradeType === 'RISE' ? 'CALL' : 'PUT';
    const params = {
      proposal: 1,
      amount: parseFloat(amount),
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration,
      duration_unit,
      underlying_symbol: symbol,
    };
    console.log('DerivAPI: getProposal called with params:', params);
    const response = await this.sendRequest<any>(params);
    console.log('DerivAPI: getProposal response:', response);
    if (response.error) {
      throw new Error(response.error.message || 'Proposal failed');
    }
    return {
      id: response.proposal.id,
      ask_price: response.proposal.ask_price,
    };
  }

  public async buyContract(
    symbol: string,
    amount: string,
    duration: number,
    duration_unit: 't' | 'm',
    tradeType: 'RISE' | 'FALL'
  ): Promise<BuyResponse> {
    console.log('DerivAPI: buyContract called');
    // First get proposal
    const proposal = await this.getProposal(symbol, amount, duration, duration_unit, tradeType);
    console.log('DerivAPI: Got proposal:', proposal);
    
    // Now buy using proposal.id and proposal.ask_price
    const buyRequest = {
      buy: proposal.id,
      price: proposal.ask_price,
    };
    console.log('DerivAPI: Sending buy request:', buyRequest);
    
    const response = await this.sendRequest<BuyResponse>(buyRequest);
    console.log('DerivAPI: Buy response:', response);
    
    if (response.error) {
      throw new Error(response.error.message || 'Buy failed');
    }
    
    return response;
  }

  public async subscribeToContract(contractId: number, callback: (data: ProposalOpenContract) => void): Promise<void> {
    console.log(`DerivAPI: subscribeToContract called for contractId:`, contractId);
    if (this.openContractSubscriptions.has(contractId)) {
      console.warn(`Already subscribed to contract ${contractId}. Ignoring.`);
      return;
    }

    // Add callback first so we don't miss any updates even if the request times out
    this.openContractSubscriptions.set(contractId, { callback });

    try {
      // Longer timeout for open contract subscription
      const response = await this.sendRequest<{
        proposal_open_contract: any;
        subscription?: { id: string };
      }>({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      }, 30000); // 30 second timeout instead of 10

      console.log('DerivAPI: subscribeToContract response:', response);

      if (response?.subscription && this.openContractSubscriptions.has(contractId)) {
        this.openContractSubscriptions.get(contractId)!.subscriptionId = response.subscription.id;
      }

      if (response.proposal_open_contract?.is_sold) {
        this.unsubscribeFromContract(contractId);
      } else if (!response.subscription) {
        // Not the end of the world—we'll still get updates
        console.warn('DerivAPI: No subscription ID received, but callback is active');
      }
    } catch (error) {
      console.warn(`Warning: subscribeToContract request for ${contractId} failed or timed out, but callback is still active`, error);
      // Don't delete the callback—we still want open contract updates!
    }
  }

  public unsubscribeFromContract(contractId: number): void {
    const sub = this.openContractSubscriptions.get(contractId);
    if (sub?.subscriptionId) {
      this.sendRequest({ forget: sub.subscriptionId }).catch(error =>
        console.error(`Failed to forget subscription ${sub.subscriptionId}`, error)
      );
    }
    this.openContractSubscriptions.delete(contractId);
  }

  public sellContract(contractId: string | number): Promise<any> {
    return this.sendRequest({
      sell: contractId,
      price: 0, // Sells at current market price
    });
  }

  public subscribeToBalance(callback: (balance: number) => void): void {
    this.onBalanceChangeCallback = callback;
    this.sendMessage({ balance: 1, subscribe: 1 });
  }

  public close(): void {
    if (!this.isClosed && this.ws) {
      this.ws.close();
    }
    this.currentTickSymbol = null;
    this.streamSubscriptions.clear();
    this.openContractSubscriptions.clear();
  }
}

// Helper function for Deriv error messages
const getErrorMessageDeriv = (error: unknown): string => {
  console.log('=== getErrorMessageDeriv called with:', { type: typeof error, value: error });
  if (error instanceof Error) {
    return error.message;
  }
  if (error === null || error === undefined) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object') {
    const errObj = error as any;
    if (errObj.error) {
      const derivError = errObj.error;
      if (typeof derivError.message === 'string') {
        return derivError.message;
      }
      if (typeof derivError.code === 'string') {
        return derivError.code;
      }
    }
    if (typeof errObj.message === 'string') {
      return errObj.message;
    }
    return JSON.stringify(errObj);
  }
  return String(error);
};
