import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/queries';
import { ConfirmDialog } from './ConfirmDialog';

export function CardListUpload() {
  const rawList = useAppStore((s) => s.rawList);
  const submittedList = useAppStore((s) => s.submittedList);
  const setRawList = useAppStore((s) => s.setRawList);
  const submitList = useAppStore((s) => s.submitList);
  const resetList = useAppStore((s) => s.resetList);

  const [fileName, setFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const panelId = useId();

  // Same cache entry the results section reads — no state passed between them.
  const { data, isFetching } = useRecommendations(submittedList);

  // Collapse once a load finishes successfully, so the list stops taking up
  // room once there's something more useful to look at. Keyed on `data`
  // itself rather than `isFetching` going false, so a failed request (data
  // stays undefined) leaves the list open to fix and resubmit, and re-editing
  // the box afterward doesn't get yanked shut again until the *next* load
  // actually completes.
  useEffect(() => {
    if (data) setCollapsed(true);
  }, [data]);

  // A request that runs past a few seconds is almost always the free instance
  // waking up. Say so, rather than leaving a spinner to look like a hang.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isFetching) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [isFetching]);

  async function handleFile(file: File) {
    const text = await file.text();
    setRawList(text);
    setFileName(file.name);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!rawList.trim()) {
      setValidationError('Paste or upload a card list first.');
      return;
    }
    setValidationError(null);
    submitList(rawList);
  }

  function handleReset() {
    resetList();
    // Local UI state the store doesn't own, but which would otherwise
    // outlive the list it describes: a filename with no file, an error
    // about text that's gone, and a panel collapsed around nothing.
    setFileName(null);
    setValidationError(null);
    setCollapsed(false);
  }

  const lineCount = rawList.split(/\r?\n/).filter((line) => line.trim()).length;

  return (
    <form className="upload-panel" onSubmit={handleSubmit}>
      <button
        type="button"
        className="upload-collapse-toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="upload-label">Your card list</span>
        {collapsed && lineCount > 0 && (
          <span className="upload-collapsed-summary">
            {lineCount} line{lineCount === 1 ? '' : 's'} — click to edit
          </span>
        )}
        <span aria-hidden="true" className="explain-chevron">
          {collapsed ? '▼' : '▲'}
        </span>
      </button>

      {!collapsed && (
        <div id={panelId} className="upload-collapsible">
          <textarea
            id="card-list"
            className="upload-textarea"
            placeholder={'1 Sol Ring\n1 Arcane Signet\n1 Rampant Growth\n1 Eternal Witness\n...'}
            value={rawList}
            onChange={(event) => setRawList(event.target.value)}
            rows={12}
            spellCheck={false}
          />
          {validationError && <p className="status-error">{validationError}</p>}
          {slow && (
            <p className="status-waking" aria-live="polite">
              Waking the server — it sleeps after a spell of inactivity, so the first request can take up
              to a minute.
            </p>
          )}
          <div className="upload-actions">
            <label className="file-button">
              Upload .txt
              <input
                type="file"
                accept=".txt,.csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
            {fileName && <span className="file-name">{fileName}</span>}
            {/* Only offered when there's something to lose. */}
            {(rawList.trim().length > 0 || submittedList.length > 0) && (
              <ConfirmDialog
                title="Clear this list?"
                description={
                  submittedList.length > 0
                    ? 'This clears the cards you pasted and the suggestions found for them. Nothing is saved, so you would need to paste the list again.'
                    : 'This clears the cards you pasted. Nothing is saved, so you would need to paste them again.'
                }
                confirmLabel="Clear list"
                onConfirm={handleReset}
              >
                <button type="button" className="page-button">
                  Clear
                </button>
              </ConfirmDialog>
            )}
            <button type="submit" className="primary-button" disabled={isFetching}>
              {isFetching ? 'Finding synergies…' : 'Suggest Commanders'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
