package v1

import (
	"context"
	stderrors "errors"
	"fmt"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/memoimport"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/runner/memopayload"
	"github.com/usememos/memos/store"
)

const maxMemoImportDataBytes = 64 << 20

// PreviewMemoImport validates a MemoArk v1 export and the empty-account guard.
func (s *APIV1Service) PreviewMemoImport(ctx context.Context, request *v1pb.PreviewMemoImportRequest) (*v1pb.MemoImportPreview, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	data := request.GetData()
	if err := validateMemoImportDataSize(data); err != nil {
		return nil, err
	}
	contentLengthLimit, err := s.getContentLengthLimit(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get content length limit")
	}
	parsed := memoimport.Parse(data, contentLengthLimit)
	preview := memoImportPreviewToProto(parsed)
	if !preview.CanImport {
		return preview, nil
	}

	nonempty, err := s.memoImportTargetNonempty(ctx, user.ID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to check import target")
	}
	if nonempty {
		preview.CanImport = false
		preview.BlockingReason = "target account is not empty"
	}
	return preview, nil
}

// ImportMemoExport restores supported memo fields in one database transaction.
func (s *APIV1Service) ImportMemoExport(ctx context.Context, request *v1pb.ImportMemoExportRequest) (*v1pb.MemoImportResult, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	data := request.GetData()
	if err := validateMemoImportDataSize(data); err != nil {
		return nil, err
	}
	contentLengthLimit, err := s.getContentLengthLimit(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get content length limit")
	}
	parsed := memoimport.Parse(data, contentLengthLimit)
	if !parsed.CanImport() {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo export: %s", parsed.BlockingReason)
	}

	creates := make([]*store.Memo, 0, len(parsed.Records))
	for _, record := range parsed.Records {
		uid, err := ValidateAndGenerateUID("")
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to generate memo ID")
		}
		memo := &store.Memo{
			UID:        uid,
			CreatorID:  user.ID,
			RowStatus:  memoImportRowStatus(record.State),
			CreatedTs:  record.CreateTime.Unix(),
			UpdatedTs:  record.UpdateTime.Unix(),
			Content:    record.Content,
			Visibility: memoImportVisibility(record.Visibility),
			Pinned:     record.Pinned,
		}
		if err := memopayload.RebuildMemoPayload(ctx, memo, s.MarkdownService); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "failed to parse imported memo content: %v", err)
		}
		creates = append(creates, memo)
	}

	if err := s.Store.ImportMemosAtomically(ctx, user.ID, creates); err != nil {
		switch {
		case stderrors.Is(err, store.ErrMemoImportTargetNotEmpty):
			return nil, status.Errorf(codes.FailedPrecondition, "target account is not empty")
		case stderrors.Is(err, store.ErrMemoImportFailpoint):
			return nil, status.Errorf(codes.Internal, "memo import failed and was rolled back")
		default:
			return nil, status.Errorf(codes.Internal, "memo import failed and was rolled back: %v", err)
		}
	}

	if len(creates) > 0 && s.SSEHub != nil {
		s.SSEHub.Broadcast(&SSEEvent{
			Type:       SSEEventMemoCreated,
			Name:       MemoNamePrefix + creates[0].UID,
			Visibility: creates[0].Visibility,
			CreatorID:  user.ID,
		})
	}
	return &v1pb.MemoImportResult{
		Restored:     int32(len(creates)),
		SkippedTotal: int32(parsed.Skipped.Total()),
		Failed:       0,
		Normal:       int32(parsed.Normal),
		Archived:     int32(parsed.Archived),
		Skipped:      memoImportSkippedToProto(parsed.Skipped),
		Warnings:     memoImportWarnings(parsed),
	}, nil
}

func validateMemoImportDataSize(data []byte) error {
	if len(data) > maxMemoImportDataBytes {
		return status.Errorf(codes.ResourceExhausted, "memo export exceeds the 64 MiB import limit")
	}
	return nil
}

func (s *APIV1Service) memoImportTargetNonempty(ctx context.Context, creatorID int32) (bool, error) {
	limit := 1
	memos, err := s.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &creatorID, Limit: &limit})
	if err != nil {
		return false, err
	}
	return len(memos) > 0, nil
}

func memoImportPreviewToProto(parsed *memoimport.Document) *v1pb.MemoImportPreview {
	issues := make([]*v1pb.MemoImportIssue, 0, len(parsed.Issues))
	for _, issue := range parsed.Issues {
		kind := v1pb.MemoImportIssueKind_INVALID
		if issue.Kind == memoimport.IssueKindUnsupported {
			kind = v1pb.MemoImportIssueKind_UNSUPPORTED
		}
		issues = append(issues, &v1pb.MemoImportIssue{
			RecordIndex: int32(issue.RecordIndex),
			SourceName:  issue.SourceName,
			Kind:        kind,
			Message:     issue.Message,
		})
	}
	exportedAt := ""
	if !parsed.ExportedAt.IsZero() {
		exportedAt = parsed.ExportedAt.Format(time.RFC3339Nano)
	}
	return &v1pb.MemoImportPreview{
		EnvelopeValid:  parsed.EnvelopeValid,
		CanImport:      parsed.CanImport(),
		BlockingReason: parsed.BlockingReason,
		Total:          int32(parsed.Total),
		Normal:         int32(parsed.Normal),
		Archived:       int32(parsed.Archived),
		Invalid:        int32(parsed.Invalid),
		Unsupported:    int32(parsed.Unsupported),
		Skipped:        memoImportSkippedToProto(parsed.Skipped),
		Issues:         issues,
		SourceUser:     parsed.SourceUser,
		ExportedAt:     exportedAt,
	}
}

func memoImportSkippedToProto(skipped memoimport.SkippedCounts) *v1pb.MemoImportSkippedCounts {
	return &v1pb.MemoImportSkippedCounts{
		Attachments: int32(skipped.Attachments),
		Comments:    int32(skipped.Comments),
		Relations:   int32(skipped.Relations),
		Reactions:   int32(skipped.Reactions),
		Locations:   int32(skipped.Locations),
		Settings:    int32(skipped.Settings),
	}
}

func memoImportWarnings(parsed *memoimport.Document) []string {
	warnings := make([]string, 0)
	seen := map[string]struct{}{}
	for _, issue := range parsed.Issues {
		if issue.Kind != memoimport.IssueKindUnsupported {
			continue
		}
		message := issue.Message
		if issue.SourceName != "" {
			message = fmt.Sprintf("%s: %s", issue.SourceName, message)
		}
		if _, ok := seen[message]; ok {
			continue
		}
		seen[message] = struct{}{}
		warnings = append(warnings, message)
	}
	return warnings
}

func memoImportRowStatus(state string) store.RowStatus {
	if state == "ARCHIVED" {
		return store.Archived
	}
	return store.Normal
}

func memoImportVisibility(visibility string) store.Visibility {
	switch visibility {
	case "PUBLIC":
		return store.Public
	case "PROTECTED":
		return store.Protected
	default:
		return store.Private
	}
}
