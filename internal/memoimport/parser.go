// Package memoimport parses and validates MemoArk JSON memo exports.
package memoimport

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/base"
)

const (
	// Format is the only import document format supported by v1.
	Format = "memoark.memo-export"
	// FormatVersion is the only import document version supported by v1.
	FormatVersion = 1
)

// IssueKind classifies preview issues.
type IssueKind string

const (
	IssueKindInvalid     IssueKind = "INVALID"
	IssueKindUnsupported IssueKind = "UNSUPPORTED"
)

// Issue describes one document or record problem.
type Issue struct {
	RecordIndex int
	SourceName  string
	Kind        IssueKind
	Message     string
}

// SkippedCounts reports unsupported data that a core memo import will skip.
type SkippedCounts struct {
	Attachments int
	Comments    int
	Relations   int
	Reactions   int
	Locations   int
	Settings    int
}

// Total returns the number of skipped records and nested items.
func (c SkippedCounts) Total() int {
	return c.Attachments + c.Comments + c.Relations + c.Reactions + c.Locations + c.Settings
}

// Record is the supported, validated subset of an exported memo.
type Record struct {
	SourceName string
	State      string
	CreateTime time.Time
	UpdateTime time.Time
	Content    string
	Visibility string
	Pinned     bool
}

// Document contains the complete parse and preview result.
type Document struct {
	EnvelopeValid  bool
	BlockingReason string
	Total          int
	Normal         int
	Archived       int
	Invalid        int
	Unsupported    int
	Skipped        SkippedCounts
	Issues         []Issue
	SourceUser     string
	ExportedAt     time.Time
	Records        []Record
}

// CanImport reports whether all required envelope and memo core fields are valid.
func (d *Document) CanImport() bool {
	return d.EnvelopeValid && d.Invalid == 0
}

type rawDocument struct {
	Format          *string             `json:"format"`
	FormatVersion   *int                `json:"formatVersion"`
	ExportedAt      *string             `json:"exportedAt"`
	User            *rawUser            `json:"user"`
	Counts          *rawCounts          `json:"counts"`
	IncludedContent *rawIncludedContent `json:"includedContent"`
	Memos           *[]json.RawMessage  `json:"memos"`
}

