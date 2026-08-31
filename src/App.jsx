import React, { useState, useEffect, useCallback, useRef } from "react";
import { loadSession, saveSession } from "./lib/hautaStorage";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Users,
  KeyRound,
  ClipboardList,
  Sparkles,
} from "lucide-react";

/* ---------------------------------- */
/* Design tokens                       */
/* ---------------------------------- */
const C = {
  paper: "#EAEDF1",
  paperDark: "#DCE1E8",
  panel: "#F5F7F9",
  ink: "#1B2436",
  inkSoft: "#5B6577",
  brass: "#A97F1F",
  brassDeep: "#8C6A19",
  brassSoft: "#EBDCB6",
  teal: "#33625D",
  tealSoft: "#DCE9E6",
  clay: "#AF4A31",
  claySoft: "#F3DFD8",
  line: "#CBD2DB",
  white: "#FFFFFF",
};

const FONTS = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
};

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Distinct accent colors assigned to competencies, in order, for the published scorecard.
const COMP_PALETTE = [
  "#A97F1F", // brass
  "#33625D", // teal
  "#6E5A87", // muted plum
  "#3E6FA6", // slate blue
  "#AF4A31", // clay
  "#5C7A3D", // olive
  "#8A5A3B", // umber
  "#4A5B7A", // steel
  "#8C6A19", // deep brass
  "#4F7A72", // sea green
  "#8E4B6B", // muted rose
  "#5A6B4A", // moss
];
const colorForIndex = (i) => COMP_PALETTE[i % COMP_PALETTE.length];

// Rating (1-5) -> percent of the competency's weight earned. 5 = 100%, 3 = 50%, 1 = 0%.
const ratingToPercent = (rating) => ((rating - 1) / 4) * 100;

const scoreTone = (pct) => {
  if (pct === null || pct === undefined) return "neutral";
  if (pct >= 75) return "teal";
  if (pct >= 45) return "brass";
  return "clay";
};

// --- Score wheel geometry helpers ---
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0deg = top, clockwise
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegmentPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  if (endAngle <= startAngle + 0.01) return "";
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p0 = polarToCartesian(cx, cy, outerR, startAngle);
  const p1 = polarToCartesian(cx, cy, outerR, endAngle);
  const p2 = polarToCartesian(cx, cy, innerR, endAngle);
  const p3 = polarToCartesian(cx, cy, innerR, startAngle);
  return `M ${p0.x} ${p0.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${p3.x} ${p3.y} Z`;
}

/* ---------------------------------- */
/* Helpers                             */
/* ---------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10);

const genCode = (len = 6) => {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const defaultThreshold = (n) => Math.max(2, Math.round((n - 1) * 0.55));

// loadSession/saveSession now come from ./lib/hautaStorage (Supabase-backed)

function computeResults(session) {
  if (!session) return [];
  const n = session.competencies.length;
  const submitted = session.participants.filter((p) => p.status === "submitted" && p.ranking);
  const map = {};
  session.competencies.forEach((c) => {
    map[c.id] = { id: c.id, text: c.text, entries: [] };
  });
  submitted.forEach((p) => {
    p.ranking.forEach((compId, idx) => {
      const rank = idx + 1;
      const points = n - rank + 1;
      if (map[compId]) {
        map[compId].entries.push({
          participantId: p.id,
          label: p.label,
          email: p.email,
          rank,
          points,
        });
      }
    });
  });
  const rows = Object.values(map).map((row) => {
    const pts = row.entries.map((e) => e.points);
    const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
    const min = pts.length ? Math.min(...pts) : null;
    const max = pts.length ? Math.max(...pts) : null;
    const range = pts.length ? max - min : null;
    const override = session.overrides ? session.overrides[row.id] : undefined;
    const finalWeight = override !== undefined && override !== null && override !== "" ? Number(override) : avg;
    return { ...row, avg, min, max, range, override, finalWeight, submittedCount: pts.length };
  });

  // Normalize so the final weights across the scorecard sum to 100 points.
  const total = rows.reduce((sum, r) => (r.finalWeight !== null ? sum + r.finalWeight : sum), 0);
  const normalized = rows.map((r) => ({
    ...r,
    normalizedWeight: r.finalWeight !== null && total > 0 ? (r.finalWeight / total) * 100 : null,
  }));

  return normalized.sort((a, b) => (b.normalizedWeight ?? -1) - (a.normalizedWeight ?? -1));
}

/* ---------------------------------- */
/* Small UI atoms                      */
/* ---------------------------------- */
function Logo() {
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{ fontFamily: FONTS.display, color: C.ink, fontSize: "1.6rem", fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        Hauta
      </span>
      <span style={{ fontFamily: FONTS.mono, color: C.inkSoft, fontSize: "0.7rem", letterSpacing: "0.08em" }}>
        SCORECARD WEIGHTING
      </span>
      <span
        style={{
          fontFamily: FONTS.mono,
          color: C.brassDeep,
          background: C.brassSoft,
          fontSize: "0.65rem",
          letterSpacing: "0.04em",
          padding: "0.1rem 0.4rem",
          borderRadius: "999px",
        }}
      >
        TESTV1.4
      </span>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, className = "", type = "button", title }) {
  const base = {
    fontFamily: FONTS.body,
    fontWeight: 600,
    fontSize: "0.875rem",
    borderRadius: "6px",
    padding: "0.6rem 1.1rem",
    transition: "all 120ms ease",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: "1px solid transparent",
  };
  const variants = {
    primary: { background: C.ink, color: C.white },
    brass: { background: C.brass, color: C.white },
    ghost: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
    danger: { background: "transparent", color: C.clay, border: `1px solid ${C.clay}` },
    subtle: { background: C.paperDark, color: C.ink },
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(27,36,54,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-4">
      <span
        style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft, letterSpacing: "0.06em" }}
        className="uppercase block mb-1.5"
      >
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.inkSoft }} className="block mt-1">
          {hint}
        </span>
      )}
    </label>
  );
}

