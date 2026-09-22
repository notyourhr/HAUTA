import React, { useState, useEffect, useCallback, useRef } from "react";
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
import {
  sendMagicLink,
  getCurrentUser,
  signOut,
  onAuthChange,
  listMySessions,
  createSession,
  loadSessionById,
  saveSessionById,
  deleteSessionById,
  getSessionByCode,
  submitRankingByCode,
  submitEvaluationByCode,
} from "./lib/hautaStorage";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const uid = () => Math.random().toString(36).slice(2, 10);
const genCode = (len = 6) => {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
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

/* ---------------------------------- */
/* Design tokens                       */
/* Inspired by warm screen-printed poster design: flat color   */
/* blocking, hard offset shadows, square corners, high contrast.*/
/* ---------------------------------- */
const C = {
  paper: "#E9B85B", // ochre — page background
  paperDark: "#C9924D", // tan — dividers, subtle supporting fields
  panel: "#F4E8C8", // cream — card/panel surfaces
  cream: "#F4E8C8",
  ink: "#111214", // near-black — text, borders, primary buttons
  inkSoft: "#5C5546", // warm dark gray — secondary text
  brass: "#2AA8A9", // teal — brand accent, primary data/positive fills
  brassDeep: "#1F7E7F",
  brassSoft: "#F4E8C8",
  teal: "#2AA8A9",
  tealSoft: "#F4E8C8",
  clay: "#EF3037", // tomato red — flags, critical, key actions
  claySoft: "#F4E8C8",
  line: "#111214", // borders are bold and near-black, not soft hairlines
  white: "#FFFFFF",
};

const FONTS = {
  display: "'Kalam', 'Caveat', cursive",
  body: "'DM Sans', 'Manrope', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
};

const HARD_SHADOW = `4px 4px 0 ${C.ink}`;

const STORAGE_KEY_UNUSED = null; // no longer used — real per-session ids come from the database now

// Distinct accent colors assigned to competencies, in order, for the published scorecard.
const COMP_PALETTE = [
  "#2AA8A9", // teal
  "#EF3037", // tomato red
  "#C9924D", // tan
  "#111214", // ink
  "#1F7E7F", // deep teal
  "#B5271F", // rust
  "#8C6A19", // gold
  "#5C7A3D", // olive
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
        TESTV2.0 USER
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
        TESTV1.6
      </span>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, className = "", type = "button", title }) {
  const base = {
    fontFamily: FONTS.body,
    fontWeight: 700,
    fontSize: "0.875rem",
    borderRadius: "4px",
    padding: "0.6rem 1.1rem",
    transition: "transform 100ms ease, box-shadow 100ms ease, background 100ms ease",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: `2px solid ${C.ink}`,
    boxShadow: disabled ? "none" : `3px 3px 0 ${C.ink}`,
  };
  const variants = {
    primary: { background: C.ink, color: C.cream },
    brass: { background: C.ink, color: C.cream },
    ghost: { background: C.cream, color: C.ink },
    danger: { background: C.clay, color: C.cream, border: `2px solid ${C.ink}` },
    subtle: { background: C.paperDark, color: C.ink },
  };
  const hoverBg = { primary: C.clay, brass: C.clay, ghost: C.paperDark, danger: C.ink, subtle: C.panel };
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
        e.currentTarget.style.transform = "translate(3px, 3px)";
        e.currentTarget.style.boxShadow = "0 0 0 " + C.ink;
        e.currentTarget.style.background = hoverBg[variant];
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = `3px 3px 0 ${C.ink}`;
        e.currentTarget.style.background = variants[variant].background;
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
  background: C.cream,
  border: `2px solid ${C.ink}`,
  borderRadius: "4px",
  padding: "0.55rem 0.75rem",
  width: "100%",
  outline: "none",
};

