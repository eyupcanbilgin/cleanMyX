import { XApiError, type XListTweetsPage, type XMeResponse, type XTweet } from "./types.js";
import type {
  DeleteRetweetParams,
  DeleteTweetParams,
  ListUserTweetsParams,
  XApiClient,
  XResponse,
} from "./x-api-client.js";

type MockState = {
  me: XMeResponse;
  tweetsByUserId: Map<string, XTweet[]>;
  deletedTweetIds: Set<string>;
  retweetsByUserId: Set<string>; // `${userId}:${sourceTweetId}`
};

export class MockXApiClient implements XApiClient {
  private readonly state: MockState;

  constructor(seed?: Partial<Pick<MockState, "me">> & { tweets?: Record<string, XTweet[]> }) {
    const me: XMeResponse = seed?.me ?? { id: "mock-user-1", name: "Mock User", username: "mockuser" };
    const tweetsByUserId = new Map<string, XTweet[]>();
    if (seed?.tweets) {
      for (const [userId, tweets] of Object.entries(seed.tweets)) {
        tweetsByUserId.set(userId, tweets);
      }
    }
    if (!tweetsByUserId.has(me.id)) {
      tweetsByUserId.set(me.id, [
        { id: "tweet-1", text: "Hello from mock", created_at: new Date(Date.now() - 3600_000).toISOString() },
        {
          id: "tweet-2",
          text: "A reply",
          created_at: new Date(Date.now() - 3500_000).toISOString(),
          referenced_tweets: [{ type: "replied_to", id: "tweet-0" }],
          in_reply_to_user_id: "someone",
        },
        {
          id: "tweet-3",
          text: "A quote",
          created_at: new Date(Date.now() - 3400_000).toISOString(),
          referenced_tweets: [{ type: "quoted", id: "tweet-9" }],
        },
        {
          id: "tweet-4",
          text: "A retweet",
          created_at: new Date(Date.now() - 3300_000).toISOString(),
          referenced_tweets: [{ type: "retweeted", id: "tweet-8" }],
        },
      ]);
    }

    this.state = {
      me,
      tweetsByUserId,
      deletedTweetIds: new Set(),
      retweetsByUserId: new Set(),
    };
  }

  async getMe(_accessToken: string): Promise<XResponse<XMeResponse>> {
    return { data: this.state.me, meta: {} };
  }

  async listUserTweets(
    _accessToken: string,
    params: ListUserTweetsParams
  ): Promise<XResponse<XListTweetsPage>> {
    const max = params.maxResults ?? 100;
    const tweets = this.state.tweetsByUserId.get(params.userId) ?? [];

    const offset = params.paginationToken ? Number(params.paginationToken) : 0;
    const page = tweets.slice(offset, offset + max);
    const nextOffset = offset + page.length;

    return {
      data: {
        data: page,
        next_token: nextOffset < tweets.length ? String(nextOffset) : undefined,
      },
      meta: {},
    };
  }

  async deleteTweet(
    _accessToken: string,
    params: DeleteTweetParams
  ): Promise<XResponse<{ deleted: boolean }>> {
    // Simulate idempotency: if not found, return 404.
    const allTweets = Array.from(this.state.tweetsByUserId.values()).flat();
    const exists = allTweets.some((t) => t.id === params.tweetId);
    if (!exists) {
      throw new XApiError({ message: "Not found", kind: "NOT_FOUND", status: 404 });
    }

    this.state.deletedTweetIds.add(params.tweetId);
    return { data: { deleted: true }, meta: {} };
  }

  async deleteRetweet(
    _accessToken: string,
    params: DeleteRetweetParams
  ): Promise<XResponse<{ deleted: boolean }>> {
    const key = `${params.userId}:${params.sourceTweetId}`;
    this.state.retweetsByUserId.add(key);
    return { data: { deleted: true }, meta: {} };
  }
}