const inputStyle = {
  fontFamily: FONTS.body,
  fontSize: "0.9rem",
  color: C.ink,
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: "6px",
  padding: "0.55rem 0.75rem",
  width: "100%",
  outline: "none",
};

function TextInput(props) {
  return (
    <input
      {...props}
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = C.brass)}
      onBlur={(e) => (e.target.style.borderColor = C.line)}
    />
  );
}

function CopyButton({ value, small }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {}
  };
  return (
    <button
      onClick={doCopy}
      title="Copy"
      style={{
        fontFamily: FONTS.mono,
        fontSize: small ? "0.7rem" : "0.75rem",
        color: copied ? C.teal : C.inkSoft,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: C.paperDark, fg: C.inkSoft },
    teal: { bg: C.tealSoft, fg: C.teal },
    clay: { bg: C.claySoft, fg: C.clay },
    brass: { bg: C.brassSoft, fg: C.brassDeep },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        fontFamily: FONTS.mono,
        fontSize: "0.65rem",
        letterSpacing: "0.04em",
        background: t.bg,
        color: t.fg,
        padding: "0.2rem 0.5rem",
        borderRadius: "999px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- */
/* Screen: Home                        */
/* ---------------------------------- */
function HomeScreen({ session, onStartSetup, onEnterCode, onResume, loading }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setErr("Enter a code first.");
      return;
    }
    setErr("");
    onEnterCode(trimmed);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div
        className="rounded-lg p-8 mb-6"
        style={{ background: C.white, border: `1px solid ${C.line}` }}
      >
        <p style={{ fontFamily: FONTS.body, color: C.inkSoft, fontSize: "0.95rem", lineHeight: 1.6 }}>
          Rank competencies with your hiring panel, convert everyone's rankings into weighted
          scores, and flag the ones your panel disagrees about — before they quietly skew the
          scorecard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-lg p-6 flex flex-col justify-between"
          style={{ background: C.white, border: `1px solid ${C.line}` }}
        >
          <div>
            <div className="flex items-center gap-2 mb-2" style={{ color: C.brass }}>
              <ClipboardList size={18} />
              <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
                Run a new session
              </span>
            </div>
            <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }}>
              Enter the competencies, set how many panelists are ranking, and get a code for each
              of them.
            </p>
          </div>
          <Button variant="brass" onClick={onStartSetup} className="mt-4 self-start">
            Set up scorecard <ChevronRight size={15} />
          </Button>
        </div>

        <div
          className="rounded-lg p-6 flex flex-col justify-between"
          style={{ background: C.white, border: `1px solid ${C.line}` }}
        >
          <div>
            <div className="flex items-center gap-2 mb-2" style={{ color: C.teal }}>
              <KeyRound size={18} />
              <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
                I have a code
              </span>
            </div>
            <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }}>
              Panelist code to rank competencies, organizer code to view results, or an interviewer
              code to rate a candidate.
            </p>
          </div>
          <div className="mt-4">
            <div className="flex gap-2">
              <TextInput
                placeholder="e.g. XK4P9Q"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{ ...inputStyle, fontFamily: FONTS.mono, textTransform: "uppercase" }}
              />
              <Button variant="ghost" onClick={submit} disabled={loading}>
                Go
              </Button>
            </div>
            {err && (
              <p style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.clay }} className="mt-1.5">
                {err}
              </p>
            )}
          </div>
        </div>
      </div>

      {session && (
        <div
          className="rounded-lg p-4 mt-6 flex items-center justify-between gap-3"
          style={{ background: C.panel, border: `1px dashed ${C.line}` }}
        >
          <p style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }}>
            ACTIVE SESSION · {session.competencies.length} competencies ·{" "}
            {session.participants.filter((p) => p.status === "submitted").length}/
            {session.participants.length} submitted
          </p>
          <Button variant="subtle" onClick={onResume}>
            Resume session <ChevronRight size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Setup                       */
