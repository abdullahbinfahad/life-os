import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { translate as tr } from "../lib/locales";
import { useStore } from "../lib/store";
import { useAuth } from "../lib/auth";

export type EntityType =
  | "task"
  | "habit"
  | "goal"
  | "milestone"
  | "library_item";
export type PlannerProposal = {
  entityType: EntityType;
  title: string;
  dueDate?: string;
  scheduledTime?: string;
  notes: string;
  priority: 1 | 2 | 3 | 4;
  frequency?: "daily" | "weekly";
  targetPerWeek?: number;
  why?: string;
  description?: string;
  targetDate?: string;
  completionCriteria?: string;
  parentGoalTitle?: string;
  durationMinutes?: number;
  categoryId?: string;
  goalId?: string;
  /** UI-only key for linking milestones to goals in the same proposal batch. */
  proposalKey?: string;
};
type Turn = { role: "user" | "assistant"; content: string };
type Reply = {
  message: string;
  proposals: PlannerProposal[];
  outOfScope?: boolean;
};
const entityTypes: EntityType[] = [
  "task",
  "habit",
  "goal",
  "milestone",
  "library_item",
];
const validDate = (v: unknown) => {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\d$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};
const validProposal = (v: unknown): v is PlannerProposal => {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    entityTypes.includes(p.entityType as EntityType) &&
    typeof p.title === "string" &&
    !!p.title.trim() &&
    p.title.length <= 200 &&
    typeof p.notes === "string" &&
    p.notes.length <= 1000 &&
    Number.isInteger(p.priority) &&
    Number(p.priority) >= 1 &&
    Number(p.priority) <= 4 &&
    (p.dueDate == null || p.dueDate === "" || validDate(p.dueDate)) &&
    (p.targetDate == null || p.targetDate === "" || validDate(p.targetDate)) &&
    (p.scheduledTime == null ||
      p.scheduledTime === "" ||
      (typeof p.scheduledTime === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(p.scheduledTime))) &&
    (p.frequency == null ||
      p.frequency === "daily" ||
      p.frequency === "weekly") &&
    (p.targetPerWeek == null ||
      (Number.isInteger(p.targetPerWeek) &&
        Number(p.targetPerWeek) >= 1 &&
        Number(p.targetPerWeek) <= 7)) &&
    (p.durationMinutes == null ||
      (Number.isInteger(p.durationMinutes) &&
        Number(p.durationMinutes) >= 5 &&
        Number(p.durationMinutes) <= 480))
  );
};
const containsSensitiveInfo = (s: string) =>
  /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/i.test(s) ||
  /(?:\+?\d[\s().-]*){9,}/.test(s) ||
  /\b(?:passport|national id|government id|social security|ssn|aadhaar|nid|credit card|debit card|cvv|bank account)\b/i.test(
    s,
  ) ||
  /\b(?:password|api key|secret key|private key|access token)\b\s*(?:is|:|=)\s*\S+/i.test(
    s,
  );