function TextInput(props) {
  return (
    <input
      {...props}
      style={inputStyle}
      onFocus={(e) => {
        e.target.style.borderColor = C.clay;
        e.target.style.boxShadow = `0 0 0 2px ${C.clay}33`;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = C.ink;
        e.target.style.boxShadow = "none";
      }}
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
    neutral: { bg: C.paperDark, fg: C.ink },
    teal: { bg: C.teal, fg: C.cream },
    clay: { bg: C.clay, fg: C.cream },
    brass: { bg: C.teal, fg: C.cream },
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
        padding: "0.2rem 0.55rem",
        borderRadius: "3px",
        border: `1.5px solid ${C.ink}`,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- */
/* Screen: Home                        */
/* ---------------------------------- */
/* ---------------------------------- */
/* Screen: Log in (magic link)         */
/* ---------------------------------- */
function LoginPanel({ onSendLink }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!email.trim()) {
      setErr("Enter your email first.");
      return;
    }
    setErr("");
    setSending(true);
    const ok = await onSendLink(email.trim());
    setSending(false);
    if (ok) {
      setSent(true);
    } else {
      setErr("Couldn't send the link — check the email and try again.");
    }
  };

  if (sent) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2" style={{ color: C.teal }}>
          <KeyRound size={18} />
          <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
            Check your email
          </span>
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }}>
          We sent a login link to <strong style={{ color: C.ink }}>{email}</strong>. Click it to come
          back here signed in — no password needed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2" style={{ color: C.brass }}>
        <KeyRound size={18} />
        <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
          Log in to manage your scorecards
        </span>
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }} className="mb-3">
        No password — we'll email you a one-time link.
      </p>
      <div className="flex gap-2">
        <TextInput
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Button variant="brass" onClick={submit} disabled={sending}>
          {sending ? "Sending…" : "Send link"}
        </Button>
      </div>
      {err && (
        <p style={{ fontFamily: FONTS.body, fontSize: "0.75rem", color: C.clay }} className="mt-1.5">
          {err}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Your scorecards             */
/* ---------------------------------- */
function SessionsPanel({ userEmail, sessions, onOpen, onDelete, onNewScorecard, onLogout }) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const statusFor = (data) => {
    const submitted = (data.participants || []).filter((p) => p.status === "submitted").length;
    const total = (data.participants || []).length;
    if (data.published) return `Published · ${(data.competencies || []).length} competencies`;
    return `Ranking — ${submitted}/${total} submitted`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2" style={{ color: C.brass }}>
          <ClipboardList size={18} />
          <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
            Your scorecards
          </span>
        </div>
        <button
          onClick={onLogout}
          style={{ fontFamily: FONTS.body, fontSize: "0.72rem", color: C.inkSoft, background: "none", border: "none", cursor: "pointer" }}
        >
          Log out
        </button>
      </div>
      <p style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft }} className="mb-3">
        {userEmail}
      </p>

      {sessions.length === 0 ? (
        <p style={{ fontFamily: FONTS.body, fontSize: "0.82rem", color: C.inkSoft }} className="mb-4">
          You haven't set up a scorecard yet.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {sessions.map((s) => (
            <div key={s.id}>
              <div
                className="flex items-center justify-between rounded-md px-3 py-2"
                style={{ background: C.panel, border: `1.5px solid ${C.ink}` }}
              >
                <div>
                  <span style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.ink }}>
                    {(s.data.competencies || []).length} competencies
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: "0.7rem", color: C.inkSoft }} className="block">
                    {statusFor(s.data)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="subtle" onClick={() => onOpen(s.id)}>
                    Open <ChevronRight size={13} />
                  </Button>
                  <button
                    onClick={() => setConfirmingDeleteId(s.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.clay, padding: "0.3rem" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {confirmingDeleteId === s.id && (
                <div className="rounded-md p-3 mt-1" style={{ background: C.claySoft }}>
                  <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.ink }} className="mb-2">
                    Delete this scorecard for good? This can't be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      onClick={() => {
                        onDelete(s.id);
                        setConfirmingDeleteId(null);
                      }}
                    >
                      Yes, delete it
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingDeleteId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Button variant="brass" onClick={onNewScorecard}>
        <Sparkles size={15} /> New scorecard
      </Button>
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Home                        */
/* ---------------------------------- */
function HomeScreen({ authUser, sessions, onSendLink, onLogout, onNewScorecard, onOpenSession, onDeleteSession, onEnterCode }) {
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
        className="rounded-none p-8 mb-6"
        style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}
      >
        <p style={{ fontFamily: FONTS.body, color: C.inkSoft, fontSize: "0.95rem", lineHeight: 1.6 }}>
          Rank competencies with your hiring panel, convert everyone's rankings into weighted
          scores, and flag the ones your panel disagrees about — before they quietly skew the
          scorecard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-none p-6 flex flex-col justify-between"
          style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}
        >
          {authUser ? (
            <SessionsPanel
              userEmail={authUser.email}
              sessions={sessions}
              onOpen={onOpenSession}
              onDelete={onDeleteSession}
              onNewScorecard={onNewScorecard}
              onLogout={onLogout}
            />
          ) : (
            <LoginPanel onSendLink={onSendLink} />
          )}
        </div>

        <div
          className="rounded-none p-6 flex flex-col justify-between"
          style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}
        >
          <div>
            <div className="flex items-center gap-2 mb-2" style={{ color: C.teal }}>
              <KeyRound size={18} />
              <span style={{ fontFamily: FONTS.display, fontSize: "1.05rem", color: C.ink }}>
                I have a code
              </span>
            </div>
            <p style={{ fontFamily: FONTS.body, fontSize: "0.8rem", color: C.inkSoft, lineHeight: 1.5 }}>
              Panelist code to rank competencies, or an interviewer code to rate a candidate. No
              login needed.
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
              <Button variant="ghost" onClick={submit}>
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
    </div>
  );
}

