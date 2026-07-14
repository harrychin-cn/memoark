import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { InstanceSetting_Key } from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityFromString } from "@/utils/memo";
import { generateUUID } from "@/utils/uuid";
import {
  AudioRecorderPanel,
  DraftRecoveryNotice,
  EditorContent,
  EditorMetadata,
  EditorToolbar,
  FailedSaveNotice,
  FocusModeExitButton,
  FocusModeOverlay,
  TimestampPopover,
} from "./components";
import { FOCUS_MODE_STYLES } from "./constants";
import type { EditorRefActions } from "./Editor";
import { useAudioRecorder, useAutoSave, useFocusMode, useKeyboard, useMemoInit } from "./hooks";
import { cacheService, errorService, memoService, transcriptionService, validationService } from "./services";
import { EditorProvider, useEditorContext } from "./state";
import type { MemoEditorProps } from "./types";
import type { LocalFile } from "./types/attachment";

type SaveDeliveryState =
  | { kind: "idle" }
  | { kind: "sending"; requestId?: string; savedAt: string; retrying: boolean; persisted: boolean }
  | { kind: "unsent"; requestId?: string; savedAt: string };

const MemoEditor = (props: MemoEditorProps) => (
  <EditorProvider>
    <MemoEditorImpl {...props} />
  </EditorProvider>
);

