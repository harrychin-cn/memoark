package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/usememos/memos/internal/base"
)

var (
	// ErrMemoImportTargetNotEmpty is returned when the target account already owns a memo.
	ErrMemoImportTargetNotEmpty = errors.New("memo import target account is not empty")
	// ErrMemoImportFailpoint is returned by the test-only import rollback hook.
	ErrMemoImportFailpoint = errors.New("memo import test failpoint")
)

type memoImportFailAfterKey struct{}

// WithMemoImportFailAfter is a test-only helper that aborts after n inserts.
func WithMemoImportFailAfter(ctx context.Context, n int) context.Context {
	return context.WithValue(ctx, memoImportFailAfterKey{}, n)
}

// GetMemoImportFailAfter returns the test-only import failure threshold.
func GetMemoImportFailAfter(ctx context.Context) int {
	n, _ := ctx.Value(memoImportFailAfterKey{}).(int)
	return n
}

// ImportMemosAtomically imports an already validated batch into an empty account.
func (s *Store) ImportMemosAtomically(ctx context.Context, creatorID int32, memos []*Memo) error {
	if creatorID <= 0 {
		return errors.New("invalid memo import creator")
	}
	for i, memo := range memos {
		if memo == nil {
			return fmt.Errorf("memo %d is nil", i+1)
		}
		if memo.CreatorID != creatorID {
			return fmt.Errorf("memo %d creator does not match import target", i+1)
		}
		if !base.UIDMatcher.MatchString(memo.UID) {
			return fmt.Errorf("memo %d has invalid uid", i+1)
		}
		if memo.RowStatus != Normal && memo.RowStatus != Archived {
			return fmt.Errorf("memo %d has invalid row status", i+1)
		}
		if memo.Visibility != Private && memo.Visibility != Protected && memo.Visibility != Public {
			return fmt.Errorf("memo %d has invalid visibility", i+1)
		}
		if memo.CreatedTs == 0 || memo.UpdatedTs == 0 {
			return fmt.Errorf("memo %d has invalid timestamps", i+1)
		}
	}
	return s.driver.ImportMemosAtomically(ctx, creatorID, memos)
}