function GuideIntro({ onContinue, onSkip }) {
  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-none p-8" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.68rem", color: C.inkSoft, letterSpacing: "0.06em" }} className="uppercase mb-1">
          Before you start
        </p>
        <h2 style={{ fontFamily: FONTS.display, fontSize: "1.3rem", color: C.ink }} className="mb-5">
          What's a competency, and how do weights work?
        </h2>

        <div className="mb-6">
          <span style={{ fontFamily: FONTS.display, fontSize: "1rem", color: C.ink }} className="block mb-2">
            A competency is a specific, judgeable skill
          </span>
          <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.inkSoft, lineHeight: 1.6 }} className="mb-3">
            It's concrete enough that a panel of interviewers could actually agree on whether a
            candidate has it — not a vague trait. A strong competency pairs a short name with a
            plain-language definition.
          </p>
          <div className="space-y-2">
            {[
              ["Time Management", "Ability to use time effectively and efficiently to complete assigned tasks within a given deadline."],
              ["Stakeholder Management", "Ability to build and maintain productive working relationships with people who have an interest in, or are affected by, your work."],
              ["Problem Solving", "Ability to identify issues, gather relevant information, and develop effective, timely solutions."],
            ].map(([name, def]) => (
              <div key={name} className="rounded-md px-3 py-2" style={{ background: C.panel, border: `1.5px solid ${C.ink}` }}>
                <span style={{ fontFamily: FONTS.body, fontSize: "0.82rem", color: C.ink, fontWeight: 600 }}>{name}: </span>
                <span style={{ fontFamily: FONTS.body, fontSize: "0.82rem", color: C.inkSoft }}>{def}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-2" style={{ borderTop: `2px solid ${C.ink}` }} />

        <div className="mb-2 mt-5">
          <span style={{ fontFamily: FONTS.display, fontSize: "1rem", color: C.ink }} className="block mb-2">
            How weights get assigned
          </span>
          <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.inkSoft, lineHeight: 1.6 }} className="mb-2">
            Instead of guessing at percentages, Hauta builds the weights from what your panel
            actually thinks: each panelist ranks every competency from most to least important, the
            ranks convert to points, and everyone's points are averaged together. Those averages are
            then rebalanced so the whole scorecard always adds up to exactly 100 points. If your
            panel disagrees a lot on any one competency, it gets flagged so you can talk it through
            rather than let the disagreement get quietly averaged away.
          </p>
          <p style={{ fontFamily: FONTS.body, fontSize: "0.85rem", color: C.inkSoft, lineHeight: 1.6 }}>
            The calculated weight is a strong starting point, not a locked-in verdict —{" "}
            <strong style={{ color: C.ink }}>you can override any competency's weight at any
            time</strong>, and the moment you do, Hauta automatically recalculates every other
            competency's weight so the scorecard still adds up to 100.
          </p>
        </div>

        <div className="flex items-center gap-4 mt-6 pt-4" style={{ borderTop: `2px solid ${C.ink}` }}>
          <Button variant="brass" onClick={onContinue}>
            Continue to setup <ChevronRight size={15} />
          </Button>
          <button
            onClick={onSkip}
            style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft, background: "none", border: "none", cursor: "pointer" }}
          >
            Skip the guide
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- */
/* Screen: Setup                       */
/* ---------------------------------- */
function SetupScreen({ onCreate, onCancel }) {
  const [competencies, setCompetencies] = useState(["", "", ""]);
  const [numParticipants, setNumParticipants] = useState(3);

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
      createdAt: Date.now(),
      varianceThreshold: defaultThreshold(comps.length),
      competencies: comps,
      participants,
      overrides: {},
    };
    onCreate(session);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-none p-8" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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

        <div className="flex items-center gap-3 mt-4">
          <Button variant="brass" disabled={!canSubmit} onClick={reallyCreate}>
            <Sparkles size={15} /> Generate codes
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
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
    <div style={{ borderBottom: `2px solid ${C.ink}` }} className="py-3">
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
                reset to participant's rating average
              </button>
            )}
          </div>
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
    <div className="rounded-md p-3" style={{ background: C.panel, border: `2px solid ${C.ink}` }}>
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

