import React, { useEffect, useRef, useState } from 'react';
import { translate as tr } from '../../lib/locales';
import type {
  StudyCanvasBackground,
  StudyCanvasDocument,
  StudyCanvasObject,
  StudyState,
  Point,
} from '../../lib/study/types';

type Props = {
  canvas: StudyCanvasDocument;
  update: (recipe: (state: StudyState) => StudyState) => void;
};
type Tool = 'pen' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';

const COLORS = ['#243047', '#2563eb', '#0e9f8a', '#d97706', '#dc2626', '#7c3aed'];
const PAPERS: StudyCanvasBackground[] = ['plain', 'grid', 'dot', 'lined'];
const MAX_OBJECTS = 1200;
const MAX_POINTS = 30_000;
const MAX_POINTS_PER_STROKE = 3000;
const MAX_ERASER_POINTS = 512;
const MAX_UNDO = 80;
const ERASER_RADIUS_PX = 14;
const uid = () => globalThis.crypto?.randomUUID?.() ?? `study-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function distanceToSegment(
  point: Point,
  from: Point,
  to: Point,
  width: number,
  height: number,
): number {
  const px = point.x * width;
  const py = point.y * height;
  const ax = from.x * width;
  const ay = from.y * height;
  const bx = to.x * width;
  const by = to.y * height;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function objectHitByEraser(
  object: StudyCanvasObject,
  eraserPath: Point[],
  width: number,
  height: number,
): boolean {
  if (!eraserPath.length) return false;
  const strokeWidth =
    object.type === 'rect' || object.type === 'ellipse'
      ? object.strokeWidth || 2
      : object.type === 'text'
        ? 1
        : object.width || 2;
  const tolerance = ERASER_RADIUS_PX + Math.max(1, strokeWidth) / 2;

  if (object.type === 'stroke') {
    if (object.points.length === 1) {
      return eraserPath.some((p) => distanceToSegment(p, object.points[0], object.points[0], width, height) <= tolerance);
    }
    for (let i = 1; i < object.points.length; i += 1) {
      if (eraserPath.some((p) => distanceToSegment(p, object.points[i - 1], object.points[i], width, height) <= tolerance)) return true;
    }
    return false;
  }

  if (object.type === 'line' || object.type === 'arrow') {
    return eraserPath.some((p) => distanceToSegment(p, object.from, object.to, width, height) <= tolerance);
  }

  if (object.type === 'rect') {
    const left = object.x;
    const right = object.x + object.width;
    const top = object.y;
    const bottom = object.y + object.height;
    const edges: [Point, Point][] = [
      [{ x: left, y: top }, { x: right, y: top }],
      [{ x: right, y: top }, { x: right, y: bottom }],
      [{ x: right, y: bottom }, { x: left, y: bottom }],
      [{ x: left, y: bottom }, { x: left, y: top }],
    ];
    return eraserPath.some((p) => edges.some(([a, b]) => distanceToSegment(p, a, b, width, height) <= tolerance));
  }

  if (object.type === 'ellipse') {
    const rx = Math.max(0.001, object.width / 2);
    const ry = Math.max(0.001, object.height / 2);
    const center = { x: object.x + rx, y: object.y + ry };
    const radius = Math.max(0.001, Math.min(rx * width, ry * height));
    return eraserPath.some((p) => {
      const dx = (p.x - center.x) * width;
      const dy = (p.y - center.y) * height;
      const normalizedRadius = Math.sqrt((dx * dx) / ((rx * width) ** 2) + (dy * dy) / ((ry * height) ** 2));
      return Math.abs(normalizedRadius - 1) * radius <= tolerance;
    });
  }

  if (object.type !== 'text') return false;
  const fontSize = object.fontSize || 18;
  const left = object.x * width;
  const baseline = object.y * height;
  const right = left + Math.max(18, object.text.length * fontSize * 0.58);
  const top = baseline - fontSize;
  return eraserPath.some((p) => {
    const x = p.x * width;
    const y = p.y * height;
    return x >= left - tolerance && x <= right + tolerance && y >= top - tolerance && y <= baseline + tolerance;
  });
}

export default function StudyCanvas({ canvas, update }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [background, setBackground] = useState<StudyCanvasBackground>(canvas.background || 'plain');
  const [objects, setObjects] = useState(canvas.objects);
  const [undo, setUndo] = useState<StudyCanvasObject[][]>([]);
  const [redo, setRedo] = useState<StudyCanvasObject[][]>([]);
  const [draft, setDraft] = useState<StudyCanvasObject | null>(null);
  const [textPoint, setTextPoint] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const [start, setStart] = useState<Point | null>(null);
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const baseline = useRef(JSON.stringify(canvas.objects));
  const eraserPath = useRef<Point[]>([]);

  useEffect(() => {
    const incoming = JSON.stringify(canvas.objects);
    if (incoming !== baseline.current) {
      baseline.current = incoming;
      setObjects(canvas.objects);
      setUndo([]);
      setRedo([]);
      setDraft(null);
      eraserPath.current = [];
    }
    setBackground(canvas.background || 'plain');
  }, [canvas.objects, canvas.background]);

  useEffect(() => {
    if (!confirm) return;
    dialogRef.current?.querySelector<HTMLButtonElement>('.study-secondary')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirm]);

  const point = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const persist = (next: StudyCanvasObject[]): boolean => {
    const pointCount = next.reduce((total, object) => total + (object.type === 'stroke' ? object.points.length : 1), 0);
    const oversizedStroke = next.find((object) => object.type === 'stroke' && object.points.length > MAX_POINTS_PER_STROKE);
    if (next.length > MAX_OBJECTS || pointCount > MAX_POINTS || oversizedStroke) {
      setError(
        oversizedStroke
          ? `A single pen stroke can contain at most ${MAX_POINTS_PER_STROKE.toLocaleString()} points. Finish a shorter stroke, or split the drawing into multiple strokes.`
          : `Canvas size limit reached: ${MAX_OBJECTS.toLocaleString()} objects and ${MAX_POINTS.toLocaleString()} vector points. Export or remove objects before drawing more.`,
      );
      return false;
    }
    update((state) => ({
      ...state,
      canvases: state.canvases.map((item) =>
        item.id === canvas.id ? { ...item, objects: next, updatedAt: new Date().toISOString() } : item,
      ),
    }));
    baseline.current = JSON.stringify(next);
    setObjects(next);
    setError('');
    return true;
  };

  const persistBackground = (next: StudyCanvasBackground) => {
    setBackground(next);
    update((state) => ({
      ...state,
      canvases: state.canvases.map((item) =>
        item.id === canvas.id ? { ...item, background: next, updatedAt: new Date().toISOString() } : item,
      ),
    }));
  };

  const remember = (previous: StudyCanvasObject[]) => {
    setUndo((stack) => [...stack.slice(-(MAX_UNDO - 1)), previous]);
    setRedo([]);
  };

  const commit = (object: StudyCanvasObject) => {
    const next = [...objects, object];
    if (persist(next)) remember(objects);
  };

  const finishErase = () => {
    const path = eraserPath.current;
    eraserPath.current = [];
    if (!path.length) return;
    const rect = svg.current?.getBoundingClientRect();
    const viewportWidth = rect?.width || 1000;
    const viewportHeight = rect?.height || 700;
    const next = objects.filter((object) => !objectHitByEraser(object, path, viewportWidth, viewportHeight));
    if (next.length !== objects.length && persist(next)) remember(objects);
  };

  const down = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const currentPoint = point(event);
    if (tool === 'eraser') {
      eraserPath.current = [currentPoint];
      setEraserCursor(currentPoint);
      return;
    }
    setStart(currentPoint);
    if (tool === 'text') {
      setTextPoint(currentPoint);
      setTextValue('');
      return;
    }
    if (tool === 'pen') {
      setDraft({ id: uid(), type: 'stroke', points: [currentPoint], color, width });
      return;
    }
    if (tool === 'line' || tool === 'arrow') {
      setDraft({ id: uid(), type: tool, from: currentPoint, to: currentPoint, color, width });
      return;
    }
    setDraft({
      id: uid(),
      type: tool === 'ellipse' ? 'ellipse' : 'rect',
      x: currentPoint.x,
      y: currentPoint.y,
      width: 0,
      height: 0,
      color,
      strokeWidth: width,
    });
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const currentPoint = point(event);
    if (tool === 'eraser') {
      setEraserCursor(currentPoint);
      if (eraserPath.current.length && event.buttons) {
        const previous = eraserPath.current[eraserPath.current.length - 1];
        if (
          eraserPath.current.length < MAX_ERASER_POINTS &&
          Math.hypot(
            (currentPoint.x - previous.x) * event.currentTarget.clientWidth,
            (currentPoint.y - previous.y) * event.currentTarget.clientHeight,
          ) >= 6
        ) {
          eraserPath.current = [...eraserPath.current, currentPoint];
        }
      }
      return;
    }
    if (!draft || !start) return;
    if (draft.type === 'stroke') {
      if (draft.points.length >= MAX_POINTS_PER_STROKE) {
        setError(`This pen stroke reached the ${MAX_POINTS_PER_STROKE.toLocaleString()}-point limit.`);
        return;
      }
      const last = draft.points[draft.points.length - 1];
      const movedPx = Math.hypot(
        (currentPoint.x - last.x) * event.currentTarget.clientWidth,
        (currentPoint.y - last.y) * event.currentTarget.clientHeight,
      );
      if (movedPx >= 1.5) setDraft({ ...draft, points: [...draft.points, currentPoint] });
    } else if (draft.type === 'line' || draft.type === 'arrow') {
      setDraft({ ...draft, to: currentPoint });
    } else if (draft.type === 'rect' || draft.type === 'ellipse') {
      setDraft({
        ...draft,
        x: Math.min(start.x, currentPoint.x),
        y: Math.min(start.y, currentPoint.y),
        width: Math.abs(start.x - currentPoint.x),
        height: Math.abs(start.y - currentPoint.y),
      });
    }
  };

  const up = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'eraser') {
      finishErase();
      return;
    }
    if (draft) {
      const finalPoint = point(event);
      let completed = draft;
      if (draft.type === 'line' || draft.type === 'arrow') completed = { ...draft, to: finalPoint };
      if (draft.type === 'rect' || draft.type === 'ellipse') {
        completed = {
          ...draft,
          x: Math.min(start?.x ?? finalPoint.x, finalPoint.x),
          y: Math.min(start?.y ?? finalPoint.y, finalPoint.y),
          width: Math.abs((start?.x ?? finalPoint.x) - finalPoint.x),
          height: Math.abs((start?.y ?? finalPoint.y) - finalPoint.y),
        };
      }
      commit(completed);
    }
    setDraft(null);
    setStart(null);
  };

  const cancelGesture = () => {
    setDraft(null);
    setStart(null);
    eraserPath.current = [];
  };

  const undoOnce = () => {
    if (!undo.length) return;
    const previous = undo[undo.length - 1];
    if (persist(previous)) {
      setUndo((stack) => stack.slice(0, -1));
      setRedo((stack) => [...stack.slice(-(MAX_UNDO - 1)), objects]);
    }
  };

  const redoOnce = () => {
    if (!redo.length) return;
    const next = redo[redo.length - 1];
    if (persist(next)) {
      setRedo((stack) => stack.slice(0, -1));
      setUndo((stack) => [...stack.slice(-(MAX_UNDO - 1)), objects]);
    }
  };

  const exportSvg = () => {
    const node = svg.current;
    if (!node) return;
    const clone = node.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(canvas.width));
    clone.setAttribute('height', String(canvas.height));
    clone.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    clone.querySelectorAll('[data-preview="true"]').forEach((element) => element.remove());
    clone.querySelectorAll('[data-eraser-cursor="true"]').forEach((element) => element.remove());
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeTitle = (canvas.title || 'study-canvas').replace(/[^\w -]/g, '').trim() || 'study-canvas';
    anchor.download = `${safeTitle}.svg`;
    anchor.href = url;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const W = Math.max(1, canvas.width || 1000);
  const H = Math.max(1, canvas.height || 700);
  const paperId = `study-${background}-${canvas.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const render = (object: StudyCanvasObject) => {
    const strokeWidth =
      object.type === 'rect' || object.type === 'ellipse'
        ? object.strokeWidth || width
        : object.type === 'text'
          ? 0
          : object.width || width;
    const common = {
      key: object.id,
      stroke: object.color || color,
      strokeWidth,
      fill: object.type === 'rect' || object.type === 'ellipse' ? object.fill || 'none' : 'none',
    };
    if (object.type === 'stroke') {
      return (
        <polyline
          {...common}
          points={object.points.map((p) => `${p.x * W},${p.y * H}`).join(' ')}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    if (object.type === 'line' || object.type === 'arrow') {
      return (
        <line
          {...common}
          x1={object.from.x * W}
          y1={object.from.y * H}
          x2={object.to.x * W}
          y2={object.to.y * H}
          markerEnd={
            object.type === 'arrow'
              ? `url(#${paperId}-arrow-${Math.max(0, COLORS.indexOf(object.color || color))})`
              : undefined
          }
        />
      );
    }
    if (object.type === 'rect') {
      return <rect {...common} x={object.x * W} y={object.y * H} width={object.width * W} height={object.height * H} />;
    }
    if (object.type === 'ellipse') {
      return (
        <ellipse
          {...common}
          cx={(object.x + object.width / 2) * W}
          cy={(object.y + object.height / 2) * H}
          rx={(object.width * W) / 2}
          ry={(object.height * H) / 2}
        />
      );
    }
    if (object.type !== 'text') return null;
    return (
      <text
        key={object.id}
        x={object.x * W}
        y={object.y * H}
        fill={object.color || color}
        fontSize={object.fontSize || 18}
      >
        {object.text}
      </text>
    );
  };

  return (
    <div className="study-canvas-wrap">
      <div className="study-canvas-tools" role="toolbar" aria-label={tr('Vector canvas tools')}>
        {(['pen', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text'] as const).map((item) => (
          <button
            type="button"
            className="study-secondary"
            aria-label={`${tr(item)} ${tr('tool')}`}
            aria-pressed={tool === item}
            key={item}
            onClick={() => setTool(item)}
          >
            {item === 'rect' ? 'Rectangle' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
        <label>
          Color
          <select aria-label={tr('Drawing color')} value={color} onChange={(event) => setColor(event.target.value)}>
            {COLORS.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Stroke width
          <input aria-label={tr('Stroke width')} type="range" min="1" max="12" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
        </label>
        <label>
          Paper
          <select aria-label={tr('Paper background')} value={background} onChange={(event) => persistBackground(event.target.value as StudyCanvasBackground)}>
            {PAPERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" className="study-secondary" aria-label={tr('Undo')} onClick={undoOnce} disabled={!undo.length}>{tr('Undo')}</button>
        <button type="button" className="study-secondary" aria-label={tr('Redo')} onClick={redoOnce} disabled={!redo.length}>{tr('Redo')}</button>
        <button type="button" className="study-secondary" aria-label={tr('Export as SVG')} onClick={exportSvg}>{tr('Export SVG')}</button>
        <button type="button" className="study-danger" onClick={() => setConfirm(true)}>{tr('Clear')}</button>
      </div>

      {tool === 'eraser' && (
        <p className="study-muted" role="note">
          Eraser removes whole vector objects when their visible stroke is crossed; it does not rasterize or partially cut a path.
        </p>
      )}
      {error && <p className="study-error" role="alert">{error}</p>}

      {confirm && (
        <div
          className="study-modal"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirm(false); }}
        >
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`canvas-clear-${canvas.id}`} tabIndex={-1}>
            <h3 id={`canvas-clear-${canvas.id}`}>{tr('Clear this canvas?')}</h3>
            <p>{tr('This removes saved vector objects from this canvas. Undo remains available until you leave this canvas.')}</p>
            <button
              type="button"
              className="study-danger"
              onClick={() => {
                if (persist([])) {
                  remember(objects);
                  setConfirm(false);
                }
              }}
            >{tr('Clear canvas')}
            </button>{' '}
            <button type="button" className="study-secondary" onClick={() => setConfirm(false)}>{tr('Cancel')}</button>
          </div>
        </div>
      )}

      {textPoint && (
        <form
          className="study-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (textValue.trim()) {
              commit({ id: uid(), type: 'text', x: textPoint.x, y: textPoint.y, text: textValue.trim(), color, fontSize: 18 });
            }
            setTextPoint(null);
          }}
        >
          <label>
            {tr('Canvas text')}
            <input autoFocus value={textValue} onChange={(event) => setTextValue(event.target.value)} maxLength={300} />
          </label>
          <button type="submit" className="study-primary">{tr('Add text')}</button>
          <button type="button" className="study-secondary" onClick={() => setTextPoint(null)}>{tr('Cancel')}</button>
        </form>
      )}

      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={tr('Interactive vector drawing canvas, {W} by {H}. Use the toolbar to select a drawing tool.').replace('{W}', String(W)).replace('{H}', String(H))}
        className={`study-drawing-surface bg-${background}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancelGesture}
        onPointerLeave={() => setEraserCursor(null)}
        style={{ touchAction: 'none', width: '100%', height: 'auto' }}
      >
        <defs>
          <pattern id={`${paperId}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#dbe3ee" strokeWidth="1" />
          </pattern>
          <pattern id={`${paperId}-dot`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#94a3b8" />
          </pattern>
          <pattern id={`${paperId}-lined`} width="24" height="28" patternUnits="userSpaceOnUse">
            <path d="M 0 27.5 H 24" fill="none" stroke="#dbe3ee" strokeWidth="1" />
          </pattern>
          {COLORS.map((markerColor, index) => (
            <marker
              key={markerColor}
              id={`${paperId}-arrow-${index}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8" fill="none" stroke={markerColor} />
            </marker>
          ))}
        </defs>
        <rect x="0" y="0" width={W} height={H} fill={background === 'plain' ? '#fffdf8' : `url(#${paperId}-${background})`} />
        {objects.map(render)}
        {draft && <g data-preview="true">{render(draft)}</g>}
        {tool === 'eraser' && eraserCursor && (
          <circle
            data-eraser-cursor="true"
            cx={eraserCursor.x * W}
            cy={eraserCursor.y * H}
            r={(ERASER_RADIUS_PX / (svg.current?.getBoundingClientRect().width || 1000)) * W}
            fill="#dc262622"
            stroke="#dc2626"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
