package test

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestMemoImportPreviewAndRoundTrip(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	user, err := ts.CreateRegularUser(ctx, "import-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	privateMemo := memoImportJSON("memos/source-private", "NORMAL", "PRIVATE", true, "# 中文标题\n\n正文与 **Markdown** #标签")
	privateMemo["attachments"] = []any{map[string]any{"name": "attachments/a"}, map[string]any{"name": "attachments/b"}}
	privateMemo["relations"] = []any{map[string]any{"type": "REFERENCE"}}
	privateMemo["reactions"] = []any{map[string]any{"reactionType": "like"}}
	privateMemo["location"] = map[string]any{"placeholder": "Shanghai"}
	archivedMemo := memoImportJSON("memos/source-archived", "ARCHIVED", "PUBLIC", false, "已归档")
	protectedMemo := memoImportJSON("memos/source-protected", "NORMAL", "PROTECTED", false, "protected")
	comment := memoImportJSON("memos/source-comment", "NORMAL", "PRIVATE", false, "comment")
	comment["parent"] = "memos/source-private"
	data := memoImportExportJSON(t, []map[string]any{privateMemo, archivedMemo, protectedMemo, comment})

	preview, err := ts.Service.PreviewMemoImport(userCtx, &v1pb.PreviewMemoImportRequest{Data: data})
	require.NoError(t, err)
	require.True(t, preview.EnvelopeValid)
	require.True(t, preview.CanImport)
	require.Equal(t, int32(4), preview.Total)
	require.Equal(t, int32(2), preview.Normal)
	require.Equal(t, int32(1), preview.Archived)
	require.Zero(t, preview.Invalid)
	require.Equal(t, int32(1), preview.Unsupported)
	require.Equal(t, int32(2), preview.Skipped.Attachments)
	require.Equal(t, int32(1), preview.Skipped.Comments)
	require.Equal(t, int32(1), preview.Skipped.Relations)
	require.Equal(t, int32(1), preview.Skipped.Reactions)
	require.Equal(t, int32(1), preview.Skipped.Locations)
	require.NotEmpty(t, preview.Issues)

	result, err := ts.Service.ImportMemoExport(userCtx, &v1pb.ImportMemoExportRequest{Data: data})
	require.NoError(t, err)
	require.Equal(t, int32(3), result.Restored)
	require.Equal(t, int32(6), result.SkippedTotal)
	require.Zero(t, result.Failed)
	require.Equal(t, int32(2), result.Normal)
	require.Equal(t, int32(1), result.Archived)
	require.NotEmpty(t, result.Warnings)

	got, err := ts.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, got, 3)
	byContent := map[string]*store.Memo{}
	for _, memo := range got {
		byContent[memo.Content] = memo
		require.NotContains(t, []string{"source-private", "source-archived", "source-protected"}, memo.UID)
	}
	private := byContent["# 中文标题\n\n正文与 **Markdown** #标签"]
	require.NotNil(t, private)
	require.Equal(t, store.Normal, private.RowStatus)
	require.Equal(t, store.Private, private.Visibility)
	require.True(t, private.Pinned)
	require.Equal(t, int64(1_767_323_045), private.CreatedTs)
	require.Equal(t, int64(1_767_409_445), private.UpdatedTs)
	require.True(t, slices.Contains(private.Payload.Tags, "标签"))
	archived := byContent["已归档"]
	require.NotNil(t, archived)
	require.Equal(t, store.Archived, archived.RowStatus)
	require.Equal(t, store.Public, archived.Visibility)
	require.Equal(t, store.Protected, byContent["protected"].Visibility)
}

func TestMemoImportInvalidDataWritesNothing(t *testing.T) {
	tests := []struct {
		name string
		data func(*testing.T) []byte
	}{
		{name: "invalid json", data: func(*testing.T) []byte { return []byte(`{"format":`) }},
		{name: "wrong format", data: func(t *testing.T) []byte {
			return mutateMemoImportExport(t, nil, func(document map[string]any) { document["format"] = "other" })
		}},
		{name: "wrong version", data: func(t *testing.T) []byte {
			return mutateMemoImportExport(t, nil, func(document map[string]any) { document["formatVersion"] = 2 })
		}},
		{name: "invalid core record", data: func(t *testing.T) []byte {
			memo := memoImportJSON("memos/invalid", "NORMAL", "PRIVATE", false, "content")
			delete(memo, "content")
			return memoImportExportJSON(t, []map[string]any{memo})
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			ts := NewTestService(t)
			defer ts.Cleanup()
			user, err := ts.CreateRegularUser(ctx, "invalid-import-user")
			require.NoError(t, err)
			userCtx := ts.CreateUserContext(ctx, user.ID)
			data := tt.data(t)

			preview, err := ts.Service.PreviewMemoImport(userCtx, &v1pb.PreviewMemoImportRequest{Data: data})
			require.NoError(t, err)
			require.False(t, preview.CanImport)
			require.NotEmpty(t, preview.BlockingReason)
			_, err = ts.Service.ImportMemoExport(userCtx, &v1pb.ImportMemoExportRequest{Data: data})
			require.Equal(t, codes.InvalidArgument, status.Code(err))
			got, listErr := ts.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
			require.NoError(t, listErr)
			require.Empty(t, got)
		})
	}
}