function AdminDashboard({ session, onOverride, onThreshold, onReset, onPublish, onSaveNote, onCreatePanel, onResetPanel, onBack }) {
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
      <button
        onClick={onBack}
        style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft, background: "none", border: "none", cursor: "pointer" }}
        className="flex items-center gap-1"
      >
        <ChevronRight size={13} style={{ transform: "rotate(180deg)" }} /> Your scorecards
      </button>

      <div className="rounded-none p-6" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ color: C.teal }}>
            <Users size={17} />
            <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }}>
              Panel ({submittedCount}/{total} submitted)
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {session.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: C.panel, border: `1.5px solid ${C.ink}` }}
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

      <div className="rounded-none p-6" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
          <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: `2px solid ${C.ink}` }}>
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
        <div className="rounded-none p-6" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
        <Button variant="ghost" onClick={onReset}>
          Set up another scorecard
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
      <div className="rounded-none p-6" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
                  border: `2px solid ${C.ink}`,
                  background: count === n ? C.brass : C.cream,
                  color: count === n ? C.cream : C.ink,
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
    <div className="rounded-none p-6" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontFamily: FONTS.display, fontSize: "1.1rem", color: C.ink }}>Interviewer panel</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }}>{panel.candidateName}</span>
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: "0.78rem", color: C.inkSoft }} className="mb-4">
        {panel.interviewers.filter((i) => i.status === "submitted").length}/{panel.interviewers.length} submitted
      </p>

      <div className="space-y-2 mb-4">
        {panel.interviewers.map((intw) => (
          <div key={intw.id} className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: C.panel, border: `1.5px solid ${C.ink}` }}>
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
        <div className="pt-4" style={{ borderTop: `2px solid ${C.ink}` }}>
          <div className="text-center mb-5">
            <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: C.inkSoft, letterSpacing: "0.05em" }} className="uppercase block">
              Combined total ({panel.interviewers.length} interviewers)
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: "2.2rem", fontWeight: 700, color: C.ink }}>
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
              <div key={intw.id} className="rounded-md p-2" style={{ background: C.panel, border: `2px solid ${C.ink}` }}>
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
      <div className="rounded-none p-8" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
              style={{ background: C.panel, border: `2px solid ${C.ink}` }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: "0.75rem",
                  color: C.cream,
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
              stroke={C.cream}
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
          <span style={{ fontFamily: FONTS.mono, fontSize: "2rem", fontWeight: 700, color: toneColor, lineHeight: 1.1 }}>
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
      <div className="rounded-none p-8" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
              <div key={c.id} className="rounded-md px-4 py-3" style={{ background: C.panel, border: `2px solid ${C.ink}` }}>
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
                        border: `2px solid ${C.ink}`,
                        background: r === n ? color : C.cream,
                        color: r === n ? C.cream : C.ink,
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

        <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: `2px solid ${C.ink}` }}>
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
      <div className="rounded-none p-8 text-center" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.72rem", color: C.inkSoft }} className="uppercase mb-1">
          {evaluation.candidateName}
        </p>
        <p style={{ fontFamily: FONTS.mono, fontSize: "2.4rem", color: C.ink, fontWeight: 700 }}>
          {evaluation.total.toFixed(1)}
          <span style={{ fontSize: "1.1rem", color: C.inkSoft }}>/100</span>
        </p>
        <Badge tone={tone}>{evaluation.total >= 75 ? "Strong" : evaluation.total >= 45 ? "Mixed" : "Weak"}</Badge>
      </div>

      <div className="rounded-none p-6 mt-4" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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


