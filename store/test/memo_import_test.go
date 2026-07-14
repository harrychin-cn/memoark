package test

import (
	"context"
	stderrors "errors"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestImportMemosAtomicallyRestoresCoreFields(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	memos := []*store.Memo{
		{
			UID: "import-normal", CreatorID: user.ID, RowStatus: store.Normal,
			CreatedTs: 1_700_000_001, UpdatedTs: 1_700_000_101,
			Content: "# 中文 Markdown\n\n#标签", Visibility: store.Private, Pinned: true,
			Payload: &storepb.MemoPayload{Tags: []string{"标签"}},
		},
		{
			UID: "import-archived", CreatorID: user.ID, RowStatus: store.Archived,
			CreatedTs: 1_700_000_002, UpdatedTs: 1_700_000_102,
			Content: "archived", Visibility: store.Public, Pinned: false,
			Payload: &storepb.MemoPayload{},
		},
	}
	require.NoError(t, ts.ImportMemosAtomically(ctx, user.ID, memos))

	got, err := ts.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, got, 2)
	byUID := map[string]*store.Memo{}
	for _, memo := range got {
		byUID[memo.UID] = memo
	}
	require.Equal(t, store.Normal, byUID["import-normal"].RowStatus)
	require.Equal(t, store.Private, byUID["import-normal"].Visibility)
	require.True(t, byUID["import-normal"].Pinned)
	require.Equal(t, int64(1_700_000_001), byUID["import-normal"].CreatedTs)
	require.Equal(t, int64(1_700_000_101), byUID["import-normal"].UpdatedTs)
	require.Equal(t, "# 中文 Markdown\n\n#标签", byUID["import-normal"].Content)
	require.Equal(t, []string{"标签"}, byUID["import-normal"].Payload.Tags)
	require.Equal(t, store.Archived, byUID["import-archived"].RowStatus)
	require.Equal(t, store.Public, byUID["import-archived"].Visibility)
}

func TestImportMemosAtomicallyRejectsNonEmptyTarget(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	_, err = ts.CreateMemo(ctx, &store.Memo{UID: "existing", CreatorID: user.ID, Content: "existing", Visibility: store.Private})
	require.NoError(t, err)

	err = ts.ImportMemosAtomically(ctx, user.ID, []*store.Memo{importTestingMemo(user.ID, "new")})
	require.ErrorIs(t, err, store.ErrMemoImportTargetNotEmpty)
	got, listErr := ts.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, listErr)
	require.Len(t, got, 1)
	require.Equal(t, "existing", got[0].UID)
}

func TestImportMemosAtomicallyRollsBackOnMidBatchFailure(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	failingCtx := store.WithMemoImportFailAfter(ctx, 2)
	err = ts.ImportMemosAtomically(failingCtx, user.ID, []*store.Memo{
		importTestingMemo(user.ID, "one"), importTestingMemo(user.ID, "two"), importTestingMemo(user.ID, "three"),
	})
	require.True(t, stderrors.Is(err, store.ErrMemoImportFailpoint))
	got, listErr := ts.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID})
	require.NoError(t, listErr)
	require.Empty(t, got)
}

func TestImportMemosAtomicallyOnlyChecksTargetAccount(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	target, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	other, err := createTestingUserWithRole(ctx, ts, "other", store.RoleUser)
	require.NoError(t, err)
	_, err = ts.CreateMemo(ctx, &store.Memo{UID: "other-existing", CreatorID: other.ID, Content: "other", Visibility: store.Private})
	require.NoError(t, err)

	require.NoError(t, ts.ImportMemosAtomically(ctx, target.ID, []*store.Memo{importTestingMemo(target.ID, "target-import")}))
	got, err := ts.ListMemos(ctx, &store.FindMemo{CreatorID: &target.ID})
	require.NoError(t, err)
	require.Len(t, got, 1)
}

func TestImportMemosAtomicallyRejectsMissingCreator(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, ts.Close()) })
	missingCreatorID := int32(2_147_000_000)

	err := ts.ImportMemosAtomically(ctx, missingCreatorID, []*store.Memo{importTestingMemo(missingCreatorID, "missing-creator")})
	require.Error(t, err)
	got, listErr := ts.ListMemos(ctx, &store.FindMemo{CreatorID: &missingCreatorID})
	require.NoError(t, listErr)
	require.Empty(t, got)
}

func importTestingMemo(creatorID int32, uid string) *store.Memo {
	return &store.Memo{
		UID: uid, CreatorID: creatorID, RowStatus: store.Normal,
		CreatedTs: 1_700_000_000, UpdatedTs: 1_700_000_000,
		Content: uid, Visibility: store.Protected, Payload: &storepb.MemoPayload{},
	}
}
