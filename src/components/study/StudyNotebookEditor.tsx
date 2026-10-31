import React, { useEffect, useRef, useState } from 'react';
import { translate as tr } from '../../lib/locales';
import StudyCanvas from './StudyCanvas';
import type {
  StudyData,
  StudyNotebook,
  StudyNotebookPage,
  StudyNoteBlock,
  StudyCanvasDocument,
} from '../../lib/study/types';

type Props = {
  study: StudyData;
  update: (fn: (s: StudyData) => StudyData) => void;
  notebook: StudyNotebook;
};
const uid = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const blockTypes: StudyNoteBlock['type'][] = [
  'paragraph',
  'heading',
  'checklist',
  'code',
  'callout',
  'quote',
  'formula',
  'divider',
];
const newBlock = (type: StudyNoteBlock['type']): StudyNoteBlock =>
  type === 'divider'
    ? { id: uid(), type }
    : {
        id: uid(),
        type,
        text: '',
        ...(type === 'checklist' ? { checked: false } : {}),
        ...(type === 'heading' ? { level: 1 as const } : {}),
      };
const plain = (p: StudyNotebookPage) =>
  p.blocks
    .map((b) =>
      b.type === 'divider'
        ? '---'
        : `${b.type === 'heading' ? '#'.repeat(b.level || 1) + ' ' : b.type === 'checklist' ? `${b.checked ? '[x]' : '[ ]'} ` : ''}${b.text}`,
    )
    .join('\n\n');