function dateInZone(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export default function PlanningAssistant({
  onAddItems,
}: {
  onAddItems: (p: PlannerProposal[]) => void;
}) {
  const appLanguage = useStore((s) => s.settings.language ?? "en");
  const categories = useStore((s) => s.categories);
  const goals = useStore((s) => s.goals);
  const { user, setGuest } = useAuth();
  const [open, setOpen] = useState(false),
    [acknowledgedForUser, setAcknowledgedForUser] = useState<string | null>(
      () => {
        const id = useAuth.getState().user?.id;
        try {
          return id &&
            window.localStorage.getItem(`lifeos-planner-consent-v1:${id}`) ===
              "accepted"
            ? id
            : null;
        } catch {
          return null;
        }
      },
    );
  const [input, setInput] = useState(""),
    [turns, setTurns] = useState<Turn[]>([]),
    [proposals, setProposals] = useState<PlannerProposal[]>([]),
    [selected, setSelected] = useState<Record<number, boolean>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitRef = useRef(false),
    confirmRef = useRef(false);
  const acknowledged = !!user?.id && acknowledgedForUser === user.id;
  useEffect(() => {
    if (user?.id)
      try {
        if (
          window.localStorage.getItem(
            `lifeos-planner-consent-v1:${user.id}`,
          ) === "accepted"
        )
          setAcknowledgedForUser(user.id);
      } catch {}
  }, [user?.id]);
  const update = (i: number, patch: Partial<PlannerProposal>) =>
    setProposals((a) => a.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  async function send() {
    const text = input.trim();
    if (!text || submitRef.current || !acknowledged) return;
    if (!user || !supabase) {
      setError(tr("Planning assistant requires a signed-in account."));
      return;
    }
    const next = [...turns, { role: "user" as const, content: text }].slice(-6);
    if (next.some((t) => containsSensitiveInfo(t.content))) {
      setError(
        tr(
          "Sensitive details detected. Remove them before sending; do not share contact details, identity numbers, payment details, passwords, or secrets.",
        ),
      );
      return;
    }
    submitRef.current = true;
    setBusy(true);
    setError("");
    setInput("");
    setTurns(next);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("auth");
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { data, error: e } = await supabase.functions.invoke(
        "lifeos-planner",
        {
          body: {
            turns: next,
            language: appLanguage,
            localDate: dateInZone(new Date(), tz),
            timezone: tz,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (e) {
        const st = (e as { context?: { status?: number } }).context?.status;
        throw new Error(
          st === 422
            ? "sensitive"
            : st === 429
              ? "quota"
              : st === 401 || st === 403
                ? "auth"
                : st === 404 || st === 503
                  ? "setup"
                  : st === 502
                    ? "upstream"
                    : st === 400
                      ? "malformed"
                      : "network",
        );
      }
      const r = data as Reply;
      if (
        !r ||
        typeof r.message !== "string" ||
        r.message.length > 2000 ||
        !Array.isArray(r.proposals) ||
        r.proposals.length > 5 ||
        !r.proposals.every(validProposal)
      )
        throw new Error("malformed");
      setTurns((a) =>
        [...a, { role: "assistant" as const, content: r.message }].slice(-6),
      );
      const keyedProposals = r.proposals.map((proposal, index) => ({
        ...proposal,
        proposalKey: String(index),
      }));
      setProposals(
        keyedProposals.map((p) => {
          const hint = (p.parentGoalTitle ?? "").trim().toLowerCase();
          const candidates = [
            ...goals.map((g) => ({
              title: g.title,
              id: g.id,
              proposed: false,
            })),
            ...keyedProposals
              .filter((g) => g.entityType === "goal")
              .map((g) => ({
                title: g.title,
                id: `proposal:${g.proposalKey}`,
                proposed: true,
              })),
          ];
          const exact = hint
            ? candidates.filter((g) => g.title.trim().toLowerCase() === hint)
            : [];
          const close =
            hint && !exact.length
              ? candidates.filter((g) => {
                  const a = hint
                      .replace(/[^a-z0-9]+/g, " ")
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean),
                    b = g.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, " ")
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean);
                  const common = a.filter((w) => b.includes(w)).length;
                  return (
                    common > 0 && common / Math.max(a.length, b.length) >= 0.75
                  );
                })
              : [];
          const match =
            exact.length === 1
              ? exact[0]
              : !exact.length && close.length === 1
                ? close[0]
                : undefined;
          return {
            ...p,
            dueDate: p.dueDate || undefined,
            targetDate: p.targetDate || undefined,
            scheduledTime: p.scheduledTime || undefined,
            categoryId:
              categories.find((c) => c.id === p.categoryId)?.id ??
              categories[0]?.id,
            ...(p.entityType === "milestone" && match
              ? { goalId: match.id }
              : {}),
          };
        }),
      );
      confirmRef.current = false;
      setSelected(Object.fromEntries(keyedProposals.map((_, i) => [i, true])));
    } catch (e) {
      const c = e instanceof Error ? e.message : "network";
      setError(
        tr(
          c === "sensitive"
            ? "Sensitive details detected. Remove them before sending; do not share contact details, identity numbers, payment details, passwords, or secrets."
            : c === "auth"
              ? "Planning assistant sign-in error."
              : c === "quota"
                ? "Daily planning limit reached. Try again tomorrow."
                : c === "setup"
                  ? "Planning assistant setup is incomplete. Deploy the lifeos-planner function, apply its planner usage migration, and set the GEMINI_API_KEY secret in Supabase."
                  : c === "upstream"
                    ? "The AI provider is temporarily unavailable. Please try again shortly."
                    : c === "malformed"
                      ? "The assistant returned an invalid response. Please retry."
                      : "Planning assistant is unavailable. Check your connection and try again.",
        ),
      );
      setTurns((a) => a.slice(0, -1));
      setInput(text);
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }
  const proposalReady = (p: PlannerProposal, i: number) => {
    if (
      !p.title.trim() ||
      p.title.length > 200 ||
      typeof p.notes !== "string" ||
      p.notes.length > 1000 ||
      !Number.isInteger(p.priority) ||
      p.priority < 1 ||
      p.priority > 4
    )
      return false;
    if (
      ![p.why, p.description, p.completionCriteria, p.parentGoalTitle].every(
        (value) =>
          value === undefined ||
          (typeof value === "string" && value.length <= 1000),
      )
    )
      return false;
    if (p.dueDate && !validDate(p.dueDate)) return false;
    if (p.targetDate && !validDate(p.targetDate)) return false;
    if (p.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.scheduledTime))
      return false;
    if (
      p.durationMinutes != null &&
      (!Number.isInteger(p.durationMinutes) ||
        p.durationMinutes < 5 ||
        p.durationMinutes > 480)
    )
      return false;
    if (
      p.entityType === "habit" &&
      !(
        p.frequency === "daily" ||
        (p.frequency === "weekly" &&
          Number.isInteger(p.targetPerWeek) &&
          p.targetPerWeek! >= 1 &&
          p.targetPerWeek! <= 7)
      )
    )
      return false;
    if (p.entityType === "milestone") {
      const existing = goals.some((g) => g.id === p.goalId);
      const proposed = /^proposal:(.+)$/.exec(p.goalId ?? "");
      const selectedGoal =
        proposed &&
        proposals.some(
          (g, n) =>
            n !== i &&
            g.entityType === "goal" &&
            selected[n] &&
            g.proposalKey === proposed[1],
        );
      if (!existing && !selectedGoal) return false;
    }
    return true;
  };
  const selectedReady = () => {
    const chosen = proposals
      .map((p, i) => ({ p, i }))
      .filter((x) => selected[x.i]);
    return chosen.length > 0 && chosen.every(({ p, i }) => proposalReady(p, i));
  };
  const confirm = () => {
    if (confirmRef.current || !selectedReady()) return;
    confirmRef.current = true;
    const chosen = proposals.filter((_, i) => selected[i]);
    onAddItems(chosen);
    setProposals([]);
    setSelected({});
    setOpen(false);
  };
  const cancel = () => {
    setProposals([]);
    setSelected({});
  };
  const consent = (ok: boolean) => {
    if (ok && user?.id) {
      try {
        window.localStorage.setItem(
          `lifeos-planner-consent-v1:${user.id}`,
          "accepted",
        );
      } catch {}
      setAcknowledgedForUser(user.id);
    }
  };
  const destination = (p: PlannerProposal) =>
    tr(
      (
        {
          task: "Today / Tasks",
          habit: "Habits",
          goal: "Goals",
          milestone: "Goals · milestone",
          library_item: "Life Library",
        } as const
      )[p.entityType],
    );
  const entityLabel = (p: PlannerProposal) =>
    tr(
      (
        {
          task: "Task",
          habit: "Habit",
          goal: "Goal",
          milestone: "Milestone",
          library_item: "Library item",
        } as const
      )[p.entityType],
    );
  return (
    <>
      <button
        type="button"
        className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-indigo-500/30 bg-white/75 text-indigo-700 shadow-lg backdrop-blur-xl lg:bottom-24 lg:right-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={tr(
          open ? "Close planning assistant" : "Open planning assistant",
        )}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>
      {open && (
        <section
          role="dialog"
          aria-label={tr("Planning assistant")}
          className="fixed bottom-[calc(13rem+env(safe-area-inset-bottom))] right-3 z-[80] max-h-[min(68dvh,44rem)] w-[min(94vw,34rem)] overflow-y-auto rounded-2xl shadow-2xl lg:bottom-[7rem] lg:right-6"
        >
          <div className="card p-4 sm:p-5">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{tr("Planning assistant")}</h2>
                <p className="text-xs muted">
                  {tr("Planning and scheduling only")}
                </p>
              </div>
              <button className="btn-ghost !p-2" onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </header>
            {!user ? (
              <div>
                <p>{tr("Planning assistant requires a signed-in account.")}</p>
                <button
                  className="btn-outline"
                  onClick={() => {
                    setOpen(false);
                    setGuest(false);
                  }}
                >
                  {tr("Sign in")}
                </button>
              </div>
            ) : !acknowledged ? (
              <div className="space-y-3 text-sm">
                <p>
                  {tr(
                    "Gemini prompts and responses may be used to improve Google products and reviewed by humans. Do not enter sensitive or identifying information.",
                  )}
                </p>
                <p className="text-xs muted">
                  {tr(
                    "Only recent chat messages, language, local date and timezone are sent. Local account records are never attached.",
                  )}
                </p>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    onChange={(e) => consent(e.target.checked)}
                  />
                  <span>
                    {tr("I understand and acknowledge this data-use tradeoff.")}
                  </span>
                </label>
              </div>
            ) : (
              <>
                <div className="mb-3 max-h-40 space-y-2 overflow-y-auto text-sm">
                  {turns.map((t, i) => (
                    <p
                      key={i}
                      className={
                        t.role === "user"
                          ? "ml-8 rounded-xl bg-indigo-500/10 p-3"
                          : "mr-8 rounded-xl bg-slate-500/10 p-3"
                      }
                    >
                      {t.content}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    className="input min-h-10 flex-1"
                    rows={2}
                    maxLength={2000}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={tr("Plan a task, habit, goal, or goal plan…")}
                  />
                  <button
                    className="btn-primary self-end"
                    disabled={busy || !input.trim()}
                    onClick={() => void send()}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
                {error && (
                  <p role="alert" className="mt-2 text-sm text-rose-600">
                    {error}
                  </p>
                )}
              </>
            )}
            {proposals.length > 0 && (
              <div className="mt-4 space-y-3 border-t pt-3">
                <p className="text-sm muted">
                  {tr("Review and edit. Nothing is saved until confirmation.")}
                </p>
                {proposals.map((p, i) => (
                  <article key={i} className="rounded-xl border p-3">
                    <div className="mb-2 text-xs font-semibold text-indigo-600">
                      {entityLabel(p)} → {destination(p)}
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selected[i]}
                        onChange={(e) =>
                          setSelected({ ...selected, [i]: e.target.checked })
                        }
                      />
                      <input
                        className="input min-w-0 flex-1"
                        value={p.title}
                        onChange={(e) => update(i, { title: e.target.value })}
                      />
                    </label>
                    <label className="mt-2 block text-xs muted">
                      {tr("Entity type")}
                      <select
                        className="input mt-1"
                        value={p.entityType}
                        onChange={(e) =>
                          update(i, {
                            entityType: e.target.value as EntityType,
                            goalId: undefined,
                          })
                        }
                      >
                        {entityTypes.map((type) => (
                          <option key={type} value={type}>
                            {tr(
                              (
                                {
                                  task: "Task",
                                  habit: "Habit",
                                  goal: "Goal",
                                  milestone: "Milestone",
                                  library_item: "Library item",
                                } as const
                              )[type],
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                    {p.entityType === "task" ||
                    p.entityType === "library_item" ? (
                      <>
                        <label className="mt-2 block text-xs muted">
                          {tr("Category")}
                          <select
                            className="input mt-1"
                            value={p.categoryId ?? ""}
                            onChange={(e) =>
                              update(i, { categoryId: e.target.value })
                            }
                          >
                            {categories.map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-xs muted">
                            {tr("Due date")}
                            <input
                              type="date"
                              className="input"
                              value={p.dueDate ?? ""}
                              onChange={(e) =>
                                update(i, {
                                  dueDate: e.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-xs muted">
                            {tr("Scheduled time")}
                            <input
                              type="time"
                              className="input"
                              value={p.scheduledTime ?? ""}
                              onChange={(e) =>
                                update(i, {
                                  scheduledTime: e.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-xs muted">
                            {tr("Duration (minutes)")}
                            <input
                              type="number"
                              min="5"
                              max="480"
                              step="5"
                              className="input"
                              value={p.durationMinutes ?? ""}
                              onChange={(e) =>
                                update(i, {
                                  durationMinutes: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </label>
                          {p.entityType === "task" && (
                            <label className="text-xs muted">
                              {tr("Link to goal")}
                              <select
                                className="input"
                                value={p.goalId ?? ""}
                                onChange={(e) =>
                                  update(i, {
                                    goalId: e.target.value || undefined,
                                  })
                                }
                              >
                                <option value="">{tr("None")}</option>
                                {goals.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                        <label className="mt-2 block text-xs muted">
                          {tr("Priority")}
                          <select
                            className="input"
                            value={p.priority}
                            onChange={(e) =>
                              update(i, {
                                priority: Number(
                                  e.target.value,
                                ) as PlannerProposal["priority"],
                              })
                            }
                          >
                            {[1, 2, 3, 4].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Notes")}
                          <textarea
                            className="input"
                            value={p.notes}
                            onChange={(e) =>
                              update(i, { notes: e.target.value })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    {p.entityType === "habit" && (
                      <>
                        <label className="mt-2 block text-xs muted">
                          {tr("Category")}
                          <select
                            className="input"
                            value={p.categoryId ?? ""}
                            onChange={(e) =>
                              update(i, { categoryId: e.target.value })
                            }
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Frequency")}
                          <select
                            className="input"
                            value={p.frequency ?? ""}
                            onChange={(e) =>
                              update(i, {
                                frequency: e.target.value as "daily" | "weekly",
                              })
                            }
                          >
                            <option value="">{tr("Choose recurrence")}</option>
                            <option value="daily">{tr("Daily")}</option>
                            <option value="weekly">{tr("Weekly")}</option>
                          </select>
                        </label>
                        {p.frequency === "weekly" && (
                          <label className="mt-2 block text-xs muted">
                            {tr("Times per week")}
                            <input
                              type="number"
                              min="1"
                              max="7"
                              className="input"
                              value={p.targetPerWeek ?? ""}
                              onChange={(e) =>
                                update(i, {
                                  targetPerWeek:
                                    Number(e.target.value) || undefined,
                                })
                              }
                            />
                          </label>
                        )}
                        <label className="mt-2 block text-xs muted">
                          {tr("Why")}
                          <textarea
                            className="input"
                            value={p.why ?? p.notes}
                            onChange={(e) => update(i, { why: e.target.value })}
                          />
                        </label>
                      </>
                    )}
                    {p.entityType === "goal" && (
                      <>
                        <label className="mt-2 block text-xs muted">
                          {tr("Description")}
                          <textarea
                            className="input"
                            value={p.description ?? p.notes}
                            onChange={(e) =>
                              update(i, { description: e.target.value })
                            }
                          />
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Category")}
                          <select
                            className="input"
                            value={p.categoryId ?? ""}
                            onChange={(e) =>
                              update(i, { categoryId: e.target.value })
                            }
                          >
                            {categories.map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Target date")}
                          <input
                            type="date"
                            className="input"
                            value={p.targetDate ?? ""}
                            onChange={(e) =>
                              update(i, {
                                targetDate: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    {p.entityType === "milestone" && (
                      <>
                        <label className="mt-2 block text-xs muted">
                          {tr("Parent goal")}
                          <select
                            className="input"
                            value={p.goalId ?? ""}
                            onChange={(e) =>
                              update(i, { goalId: e.target.value || undefined })
                            }
                          >
                            <option value="">{tr("Choose parent goal")}</option>
                            {goals.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title}
                              </option>
                            ))}
                            {proposals
                              .filter((x) => x.entityType === "goal")
                              .map((g) => (
                                <option
                                  key={g.proposalKey ?? g.title}
                                  value={`proposal:${g.proposalKey}`}
                                >
                                  {g.title} ({tr("new goal in this batch")})
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Completion criteria")}
                          <input
                            className="input"
                            value={p.completionCriteria ?? ""}
                            onChange={(e) =>
                              update(i, { completionCriteria: e.target.value })
                            }
                          />
                        </label>
                        <label className="mt-2 block text-xs muted">
                          {tr("Target date")}
                          <input
                            type="date"
                            className="input"
                            value={p.dueDate ?? ""}
                            onChange={(e) =>
                              update(i, {
                                dueDate: e.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </article>
                ))}
                <p
                  id="planner-readiness-help"
                  role="status"
                  aria-live="polite"
                  className="text-sm text-rose-600"
                >
                  {proposals.some((p, i) => selected[i] && !proposalReady(p, i))
                    ? tr(
                        "One or more selected proposals are incomplete or invalid. Complete required fields and choose a valid parent goal before confirming.",
                      )
                    : ""}
                </p>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={cancel}>
                    {tr("Cancel")}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={!selectedReady()}
                    aria-describedby="planner-readiness-help"
                    onClick={confirm}
                  >
                    <Check size={16} className="mr-1 inline" />
                    <CalendarClock size={16} className="mr-1 inline" />
                    {tr("Confirm selected")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