func TestMemoImportRequiresAuthenticationAndEmptyAccount(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	data := memoImportExportJSON(t, []map[string]any{memoImportJSON("memos/source", "NORMAL", "PRIVATE", false, "new")})

	_, err := ts.Service.PreviewMemoImport(ctx, &v1pb.PreviewMemoImportRequest{Data: data})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = ts.Service.ImportMemoExport(ctx, &v1pb.ImportMemoExportRequest{Data: data})
	require.Equal(t, codes.Unauthenticated, status.Code(err))

	user, err := ts.CreateRegularUser(ctx, "nonempty-import-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	_, err = ts.Store.CreateMemo(ctx, &store.Memo{UID: "existing", CreatorID: user.ID, Content: "existing", Visibility: store.Private})
	require.NoError(t, err)
	preview, err := ts.Service.PreviewMemoImport(userCtx, &v1pb.PreviewMemoImportRequest{Data: data})
	require.NoError(t, err)
	require.False(t, preview.CanImport)
	require.Contains(t, preview.BlockingReason, "not empty")
	_, err = ts.Service.ImportMemoExport(userCtx, &v1pb.ImportMemoExportRequest{Data: data})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	got, listErr := ts.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, listErr)
	require.Len(t, got, 1)
	require.Equal(t, "existing", got[0].UID)
}

func TestMemoImportRejectsOversizeDataBeforeParsingAndWritesNothing(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	user, err := ts.CreateRegularUser(ctx, "oversize-import-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	data := make([]byte, (64<<20)+1)

	_, err = ts.Service.PreviewMemoImport(userCtx, &v1pb.PreviewMemoImportRequest{Data: data})
	require.Equal(t, codes.ResourceExhausted, status.Code(err))
	_, err = ts.Service.ImportMemoExport(userCtx, &v1pb.ImportMemoExportRequest{Data: data})
	require.Equal(t, codes.ResourceExhausted, status.Code(err))

	got, listErr := ts.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, listErr)
	require.Empty(t, got)
}

func TestMemoImportRollsBackAfterMidBatchFailure(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	user, err := ts.CreateRegularUser(ctx, "rollback-import-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	userCtx = store.WithMemoImportFailAfter(userCtx, 2)
	data := memoImportExportJSON(t, []map[string]any{
		memoImportJSON("memos/one", "NORMAL", "PRIVATE", false, "one"),
		memoImportJSON("memos/two", "NORMAL", "PRIVATE", false, "two"),
		memoImportJSON("memos/three", "ARCHIVED", "PUBLIC", false, "three"),
	})

	_, err = ts.Service.ImportMemoExport(userCtx, &v1pb.ImportMemoExportRequest{Data: data})
	require.Equal(t, codes.Internal, status.Code(err))
	got, listErr := ts.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, listErr)
	require.Empty(t, got)
}

func memoImportExportJSON(t *testing.T, memos []map[string]any) []byte {
	t.Helper()
	normal, archived := 0, 0
	items := make([]any, 0, len(memos))
	for _, memo := range memos {
		items = append(items, memo)
		if memo["state"] == "ARCHIVED" {
			archived++
		} else {
			normal++
		}
	}
	document := map[string]any{
		"format":        "memoark.memo-export",
		"formatVersion": 1,
		"exportedAt":    "2026-07-14T01:02:03Z",
		"user": map[string]any{
			"name": "users/9", "username": "source-user", "displayName": "Source User",
		},
		"counts": map[string]any{"total": len(memos), "normal": normal, "archived": archived},
		"includedContent": map[string]any{
			"memoData": true, "attachmentMetadata": true, "attachmentFiles": false, "comments": false, "instanceSettings": false,
		},
		"memos": items,
	}
	data, err := json.Marshal(document)
	require.NoError(t, err)
	return data
}

func mutateMemoImportExport(t *testing.T, memos []map[string]any, mutate func(map[string]any)) []byte {
	t.Helper()
	var document map[string]any
	require.NoError(t, json.Unmarshal(memoImportExportJSON(t, memos), &document))
	mutate(document)
	data, err := json.Marshal(document)
	require.NoError(t, err)
	return data
}

func memoImportJSON(name, state, visibility string, pinned bool, content string) map[string]any {
	return map[string]any{
		"name": name, "state": state, "creator": "users/9",
		"createTime": "2026-01-02T03:04:05Z", "updateTime": "2026-01-03T03:04:05Z",
		"content": content, "visibility": visibility, "tags": []any{}, "pinned": pinned,
		"attachments": []any{}, "relations": []any{}, "reactions": []any{},
		"property": map[string]any{}, "snippet": content,
	}
}