const MemoEditorImpl: React.FC<MemoEditorProps> = ({
  className,
  cacheKey,
  memo,
  parentMemoName,
  autoFocus,
  placeholder,
  defaultCreateTime,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const editorRef = useRef<EditorRefActions>(null);
  const { state, actions, dispatch } = useEditorContext();
  const { userGeneralSetting } = useAuth();
  const { aiSetting, fetchSetting } = useInstance();
  const [isAudioRecorderOpen, setIsAudioRecorderOpen] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [completedEditIdentity, setCompletedEditIdentity] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [deliveryState, setDeliveryState] = useState<SaveDeliveryState>({ kind: "idle" });
  const saveInFlightRef = useRef(false);

  const memoName = memo?.name;
  const draftCacheKey = memoName ? `edit-${memoName}` : cacheKey;
  const editorIdentity = `${currentUser?.name ?? ""}\u0000${draftCacheKey ?? ""}\u0000${memoName ?? "create"}`;
  const canTranscribe = useMemo(() => {
    const providerId = aiSetting.transcription?.providerId ?? "";
    if (!providerId) return false;
    const provider = aiSetting.providers.find((p) => p.id === providerId);
    return Boolean(provider?.apiKeySet);
  }, [aiSetting.providers, aiSetting.transcription?.providerId]);

  // Get default visibility from user settings
  const defaultVisibility = userGeneralSetting?.memoVisibility ? convertVisibilityFromString(userGeneralSetting.memoVisibility) : undefined;

  const {
    isInitialized,
    pendingDraft,
    draftBaseUpdateTime,
    draftRequestId,
    recoveredPendingSave,
    restorePendingDraft,
    discardPendingDraft,
  } = useMemoInit({
    editorRef,
    memo,
    cacheKey: draftCacheKey,
    username: currentUser?.name ?? "",
    autoFocus,
    defaultVisibility,
    defaultCreateTime,
  });

  useEffect(() => {
    if (!isInitialized) return;

    setRequestId(draftRequestId);
    setDeliveryState(
      recoveredPendingSave
        ? { kind: "unsent", requestId: recoveredPendingSave.requestId, savedAt: recoveredPendingSave.savedAt }
        : { kind: "idle" },
    );
  }, [editorIdentity, isInitialized, draftRequestId, recoveredPendingSave]);

  // Auto-save new and edited memo content locally. A discovered edit draft must
  // be explicitly restored or discarded before new writes can replace it.
  const { discardDraft } = useAutoSave(state.content, currentUser?.name ?? "", draftCacheKey, {
    enabled: isInitialized && !pendingDraft && completedEditIdentity !== editorIdentity,
    baselineContent: memo?.content ?? "",
    mode: memo ? "edit" : "create",
    memoName,
    baseUpdateTime: draftBaseUpdateTime,
    requestId,
    pending: deliveryState.kind !== "idle",
    attemptedAt: deliveryState.kind === "idle" ? undefined : deliveryState.savedAt,
  });
  const isEditorLocked = Boolean(pendingDraft) || state.ui.isLoading.saving;

  // Focus mode management with body scroll lock
  useFocusMode(state.ui.isFocusMode);

  // Live-sync the draft's createTime/updateTime to the calendar-derived prop.
  // Only applies in create mode; edit mode owns its own timestamps. Runs after
  // initial mount (the seed value is set in useMemoInit), and again whenever
  // the prop changes — e.g., when the user picks a different calendar date
  // while the editor is open.
  useEffect(() => {
    if (memo) return;
    if (!isInitialized) return;
    dispatch(
      actions.setTimestamps({
        createTime: defaultCreateTime,
        updateTime: defaultCreateTime,
      }),
    );
  }, [defaultCreateTime, memo, isInitialized, actions, dispatch]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    void fetchSetting(InstanceSetting_Key.AI).catch(() => undefined);
  }, [currentUser, fetchSetting]);

  const insertTranscribedText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const content = editor.getContent();
    const cursor = editor.getCursorPosition();
    const beforeCursor = content.slice(0, cursor);
    const afterCursor = content.slice(cursor);
    const prefix = beforeCursor.length === 0 || beforeCursor.endsWith("\n\n") ? "" : beforeCursor.endsWith("\n") ? "\n" : "\n\n";
    const suffix = afterCursor.length === 0 || afterCursor.startsWith("\n\n") ? "" : afterCursor.startsWith("\n") ? "\n" : "\n\n";

    editor.insertText(text, prefix, suffix);
    editor.scrollToCursor();
  }, []);

  const handleTranscribeRecordedAudio = useCallback(
    async (localFile: LocalFile) => {
      if (!canTranscribe) {
        dispatch(actions.addLocalFile(localFile));
        setIsTranscribingAudio(false);
        setIsAudioRecorderOpen(false);
        return;
      }

      try {
        const text = (await transcriptionService.transcribeFile(localFile.file)).trim();
        if (!text) {
          dispatch(actions.addLocalFile(localFile));
          toast.error(t("editor.audio-recorder.transcribe-empty"));
          return;
        }

        insertTranscribedText(text);
        toast.success(t("editor.audio-recorder.transcribe-success"));
      } catch (error) {
        console.error(error);
        toast.error(errorService.getErrorMessage(error) || t("editor.audio-recorder.transcribe-error"));
        dispatch(actions.addLocalFile(localFile));
      } finally {
        setIsTranscribingAudio(false);
        setIsAudioRecorderOpen(false);
      }
    },
    [actions, canTranscribe, dispatch, insertTranscribedText, t],
  );

  const audioRecorderActions = useMemo(
    () => ({
      setAudioRecorderSupport: (value: boolean) => dispatch(actions.setAudioRecorderSupport(value)),
      setAudioRecorderPermission: (value: "unknown" | "granted" | "denied") => dispatch(actions.setAudioRecorderPermission(value)),
      setAudioRecorderStatus: (value: "idle" | "requesting_permission" | "recording" | "error" | "unsupported") =>
        dispatch(actions.setAudioRecorderStatus(value)),
      setAudioRecorderElapsed: (value: number) => dispatch(actions.setAudioRecorderElapsed(value)),
      setAudioRecorderError: (value?: string) => dispatch(actions.setAudioRecorderError(value)),
      onRecordingComplete: (localFile: LocalFile, mode: "attach" | "transcribe") => {
        if (mode === "transcribe") {
          void handleTranscribeRecordedAudio(localFile);
          return;
        }

        dispatch(actions.addLocalFile(localFile));
        setIsAudioRecorderOpen(false);
      },
      onRecordingEmpty: (mode: "attach" | "transcribe") => {
        if (mode === "transcribe") {
          setIsTranscribingAudio(false);
          toast.error(t("editor.audio-recorder.transcribe-empty"));
        }
        setIsAudioRecorderOpen(false);
      },
    }),
    [actions, dispatch, handleTranscribeRecordedAudio, t],
  );

  const audioRecorder = useAudioRecorder(audioRecorderActions);

  useEffect(() => {
    if (!isAudioRecorderOpen) {
      return;
    }

    if (state.audioRecorder.status === "error" || state.audioRecorder.status === "unsupported") {
      toast.error(state.audioRecorder.error || t("editor.audio-recorder.error-description"));
      setIsAudioRecorderOpen(false);
    }
  }, [isAudioRecorderOpen, state.audioRecorder.error, state.audioRecorder.status, t]);

  const handleToggleFocusMode = () => {
    dispatch(actions.toggleFocusMode());
  };

  const handleStartAudioRecording = async () => {
    setIsAudioRecorderOpen(true);
    await audioRecorder.startRecording();
  };

  const handleAudioRecorderClick = () => {
    if (state.audioRecorder.status === "recording" || state.audioRecorder.status === "requesting_permission") {
      return;
    }

    void handleStartAudioRecording();
  };

  const handleCancelAudioRecording = () => {
    setIsTranscribingAudio(false);
    audioRecorder.resetRecording();
    setIsAudioRecorderOpen(false);
  };

  const handleTranscribeAudioRecording = () => {
    if (!canTranscribe || isTranscribingAudio) {
      return;
    }

    setIsTranscribingAudio(true);
    const didStop = audioRecorder.stopRecording("transcribe");
    if (!didStop) {
      setIsTranscribingAudio(false);
    }
  };

  useKeyboard(editorRef, handleSave);

  async function handleSave() {
    if (saveInFlightRef.current || isEditorLocked) return;

    // Validate before saving
    const { valid, reason } = validationService.canSave(state);
    if (!valid) {
      toast.error(reason || "Cannot save");
      return;
    }

    const retrying = deliveryState.kind === "unsent";
    const savedAt = new Date().toISOString();
    const draftKey = cacheService.key(currentUser?.name ?? "", draftCacheKey);
    let nextRequestId = requestId;
    let persisted = false;

    saveInFlightRef.current = true;
    dispatch(actions.setLoading("saving", true));

    try {
      // uuid uses getRandomValues and works on the plain-HTTP LAN deployments
      // where crypto.randomUUID may be unavailable. Keep generation inside the
      // guarded save path so an unexpected runtime failure cannot escape the UI.
      nextRequestId = memo ? requestId : (requestId ?? generateUUID());
      persisted = cacheService.saveNow(draftKey, state.content, {
        mode: memo ? "edit" : "create",
        memoName,
        baseUpdateTime: draftBaseUpdateTime,
        savedAt,
        requestId: nextRequestId,
        pending: true,
        attemptedAt: savedAt,
      });

      setRequestId(nextRequestId);
      setDeliveryState({ kind: "sending", requestId: nextRequestId, savedAt, retrying, persisted });

      const result = await memoService.save(state, {
        memoName,
        parentMemoName,
        requestId: nextRequestId,
        retrying,
        baseUpdateTime: draftBaseUpdateTime,
      });

      if (!result.hasChanges && !result.confirmedExisting && !retrying) {
        discardDraft();
        setRequestId(undefined);
        setDeliveryState({ kind: "idle" });
        toast.error(t("editor.no-changes-detected"));
        onCancel?.();
        return;
      }

      // Clear localStorage cache on successful save and prevent the unmount
      // flush from writing the just-saved content back as a stale draft.
      if (memo) {
        setCompletedEditIdentity(editorIdentity);
      }
      discardDraft();
      setRequestId(undefined);
      setDeliveryState({ kind: "idle" });

      // Invalidate React Query cache to refresh memo lists across the app
      const invalidationPromises = [
        queryClient.invalidateQueries({ queryKey: memoKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: userKeys.stats() }),
      ];

      // Ensure memo detail pages don't keep stale cached content after edits.
      if (memoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.detail(memoName) }));
      }

      // If this was a comment, also invalidate the comments query for the parent memo
      if (parentMemoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.comments(parentMemoName) }));
      }

      await Promise.all(invalidationPromises);

      // Reset editor state to initial values
      dispatch(actions.reset());
      if (!memoName && defaultVisibility) {
        dispatch(actions.setMetadata({ visibility: defaultVisibility }));
      }
      // Re-seed the calendar-derived timestamps so the popover stays visible
      // and subsequent memos in the same filter session keep the prefilled date.
      // Without this, the live-sync effect won't re-fire (its deps don't change
      // across reset), and memo #2 onward would silently fall back to "now".
      if (!memoName && defaultCreateTime) {
        dispatch(actions.setTimestamps({ createTime: defaultCreateTime, updateTime: defaultCreateTime }));
      }

      // Notify parent component of successful save
      onConfirm?.(result.memoName);
    } catch (error) {
      if (errorService.classifySaveError(error) === "network" && persisted) {
        setDeliveryState({ kind: "unsent", requestId: nextRequestId, savedAt });
      } else {
        setDeliveryState({ kind: "idle" });
        cacheService.saveNow(draftKey, state.content, {
          mode: memo ? "edit" : "create",
          memoName,
          baseUpdateTime: draftBaseUpdateTime,
          savedAt,
          requestId: nextRequestId,
          pending: false,
        });

        if (errorService.classifySaveError(error) === "network") {
          console.error("Failed to save memo", error);
          toast.error(t("editor.failed-save.local-cache-error"));
        } else {
          handleError(error, toast.error, {
            context: "Failed to save memo",
            fallbackMessage: errorService.getErrorMessage(error),
          });
        }
      }
    } finally {
      saveInFlightRef.current = false;
      dispatch(actions.setLoading("saving", false));
    }
  }

  const failedSaveNotice =
    deliveryState.kind === "unsent"
      ? { savedAt: deliveryState.savedAt, retrying: false }
      : deliveryState.kind === "sending" && deliveryState.retrying
        ? { savedAt: deliveryState.savedAt, retrying: true }
        : null;

  return (
    <>
      <FocusModeOverlay isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} />

      {/*
        Layout structure:
        - Uses justify-between to push content to top and bottom
        - In focus mode: becomes fixed with specific spacing, editor grows to fill space
        - In normal mode: stays relative with max-height constraint
      */}
      <div
        className={cn(
          "group relative w-full flex flex-col justify-between items-start bg-card px-4 pt-3 pb-1 rounded-lg border border-border gap-2",
          FOCUS_MODE_STYLES.transition,
          state.ui.isFocusMode && cn(FOCUS_MODE_STYLES.container.base, FOCUS_MODE_STYLES.container.spacing),
          className,
        )}
      >
        {/* Exit button is absolutely positioned in top-right corner when active */}
        <FocusModeExitButton isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} title={t("editor.exit-focus-mode")} />

        {(memoName || (!memo && state.timestamps.createTime)) && (
          <div className="w-full -mb-1" inert={isEditorLocked}>
            <TimestampPopover />
          </div>
        )}

        {pendingDraft && (
          <DraftRecoveryNotice
            savedAt={pendingDraft.savedAt}
            hasServerChanges={pendingDraft.hasServerChanges}
            onRestore={() => {
              restorePendingDraft();
              requestAnimationFrame(() => editorRef.current?.focus());
            }}
            onDiscard={discardPendingDraft}
          />
        )}

        {failedSaveNotice && (
          <FailedSaveNotice savedAt={failedSaveNotice.savedAt} retrying={failedSaveNotice.retrying} onRetry={() => void handleSave()} />
        )}

        {/* Editor content grows to fill available space in focus mode */}
        <EditorContent ref={editorRef} placeholder={placeholder} readOnly={isEditorLocked} />

        {isAudioRecorderOpen &&
          (state.audioRecorder.status === "recording" || state.audioRecorder.status === "requesting_permission" || isTranscribingAudio) && (
            <AudioRecorderPanel
              audioRecorder={state.audioRecorder}
              mediaStream={audioRecorder.recordingStream}
              onStop={audioRecorder.stopRecording}
              onCancel={handleCancelAudioRecording}
              onTranscribe={handleTranscribeAudioRecording}
              canTranscribe={canTranscribe}
              isTranscribing={isTranscribingAudio}
            />
          )}

        {/* Metadata and toolbar grouped together at bottom */}
        <div className="w-full flex flex-col gap-2" inert={isEditorLocked}>
          <EditorMetadata memoName={memoName} />
          <EditorToolbar onSave={handleSave} onCancel={onCancel} memoName={memoName} onAudioRecorderClick={handleAudioRecorderClick} />
        </div>
      </div>
    </>
  );
};

export default MemoEditor;
