import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import MemoCommentSection from "@/components/MemoCommentSection";
import { useInfiniteMemoComments } from "@/hooks/useMemoQueries";
import { ListMemoCommentsResponseSchema, MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const clients = vi.hoisted(() => ({
  listMemoComments: vi.fn(),
}));

vi.mock("@/connect", () => ({
  memoServiceClient: {
    listMemoComments: clients.listMemoComments,
  },
}));

vi.mock("@/components/MemoEditor", () => ({
  default: () => null,
}));

vi.mock("@/components/MemoView", () => ({
  default: ({ memo }: { memo: { content: string } }) => <div>{memo.content}</div>,
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => null,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) =>
    ({
      "memo.comment.self": "Comments",
      "memo.load-more": "Load more",
      "resource.fetching-data": "Loading comments",
    })[key] ?? key,
}));

const parentMemo = create(MemoSchema, { name: "memos/parent", content: "Parent memo" });
const firstComment = create(MemoSchema, { name: "memos/comment-1", content: "First comment" });
const secondComment = create(MemoSchema, { name: "memos/comment-2", content: "Second comment" });

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  return { queryClient, wrapper };
}

describe("memo comment pagination", () => {
  it("requests every page with the next page token and flattens the comments", async () => {
    clients.listMemoComments
      .mockResolvedValueOnce(create(ListMemoCommentsResponseSchema, { memos: [firstComment], nextPageToken: "page-2" }))
      .mockResolvedValueOnce(create(ListMemoCommentsResponseSchema, { memos: [secondComment], nextPageToken: "" }));
    const { queryClient, wrapper } = createWrapper();
    const { result, unmount } = renderHook(() => useInfiniteMemoComments(parentMemo.name), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([firstComment]));
    expect(clients.listMemoComments).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: parentMemo.name, pageSize: 16, pageToken: "" }),
    );
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data).toEqual([firstComment, secondComment]));
    expect(clients.listMemoComments).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: parentMemo.name, pageSize: 16, pageToken: "page-2" }),
    );
    expect(result.current.hasNextPage).toBe(false);

    unmount();
    queryClient.clear();
  });

  it("shows a load-more control and disables it while the next page is loading", () => {
    const onLoadMoreComments = vi.fn();
    const { rerender } = render(
      <MemoCommentSection memo={parentMemo} comments={[firstComment]} hasMoreComments onLoadMoreComments={onLoadMoreComments} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMoreComments).toHaveBeenCalledOnce();

    rerender(
      <MemoCommentSection
        memo={parentMemo}
        comments={[firstComment]}
        hasMoreComments
        isFetchingMoreComments
        onLoadMoreComments={onLoadMoreComments}
      />,
    );

    expect(screen.getByRole("button", { name: "Loading comments" })).toBeDisabled();
  });
});
