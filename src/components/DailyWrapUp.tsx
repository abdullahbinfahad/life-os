import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, Lock, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { translate } from '../lib/locales';
import { useStore } from '../lib/store';
import { fmtDate, today } from '../lib/utils';

interface DailyWrapUpProps {
  compact?: boolean;
}

const STARTERS = ['Today, I spent time on…', 'A moment I want to remember…', 'I learned…', 'Tomorrow I want to…'];

export function DailyWrapUp({ compact = false }: DailyWrapUpProps) {
  const journal = useStore((state) => state.journal);
  const settings = useStore((state) => state.settings);
  const saveEntry = useStore((state) => state.saveEntry);
  const date = today();
  const entryId = `daily-wrap-up-${date}`;
  const entry = useMemo(() => journal.find((item) => item.id === entryId), [journal, entryId]);
  const [draft, setDraft] = useState(entry?.content ?? '');
  const [savedMessage, setSavedMessage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedContent = entry?.content ?? '';
  const isPublic = entry?.visibility === 'public';
  const isDirty = draft !== savedContent;
  const isEmpty = !draft.trim();

  // Reflect updates to this journal record, including persisted data hydrated after mount.
  useEffect(() => {
    if (draft !== savedContent) {
      setDraft(savedContent);
      setSavedMessage(false);
    }
  }, [entryId, savedContent]);

  const appendStarter = (phrase: string) => {
    setDraft((current) => `${current}${current && !current.endsWith('\n') ? '\n' : ''}${phrase} `);
    setSavedMessage(false);
  };

  const save = () => {
    const content = draft.trim();
    if (!content || !isDirty) return;
    const now = new Date().toISOString();
    saveEntry({
      id: entryId,
      date,
      title: `${translate('End-of-day reflection')} — ${fmtDate(date, settings.language)}`,
      content,
      visibility: 'private',
      mood: entry?.mood ?? 3,
      tags: entry?.tags ?? [],
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
    });
    setDraft(content);
    setSavedMessage(true);
  };

  const status = isDirty
    ? translate('Unsaved changes')
    : savedMessage
      ? translate('Saved to your private journal')
      : '';

  return (
    <section className={compact ? 'mt-4 border-t border-slate-200 pt-4 dark:border-white/10' : 'card p-4 sm:p-5'} aria-labelledby="daily-wrap-up-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="daily-wrap-up-heading" className="font-semibold">{translate('End-of-day reflection')}</h2>
          <p className="mt-0.5 text-xs muted">{fmtDate(date, settings.language)}</p>
          <p className="mt-1 text-sm muted">
            {translate(compact
              ? 'Capture what you did today in your own words.'
              : 'Write what you did today—not just what you checked off. Add the work, moments, effort, and small wins you want to remember.')}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs muted">
          {isPublic ? <Globe2 size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
          {translate(isPublic ? 'Public journal entry' : 'Private journal entry')}
        </span>
      </div>

      <div className="pr-14 md:pr-0">
        <label htmlFor="daily-wrap-up-content" className="mb-1.5 mt-4 block text-sm font-medium">
          {translate('What did you do today?')}
        </label>
        <textarea
          id="daily-wrap-up-content"
          ref={textareaRef}
          className="input min-h-28 w-full resize-y"
          rows={compact ? 3 : 5}
          placeholder={translate('Write a few lines about your day…')}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setSavedMessage(false); }}
        />

        {!compact && (
          <div className="mt-2 flex flex-wrap gap-2">
            {STARTERS.map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="btn-outline min-h-10 px-3 text-xs"
                onClick={() => {
                  appendStarter(translate(phrase));
                  requestAnimationFrame(() => {
                    const textarea = textareaRef.current;
                    if (!textarea) return;
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                  });
                }}
              >
                {translate(phrase)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="min-h-5 text-sm muted" aria-live="polite" role="status">
            {status}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/journal" className="btn-outline min-h-11 px-3 text-sm">{translate('Open journal')}</Link>
            <button
              type="button"
              className="btn-primary min-h-11 px-3 text-sm"
              onClick={save}
              disabled={isEmpty || !isDirty}
            >
              <Save size={16} aria-hidden="true" />{translate('Save reflection')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DailyWrapUp;
