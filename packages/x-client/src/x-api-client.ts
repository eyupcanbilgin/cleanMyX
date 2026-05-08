import type { XListTweetsPage, XMeResponse, XRateLimit } from "./types.js";

export type ListUserTweetsParams = {
  userId: string;
  paginationToken?: string;
  maxResults?: number;
};

export type DeleteTweetParams = {
  tweetId: string;
};

export type DeleteRetweetParams = {
  userId: string;
  sourceTweetId: string;
};

export type XResponseMeta = {
  rateLimit?: XRateLimit;
};

export type XResponse<T> = {
  data: T;
  meta: XResponseMeta;
};

export interface XApiClient {
  getMe(accessToken: string): Promise<XResponse<XMeResponse>>;
  listUserTweets(
    accessToken: string,
    params: ListUserTweetsParams
  ): Promise<XResponse<XListTweetsPage>>;
  deleteTweet(
    accessToken: string,
    params: DeleteTweetParams
  ): Promise<XResponse<{ deleted: boolean }>>;
  deleteRetweet(
    accessToken: string,
    params: DeleteRetweetParams
  ): Promise<XResponse<{ deleted: boolean }>>;
}