/* ---------------------------------- */
function SetupScreen({ existingSession, onCreate, onCancel }) {
  const [competencies, setCompetencies] = useState(["", "", ""]);
  const [numParticipants, setNumParticipants] = useState(3);
  const [confirming, setConfirming] = useState(false);

  const updateComp = (i, val) => {
    const next = [...competencies];
    next[i] = val;
    setCompetencies(next);
  };
  const addComp = () => setCompetencies([...competencies, ""]);
  const removeComp = (i) => setCompetencies(competencies.filter((_, idx) => idx !== i));

  const validComps = competencies.map((c) => c.trim()).filter(Boolean);
  const canSubmit = validComps.length >= 2 && numParticipants >= 1 && numParticipants <= 12;

  const reallyCreate = () => {
    const comps = validComps.map((text) => ({ id: uid(), text }));
    const participants = Array.from({ length: numParticipants }).map((_, i) => ({
      id: uid(),
      code: genCode(),
      label: `Participant ${i + 1}`,
      email: null,
      status: "pending",
      ranking: null,
      submittedAt: null,
    }));
    const session = {
      id: uid(),
      createdAt: Date.now(),
      organizerCode: genCode(7),
      varianceThreshold: defaultThreshold(comps.length),
      competencies: comps,
      participants,
      overrides: {},
    };
    onCreate(session);
  };

  const handleSubmit = () => {
    if (existingSession) {
      setConfirming(true);
    } else {
      reallyCreate();
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-lg p-8" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <h2 style={{ fontFamily: FONTS.display, fontSize: "1.3rem", color: C.ink }} className="mb-6">
          Set up the scorecard
        </h2>

        <Field label="Competencies to rank">
          <div className="space-y-2">
            {competencies.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  style={{ fontFamily: FONTS.mono, fontSize: "0.75rem", color: C.inkSoft, width: "1.2rem" }}
                >
                  {i + 1}
                </span>
                <TextInput
                  value={c}
                  placeholder="e.g. Stakeholder Management"
                  onChange={(e) => updateComp(i, e.target.value)}
                />
                <button
                  onClick={() => removeComp(i)}
                  disabled={competencies.length <= 2}
                  style={{ color: C.inkSoft, opacity: competencies.length <= 2 ? 0.3 : 1, background: "none", border: "none", cursor: "pointer" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addComp}
            className="mt-2 flex items-center gap-1"
            style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.brassDeep, background: "none", border: "none", cursor: "pointer" }}
          >
            <Plus size={14} /> Add competency
          </button>
        </Field>

        <Field
          label="Number of participants"
          hint="Each participant gets their own private ranking code."
        >
          <input
            type="number"
            min={1}
            max={12}
            value={numParticipants}
            onChange={(e) => setNumParticipants(Number(e.target.value))}
            style={{ ...inputStyle, width: "6rem" }}
          />
        </Field>

        {!confirming ? (
          <div className="flex items-center gap-3 mt-4">
            <Button variant="brass" disabled={!canSubmit} onClick={handleSubmit}>
              <Sparkles size={15} /> Generate codes
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="rounded-md p-4 mt-4" style={{ background: C.claySoft }}>
            <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }} className="mb-3">
              There's already an active session. Starting a new one replaces it — existing codes
              and rankings will stop working. Continue?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={reallyCreate}>
                Yes, replace it
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Go back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Admin dashboard             */
/* ---------------------------------- */
function ResultRow({ row, threshold, onOverride, note, onSaveNote }) {
  const [open, setOpen] = useState(false);
  const flagged = row.range !== null && row.range >= threshold;
  const barWidth = row.normalizedWeight !== null ? Math.max(3, row.normalizedWeight) : 0;
  const [overrideDraft, setOverrideDraft] = useState(row.override ?? "");

  useEffect(() => {
    setOverrideDraft(row.override ?? "");
  }, [row.override]);

  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }} className="py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(!open)}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.inkSoft }}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div style={{ width: "13rem" }}>
          <span style={{ fontFamily: FONTS.body, fontSize: "0.88rem", color: C.ink, fontWeight: 500 }}>
            {row.text}
          </span>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <div
            style={{
              height: "10px",
              borderRadius: "3px",
              background: flagged ? C.clay : C.brass,
              width: `${barWidth}%`,
              maxWidth: "100%",
              transition: "width 200ms ease",
            }}
          />
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.ink, minWidth: "3.2rem" }}>
            {row.normalizedWeight !== null ? `${row.normalizedWeight.toFixed(1)} pts` : "—"}
          </span>
        </div>
        <div style={{ width: "5rem", textAlign: "right" }}>
          {row.range !== null && (
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }}>
              range {row.range}
            </span>
          )}
        </div>
        <div style={{ width: "6.5rem" }} className="flex justify-end">
          {flagged ? (
            <Badge tone="clay">
              <AlertTriangle size={11} style={{ display: "inline", marginRight: 3, marginBottom: 1 }} />
              Discuss
            </Badge>
          ) : row.range !== null ? (
            <Badge tone="teal">Aligned</Badge>
          ) : (
            <Badge tone="neutral">Waiting</Badge>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 ml-7 pl-3" style={{ borderLeft: `2px solid ${C.line}` }}>
          {row.entries.length === 0 && (
            <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }}>
              No submissions yet for this competency.
            </p>
          )}
          <div className="space-y-1 mb-3">
            {row.entries
              .slice()
              .sort((a, b) => b.points - a.points)
              .map((e) => (
                <div key={e.participantId} className="flex items-center justify-between">
                  <span style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.ink }}>
                    {e.label} {e.email ? `· ${e.email}` : ""}
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: "0.75rem", color: C.inkSoft }}>
                    rank #{e.rank} → {e.points} pts
                  </span>
                </div>
              ))}
          </div>
          {flagged && (
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft }} className="uppercase">
                Override (raw points, before rebalancing to 100)
              </span>
              <input
                type="number"
                step="0.1"
                value={overrideDraft}
                placeholder={row.avg !== null ? row.avg.toFixed(1) : ""}
                onChange={(e) => setOverrideDraft(e.target.value)}
                onBlur={() => onOverride(row.id, overrideDraft)}
                style={{ ...inputStyle, width: "5.5rem", padding: "0.3rem 0.5rem" }}
              />
              {row.override !== undefined && row.override !== null && row.override !== "" && (
                <button
                  onClick={() => onOverride(row.id, "")}
                  style={{ fontFamily: FONTS.body, fontSize: "0.72rem", color: C.inkSoft, background: "none", border: "none", cursor: "pointer" }}
                >
                  reset to average
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {row.normalizedWeight !== null && (
        <div className="ml-7 mt-3">
          <NoteBox note={note} onSave={(text) => onSaveNote(row.id, text)} />
        </div>
      )}
    </div>
  );
}

