package memoimport

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseValidV1Export(t *testing.T) {
	data := exportJSON(t, []any{
		memoJSON("memos/source-1", "NORMAL", "PRIVATE", true, "# 中文标题\n\nMarkdown #标签"),
		memoJSON("memos/source-2", "ARCHIVED", "PUBLIC", false, "archived"),
	})

	result := Parse(data, 1_000_000)
	require.True(t, result.EnvelopeValid)
	require.True(t, result.CanImport())
	require.Empty(t, result.BlockingReason)
	require.Equal(t, 2, result.Total)
	require.Equal(t, 1, result.Normal)
	require.Equal(t, 1, result.Archived)
	require.Len(t, result.Records, 2)
	require.Equal(t, "# 中文标题\n\nMarkdown #标签", result.Records[0].Content)
	require.True(t, result.Records[0].Pinned)
}

func TestParseCountsUnsupportedData(t *testing.T) {
	normal := memoJSON("memos/source-1", "NORMAL", "PROTECTED", false, "normal")
	normal["attachments"] = []any{map[string]any{"name": "attachments/a"}, map[string]any{"name": "attachments/b"}}
	normal["relations"] = []any{map[string]any{"type": "REFERENCE"}}
	normal["reactions"] = []any{map[string]any{"reactionType": "like"}}
	normal["location"] = map[string]any{"placeholder": "home"}
	comment := memoJSON("memos/comment-1", "NORMAL", "PRIVATE", false, "comment")
	comment["parent"] = "memos/source-1"

	result := Parse(exportJSON(t, []any{normal, comment}), 1_000_000)
	require.True(t, result.CanImport())
	require.Equal(t, 2, result.Total)
	require.Equal(t, 1, result.Normal)
	require.Zero(t, result.Archived)
	require.Equal(t, 1, result.Unsupported)
	require.Equal(t, SkippedCounts{Attachments: 2, Comments: 1, Relations: 1, Reactions: 1, Locations: 1}, result.Skipped)
	require.Equal(t, 6, result.Skipped.Total())
	require.Len(t, result.Records, 1)
}

func TestParseRejectsInvalidEnvelope(t *testing.T) {
	tests := []struct {
		name string
		data []byte
	}{
		{name: "invalid json", data: []byte(`{"format":`)},
		{name: "wrong format", data: mutateExport(t, nil, func(document map[string]any) { document["format"] = "other" })},
		{name: "wrong version", data: mutateExport(t, nil, func(document map[string]any) { document["formatVersion"] = 2 })},
		{name: "wrong counts", data: mutateExport(t, []any{memoJSON("memos/a", "NORMAL", "PRIVATE", false, "a")}, func(document map[string]any) {
			document["counts"].(map[string]any)["total"] = 2
		})},
		{name: "unknown envelope field", data: mutateExport(t, nil, func(document map[string]any) { document["future"] = true })},
		{name: "unsupported included content", data: mutateExport(t, nil, func(document map[string]any) {
			document["includedContent"].(map[string]any)["instanceSettings"] = true
		})},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Parse(tt.data, 1_000_000)
			require.False(t, result.EnvelopeValid)
			require.False(t, result.CanImport())
			require.NotEmpty(t, result.BlockingReason)
		})
	}
}

func TestParseRejectsInvalidUTF8WithoutReplacingContent(t *testing.T) {
	data := exportJSON(t, []any{memoJSON("memos/invalid-utf8", "NORMAL", "PRIVATE", false, "valid")})
	contentStart := bytes.Index(data, []byte(`"content":"valid"`))
	require.NotEqual(t, -1, contentStart)
	data[contentStart+len(`"content":"`)] = 0xff

	result := Parse(data, 1_000_000)
	require.False(t, result.EnvelopeValid)
	require.False(t, result.CanImport())
	require.Contains(t, result.BlockingReason, "UTF-8")
	require.Empty(t, result.Records)
}

func TestParseInvalidCoreBlocksWholeImport(t *testing.T) {
	valid := memoJSON("memos/valid", "NORMAL", "PRIVATE", false, "valid")
	invalid := memoJSON("memos/invalid", "ARCHIVED", "PUBLIC", false, "invalid")
	delete(invalid, "content")

	result := Parse(exportJSON(t, []any{valid, invalid}), 1_000_000)
	require.True(t, result.EnvelopeValid)
	require.False(t, result.CanImport())
	require.Equal(t, 1, result.Invalid)
	require.Len(t, result.Records, 1)
	require.Contains(t, result.BlockingReason, "invalid")
}

func TestParseRejectsDuplicateNamesAndOversizeContent(t *testing.T) {
	duplicate := exportJSON(t, []any{
		memoJSON("memos/same", "NORMAL", "PRIVATE", false, "a"),
		memoJSON("memos/same", "ARCHIVED", "PRIVATE", false, "b"),
	})
	result := Parse(duplicate, 1_000_000)
	require.False(t, result.CanImport())
	require.Equal(t, 1, result.Invalid)

	oversize := Parse(exportJSON(t, []any{memoJSON("memos/large", "NORMAL", "PRIVATE", false, "1234")}), 3)
	require.False(t, oversize.CanImport())
	require.Equal(t, 1, oversize.Invalid)
}

func exportJSON(t *testing.T, memos []any) []byte {
	t.Helper()
	normal, archived := 0, 0
	for _, raw := range memos {
		if raw.(map[string]any)["state"] == "ARCHIVED" {
			archived++
		} else {
			normal++
		}
	}
	document := map[string]any{
		"format":        Format,
		"formatVersion": FormatVersion,
		"exportedAt":    "2026-07-14T01:02:03Z",
		"user": map[string]any{
			"name": "users/1", "username": "source", "displayName": "Source User",
		},
		"counts": map[string]any{"total": len(memos), "normal": normal, "archived": archived},
		"includedContent": map[string]any{
			"memoData": true, "attachmentMetadata": true, "attachmentFiles": false, "comments": false, "instanceSettings": false,
		},
		"memos": memos,
	}
	data, err := json.Marshal(document)
	require.NoError(t, err)
	return data
}

func mutateExport(t *testing.T, memos []any, mutate func(map[string]any)) []byte {
	t.Helper()
	var document map[string]any
	require.NoError(t, json.Unmarshal(exportJSON(t, memos), &document))
	mutate(document)
	data, err := json.Marshal(document)
	require.NoError(t, err)
	return data
}

func memoJSON(name, state, visibility string, pinned bool, content string) map[string]any {
	return map[string]any{
		"name": name, "state": state, "creator": "users/1",
		"createTime": "2026-01-02T03:04:05Z", "updateTime": "2026-01-03T03:04:05Z",
		"content": content, "visibility": visibility, "tags": []any{}, "pinned": pinned,
		"attachments": []any{}, "relations": []any{}, "reactions": []any{},
		"property": map[string]any{}, "snippet": content,
	}
}
