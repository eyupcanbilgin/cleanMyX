export type XRateLimit = {
  limit?: number;
  remaining?: number;
  resetEpochSeconds?: number;
};

export type XApiErrorKind =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class XApiError extends Error {
  public readonly kind: XApiErrorKind;
  public readonly status?: number;
  public readonly rateLimit?: XRateLimit;
  public readonly details?: unknown;

  constructor(opts: {
    message: string;
    kind: XApiErrorKind;
    status?: number;
    rateLimit?: XRateLimit;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "XApiError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.rateLimit = opts.rateLimit;
    this.details = opts.details;
  }
}

export type XMeResponse = {
  id: string;
  name?: string;
  username?: string;
};

export type XTweet = {
  id: string;
  text: string;
  created_at?: string;
  referenced_tweets?: Array<{
    type: "replied_to" | "quoted" | "retweeted";
    id: string;
  }>;
  in_reply_to_user_id?: string;
};

export type XListTweetsPage = {
  data: XTweet[];
  next_token?: string;
};