function NoteBox({ note, onSave }) {
  const [draft, setDraft] = useState(note || "");
  const [saved, setSaved] = useState(false);
  const dirty = draft !== (note || "");

  useEffect(() => {
    setDraft(note || "");
  }, [note]);

  const save = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  return (
    <div className="rounded-md p-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <span
        style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: C.inkSoft, letterSpacing: "0.05em" }}
        className="uppercase block mb-1.5"
      >
        Competency description & interview question
      </span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What this competency means, and the question you ask to assess it…"
        rows={2}
        style={{ ...inputStyle, resize: "vertical", fontSize: "0.82rem", lineHeight: 1.5 }}
      />
      <div className="flex items-center gap-2 mt-2">
        <Button variant={dirty ? "brass" : "subtle"} onClick={save} disabled={!dirty && !saved}>
          {saved ? <Check size={14} /> : null}
          {saved ? "Saved" : "Save note"}
        </Button>
      </div>
    </div>
  );
}

function AdminDashboard({ session, onOverride, onThreshold, onReset, onPublish, onSaveNote, onCreatePanel, onResetPanel }) {
  const rows = computeResults(session);
  const submittedCount = session.participants.filter((p) => p.status === "submitted").length;
  const total = session.participants.length;
  const flaggedCount = rows.filter((r) => r.range !== null && r.range >= session.varianceThreshold).length;
  const [copiedFinal, setCopiedFinal] = useState(false);

  const finalText = () =>
    rows
      .map((r, i) => {
        const note = (session.competencyNotes || {})[r.id];
        const weightLine = `${i + 1}. ${r.text} — weight ${r.normalizedWeight !== null ? r.normalizedWeight.toFixed(1) : "n/a"}/100`;
        return note ? `${weightLine}\n   ${note}` : weightLine;
      })
      .join("\n");

  const copyFinal = async () => {
    try {
      await navigator.clipboard.writeText(finalText());
      setCopiedFinal(true);
      setTimeout(() => setCopiedFinal(false), 1500);
    } catch (e) {}
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-lg p-6" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ color: C.teal }}>
            <Users size={17} />
            <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }}>
              Panel ({submittedCount}/{total} submitted)
            </span>
          </div>
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.7rem", color: C.inkSoft }}>
            organizer code: {session.organizerCode}
          </span>
        </div>
        <div className="space-y-2">
          {session.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: C.panel }}
            >
              <div>
                <span style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }}>{p.label}</span>
                {p.email && (
                  <span style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.inkSoft }} className="ml-2">
                    {p.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.ink }}>{p.code}</span>
                <CopyButton value={p.code} small />
                {p.status === "submitted" ? <Badge tone="teal">Submitted</Badge> : <Badge tone="neutral">Pending</Badge>}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mt-3">
          Share this tool's link with each panelist along with their code above.
        </p>
      </div>

      <div className="rounded-lg p-6" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }}>Weighted scorecard</span>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft }}>FLAG THRESHOLD ≥</span>
            <input
              type="number"
              min={1}
              max={session.competencies.length - 1}
              value={session.varianceThreshold}
              onChange={(e) => onThreshold(Number(e.target.value))}
              style={{ ...inputStyle, width: "3.5rem", padding: "0.3rem 0.4rem" }}
            />
          </div>
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mb-1">
          Weights are rebalanced across all competencies so the scorecard always totals 100 points.
        </p>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mb-4">
          {flaggedCount > 0
            ? `${flaggedCount} competenc${flaggedCount === 1 ? "y needs" : "ies need"} a quick discussion before you lock these weights in.`
            : "No high-variance items right now — the panel is aligned."}
        </p>

        <div>
          {rows.map((row) => (
            <ResultRow
              key={row.id}
              row={row}
              threshold={session.varianceThreshold}
              onOverride={onOverride}
              note={(session.competencyNotes || {})[row.id]}
              onSaveNote={onSaveNote}
            />
          ))}
        </div>

        {submittedCount > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.7rem", color: C.inkSoft }}>
              TOTAL
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.ink, fontWeight: 500 }}>
              {rows.reduce((sum, r) => sum + (r.normalizedWeight || 0), 0).toFixed(1)} / 100
            </span>
          </div>
        )}

        {submittedCount > 0 && (
          <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <Button variant="brass" onClick={copyFinal}>
              {copiedFinal ? <Check size={15} /> : <Copy size={15} />}
              {copiedFinal ? "Copied" : "Copy final scorecard"}
            </Button>
            <span style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.inkSoft }}>
              Sorted highest to lowest weight.
            </span>
          </div>
        )}
      </div>

      {submittedCount > 0 && (
        <div className="rounded-lg p-6" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }} className="block mb-2">
            Publish
          </span>
          {!session.published ? (
            <>
              <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }} className="mb-3">
                Once you're happy with the weights above, publish the scorecard. This locks in the
                current weights so candidate evaluations below stay stable even if you keep
                adjusting things up here.
              </p>
              <Button variant="brass" onClick={onPublish}>
                <Sparkles size={15} /> Publish scorecard
              </Button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mb-3">
                Scorecard is published. Adjusting weights above won't affect interviewers already
                rating a candidate — republish to push updated weights to new evaluations.
              </p>
              <Button variant="ghost" onClick={onPublish}>
                <RefreshCw size={13} /> Republish with current weights
              </Button>
            </>
          )}
        </div>
      )}

      {submittedCount > 0 && session.published && (
        <InterviewerPanel session={session} onCreatePanel={onCreatePanel} onResetPanel={onResetPanel} />
      )}

      <div className="flex justify-end">
        <Button variant="danger" onClick={onReset}>
          Start a new session
        </Button>
      </div>
    </div>
  );
}

