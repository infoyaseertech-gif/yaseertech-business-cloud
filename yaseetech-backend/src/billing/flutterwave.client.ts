import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/exceptions/app.exception';

export interface InitializeTransactionInput {
  txRef: string;
  amountNgn: number;
  customerEmail: string;
  customerName: string;
  redirectUrl: string;
}

export interface FlutterwaveVerification {
  status: 'successful' | 'failed' | 'pending' | string;
  amount: number;
  currency: string;
  txRef: string;
  flutterwaveTxId: string;
}

/**
 * Thin wrapper around Flutterwave's v3 REST API. Deliberately minimal --
 * this is not a general Flutterwave SDK, just the two calls Phase 5 needs:
 *
 *  - initializeTransaction: starts a Standard (hosted-page) checkout and
 *    returns the link the frontend redirects the browser to. We use the
 *    hosted page rather than the client-side inline widget so the
 *    frontend never touches FLUTTERWAVE_SECRET_KEY or handles card data
 *    directly -- smaller PCI surface for v1, per Phase 0's compliance note.
 *
 *  - verifyTransactionByReference: the server-to-server confirmation step.
 *    Per Phase 0's risk register (risk #1): the webhook is the trigger to
 *    check, never itself the proof of payment -- a forged or replayed
 *    webhook call can't move money if BillingService always re-verifies
 *    against Flutterwave's own API, using our secret key, before changing
 *    any subscription state.
 */
@Injectable()
export class FlutterwaveClient {
  private readonly logger = new Logger(FlutterwaveClient.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('FLUTTERWAVE_BASE_URL') ??
      'https://api.flutterwave.com/v3';
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET_KEY')!;
  }

  async initializeTransaction(input: InitializeTransactionInput): Promise<{ link: string }> {
    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: input.txRef,
        amount: input.amountNgn,
        currency: 'NGN',
        redirect_url: input.redirectUrl,
        customer: {
          email: input.customerEmail,
          name: input.customerName,
        },
        customizations: {
          title: 'YaseeTech Business Cloud',
          description: 'Subscription payment',
        },
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok || body?.status !== 'success' || !body?.data?.link) {
      this.logger.error(
        `Flutterwave initialize failed for tx_ref=${input.txRef}: ${JSON.stringify(body)}`,
      );
      throw new AppException(
        'PAYMENT_PROVIDER_ERROR',
        'Could not start the payment with Flutterwave. Please try again in a moment.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return { link: body.data.link as string };
  }

  /**
   * Verify-by-reference, NOT verify-by-id -- we only ever have our own
   * tx_ref at the point we need to verify (checkout redirect, or the
   * webhook's tx_ref field), and per Flutterwave's own guidance,
   * verify-by-reference is the correct call when you don't yet trust the
   * transaction id the caller handed you.
   */
  async verifyTransactionByReference(txRef: string): Promise<FlutterwaveVerification | null> {
    const response = await fetch(
      `${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok || body?.status !== 'success' || !body?.data) {
      // A 404 here is a legitimate outcome (payment never actually
      // started on Flutterwave's side, or hasn't landed yet) -- return
      // null and let the caller decide what that means, rather than
      // throwing and turning a "not yet" into a hard error.
      this.logger.warn(`Flutterwave verify miss for tx_ref=${txRef}: ${JSON.stringify(body)}`);
      return null;
    }

    return {
      status: body.data.status,
      amount: Number(body.data.amount),
      currency: body.data.currency,
      txRef: body.data.tx_ref,
      flutterwaveTxId: String(body.data.id),
    };
  }
}