type rawUser struct {
	Name        string `json:"name"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type rawCounts struct {
	Total    int `json:"total"`
	Normal   int `json:"normal"`
	Archived int `json:"archived"`
}

type rawIncludedContent struct {
	MemoData           bool `json:"memoData"`
	AttachmentMetadata bool `json:"attachmentMetadata"`
	AttachmentFiles    bool `json:"attachmentFiles"`
	Comments           bool `json:"comments"`
	InstanceSettings   bool `json:"instanceSettings"`
}

var allowedMemoFields = map[string]struct{}{
	"name": {}, "state": {}, "creator": {}, "createTime": {}, "updateTime": {},
	"content": {}, "visibility": {}, "tags": {}, "pinned": {}, "attachments": {},
	"relations": {}, "reactions": {}, "property": {}, "parent": {}, "snippet": {},
	"location": {},
}

// Parse validates the entire export before any caller can write its Records.
// maxContentLength is applied in bytes, matching the memo create API; zero disables it.
func Parse(data []byte, maxContentLength int) *Document {
	result := &Document{}
	if len(bytes.TrimSpace(data)) == 0 {
		return invalidEnvelope(result, "export file is empty")
	}
	if !utf8.Valid(data) {
		return invalidEnvelope(result, "export JSON is not valid UTF-8")
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var raw rawDocument
	if err := decoder.Decode(&raw); err != nil {
		return invalidEnvelope(result, fmt.Sprintf("invalid export JSON: %v", err))
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return invalidEnvelope(result, err.Error())
	}
	if raw.Format == nil || *raw.Format != Format {
		return invalidEnvelope(result, fmt.Sprintf("unsupported export format; expected %q", Format))
	}
	if raw.FormatVersion == nil || *raw.FormatVersion != FormatVersion {
		return invalidEnvelope(result, fmt.Sprintf("unsupported export version; expected %d", FormatVersion))
	}
	if raw.ExportedAt == nil {
		return invalidEnvelope(result, "missing exportedAt")
	}
	exportedAt, err := time.Parse(time.RFC3339Nano, *raw.ExportedAt)
	if err != nil {
		return invalidEnvelope(result, "invalid exportedAt timestamp")
	}
	result.ExportedAt = exportedAt
	if raw.User == nil || raw.User.Name == "" || raw.User.Username == "" {
		return invalidEnvelope(result, "missing export user identity")
	}
	result.SourceUser = raw.User.DisplayName
	if result.SourceUser == "" {
		result.SourceUser = raw.User.Username
	}
	if raw.Counts == nil || raw.Counts.Total < 0 || raw.Counts.Normal < 0 || raw.Counts.Archived < 0 {
		return invalidEnvelope(result, "missing or invalid export counts")
	}
	if raw.Counts.Total != raw.Counts.Normal+raw.Counts.Archived {
		return invalidEnvelope(result, "export counts are inconsistent")
	}
	if raw.IncludedContent == nil || !raw.IncludedContent.MemoData {
		return invalidEnvelope(result, "export does not include memo data")
	}
	if !raw.IncludedContent.AttachmentMetadata || raw.IncludedContent.AttachmentFiles || raw.IncludedContent.Comments || raw.IncludedContent.InstanceSettings {
		return invalidEnvelope(result, "includedContent flags do not match MemoArk export v1")
	}
	if raw.Memos == nil {
		return invalidEnvelope(result, "missing memos array")
	}
	if raw.Counts.Total != len(*raw.Memos) {
		return invalidEnvelope(result, "declared memo count does not match memos array")
	}

	result.EnvelopeValid = true
	result.Total = len(*raw.Memos)
	seenNames := make(map[string]struct{}, result.Total)
	actualNormal, actualArchived := 0, 0
	allStatesValid := true
	for i, rawMemo := range *raw.Memos {
		recordIndex := i + 1
		record, counts, comment, state, err := parseRecord(rawMemo, maxContentLength)
		result.Skipped.Attachments += counts.Attachments
		result.Skipped.Relations += counts.Relations
		result.Skipped.Reactions += counts.Reactions
		result.Skipped.Locations += counts.Locations
		if state == "NORMAL" {
			actualNormal++
		} else if state == "ARCHIVED" {
			actualArchived++
		} else {
			allStatesValid = false
		}
		if err != nil {
			result.Invalid++
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindInvalid, Message: err.Error()})
			continue
		}
		if _, exists := seenNames[record.SourceName]; exists {
			result.Invalid++
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindInvalid, Message: "duplicate memo resource name"})
			continue
		}
		seenNames[record.SourceName] = struct{}{}
		if comment {
			result.Unsupported++
			result.Skipped.Comments++
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindUnsupported, Message: "comments are not restored in import v1"})
			continue
		}
		if counts.Attachments > 0 {
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindUnsupported, Message: fmt.Sprintf("%d attachment metadata item(s) will be skipped", counts.Attachments)})
		}
		if counts.Relations > 0 {
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindUnsupported, Message: fmt.Sprintf("%d relation(s) will be skipped", counts.Relations)})
		}
		if counts.Reactions > 0 {
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindUnsupported, Message: fmt.Sprintf("%d reaction(s) will be skipped", counts.Reactions)})
		}
		if counts.Locations > 0 {
			result.Issues = append(result.Issues, Issue{RecordIndex: recordIndex, SourceName: record.SourceName, Kind: IssueKindUnsupported, Message: "location will be skipped"})
		}
		result.Records = append(result.Records, record)
		if record.State == "NORMAL" {
			result.Normal++
		} else {
			result.Archived++
		}
	}

	if allStatesValid && (raw.Counts.Normal != actualNormal || raw.Counts.Archived != actualArchived) {
		return invalidEnvelope(result, "declared state counts do not match memo records")
	}
	if result.Invalid > 0 {
		result.BlockingReason = fmt.Sprintf("%d memo record(s) are invalid", result.Invalid)
	}
	return result
}

func invalidEnvelope(result *Document, reason string) *Document {
	result.EnvelopeValid = false
	result.BlockingReason = reason
	result.Issues = append(result.Issues, Issue{Kind: IssueKindInvalid, Message: reason})
	return result
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("export JSON contains trailing data")
		}
		return errors.Wrap(err, "invalid trailing export JSON")
	}
	return nil
}

func parseRecord(data json.RawMessage, maxContentLength int) (Record, SkippedCounts, bool, string, error) {
	var record Record
	var skipped SkippedCounts
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
		return record, skipped, false, "", errors.New("memo must be a JSON object")
	}
	for key := range fields {
		if _, ok := allowedMemoFields[key]; !ok {
			return record, skipped, false, "", errors.Errorf("unknown memo field %q", key)
		}
	}

	name, err := requiredString(fields, "name")
	if err != nil {
		return record, skipped, false, "", err
	}
	record.SourceName = name
	uid, ok := strings.CutPrefix(name, "memos/")
	if !ok || !base.UIDMatcher.MatchString(uid) {
		return record, skipped, false, "", errors.New("invalid memo resource name")
	}
	state, err := requiredString(fields, "state")
	if err != nil {
		return record, skipped, false, "", err
	}
	if state != "NORMAL" && state != "ARCHIVED" {
		return record, skipped, false, state, errors.Errorf("unsupported memo state %q", state)
	}
	record.State = state
	createTime, err := requiredTimestamp(fields, "createTime")
	if err != nil {
		return record, skipped, false, state, err
	}
	record.CreateTime = createTime
	if value, ok := fields["updateTime"]; ok && !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		var text string
		if err := json.Unmarshal(value, &text); err != nil {
			return record, skipped, false, state, errors.New("updateTime must be an RFC3339 string")
		}
		record.UpdateTime, err = time.Parse(time.RFC3339Nano, text)
		if err != nil {
			return record, skipped, false, state, errors.New("invalid updateTime timestamp")
		}
	} else {
		record.UpdateTime = createTime
	}
	record.Content, err = requiredString(fields, "content")
	if err != nil {
		return record, skipped, false, state, err
	}
	if maxContentLength > 0 && len(record.Content) > maxContentLength {
		return record, skipped, false, state, errors.Errorf("content exceeds the %d-byte limit", maxContentLength)
	}
	record.Visibility, err = requiredString(fields, "visibility")
	if err != nil {
		return record, skipped, false, state, err
	}
	if record.Visibility != "PRIVATE" && record.Visibility != "PROTECTED" && record.Visibility != "PUBLIC" {
		return record, skipped, false, state, errors.Errorf("unsupported memo visibility %q", record.Visibility)
	}
	value, ok := fields["pinned"]
	if !ok || json.Unmarshal(value, &record.Pinned) != nil {
		return record, skipped, false, state, errors.New("pinned must be a boolean")
	}

	if skipped.Attachments, err = arrayLength(fields, "attachments"); err != nil {
		return record, skipped, false, state, err
	}
	if skipped.Relations, err = arrayLength(fields, "relations"); err != nil {
		return record, skipped, false, state, err
	}
	if skipped.Reactions, err = arrayLength(fields, "reactions"); err != nil {
		return record, skipped, false, state, err
	}
	if value, ok := fields["location"]; ok && !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		var object map[string]json.RawMessage
		if err := json.Unmarshal(value, &object); err != nil || object == nil {
			return record, skipped, false, state, errors.New("location must be an object or null")
		}
		skipped.Locations = 1
	}
	comment := false
	if value, ok := fields["parent"]; ok && !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		var parent string
		if err := json.Unmarshal(value, &parent); err != nil {
			return record, skipped, false, state, errors.New("parent must be a string or null")
		}
		comment = parent != ""
	}
	return record, skipped, comment, state, nil
}

func requiredString(fields map[string]json.RawMessage, name string) (string, error) {
	value, ok := fields[name]
	if !ok {
		return "", errors.Errorf("missing required field %q", name)
	}
	var text string
	if err := json.Unmarshal(value, &text); err != nil {
		return "", errors.Errorf("%s must be a string", name)
	}
	return text, nil
}

func requiredTimestamp(fields map[string]json.RawMessage, name string) (time.Time, error) {
	text, err := requiredString(fields, name)
	if err != nil {
		return time.Time{}, err
	}
	parsed, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return time.Time{}, errors.Errorf("invalid %s timestamp", name)
	}
	return parsed, nil
}

func arrayLength(fields map[string]json.RawMessage, name string) (int, error) {
	value, ok := fields[name]
	if !ok {
		return 0, nil
	}
	var items []json.RawMessage
	if err := json.Unmarshal(value, &items); err != nil {
		return 0, errors.Errorf("%s must be an array", name)
	}
	return len(items), nil
}