function InterviewerPanel({ session, onCreatePanel, onResetPanel }) {
  const panel = session.interviewerPanel;
  const [candidateName, setCandidateName] = useState("");
  const [count, setCount] = useState(3);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1400);
    } catch (e) {}
  };

  if (!panel) {
    return (
      <div className="rounded-lg p-6" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }} className="block mb-2">
          Interviewer panel
        </span>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }} className="mb-4">
          Add up to 3 interviewers to independently rate the same candidate on this scorecard. Once
          everyone submits, their scores combine into one total.
        </p>
        <Field label="Candidate name">
          <TextInput value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="e.g. Jordan Alvarez" />
        </Field>
        <Field label="Number of interviewers">
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  width: "2.4rem",
                  height: "2.4rem",
                  borderRadius: "6px",
                  border: `1px solid ${count === n ? C.brass : C.line}`,
                  background: count === n ? C.brass : C.white,
                  color: count === n ? C.white : C.ink,
                  fontFamily: FONTS.mono,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Button
          variant="brass"
          disabled={!candidateName.trim()}
          onClick={() => onCreatePanel(candidateName.trim(), count)}
        >
          <Sparkles size={15} /> Create interviewer codes
        </Button>
      </div>
    );
  }

  const allSubmitted = panel.interviewers.length > 0 && panel.interviewers.every((i) => i.status === "submitted");
  const combinedTotal = panel.interviewers.reduce((sum, i) => sum + (i.total || 0), 0);
  const avgTotal = combinedTotal / panel.interviewers.length;

  return (
    <div className="rounded-lg p-6" style={{ background: C.white, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }}>Interviewer panel</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }}>{panel.candidateName}</span>
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mb-4">
        {panel.interviewers.filter((i) => i.status === "submitted").length}/{panel.interviewers.length} submitted
      </p>

      <div className="space-y-2 mb-4">
        {panel.interviewers.map((intw) => (
          <div key={intw.id} className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: C.panel }}>
            <span style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }}>{intw.label}</span>
            <div className="flex items-center gap-3">
              <span style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.ink }}>{intw.code}</span>
              <button onClick={() => copyCode(intw.code)} style={{ background: "none", border: "none", cursor: "pointer", color: copiedCode === intw.code ? C.teal : C.inkSoft }}>
                {copiedCode === intw.code ? <Check size={13} /> : <Copy size={13} />}
              </button>
              {intw.status === "submitted" ? <Badge tone="teal">Submitted</Badge> : <Badge tone="neutral">Pending</Badge>}
            </div>
          </div>
        ))}
      </div>

      {allSubmitted && (
        <div className="pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <div className="text-center mb-5">
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: C.inkSoft, letterSpacing: "0.05em" }} className="uppercase block">
              Combined total ({panel.interviewers.length} interviewers)
            </span>
            <span style={{ fontFamily: FONTS.display, fontSize: "2.2rem", fontWeight: 600, color: C.ink }}>
              {combinedTotal.toFixed(1)}
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.75rem", color: C.inkSoft }} className="block">
              avg {avgTotal.toFixed(1)}/100 per interviewer
            </span>
          </div>

          <span style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft, letterSpacing: "0.05em" }} className="uppercase block mb-2">
            Individual evaluations
          </span>
          <div className="grid sm:grid-cols-3 gap-3">
            {panel.interviewers.map((intw) => (
              <div key={intw.id} className="rounded-md p-2" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.ink, textAlign: "center" }} className="mb-1">
                  {intw.label}
                </p>
                <ScoreWheel comps={session.competencies} weights={session.finalWeights || {}} ratings={intw.ratings || {}} total={intw.total || 0} />
              </div>
            ))}
          </div>
        </div>
      )}

      {!confirmingReset ? (
        <button
          onClick={() => setConfirmingReset(true)}
          className="mt-4"
          style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.clay, background: "none", border: "none", cursor: "pointer" }}
        >
          Start a new interviewer round
        </button>
      ) : (
        <div className="rounded-md p-3 mt-4" style={{ background: C.claySoft }}>
          <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.ink }} className="mb-2">
            This clears the current candidate, codes, and any submitted ratings. Continue?
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => { onResetPanel(); setConfirmingReset(false); }}>
              Yes, clear it
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Participant ranking          */
/* ---------------------------------- */
function RankingScreen({ session, participant, onSubmitRanking }) {
  const [order, setOrder] = useState(() => shuffle(session.competencies.map((c) => c.id)));
  const [submitting, setSubmitting] = useState(false);
  const compById = Object.fromEntries(session.competencies.map((c) => [c.id, c.text]));

  const move = (idx, dir) => {
    const next = [...order];
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setOrder(next);
  };

  const submit = async () => {
    setSubmitting(true);
    await onSubmitRanking(order);
    setSubmitting(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-lg p-8" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <h2 style={{ fontFamily: FONTS.display, fontSize: "1.25rem", color: C.ink }} className="mb-1">
          Rank these competencies
        </h2>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.82rem", color: C.inkSoft }} className="mb-5">
          Most important at the top. Use the arrows to reorder — order carries the signal, so take
          your time.
        </p>

        <div className="space-y-2">
          {order.map((compId, idx) => (
            <div
              key={compId}
              className="flex items-center gap-3 rounded-md px-3 py-2.5"
              style={{ background: C.panel, border: `1px solid ${C.line}` }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: "0.75rem",
                  color: C.white,
                  background: idx === 0 ? C.brass : C.inkSoft,
                  borderRadius: "999px",
                  width: "1.6rem",
                  height: "1.6rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: "0.88rem", color: C.ink, flex: 1 }}>
                {compById[compId]}
              </span>
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.25 : 1, color: C.ink }}
                aria-label="Move up"
              >
                <ArrowUp size={16} />
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === order.length - 1}
                style={{ background: "none", border: "none", cursor: idx === order.length - 1 ? "default" : "pointer", opacity: idx === order.length - 1 ? 0.25 : 1, color: C.ink }}
                aria-label="Move down"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          ))}
        </div>

        <Button variant="brass" className="mt-6" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit my ranking"}
        </Button>
      </div>
    </div>
  );
}