export default function StudyNotebookEditor({ study, update, notebook }: Props) {
  const [pageId, setPageId] = useState(notebook.pages[0]?.id || '');
  const [status, setStatus] = useState('Saved');
  const [pendingDeletePage, setPendingDeletePage] = useState(false);
  const [pendingDeleteCanvas, setPendingDeleteCanvas] = useState<StudyCanvasDocument | null>(null);
  const timer = useRef<number | undefined>();
  const pageDialogRef = useRef<HTMLDivElement>(null);
  const canvasDialogRef = useRef<HTMLDivElement>(null);
  const latest = useRef<{ id: string; blocks: StudyNoteBlock[] } | null>(null);
  const page = notebook.pages.find((p) => p.id === pageId) || notebook.pages[0];
  useEffect(() => {
    if (!notebook.pages.some((p) => p.id === pageId)) setPageId(notebook.pages[0]?.id || '');
  }, [notebook.id, notebook.pages, pageId]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (latest.current) {
        const { id, blocks } = latest.current;
        update((s) => ({
          ...s,
          notebooks: s.notebooks.map((n) =>
            n.id === notebook.id
              ? {
                  ...n,
                  pages: n.pages.map((p) =>
                    p.id === id ? { ...p, blocks, updatedAt: stamp() } : p,
                  ),
                  updatedAt: stamp(),
                }
              : n,
          ),
        }));
        latest.current = null;
      }
    },
    [notebook.id, update],
  );
  useEffect(() => {
    if (!pendingDeletePage && !pendingDeleteCanvas) return;
    const dialog = pendingDeletePage ? pageDialogRef.current : canvasDialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('.study-secondary')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingDeletePage(false);
        setPendingDeleteCanvas(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingDeletePage, pendingDeleteCanvas]);
  const commit = (id: string, blocks: StudyNoteBlock[]) => {
    latest.current = { id, blocks };
    setStatus(tr('Saving…'));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        update((s) => ({
          ...s,
          notebooks: s.notebooks.map((n) =>
            n.id === notebook.id
              ? {
                  ...n,
                  pages: n.pages.map((p) =>
                    p.id === id ? { ...p, blocks, updatedAt: stamp() } : p,
                  ),
                  updatedAt: stamp(),
                }
              : n,
          ),
        }));
        setStatus(tr('Saved'));
      } catch {
        setStatus(tr('Error · changes could not be saved'));
      }
    }, 450);
  };
  const immediate = (fn: (s: StudyData) => StudyData) => {
    if (timer.current && latest.current) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const { id, blocks } = latest.current;
      update((s) => ({
        ...s,
        notebooks: s.notebooks.map((n) =>
          n.id === notebook.id
            ? {
                ...n,
                pages: n.pages.map((p) => (p.id === id ? { ...p, blocks, updatedAt: stamp() } : p)),
              }
            : n,
        ),
      }));
      latest.current = null;
    }
    update(fn);
  };
  const addPage = () => {
    const p: StudyNotebookPage = {
      id: uid(),
      title: `Page ${notebook.pages.length + 1}`,
      blocks: [newBlock('paragraph')],
      sortOrder: notebook.pages.length,
      createdAt: stamp(),
    };
    immediate((s) => ({
      ...s,
      notebooks: s.notebooks.map((n) =>
        n.id === notebook.id ? { ...n, pages: [...n.pages, p] } : n,
      ),
    }));
    setPageId(p.id);
  };
  const move = (index: number, delta: number) => {
    const arr = [...notebook.pages];
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    immediate((s) => ({
      ...s,
      notebooks: s.notebooks.map((n) =>
        n.id === notebook.id ? { ...n, pages: arr.map((p, i) => ({ ...p, sortOrder: i })) } : n,
      ),
    }));
  };
  const duplicate = () => {
    if (!page) return;
    const p = {
      ...page,
      id: uid(),
      title: `${page.title} copy`,
      blocks: page.blocks.map((b) => ({ ...b, id: uid() })),
      createdAt: stamp(),
      sortOrder: notebook.pages.length,
    };
    immediate((s) => ({
      ...s,
      notebooks: s.notebooks.map((n) =>
        n.id === notebook.id ? { ...n, pages: [...n.pages, p] } : n,
      ),
    }));
    setPageId(p.id);
  };
  const removePage = () => {
    if (!page || notebook.pages.length <= 1) return;
    const target = notebook.pages.find((p) => p.id !== page.id);
    if (!target) return;
    const left = notebook.pages
      .filter((p) => p.id !== page.id)
      .map((p, index) => ({ ...p, sortOrder: index }));
    immediate((s) => ({
      ...s,
      canvases: s.canvases.map((c) =>
        c.notebookId === notebook.id && c.pageId === page.id
          ? { ...c, pageId: target.id, updatedAt: stamp() }
          : c,
      ),
      notebooks: s.notebooks.map((n) => (n.id === notebook.id ? { ...n, pages: left } : n)),
    }));
    setPageId(target.id);
    setPendingDeletePage(false);
  };
  const addCanvas = () => {
    if (!page) return;
    const c: StudyCanvasDocument = {
      id: uid(),
      title: `${page.title} canvas`,
      notebookId: notebook.id,
      pageId: page.id,
      width: 1000,
      height: 700,
      objects: [],
      createdAt: stamp(),
    };
    immediate((s) => ({ ...s, canvases: [c, ...s.canvases] }));
  };
  const exportText = () => {
    if (!page) return;
    const blob = new Blob([`# ${notebook.title}\n\n## ${page.title}\n\n${plain(page)}`], {
      type: 'text/markdown;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${notebook.title}-${page.title}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const edit = (id: string, patch: Partial<StudyNoteBlock>) => {
    if (!page) return;
    commit(
      page.id,
      page.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as StudyNoteBlock) : b)),
    );
  };
  const removeBlock = (id: string) =>
    page &&
    commit(
      page.id,
      page.blocks.filter((b) => b.id !== id),
    );
  const addBlock = (type: StudyNoteBlock['type']) =>
    page && commit(page.id, [...page.blocks, newBlock(type)]);
  return (
    <div className="study-notebook-workspace">
      <div className="study-page-bar">
        <label>
          {tr('Page')}
          <select
            aria-label={tr('Notebook page')}
            value={page?.id || ''}
            onChange={(e) => setPageId(e.target.value)}
          >
            {notebook.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <button className="study-secondary" onClick={addPage}>{tr('Add page')}
        </button>
        <button className="study-secondary" onClick={duplicate} disabled={!page}>{tr('Duplicate')}
        </button>
        <button
          className="study-secondary"
          onClick={() =>
            page &&
            move(
              notebook.pages.findIndex((p) => p.id === page.id),
              -1,
            )
          }
          disabled={!page || notebook.pages[0]?.id === page.id}
        >{tr('Move up')}
        </button>
        <button
          className="study-secondary"
          onClick={() =>
            page &&
            move(
              notebook.pages.findIndex((p) => p.id === page.id),
              1,
            )
          }
          disabled={!page || notebook.pages[notebook.pages.length - 1]?.id === page.id}
        >{tr('Move down')}
        </button>
        <button
          className="study-danger"
          onClick={() => setPendingDeletePage(true)}
          disabled={!page || notebook.pages.length <= 1}
          title={notebook.pages.length <= 1 ? tr('A notebook needs at least one page') : undefined}
        >{tr('Delete page')}
        </button>
        <span role="status" aria-live="polite">
          {status}
        </span>
      </div>
      {page ? (
        <>
          <label className="study-page-title">
            {tr('Page title')}
            <input
              value={page.title}
              maxLength={100}
              onChange={(e) =>
                immediate((s) => ({
                  ...s,
                  notebooks: s.notebooks.map((n) =>
                    n.id === notebook.id
                      ? {
                          ...n,
                          pages: n.pages.map((p) =>
                            p.id === page.id
                              ? { ...p, title: e.target.value, updatedAt: stamp() }
                              : p,
                          ),
                        }
                      : n,
                  ),
                }))
              }
            />
          </label>
          <div className="study-editor-tools">
            <span>{tr('Add block:')}</span>
            {blockTypes.map((t) => (
              <button key={t} className="study-secondary" onClick={() => addBlock(t)}>
                {t === 'heading' ? 'Heading 1' : t}
              </button>
            ))}
          </div>
          <div className="study-block-list">
            {page.blocks.map((b, i) => (
              <section className={`study-note-block block-${b.type}`} key={b.id}>
                <div className="study-block-label">
                  <strong>{b.type === 'heading' ? `Heading ${b.level || 1}` : b.type}</strong>
                  <div>
                    <button
                      className="study-text-button"
                      aria-label={`Move block ${i + 1} up`}
                      disabled={!i}
                      onClick={() => {
                        const a = [...page.blocks];
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        commit(page.id, a);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      className="study-text-button"
                      aria-label={`Move block ${i + 1} down`}
                      disabled={i === page.blocks.length - 1}
                      onClick={() => {
                        const a = [...page.blocks];
                        [a[i], a[i + 1]] = [a[i + 1], a[i]];
                        commit(page.id, a);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      className="study-text-button"
                      aria-label={`Delete ${b.type} block`}
                      onClick={() => removeBlock(b.id)}
                    >{tr('Remove')}
                    </button>
                  </div>
                </div>
                {b.type === 'divider' ? (
                  <hr />
                ) : (
                  <>
                    {b.type === 'heading' && (
                      <label>
                        {tr('Heading level')}
                        <select
                          value={b.level || 1}
                          onChange={(e) =>
                            edit(b.id, { level: Number(e.target.value) as 1 | 2 | 3 })
                          }
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </label>
                    )}
                    {b.type === 'checklist' && (
                      <label className="study-checkline">
                        <input
                          type="checkbox"
                          checked={!!b.checked}
                          onChange={(e) => edit(b.id, { checked: e.target.checked })}
                        />{' '}
                        Done
                      </label>
                    )}
                    <textarea
                      aria-label={`${b.type} block`}
                      value={b.text}
                      maxLength={12000}
                      rows={b.type === 'heading' ? 2 : 4}
                      onChange={(e) => edit(b.id, { text: e.target.value })}
                      placeholder={
                        b.type === 'formula'
                          ? 'Type formula text (for example: E = mc²)'
                          : `Write ${b.type}…`
                      }
                    />
                  </>
                )}
              </section>
            ))}
          </div>
          <div className="study-page-bar">
            <button className="study-secondary" onClick={exportText}>{tr('Export Markdown')}
            </button>
            <span className="study-muted">
              {tr('Plain text / Markdown export; drawings remain vector in linked canvases.')}
            </span>
          </div>
          <section className="study-linked-canvases">
            <div className="study-panel-head">
              <h3>{tr('Page canvases')}</h3>
              <button className="study-primary" onClick={addCanvas}>{tr('New SVG canvas')}
              </button>
            </div>
            {study.canvases
              .filter((c) => c.notebookId === notebook.id && c.pageId === page.id)
              .map((c) => (
                <details key={c.id} className="study-canvas-document">
                  <summary>{c.title}</summary>
                  <label>
                    {tr('Canvas title')}
                    <input
                      value={c.title}
                      onChange={(e) =>
                        immediate((s) => ({
                          ...s,
                          canvases: s.canvases.map((x) =>
                            x.id === c.id ? { ...x, title: e.target.value, updatedAt: stamp() } : x,
                          ),
                        }))
                      }
                    />
                  </label>
                  <StudyCanvas key={c.id} canvas={c} update={update} />
                  <button
                    className="study-danger"
                    onClick={() => setPendingDeleteCanvas(c)}
                  >{tr('Delete canvas')}
                  </button>
                </details>
              ))}
            {!study.canvases.some((c) => c.notebookId === notebook.id && c.pageId === page.id) && (
              <p className="study-muted">
                {tr('No canvas linked to this page yet. Create one to draw with saved SVG vectors.')}
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="study-empty">
          <h3>{tr('No pages yet')}</h3>
          <p>{tr('Create a page to start structured notes.')}</p>
          <button className="study-primary" onClick={addPage}>{tr('Create first page')}
          </button>
        </div>
      )}
      {pendingDeletePage && page && (
        <div
          className="study-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDeletePage(false);
          }}
        >
          <div
            ref={pageDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-page-${page.id}`}
            tabIndex={-1}
          >
            <h3 id={`delete-page-${page.id}`}>Delete “{page.title}”?</h3>
            <p>This removes the page and its note blocks. Any linked canvases will be kept and moved to another page.</p>
            <button type="button" className="study-danger" onClick={removePage}>Delete page</button>{' '}
            <button type="button" className="study-secondary" onClick={() => setPendingDeletePage(false)}>Cancel</button>
          </div>
        </div>
      )}
      {pendingDeleteCanvas && (
        <div
          className="study-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDeleteCanvas(null);
          }}
        >
          <div
            ref={canvasDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-canvas-${pendingDeleteCanvas.id}`}
            tabIndex={-1}
          >
            <h3 id={`delete-canvas-${pendingDeleteCanvas.id}`}>Delete “{pendingDeleteCanvas.title}”?</h3>
            <p>{tr('This permanently removes this SVG canvas and its vector objects from this notebook.')}</p>
            <button
              type="button"
              className="study-danger"
              onClick={() => {
                const id = pendingDeleteCanvas.id;
                immediate((s) => ({ ...s, canvases: s.canvases.filter((item) => item.id !== id) }));
                setPendingDeleteCanvas(null);
              }}
            >
              Delete canvas
            </button>{' '}
            <button type="button" className="study-secondary" onClick={() => setPendingDeleteCanvas(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
