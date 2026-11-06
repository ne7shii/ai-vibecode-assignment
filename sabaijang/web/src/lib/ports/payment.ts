// PaymentGateway port + deterministic fake (IMPLEMENTATION-PLAN §2). No real money ever moves.
export type ChargeRequest =
  | { key: string; amount: number; method: 'CARD'; cardNumber: string }
  | { key: string; amount: number; method: 'PROMPTPAY'; confirmed: boolean };

export interface ChargeResult { status: 'SUCCESS' | 'FAILED'; reason?: string; last4?: string }

export interface PaymentGateway {
  charge(r: ChargeRequest): Promise<ChargeResult>;
  refund(r: { key: string; amount: number }): Promise<ChargeResult>;
}

export const TEST_CARDS = { success: '4242424242424242', declined: '4000000000000002' };

export class FakePaymentGateway implements PaymentGateway {
  calls: (ChargeRequest | { refund: true; key: string; amount: number })[] = [];
  private byKey = new Map<string, ChargeResult>();
  delayMs = 0;

  async charge(r: ChargeRequest): Promise<ChargeResult> {
    const seen = this.byKey.get(r.key);
    if (seen) return seen; // same idempotency key → same result, no new charge
    this.calls.push(r);
    if (this.delayMs) await new Promise((res) => setTimeout(res, this.delayMs));
    let result: ChargeResult;
    if (r.method === 'PROMPTPAY') {
      result = r.confirmed ? { status: 'SUCCESS' } : { status: 'FAILED', reason: 'NOT_PAID' };
    } else {
      const digits = r.cardNumber.replace(/\D/g, '');
      if (digits === TEST_CARDS.success) result = { status: 'SUCCESS', last4: '4242' };
      else if (digits === TEST_CARDS.declined) result = { status: 'FAILED', reason: 'DECLINED', last4: '0002' };
      else result = { status: 'FAILED', reason: 'UNKNOWN_CARD', last4: digits.slice(-4) };
    }
    if (result.status === 'SUCCESS') this.byKey.set(r.key, result);
    return result;
  }

  async refund(r: { key: string; amount: number }): Promise<ChargeResult> {
    const seen = this.byKey.get(r.key);
    if (seen) return seen;
    this.calls.push({ refund: true, ...r });
    const res: ChargeResult = { status: 'SUCCESS' };
    this.byKey.set(r.key, res);
    return res;
  }

  successfulCharges(prefix?: string) {
    return this.calls.filter((c): c is ChargeRequest => !('refund' in c) && (!prefix || c.key.startsWith(prefix)) && this.byKey.get(c.key)?.status === 'SUCCESS');
  }
  reset() { this.calls = []; this.byKey.clear(); this.delayMs = 0; }
}

const g = globalThis as unknown as { __gateway?: FakePaymentGateway };
export function paymentGateway(): FakePaymentGateway {
  return (g.__gateway ??= new FakePaymentGateway());
}