function ScoreWheel({ comps, weights, ratings, total }) {
  const cx = 100;
  const cy = 100;
  const outerR = 88;
  const innerR = 54;

  // Only actual earned points occupy space on the wheel — nothing is reserved
  // up front for a competency's full weight. Each rated item's arc starts
  // exactly where the previous item's arc ended.
  let cumulative = 0;
  const segments = [];
  comps.forEach((c, idx) => {
    const w = weights[c.id] || 0;
    const rating = ratings[c.id];
    if (!rating) return; // unrated items take up no space at all
    const earnedPoints = w * (ratingToPercent(rating) / 100);
    const angleSpan = (earnedPoints / 100) * 360;
    if (angleSpan <= 0) return;
    const start = cumulative;
    const end = cumulative + angleSpan;
    cumulative = end;
    segments.push({ id: c.id, color: colorForIndex(idx), start, end });
  });

  const tone = scoreTone(total);
  const toneColor = tone === "teal" ? C.teal : tone === "clay" ? C.clay : tone === "brass" ? C.brass : C.inkSoft;

  return (
    <div className="flex justify-center my-4">
      <div style={{ position: "relative", width: "13rem", height: "13rem" }}>
        <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
          {/* single faint background ring representing the full 100-point circle */}
          <path d={donutSegmentPath(cx, cy, outerR, innerR, 0, 359.99)} fill={C.paperDark} />
          {segments.map((seg) => (
            <path
              key={seg.id}
              d={donutSegmentPath(cx, cy, outerR, innerR, seg.start, seg.end)}
              fill={seg.color}
              stroke={C.white}
              strokeWidth={1.5}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.62rem", color: C.inkSoft, letterSpacing: "0.06em" }}>
            LIVE SCORE
          </span>
          <span style={{ fontFamily: FONTS.display, fontSize: "2rem", fontWeight: 600, color: toneColor, lineHeight: 1.1 }}>
            {total.toFixed(1)}
          </span>
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft }}>/ 100</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Rate a candidate            */
/* ---------------------------------- */
function EvaluateScreen({ session, onSubmitEvaluation, fixedCandidateName, interviewerLabel }) {
  const comps = session.competencies;
  const weights = session.finalWeights || {};
  const [candidateName, setCandidateName] = useState(fixedCandidateName || "");
  const [ratings, setRatings] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const effectiveName = fixedCandidateName || candidateName;
  const allRated = comps.every((c) => ratings[c.id]);
  const canSubmit = effectiveName.trim() && allRated;

  const liveTotal = comps.reduce((sum, c) => {
    const w = weights[c.id] || 0;
    const r = ratings[c.id];
    if (!r) return sum;
    return sum + w * (ratingToPercent(r) / 100);
  }, 0);

  const submit = async () => {
    setSubmitting(true);
    await onSubmitEvaluation({ candidateName: effectiveName.trim(), ratings });
    setSubmitting(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-lg p-8" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <h2 style={{ fontFamily: FONTS.display, fontSize: "1.25rem", color: C.ink }} className="mb-1">
          Rate a candidate
        </h2>
        {interviewerLabel && (
          <p style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.brassDeep }} className="mb-1">
            You are: {interviewerLabel}
          </p>
        )}
        <p style={{ fontFamily: FONTS.body, fontSize: "0.82rem", color: C.inkSoft }} className="mb-2">
          Score each competency 1 (not demonstrated) to 5 (excellent). 5/5 earns the full weight;
          3/5 earns half.
        </p>

        <ScoreWheel comps={comps} weights={weights} ratings={ratings} total={liveTotal} />

        {fixedCandidateName ? (
          <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }} className="mb-4">
            Candidate: <span style={{ fontWeight: 600 }}>{fixedCandidateName}</span>
          </p>
        ) : (
          <Field label="Candidate name">
            <TextInput
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="e.g. Jordan Alvarez"
            />
          </Field>
        )}

        <div className="space-y-3 mt-2">
          {comps.map((c, idx) => {
            const color = colorForIndex(idx);
            const w = weights[c.id] || 0;
            const r = ratings[c.id];
            return (
              <div key={c.id} className="rounded-md px-4 py-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "999px", background: color, display: "inline-block" }} />
                    <span style={{ fontFamily: FONTS.body, fontSize: "0.88rem", color: C.ink, fontWeight: 500 }}>
                      {c.text}
                    </span>
                  </div>
                  <span style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }}>
                    {w.toFixed(1)}% weight
                  </span>
                </div>
                {(session.competencyNotes || {})[c.id] && (
                  <p
                    style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft, lineHeight: 1.5 }}
                    className="mb-2"
                  >
                    {(session.competencyNotes || {})[c.id]}
                  </p>
                )}
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRatings({ ...ratings, [c.id]: n })}
                      style={{
                        width: "2.1rem",
                        height: "2.1rem",
                        borderRadius: "6px",
                        border: `1px solid ${r === n ? color : C.line}`,
                        background: r === n ? color : C.white,
                        color: r === n ? C.white : C.ink,
                        fontFamily: FONTS.mono,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        transition: "all 100ms ease",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  {r && (
                    <span
                      style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft, alignSelf: "center", marginLeft: "0.5rem" }}
                    >
                      = {ratingToPercent(r).toFixed(0)}% of weight
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: "0.75rem", color: C.inkSoft }}>
            Running total
          </span>
          <span style={{ fontFamily: FONTS.mono, fontSize: "1rem", color: C.ink, fontWeight: 600 }}>
            {liveTotal.toFixed(1)}/100
          </span>
        </div>

        <Button variant="brass" className="mt-4" onClick={submit} disabled={!canSubmit || submitting}>
          {submitting ? "Submitting…" : "Submit evaluation"}
        </Button>
        {!allRated && (
          <p style={{ fontFamily: FONTS.body, fontSize: "0.72rem", color: C.inkSoft }} className="mt-2">
            Rate every competency to submit.
          </p>
        )}
      </div>
    </div>
  );
}

