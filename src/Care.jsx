import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  CalendarDays,
  CreditCard,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MessageCircle,
  X,
} from "lucide-react";
import "./care.css";
export async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data =
    r.status === 204
      ? null
      : await r.json().catch(() => ({
          message: "Backend unavailable — start the site with npm run dev",
        }));
  if (!r.ok) throw new Error(data?.message || "Request failed");
  return data;
}
// Starts a hosted checkout for a program or a physio session. Redirects the
// browser to the provider's own payment page — this app never collects a
// card number itself. sessionStorage remembers where to return the person
// so the /payment/return page can show something useful even after a
// full page redirect round-trip.
export async function startCheckout({
  kind,
  itemId,
  provider,
  phone,
  notes,
  requestedAt,
}) {
  const order = await api("/checkout", "POST", {
    kind,
    itemId,
    provider,
    phone,
    notes,
    requestedAt,
  });
  sessionStorage.setItem(
    "coach_checkout_return",
    kind === "service" ? "/physiotherapy" : "/member",
  );
  location.href = order.checkoutUrl;
}

export function PaymentOptions({ disabled = false, onPay }) {
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    api("/payment-providers")
      .then((data) => {
        if (active) setProviders(data);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setProviders({});
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const enabled =
    providers?.stripe === true || providers?.stripe?.enabled === true;
  return (
    <div className="payment-options">
      <button
        type="button"
        className="primary-btn"
        disabled={disabled || !enabled}
        onClick={() => onPay("stripe")}
      >
        {providers === null
          ? "Checking availability…"
          : enabled
            ? "Continue to card checkout"
            : "Card payments unavailable"}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
      {providers !== null && !enabled && (
        <p role={error ? "alert" : "status"} className="payment-availability">
          {error
            ? "We couldn’t check card availability — please try again shortly or choose cash"
            : "Choose cash below while online payment is being set up"}
        </p>
      )}
    </div>
  );
}

export function PaymentPaths({ disabled, onPay, children, session = false }) {
  return (
    <section className="payment-paths" aria-label="Choose how to pay">
      <h4>Choose how to pay</h4>
      <div className="payment-path online-path">
        <div className="payment-path-heading">
          <span className="payment-path-icon" aria-hidden="true">
            <CreditCard size={20} />
          </span>
          <div>
            <b>Visa / card</b>
            <span>Secure online checkout</span>
          </div>
        </div>
        <p>
          {session
            ? "Your paid session request is created after verified payment"
            : "Your program unlocks automatically after verified payment"}
        </p>
        <PaymentOptions disabled={disabled} onPay={onPay} />
      </div>
      <details className="payment-path cash-path">
        <summary>
          <span className="payment-path-icon" aria-hidden="true">
            <Banknote size={20} />
          </span>
          <span>
            <b>Cash to your coach</b>
            <small>Send a request • Pay in person • Coach confirms</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </summary>
        <div className="cash-path-body">{children}</div>
      </details>
      <p className="payment-account-note">
        A member account keeps your payment status and access in one place
        {session && " — your coach confirms the appointment time separately"}
      </p>
    </section>
  );
}

export const values = (e) => Object.fromEntries(new FormData(e.currentTarget));
export function TaskForm({
  children,
  submit,
  className = "",
  submitLabel = "Save / submit",
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={"care-form " + className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          v = values(e);
        setBusy(true);
        setError("");
        try {
          await submit(v, form);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button disabled={busy} className="primary-btn">
        {busy ? "Saving…" : submitLabel} <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function Carousel({ children, label }) {
  const ref = useRef(),
    touched = useRef(false);
  const cards = React.Children.toArray(children),
    count = cards.length;
  const [active, setActive] = useState(0),
    [overflow, setOverflow] = useState(false),
    [hint, setHint] = useState(false);
  const moveTo = (index) => {
    const el = ref.current;
    if (!el) return;
    const child = el.children[index];
    if (child)
      el.scrollTo({
        left: child.offsetLeft - el.children[0].offsetLeft,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timers = [],
      frame;
    const update = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 8);
      const first = el.children[0];
      if (!first) return;
      let best = 0,
        distance = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const d = Math.abs(child.offsetLeft - first.offsetLeft - el.scrollLeft);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      setActive(best);
    };
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const interrupt = () => {
      touched.current = true;
      timers.forEach(clearTimeout);
      el.style.scrollSnapType = "";
      setHint(false);
    };
    const resize = new ResizeObserver(update);
    resize.observe(el);
    update();
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries[0].isIntersecting ||
          touched.current ||
          el.scrollWidth <= el.clientWidth + 8
        )
          return;
        observer.disconnect();
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setHint(true);
        timers.push(
          setTimeout(() => {
            if (touched.current) return;
            el.style.scrollSnapType = "none";
            el.scrollTo({ left: 42, behavior: "smooth" });
          }, 700),
        );
        timers.push(
          setTimeout(() => {
            if (touched.current) return;
            el.scrollTo({ left: 0, behavior: "smooth" });
          }, 1450),
        );
        timers.push(
          setTimeout(() => {
            el.style.scrollSnapType = "";
            setHint(false);
          }, 2250),
        );
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    el.addEventListener("scroll", scroll, { passive: true });
    ["pointerdown", "wheel", "keydown"].forEach((event) =>
      el.addEventListener(event, interrupt, { passive: true }),
    );
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      el.removeEventListener("scroll", scroll);
      ["pointerdown", "wheel", "keydown"].forEach((event) =>
        el.removeEventListener(event, interrupt),
      );
      el.style.scrollSnapType = "";
    };
  }, [count]);
  const manual = (index) => {
    touched.current = true;
    ref.current.style.scrollSnapType = "";
    setHint(false);
    moveTo(index);
  };
  return (
    <div
      className={`carousel-wrap${overflow ? " has-overflow" : ""}${hint ? " swipe-hint-active" : ""}`}
    >
      <div className="carousel-controls">
        <span>
          <b>{label}</b>
          <small>{overflow ? "Swipe to explore" : "Find your fit"}</small>
        </span>
        <div className="carousel-arrows">
          <button
            aria-label="Previous cards"
            disabled={!overflow || active === 0}
            onClick={() => manual(Math.max(0, active - 1))}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label="Next cards"
            disabled={!overflow || active >= count - 1}
            onClick={() => manual(Math.min(count - 1, active + 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div
        className="horizontal-cards"
        ref={ref}
        tabIndex="0"
        role="region"
        aria-label={label}
      >
        {cards}
      </div>
      {overflow && (
        <div className="carousel-footer">
        </div>
      )}
    </div>
  );
}

export function Physio({ preview = false }) {
  const [services, setServices] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [payBusy, setPayBusy] = useState(false),
    [payError, setPayError] = useState(""),
    formRef = useRef(null);
  useEffect(() => {
    api("/services")
      .then(setServices)
      .catch((e) => setError(e.message));
  }, []);
  async function pay(provider) {
    setPayError("");
    const time = formRef.current?.elements.time?.value;
    if (!time) {
      setPayError("Choose a date and time first");
      return;
    }
    const notes = formRef.current?.elements.notes?.value || "";
    setPayBusy(true);
    try {
      await startCheckout({
        kind: "service",
        itemId: selected.id,
        provider,
        notes,
        requestedAt: new Date(time).toISOString(),
      });
    } catch (e) {
      setPayError(e.message);
      setPayBusy(false);
    }
  }
  if (preview)
    return (
      <section className="section care-section physio-preview" id="physio">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Post-rehab coaching</p>
            <h2>Move better</h2>
          </div>
        </div>
        <a
          className="physio-visual physio-entry"
          href="/physiotherapy"
          aria-label="Explore post-rehab coaching and recovery sessions"
        >
          <img
            src="/images/real-physio.webp"
            alt="Coach guiding a client through a return-to-training exercise"
            loading="lazy"
            width="900"
            height="1350"
          />
          <span className="physio-entry-caption">
            <span>
              <b>Post-rehab & recovery</b>
              <small>Build strength for what comes next</small>
            </span>
            <ArrowRight size={22} />
          </span>
        </a>
      </section>
    );
  return (
    <section className="section care-section" id="physio">
      <div className="physio-lead">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Post-rehab coaching</p>
            <h2>
              Move with confidence
              <br />
              <em>Come back stronger</em>
            </h2>
          </div>
          <p>
            Turn recovery into your next strong chapter with a clear plan for
            returning to training
          </p>
        </div>
        <figure className="physio-visual">
          <img
            src="/images/real-physio.webp"
            alt="Coach guiding a client through a return-to-training exercise"
            loading="lazy"
            width="1122"
            height="1402"
          />
          <figcaption>
            <Activity />
            <span>
              <b>Guided progression</b>Built for active lives
            </span>
          </figcaption>
        </figure>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        className="care-services-grid"
        aria-label="Post-rehab coaching sessions"
      >
        {services.map((s, index) => (
          <article className="care-card" key={s.id}>
            <div className="care-step">
              <span>0{index + 1}</span>
              <Activity className="care-symbol" />
            </div>
            <p className="eyebrow">{s.duration} minute session</p>
            <h3>{s.title}</h3>
            <p>{s.description}</p>
            <strong>${s.price} USD</strong>
            <button
              className="primary-btn"
              onClick={async () => {
                try {
                  const session = await api("/session");
                  if (session.role !== "member") {
                    location.href = "/member?return=physio";
                    return;
                  }
                  setSaved(false);
                  setSelected(s);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Request a session <ArrowRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <dialog
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setSelected(null)}
          className="care-dialog"
        >
          <button
            className="close-care"
            aria-label="Close"
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <h3>{selected.title}</h3>
          <div className="checkout-summary">
            <span>{selected.duration} minute session</span>
            <strong>${selected.price} USD</strong>
          </div>
          <p className="service-dialog-description">{selected.description}</p>
          {saved ? (
            <p role="status">
              Cash request saved — your coach will confirm payment and arrange
              the session time in your member area
            </p>
          ) : (
            <>
              <form
                ref={formRef}
                className="care-form"
                onSubmit={(e) => e.preventDefault()}
              >
                <label>
                  Preferred date and time (your local time)
                  <input name="time" type="datetime-local" required />
                </label>
                <label>
                  Scheduling note (optional)
                  <textarea
                    name="notes"
                    maxLength="500"
                    placeholder="For example, preferred contact time"
                  />
                </label>
              </form>
              <PaymentPaths disabled={payBusy} onPay={pay} session>
                <TaskForm
                  submitLabel="Request cash payment"
                  submit={async (v) => {
                    const time = formRef.current?.elements.time?.value;
                    if (!time) throw new Error("Choose a date and time first");
                    await api("/orders", "POST", {
                      kind: "service",
                      itemId: selected.id,
                      requestedAt: new Date(time).toISOString(),
                      notes: formRef.current?.elements.notes?.value || "",
                    });
                    setSaved(true);
                  }}
                >
                  <p>
                    Pay cash to the coach — send your request now, then your
                    coach confirms after receiving payment
                  </p>
                </TaskForm>
              </PaymentPaths>
              {payError && (
                <p role="alert" className="form-error">
                  {payError}
                </p>
              )}
            </>
          )}
        </dialog>
      )}
    </section>
  );
}

const demoShifts = [
  {
    id: "recomposition",
    photo: "/images/demo-recomposition.webp",
    title: "A stronger foundation",
    goal: "Body recomposition",
    feedback:
      "I used to put myself last — showing up for training became the first promise I learned to keep for myself",
    story:
      "The hardest step wasn’t lifting a heavier weight — it was walking through the door when confidence was low\n\nA manageable plan, small wins and someone to check in with made consistency feel possible\n\nThe change I would celebrate most is finding space for myself again",
  },
  {
    id: "strength",
    photo: "/images/demo-strength.webp",
    title: "Built through consistency",
    goal: "Strength & muscle",
    feedback:
      "The weight on the bar changed slowly — the way I believed in myself changed with every session I completed",
    story:
      "At the beginning, every missed week felt like starting over\n\nFollowing a clear plan made it easier to come back without needing a perfect week\n\nStrength became more than a number — it became proof that patience and showing up could move me forward",
  },
  {
    id: "transformation",
    photo: "/images/demo-transformation.webp",
    title: "A different kind of confidence",
    goal: "A leaner, stronger body",
    feedback:
      "I came looking for a different reflection — the bigger change was feeling proud of the person looking back",
    story:
      "I imagined confidence would arrive only after reaching a certain goal\n\nThen the small moments started to matter — finishing a session, feeling more capable and choosing to keep going\n\nThe story I want to tell is about learning to value the effort, even before the finish line",
  },
];
function FeedbackPopup({ item, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialogRef.current.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);
  const closeFromBackdrop = (event) => {
    if (event.target !== dialogRef.current) return;
    const bounds = dialogRef.current.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className="transformation-popup"
      aria-label={item.example ? "Example story" : `${item.name}’s feedback`}
      onClick={closeFromBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="transformation-popup-content">
        <button
          type="button"
          className="transformation-popup-close"
          onClick={onClose}
          aria-label="Close feedback"
          autoFocus
        >
          <X size={20} />
        </button>
        <div className="transformation-popup-avatar" aria-hidden="true">
          <MessageCircle size={26} />
        </div>
        <p className="transformation-popup-label">
          {item.example ? "Example story" : "Client feedback"}
        </p>
        <h3>{item.example ? item.title : item.name}</h3>
        <span className="transformation-popup-subtitle">
          {item.example
            ? "Illustrative copy • Not a client testimonial"
            : item.title}
        </span>
        {item.feedback && <blockquote>“{item.feedback}”</blockquote>}
        {item.story && (
          <div className="transformation-popup-story">
            <h4>{item.example ? "The example story" : "Their story"}</h4>
            <p>{item.story}</p>
          </div>
        )}
      </div>
    </dialog>
  );
}

export function Shifts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [feedbackItem, setFeedbackItem] = useState(null);
  useEffect(() => {
    api("/transformations")
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);
  const cards = items.length
    ? items
    : demoShifts.map((item) => ({ ...item, example: true }));
  return (
    <section id="results" className="section results-showcase">
      <div className="section-heading">
        <div>
          <p className="eyebrow">The shift</p>
          <h2>
            The <em>transformations</em>
          </h2>
        </div>
        <p>Build strength, confidence and a body that moves better</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <Carousel label="Before & after">
        {cards.map((item) => (
          <article
            className={`shift-card${item.example ? " demo-shift" : ""}`}
            key={item.id}
          >
            <div className="transformation-image-wrap">
              {item.example ? (
                <div className="demo-comparison">
                  <img
                    src={item.photo}
                    alt={`Illustrative transformation: ${item.goal}`}
                    loading="lazy"
                    width="1200"
                    height="800"
                  />
                  <span className="comparison-before">Before</span>
                  <span className="comparison-after">After</span>
                  <small className="demo-photo-label">DEMO SAMPLE</small>
                </div>
              ) : (
                <div className="before-after">
                  <figure>
                    <img
                      src={item.before}
                      alt={`${item.name} before`}
                      loading="lazy"
                    />
                    <figcaption>Before</figcaption>
                  </figure>
                  <figure>
                    <img
                      src={item.after}
                      alt={`${item.name} after`}
                      loading="lazy"
                    />
                    <figcaption>After</figcaption>
                  </figure>
                </div>
              )}
              {(item.feedback || item.story) && (
                <button
                  type="button"
                  className="transformation-message-button"
                  onClick={() => setFeedbackItem(item)}
                  aria-label={
                    item.example
                      ? `Read example story: ${item.title}`
                      : `Read ${item.name}’s feedback`
                  }
                  aria-haspopup="dialog"
                  title={item.example ? "Read example story" : "Read feedback"}
                >
                  <MessageCircle size={21} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="demo-shift-copy">
              <p className="eyebrow">
                {item.example ? item.goal : item.duration}
              </p>
              <h3>{item.title}</h3>
            </div>
          </article>
        ))}
      </Carousel>
      {!items.length && (
        <p className="demo-disclosure">
          Example photos and stories • Not actual client results
        </p>
      )}
      {feedbackItem && (
        <FeedbackPopup
          item={feedbackItem}
          onClose={() => setFeedbackItem(null)}
        />
      )}
    </section>
  );
}

export default function Member() {
  const [data, setData] = useState(null),
    [mode, setMode] = useState("login"),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("programs"),
    [notice, setNotice] = useState("");
  const reset = new URLSearchParams(location.search).get("reset");
  const load = async () => {
    setData(await api("/member/dashboard"));
  };
  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [!!data]);
  if (loading)
    return (
      <main className="member-shell">
        <p>Loading your account…</p>
      </main>
    );
  if (reset)
    return (
      <main className="member-shell auth-care">
        <h1>Reset your password</h1>
        <TaskForm
          submit={async (v) => {
            await api("/member/reset", "POST", {
              token: reset,
              password: v.password,
            });
            location.href = "/member";
          }}
        >
          <label>
            New password
            <input
              type="password"
              name="password"
              minLength="12"
              maxLength="128"
              required
            />
          </label>
        </TaskForm>
      </main>
    );
  if (!data)
    return (
      <main className="member-shell auth-care">
        <a href="/">
          <ArrowLeft size={16} /> Back to website
        </a>
        <Activity className="care-symbol" />
        <p className="eyebrow">Your coaching space</p>
        <h1>{mode === "login" ? "Welcome back" : "Start your journey"}</h1>
        <div className="care-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>
        <TaskForm
          key={mode}
          submit={async (v) => {
            await api("/member/" + mode, "POST", v);
            await load();
            const p = new URLSearchParams(location.search);
            if (p.get("return") === "physio") location.href = "/physiotherapy";
            else if (p.get("return") === "program" && p.get("program"))
              location.href = "/?pay=" + encodeURIComponent(p.get("program"));
          }}
        >
          {mode === "register" && (
            <label>
              Full name
              <input name="name" autoComplete="name" maxLength="100" required />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password (at least 12 characters)
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength="12"
              maxLength="128"
              required
            />
          </label>
        </TaskForm>
        <p className="muted">
          Forgot your password? Ask your coach for a private reset link.
        </p>
      </main>
    );
  return (
    <main className="member-shell">
      <header className="member-header">
        <div>
          <a href="/">← Website</a>
          <p className="eyebrow">Member area</p>
          <h1>Hello, {data.user.name.split(" ")[0]}</h1>
        </div>
        <button
          className="ghost-btn"
          onClick={async () => {
            await api("/logout", "POST");
            setData(null);
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </header>
      <div className="care-tabs">
        {["programs", "check-ins", "messages", "appointments", "account"].map(
          (t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setNotice("");
              }}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {notice && (
        <p role="status" className="success-care">
          {notice}
        </p>
      )}
      {tab === "programs" && (
        <>
          <h2>Your programs</h2>
          {data.assignments.length ? (
            data.assignments.map((a) => (
              <article key={a.id} className="care-card">
                <p className="eyebrow">{a.program.duration}</p>
                <h3>{a.program.title}</h3>
                <p>{a.program.description}</p>
                <div className="program-content">
                  {a.program.content ||
                    "Your coach is preparing your program instructions"}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-care">
              <p>Your coach hasn’t assigned a program yet</p>
              <a className="primary-btn" href="/#programs">
                Browse programs
              </a>
            </div>
          )}
          <h2>Program requests</h2>
          {data.orders.map((o) => (
            <div className="care-list-row" key={o.id}>
              <b>{o.itemTitle || o.program}</b>
              <span>
                ${o.amount} ·{" "}
                {o.paymentMethod === "cash" && o.status === "cash_pending"
                  ? "Cash request sent — waiting for coach confirmation"
                  : o.status === "paid"
                    ? o.kind === "service"
                      ? "Paid — awaiting appointment confirmation"
                      : "Paid — program access active"
                    : o.status === "awaiting_payment"
                      ? "Waiting for secure payment confirmation"
                      : o.status}
              </span>
            </div>
          ))}
          {data.orders.length > 0 && (
            <p className="muted">
              Your program unlocks automatically after verified online payment
              or after your coach confirms cash was received.
            </p>
          )}
        </>
      )}
      {tab === "check-ins" && (
        <div className="care-columns">
          <section>
            <h2>Weekly check-in</h2>
            <TaskForm
              submit={async (v, f) => {
                await api("/member/checkins", "POST", v);
                f.reset();
                await load();
                setNotice("Check-in sent to your coach");
              }}
            >
              <label>
                Weight, kg (optional)
                <input
                  name="weight"
                  type="number"
                  min="20"
                  max="400"
                  step="0.1"
                />
              </label>
              <label>
                Planned sessions this week
                <input name="planned" type="number" min="1" max="30" required />
              </label>
              <label>
                Completed sessions
                <input
                  name="completed"
                  type="number"
                  min="0"
                  max="30"
                  required
                />
              </label>
              <label>
                How did your week go?
                <textarea name="notes" maxLength="2000" />
              </label>
              <p className="muted">
                Only you and your coach can see these check-ins.
              </p>
            </TaskForm>
          </section>
          <section>
            <h2>Your history</h2>
            {data.checkins.length ? (
              data.checkins.map((c) => (
                <article className="care-card" key={c.id}>
                  <b>{new Date(c.createdAt).toLocaleDateString()}</b>
                  <p>
                    {c.completed}/{c.planned} sessions
                    {c.weight ? " · " + c.weight + " kg" : ""}
                  </p>
                  <p>{c.notes}</p>
                  {c.reply && (
                    <div className="coach-reply">
                      <b>Coach feedback</b>
                      <p>{c.reply}</p>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p>No check-ins yet</p>
            )}
          </section>
        </div>
      )}
      {tab === "messages" && (
        <section>
          <h2>Your conversation</h2>
          <div className="message-feed">
            {data.messages.map((m) => (
              <div key={m.id} className={"message " + m.from}>
                <small>
                  {m.from === "coach" ? "Coach" : "You"} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </small>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
          <TaskForm
            submit={async (v, f) => {
              await api("/member/messages", "POST", v);
              f.reset();
              await load();
            }}
          >
            <label>
              Message your coach
              <textarea name="body" required maxLength="2000" />
            </label>
          </TaskForm>
        </section>
      )}
      {tab === "appointments" && (
        <>
          <h2>Post-rehab appointments</h2>
          <a href="/#physio" className="primary-btn">
            Request a session <CalendarDays size={16} />
          </a>
          {data.bookings.map((b) => (
            <article className="care-card" key={b.id}>
              <h3>{b.title}</h3>
              <p>
                {new Date(b.requestedAt).toLocaleString()} · {b.duration} min ·
                ${b.price}
              </p>
              <b className="status">{b.status}</b>
              {["requested", "confirmed"].includes(b.status) && (
                <button
                  className="ghost-btn"
                  onClick={async () => {
                    try {
                      await api("/member/bookings/" + b.id, "PATCH", {});
                      await load();
                    } catch (e) {
                      setNotice(e.message);
                    }
                  }}
                >
                  Cancel request
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "account" && (
        <>
          <h2>Account</h2>
          <p>{data.user.email}</p>
          <TaskForm
            submit={async (v) => {
              await api("/member/password", "POST", v);
              setNotice("Password updated");
            }}
          >
            <label>
              Current password
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength="12"
                maxLength="128"
                autoComplete="new-password"
                required
              />
            </label>
          </TaskForm>
        </>
      )}
    </main>
  );
}