/* ---------------------------------- */
/* Main app                            */
/* ---------------------------------- */
export default function HautaApp() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mySessions, setMySessions] = useState([]);

  const [session, setSession] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [view, setView] = useState("home"); // home | guide | setup | admin | email | ranking | done | already | evaluate | evaluate_done
  const [activeCode, setActiveCode] = useState(null);
  const [activeParticipantId, setActiveParticipantId] = useState(null);
  const [activeInterviewerId, setActiveInterviewerId] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [lastEvaluation, setLastEvaluation] = useState(null);
  const pollRef = useRef(null);

  const refreshMySessions = useCallback(async () => {
    const list = await listMySessions();
    setMySessions(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setAuthUser(user);
      if (user) await refreshMySessions();
      setAuthLoading(false);
    })();

    const sub = onAuthChange(async (user) => {
      setAuthUser(user);
      if (user) {
        await refreshMySessions();
      } else {
        setMySessions([]);
      }
    });
    return () => sub && sub.unsubscribe && sub.unsubscribe();
  }, [refreshMySessions]);

  const refreshCurrentSession = useCallback(async () => {
    if (!currentSessionId) return null;
    const s = await loadSessionById(currentSessionId);
    setSession(s);
    return s;
  }, [currentSessionId]);

  useEffect(() => {
    if (view === "admin" && currentSessionId) {
      pollRef.current = setInterval(refreshCurrentSession, 4000);
      return () => clearInterval(pollRef.current);
    }
  }, [view, currentSessionId, refreshCurrentSession]);

  const handleSendMagicLink = async (email) => sendMagicLink(email);

  const handleLogout = async () => {
    await signOut();
    setAuthUser(null);
    setMySessions([]);
    setSession(null);
    setCurrentSessionId(null);
    setView("home");
  };

  const handleStartSetup = (guided) => setView(guided ? "guide" : "setup");

  const handleCreate = async (sessionData) => {
    const id = await createSession(sessionData);
    if (!id) return;
    setCurrentSessionId(id);
    setSession(sessionData);
    await refreshMySessions();
    setView("admin");
  };

  const handleOpenSession = async (id) => {
    setCurrentSessionId(id);
    const s = await loadSessionById(id);
    setSession(s);
    setView("admin");
  };

  const handleDeleteFromList = async (id) => {
    await deleteSessionById(id);
    await refreshMySessions();
  };

  const handleBackToSessions = async () => {
    await refreshMySessions();
    setCurrentSessionId(null);
    setSession(null);
    setView("home");
  };

  const handleEnterCode = async (code) => {
    const s = await getSessionByCode(code);
    if (!s) {
      setView("home");
      return;
    }
    const participant = (s.participants || []).find((p) => p.code === code);
    if (participant) {
      setActiveCode(code);
      setActiveParticipantId(participant.id);
      setSession(s);
      if (participant.status === "submitted") {
        setView("already");
      } else if (!participant.email) {
        setView("email");
      } else {
        setView("ranking");
      }
      return;
    }
    const panel = s.interviewerPanel;
    const interviewer = panel && panel.interviewers.find((i) => i.code === code);
    if (interviewer) {
      setActiveCode(code);
      setActiveInterviewerId(interviewer.id);
      setSession(s);
      setView(interviewer.status === "submitted" ? "already" : "evaluate");
      return;
    }
    setView("home");
  };

  const handleEmailSubmit = () => {
    if (!pendingEmail.trim()) return;
    setView("ranking");
  };

  const handleSubmitRanking = async (order) => {
    await submitRankingByCode(activeCode, pendingEmail.trim(), order);
    setView("done");
  };

  const handleOverride = async (compId, value) => {
    const s = await refreshCurrentSession();
    const overrides = { ...(s.overrides || {}) };
    if (value === "" || value === null || value === undefined) {
      delete overrides[compId];
    } else {
      overrides[compId] = value;
    }
    const next = { ...s, overrides };
    await saveSessionById(currentSessionId, next);
    setSession(next);
  };

  const handleThreshold = async (val) => {
    const next = { ...session, varianceThreshold: val };
    setSession(next);
    await saveSessionById(currentSessionId, next);
  };

  const handleSaveNote = async (compId, text) => {
    const s = await refreshCurrentSession();
    const competencyNotes = { ...(s.competencyNotes || {}), [compId]: text };
    const next = { ...s, competencyNotes };
    await saveSessionById(currentSessionId, next);
    setSession(next);
  };

  const handleReset = () => {
    setView("setup");
  };

  const handlePublish = async () => {
    const s = await refreshCurrentSession();
    const rows = computeResults(s);
    const finalWeights = {};
    rows.forEach((r) => {
      finalWeights[r.id] = r.normalizedWeight || 0;
    });
    const next = { ...s, published: true, finalWeights };
    await saveSessionById(currentSessionId, next);
    setSession(next);
  };

  const handleCreatePanel = async (candidateName, count) => {
    const s = await refreshCurrentSession();
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
    await saveSessionById(currentSessionId, next);
    setSession(next);
  };

  const handleResetPanel = async () => {
    const s = await refreshCurrentSession();
    const next = { ...s, interviewerPanel: null };
    await saveSessionById(currentSessionId, next);
    setSession(next);
  };

  const handleSubmitEvaluation = async ({ candidateName, ratings }) => {
    const weights = session.finalWeights || {};
    const total = session.competencies.reduce((sum, c) => {
      const w = weights[c.id] || 0;
      const r = ratings[c.id];
      if (!r) return sum;
      return sum + w * (ratingToPercent(r) / 100);
    }, 0);
    await submitEvaluationByCode(activeCode, ratings, total);
    setLastEvaluation({ candidateName, ratings, total });
    setView("evaluate_done");
  };

  const activeParticipant = session?.participants?.find((p) => p.id === activeParticipantId);
  const activeInterviewer =
    session?.interviewerPanel && session.interviewerPanel.interviewers.find((i) => i.id === activeInterviewerId);

  return (
    <div style={{ background: C.paper, minHeight: "100%", fontFamily: FONTS.body }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      <div style={{ background: C.teal, borderBottom: `3px solid ${C.ink}` }} className="px-6 sm:px-10 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={handleBackToSessions} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <Logo />
          </button>
          {view !== "home" && view !== "setup" && view !== "guide" && (
            <button
              onClick={handleBackToSessions}
              style={{ fontFamily: FONTS.body, fontWeight: 600, fontSize: "0.78rem", color: C.cream, background: "none", border: "none", cursor: "pointer" }}
            >
              ← Home
            </button>
          )}
        </div>
      </div>

      <div className="p-6 sm:p-10">

      {authLoading ? (
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.8rem", color: C.inkSoft, textAlign: "center" }}>Loading…</p>
      ) : (
        <>
          {view === "home" && (
            <HomeScreen
              authUser={authUser}
              sessions={mySessions}
              onSendLink={handleSendMagicLink}
              onLogout={handleLogout}
              onNewScorecard={() => handleStartSetup(false)}
              onOpenSession={handleOpenSession}
              onDeleteSession={handleDeleteFromList}
              onEnterCode={handleEnterCode}
            />
          )}

          {view === "guide" && <GuideIntro onContinue={() => setView("setup")} onSkip={() => setView("setup")} />}

          {view === "setup" && <SetupScreen onCreate={handleCreate} onCancel={() => setView("home")} />}

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
              onBack={handleBackToSessions}
            />
          )}

          {view === "email" && (
            <div className="max-w-md mx-auto">
              <div className="rounded-none p-8" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
              <div className="rounded-none p-10" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
              <div className="rounded-none p-10" style={{ background: C.panel, border: `2px solid ${C.ink}`, boxShadow: HARD_SHADOW }}>
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
    </div>
  );
}