function EvaluationResult({ session, evaluation }) {
  const comps = session.competencies;
  const weights = session.finalWeights || {};
  const tone = scoreTone(evaluation.total);

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-lg p-8 text-center" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }} className="uppercase mb-1">
          {evaluation.candidateName}
        </p>
        <p style={{ fontFamily: FONTS.display, fontSize: "2.4rem", color: C.ink, fontWeight: 600 }}>
          {evaluation.total.toFixed(1)}
          <span style={{ fontSize: "1.1rem", color: C.inkSoft }}>/100</span>
        </p>
        <Badge tone={tone}>{evaluation.total >= 75 ? "Strong" : evaluation.total >= 45 ? "Mixed" : "Weak"}</Badge>
      </div>

      <div className="rounded-lg p-6 mt-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <span style={{ fontFamily: FONTS.display, fontSize: "1rem", color: C.ink }} className="block mb-3">
          Breakdown
        </span>
        <div className="space-y-3">
          {comps.map((c, idx) => {
            const color = colorForIndex(idx);
            const w = weights[c.id] || 0;
            const r = evaluation.ratings[c.id];
            const pct = ratingToPercent(r);
            const earned = w * (pct / 100);
            const note = (session.competencyNotes || {})[c.id];
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 9, height: 9, borderRadius: "999px", background: color, display: "inline-block" }} />
                    <span style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }}>{c.text}</span>
                  </div>
                  <span style={{ fontFamily: FONTS.mono, fontSize: "0.75rem", color: C.inkSoft }}>
                    {r}/5 · {earned.toFixed(1)} of {w.toFixed(1)} pts
                  </span>
                </div>
                {note && (
                  <p style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.inkSoft, lineHeight: 1.5 }} className="mb-1 ml-4">
                    {note}
                  </p>
                )}
                <div style={{ height: 6, borderRadius: 3, background: C.paperDark, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


export default function HautaApp() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("home"); // home | setup | admin | email | ranking | done | already | evaluate | evaluate_done
  const [activeParticipantId, setActiveParticipantId] = useState(null);
  const [activeInterviewerId, setActiveInterviewerId] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    const s = await loadSession();
    setSession(s);
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    if (view === "admin") {
      pollRef.current = setInterval(refresh, 4000);
      return () => clearInterval(pollRef.current);
    }
  }, [view, refresh]);

  const handleStartSetup = () => setView("setup");

  const handleCreate = async (newSession) => {
    await saveSession(newSession);
    setSession(newSession);
    setView("admin");
  };

  const handleEnterCode = async (code) => {
    const s = await refresh();
    if (!s) {
      setView("home");
      return;
    }
    if (code === s.organizerCode) {
      setView("admin");
      return;
    }
    const panel = s.interviewerPanel;
    const interviewer = panel && panel.interviewers.find((i) => i.code === code);
    if (interviewer) {
      setActiveInterviewerId(interviewer.id);
      if (interviewer.status === "submitted") {
        setView("already");
      } else {
        setView("evaluate");
      }
      return;
    }
    const participant = s.participants.find((p) => p.code === code);
    if (!participant) {
      setView("home");
      return "invalid";
    }
    setActiveParticipantId(participant.id);
    if (participant.status === "submitted") {
      setView("already");
    } else if (!participant.email) {
      setView("email");
    } else {
      setView("ranking");
    }
  };

  const handleEmailSubmit = async () => {
    if (!pendingEmail.trim()) return;
    const s = await refresh();
    const next = {
      ...s,
      participants: s.participants.map((p) =>
        p.id === activeParticipantId ? { ...p, email: pendingEmail.trim() } : p
      ),
    };
    await saveSession(next);
    setSession(next);
    setView("ranking");
  };

  const handleSubmitRanking = async (order) => {
    const s = await refresh();
    const next = {
      ...s,
      participants: s.participants.map((p) =>
        p.id === activeParticipantId
          ? { ...p, ranking: order, status: "submitted", submittedAt: Date.now() }
          : p
      ),
    };
    await saveSession(next);
    setSession(next);
    setView("done");
  };

  const handleOverride = async (compId, value) => {
    const s = await refresh();
    const overrides = { ...(s.overrides || {}) };
    if (value === "" || value === null || value === undefined) {
      delete overrides[compId];
    } else {
      overrides[compId] = value;
    }
    const next = { ...s, overrides };
    await saveSession(next);
    setSession(next);
  };

  const handleThreshold = async (val) => {
    const s = session;
    const next = { ...s, varianceThreshold: val };
    setSession(next);
    await saveSession(next);
  };

  const handleSaveNote = async (compId, text) => {
    const s = await refresh();
    const competencyNotes = { ...(s.competencyNotes || {}), [compId]: text };
    const next = { ...s, competencyNotes };
    await saveSession(next);
    setSession(next);
  };

  const handleReset = () => {
    setView("setup");
  };

  const handleResume = async () => {
    const s = await refresh();
    if (s) setView("admin");
  };

  const handlePublish = async () => {
    const s = await refresh();
    const rows = computeResults(s);
    const finalWeights = {};
    rows.forEach((r) => {
      finalWeights[r.id] = r.normalizedWeight || 0;
    });
    const next = {
      ...s,
      published: true,
      finalWeights,
    };
    await saveSession(next);
    setSession(next);
  };

  const handleCreatePanel = async (candidateName, count) => {
    const s = await refresh();
    const interviewers = Array.from({ length: count }).map((_, i) => ({
      id: uid(),
      code: genCode(6),
      label: `Interviewer ${i + 1}`,
      status: "pending",
      ratings: null,
      total: null,
      submittedAt: null,
    }));
    const next = { ...s, interviewerPanel: { candidateName, interviewers } };
    await saveSession(next);
    setSession(next);
  };

  const handleResetPanel = async () => {
    const s = await refresh();
    const next = { ...s, interviewerPanel: null };
    await saveSession(next);
    setSession(next);
  };

  const [lastEvaluation, setLastEvaluation] = useState(null);

  const handleSubmitEvaluation = async ({ candidateName, ratings }) => {
    const s = await refresh();
    const weights = s.finalWeights || {};
    const total = s.competencies.reduce((sum, c) => {
      const w = weights[c.id] || 0;
      const r = ratings[c.id];
      if (!r) return sum;
      return sum + w * (ratingToPercent(r) / 100);
    }, 0);
    const panel = s.interviewerPanel;
    const next = {
      ...s,
      interviewerPanel: panel
        ? {
            ...panel,
            interviewers: panel.interviewers.map((i) =>
              i.id === activeInterviewerId
                ? { ...i, status: "submitted", ratings, total, submittedAt: Date.now() }
                : i
            ),
          }
        : panel,
    };
    await saveSession(next);
    setSession(next);
    setLastEvaluation({ candidateName, ratings, total });
    setView("evaluate_done");
  };


  const activeParticipant = session?.participants.find((p) => p.id === activeParticipantId);
  const activeInterviewer =
    session?.interviewerPanel && session.interviewerPanel.interviewers.find((i) => i.id === activeInterviewerId);

  return (
    <div
      style={{ background: C.paper, minHeight: "100%", fontFamily: FONTS.body }}
      className="p-6 sm:p-10"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      <div className="max-w-3xl mx-auto mb-8 flex items-center justify-between">
        <button onClick={() => setView("home")} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <Logo />
        </button>
        {view !== "home" && view !== "setup" && (
          <button
            onClick={() => setView("home")}
            style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft, background: "none", border: "none", cursor: "pointer" }}
          >
            ← Home
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.inkSoft, textAlign: "center" }}>
          Loading…
        </p>
      ) : (
        <>
          {view === "home" && (
            <HomeScreen
              session={session}
              onStartSetup={handleStartSetup}
              onEnterCode={handleEnterCode}
              onResume={handleResume}
            />
          )}

          {view === "setup" && (
            <SetupScreen existingSession={session} onCreate={handleCreate} onCancel={() => setView("home")} />
          )}

          {view === "admin" && session && (
            <AdminDashboard
              session={session}
              onOverride={handleOverride}
              onThreshold={handleThreshold}
              onReset={handleReset}
              onPublish={handlePublish}
              onSaveNote={handleSaveNote}
              onCreatePanel={handleCreatePanel}
              onResetPanel={handleResetPanel}
            />
          )}

          {view === "email" && (
            <div className="max-w-md mx-auto">
              <div className="rounded-lg p-8" style={{ background: C.white, border: `1px solid ${C.line}` }}>
                <h2 style={{ fontFamily: FONTS.display, fontSize: "1.2rem", color: C.ink }} className="mb-4">
                  Quick check-in
                </h2>
                <Field label="Your email" hint="So the organizer knows whose ranking is whose.">
                  <TextInput
                    type="email"
                    value={pendingEmail}
                    onChange={(e) => setPendingEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                    placeholder="you@company.com"
                  />
                </Field>
                <Button variant="brass" onClick={handleEmailSubmit}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {view === "ranking" && session && activeParticipant && (
            <RankingScreen session={session} participant={activeParticipant} onSubmitRanking={handleSubmitRanking} />
          )}

          {view === "evaluate" && session && activeInterviewer && (
            <EvaluateScreen
              session={session}
              onSubmitEvaluation={handleSubmitEvaluation}
              fixedCandidateName={session.interviewerPanel?.candidateName}
              interviewerLabel={activeInterviewer.label}
            />
          )}

          {view === "evaluate_done" && session && lastEvaluation && (
            <EvaluationResult session={session} evaluation={lastEvaluation} />
          )}

          {view === "done" && (
            <div className="max-w-md mx-auto text-center">
              <div className="rounded-lg p-10" style={{ background: C.white, border: `1px solid ${C.line}` }}>
                <Check size={28} style={{ color: C.teal, margin: "0 auto 0.75rem" }} />
                <h2 style={{ fontFamily: FONTS.display, fontSize: "1.2rem", color: C.ink }}>Ranking submitted</h2>
                <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.inkSoft }} className="mt-2">
                  Thanks — the organizer will follow up if your panel needs to align on anything.
                </p>
              </div>
            </div>
          )}

          {view === "already" && (
            <div className="max-w-md mx-auto text-center">
              <div className="rounded-lg p-10" style={{ background: C.white, border: `1px solid ${C.line}` }}>
                <h2 style={{ fontFamily: FONTS.display, fontSize: "1.2rem", color: C.ink }}>Already submitted</h2>
                <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.inkSoft }} className="mt-2">
                  This code has already been used to submit a ranking or evaluation.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
