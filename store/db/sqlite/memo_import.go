package sqlite

import (
	"context"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/usememos/memos/store"
)

// ImportMemosAtomically restores a validated memo batch into an empty account.
func (d *DB) ImportMemosAtomically(ctx context.Context, creatorID int32, memos []*store.Memo) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return errors.Wrap(err, "failed to begin memo import transaction")
	}
	defer func() { _ = tx.Rollback() }()

	// Serialize imports for the same account before checking the empty-target invariant.
	lockResult, err := tx.ExecContext(ctx, "UPDATE `user` SET `username` = `username` WHERE `id` = ?", creatorID)
	if err != nil {
		return errors.Wrap(err, "failed to lock memo import target")
	}
	lockedRows, err := lockResult.RowsAffected()
	if err != nil {
		return errors.Wrap(err, "failed to verify memo import target lock")
	}
	if lockedRows != 1 {
		return errors.Errorf("failed to lock memo import target: user %d does not exist", creatorID)
	}
	var exists bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM `memo` WHERE `creator_id` = ? LIMIT 1)", creatorID).Scan(&exists); err != nil {
		return errors.Wrap(err, "failed to check memo import target")
	}
	if exists {
		return store.ErrMemoImportTargetNotEmpty
	}

	const statement = "INSERT INTO `memo` (`uid`, `creator_id`, `created_ts`, `updated_ts`, `row_status`, `content`, `visibility`, `pinned`, `payload`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
	for i, memo := range memos {
		payload := "{}"
		if memo.Payload != nil {
			payloadBytes, err := protojson.Marshal(memo.Payload)
			if err != nil {
				return errors.Wrap(err, "failed to marshal imported memo payload")
			}
			payload = string(payloadBytes)
		}
		if _, err := tx.ExecContext(ctx, statement, memo.UID, creatorID, memo.CreatedTs, memo.UpdatedTs, memo.RowStatus, memo.Content, memo.Visibility, memo.Pinned, payload); err != nil {
			return errors.Wrapf(err, "failed to insert imported memo %d", i+1)
		}
		if failAfter := store.GetMemoImportFailAfter(ctx); failAfter > 0 && i+1 >= failAfter {
			return store.ErrMemoImportFailpoint
		}
	}
	if err := tx.Commit(); err != nil {
		return errors.Wrap(err, "failed to commit memo import transaction")
	}
	return nil
}
