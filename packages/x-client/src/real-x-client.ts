import { XApiError, type XListTweetsPage, type XMeResponse, type XRateLimit } from "./types.js";
import type {
  DeleteRetweetParams,
  DeleteTweetParams,
  ListUserTweetsParams,
  XApiClient,
  XResponse,
} from "./x-api-client.js";

type FetchLike = typeof fetch;

function parseRateLimit(headers: Headers): XRateLimit | undefined {
  const limitStr = headers.get("x-rate-limit-limit") ?? undefined;
  const remainingStr = headers.get("x-rate-limit-remaining") ?? undefined;
  const resetStr = headers.get("x-rate-limit-reset") ?? undefined;

  const limit = limitStr ? Number(limitStr) : undefined;
  const remaining = remainingStr ? Number(remainingStr) : undefined;
  const resetEpochSeconds = resetStr ? Number(resetStr) : undefined;

  if (
    limit === undefined &&
    remaining === undefined &&
    resetEpochSeconds === undefined
  ) {
    return undefined;
  }

  return {
    limit: Number.isFinite(limit!) ? limit : undefined,
    remaining: Number.isFinite(remaining!) ? remaining : undefined,
    resetEpochSeconds: Number.isFinite(resetEpochSeconds!) ? resetEpochSeconds : undefined,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function kindFromStatus(status: number): XApiError["kind"] {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

export class RealXApiClient implements XApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts?: { baseUrl?: string; fetchImpl?: FetchLike }) {
    this.baseUrl = opts?.baseUrl ?? "https://api.x.com/2";
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  async getMe(accessToken: string): Promise<XResponse<XMeResponse>> {
    return await this.requestJson<XMeResponse>(accessToken, "GET", "/users/me");
  }

  async listUserTweets(
    accessToken: string,
    params: ListUserTweetsParams
  ): Promise<XResponse<XListTweetsPage>> {
    const url = new URL(`${this.baseUrl}/users/${params.userId}/tweets`);
    url.searchParams.set("max_results", String(params.maxResults ?? 100));
    url.searchParams.set("tweet.fields", "created_at,referenced_tweets,in_reply_to_user_id");
    if (params.paginationToken) url.searchParams.set("pagination_token", params.paginationToken);

    return await this.requestJson<XListTweetsPage>(accessToken, "GET", url.toString());
  }

  async deleteTweet(
    accessToken: string,
    params: DeleteTweetParams
  ): Promise<XResponse<{ deleted: boolean }>> {
    return await this.requestJson<{ deleted: boolean }>(
      accessToken,
      "DELETE",
      `/tweets/${params.tweetId}`
    );
  }

  async deleteRetweet(
    accessToken: string,
    params: DeleteRetweetParams
  ): Promise<XResponse<{ deleted: boolean }>> {
    return await this.requestJson<{ deleted: boolean }>(
      accessToken,
      "DELETE",
      `/users/${params.userId}/retweets/${params.sourceTweetId}`
    );
  }

  private async requestJson<T>(
    accessToken: string,
    method: "GET" | "POST" | "DELETE",
    pathOrUrl: string
  ): Promise<XResponse<T>> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      throw new XApiError({
        message: "Network error calling X API",
        kind: "NETWORK_ERROR",
        details: err,
      });
    }

    const rateLimit = parseRateLimit(res.headers);
    if (!res.ok) {
      const details = await safeJson(res);
      throw new XApiError({
        message: `X API request failed (${res.status})`,
        kind: kindFromStatus(res.status),
        status: res.status,
        rateLimit,
        details,
      });
    }

    const json = (await safeJson(res)) as T;
    return { data: json, meta: { rateLimit } };
  }
}

