import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Award,
  Check,
  Dumbbell,
  Instagram,
  LockKeyhole,
  Menu,
  MessageCircle,
  Play,
  ShieldCheck,
  ShoppingBag,
  Target,
  Timer,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { coach, programs } from "./config";
import Admin from "./Admin";
import Member, {
  Carousel,
  Physio,
  Shifts,
  api,
  startCheckout,
  PaymentPaths,
} from "./Care";
import PaymentReturn from "./PaymentReturn";
import "./styles.css";
import "./clinical.css";
import "./premium.css";

function scrollToId(id) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
}

function tap() {
  if (navigator.vibrate)
    try {
      navigator.vibrate(8);
    } catch {}
}

// Bottom sheet on mobile (drag handle + swipe-to-dismiss), centered dialog on desktop.
function Modal({ open, onClose, children, label }) {
  const sheetRef = useRef(null);
  const drag = useRef({ startY: 0, y: 0, active: false });
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, 220);
  };

  useEffect(() => {
    if (!open) {
      setClosing(false);
      return;
    }
    const close = (event) => event.key === "Escape" && requestClose();
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const sheet = sheetRef.current;
    const controls = () =>
      [
        ...sheet.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
    controls()[0]?.focus();
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const list = controls(),
        first = list[0],
        last = list.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sheet.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sheet.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    sheet.addEventListener("keydown", trapFocus);
    return () => {
      sheet.removeEventListener("keydown", trapFocus);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onTouchStart = (e) => {
    if (matchMedia("(min-width: 701px)").matches) return;
    drag.current = { startY: e.touches[0].clientY, y: 0, active: true };
  };
  const onTouchMove = (e) => {
    if (!drag.current.active) return;
    const delta = Math.max(0, e.touches[0].clientY - drag.current.startY);
    drag.current.y = delta;
    if (sheetRef.current)
      sheetRef.current.style.transform = `translateY(${delta}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.y > 90) {
      requestClose();
    } else if (sheetRef.current) sheetRef.current.style.transform = "";
  };

  return (
    <div
      className={`modal-backdrop${closing ? " closing" : ""}`}
      onMouseDown={requestClose}
      role="presentation"
    >
      <section
        className={`modal${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={sheetRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="modal-handle"
          aria-hidden="true"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        <button
          className="icon-btn modal-close"
          onClick={requestClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

function ProgramSkeleton() {
  return (
    <div className="program-card skeleton" aria-hidden="true">
      <div className="program-image" />
      <div className="program-body">
        <div className="sk-line sk-meta" />
        <div className="sk-line sk-title" />
        <div className="sk-line sk-sub" />
        <div className="program-bottom">
          <div className="sk-line sk-price" />
          <div className="sk-pill" />
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 14 });
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((_, i) => (
        <i key={i} style={{ "--i": i, "--h": `${(i * 47) % 360}deg` }} />
      ))}
    </div>
  );
}

function App() {
  const physioPage =
    window.location.pathname.replace(/\/$/, "") === "/physiotherapy";
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [selected, setSelected] = useState(null);
  const [orderError, setOrderError] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [showQuickBar, setShowQuickBar] = useState(false);
  const [quickBarDismissed, setQuickBarDismissed] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll("main > section:not(.hero)").forEach((el) => {
      el.classList.add("scroll-reveal");
      observer.observe(el);
    });
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);

  useEffect(() => {
    fetch("/api/programs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setCatalog)
      .catch(() =>
        setCatalogError(
          "Programs could not load — refresh the page or contact the coach",
        ),
      )
      .finally(() => setCatalogLoading(false));
    if (!sessionStorage.getItem("coach_view_tracked")) {
      fetch("/api/track", { method: "POST" }).catch(() => {});
      sessionStorage.setItem("coach_view_tracked", "1");
    }
  }, []);

  useEffect(() => {
    const sectionIds = ["home", "programs", "results", "physio", "about"];
    const updateNavigation = () => {
      setScrolled(window.scrollY > 18);
      setShowQuickBar(window.scrollY > window.innerHeight * 0.75);
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty(
        "--scroll-progress",
        `${maxScroll > 0 ? Math.min(100, (window.scrollY / maxScroll) * 100) : 0}%`,
      );
      const marker = window.scrollY + window.innerHeight * 0.32;
      let current = "home";
      sectionIds.forEach((id) => {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= marker) current = id;
      });
      setActiveSection(current);
    };
    updateNavigation();
    window.addEventListener("scroll", updateNavigation, { passive: true });
    window.addEventListener("resize", updateNavigation);
    return () => {
      window.removeEventListener("scroll", updateNavigation);
      window.removeEventListener("resize", updateNavigation);
    };
  }, []);

  const navigate = (id) => {
    setMenuOpen(false);
    if (physioPage) {
      location.href = "/#" + id;
      return;
    }
    scrollToId(id);
  };

  async function submitOrder(event) {
    event.preventDefault();
    setLoading(true);
    setOrderError("");
    const form = new FormData(event.currentTarget);
    try {
      const session = await api("/session");
      if (session.role !== "member") {
        location.href =
          "/member?return=program&program=" + encodeURIComponent(selected.id);
        return;
      }
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: selected.id,
          phone: form.get("phone"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setSubmitted(data);
    } catch (error) {
      setOrderError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function payForProgram(provider) {
    setPayError("");
    setPayBusy(true);
    try {
      const session = await api("/session");
      if (session.role !== "member") {
        location.href = "/member?return=program&program=" + selected.id;
        return;
      }
      await startCheckout({ kind: "program", itemId: selected.id, provider });
    } catch (e) {
      setPayError(e.message);
      setPayBusy(false);
    }
  }

  useEffect(() => {
    const payId = new URLSearchParams(location.search).get("pay");
    if (payId && catalog.length) {
      const program = catalog.find((p) => p.id === payId);
      if (program) {
        setSelected(program);
        setSubmitted(null);
        setOrderError("");
      }
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }, [catalog]);

  return (
    <div className={`site-shell${physioPage ? " physio-page" : " home-page"}`}>
      <header className={`header${scrolled ? " scrolled" : ""}`}>
        <button
          className="wordmark"
          onClick={() => navigate("home")}
          aria-label="Go to home"
        >
          <span className="brand-name">
            <span>{coach.firstName}</span> {coach.lastName}
          </span>
          <b>COACHING & POST-REHAB</b>
        </button>
        <nav
          className={menuOpen ? "desktop-nav open" : "desktop-nav"}
          aria-label="Main navigation"
        >
          <button
            className={activeSection === "programs" ? "active" : ""}
            aria-current={activeSection === "programs" ? "page" : undefined}
            onClick={() => navigate("programs")}
          >
            Programs
          </button>
          <button
            className={activeSection === "results" ? "active" : ""}
            aria-current={activeSection === "results" ? "page" : undefined}
            onClick={() => navigate("results")}
          >
            Results
          </button>
          <button
            className={activeSection === "physio" ? "active" : ""}
            aria-current={activeSection === "physio" ? "page" : undefined}
            onClick={() => navigate("physio")}
          >
            Post-rehab
          </button>
          <button
            className={activeSection === "about" ? "active" : ""}
            aria-current={activeSection === "about" ? "page" : undefined}
            onClick={() => navigate("about")}
          >
            The coach
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="login-btn"
            onClick={() => {
              location.href = "/member";
            }}
            aria-label="Member login"
          >
            <LockKeyhole size={16} />
            <span>Member login</span>
          </button>
          <button
            className="icon-btn menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      <main>
        {physioPage ? (
          <>
            <a className="physio-back" href="/">
              ← Back to coaching
            </a>
            <Physio />
            <section className="section rehab-programs">
              <p className="eyebrow">Your post-rehab plan</p>
              <h2>
                Support beyond
                <br />
                <em>the session</em>
              </h2>
              <p>
                Build strength after treatment with a personal
                return-to-training plan shaped around your goals
              </p>
              <a
                className="primary-btn"
                href={`https://wa.me/${coach.whatsapp}?text=Hi%20Andre%2C%20I%27d%20like%20to%20discuss%20a%20post-rehab%20program`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore your next step <ArrowRight size={17} />
              </a>
            </section>
          </>
        ) : (
          <>
            <section id="home" className="hero">
              <picture className="hero-media">
                <img
                  src="/images/stock-training.webp"
                  alt="Athlete training with a kettlebell in a gym"
                  fetchPriority="high"
                  width="900"
                  height="1350"
                />
              </picture>
              <div className="hero-overlay" />
              <div className="hero-content">
                <p className="eyebrow">
                  <span /> Training programs · Post-rehab
                </p>
                <h1>
                  Build strength
                  <br />
                  <em>Move better</em>
                </h1>
                <p className="hero-copy">
                  A stronger body, better movement
                  <br className="mobile-break" /> with a clear program and
                  weekly coach support
                </p>
                <div className="hero-actions">
                  <a
                    className="primary-btn"
                    href={`https://wa.me/${coach.whatsapp}?text=Hi%20Andre%2C%20I%27d%20like%20to%20start%20coaching`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Start with Andre <ArrowRight size={18} />
                  </a>
                  <button
                    className="text-btn"
                    onClick={() => navigate("programs")}
                  >
                    Explore coaching <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-proof">
                  <div>
                    <b>10 years</b>
                    <span>Of coaching</span>
                  </div>
                  <div>
                    <b>Expert guidance</b>
                    <span>Structured for lasting progress</span>
                  </div>
                </div>
              </div>
              <button
                className="hero-scroll"
                onClick={() => navigate("programs")}
                aria-label="Explore coaching programs"
              >
                <span>Discover your next level</span>
                <ArrowRight size={16} />
              </button>
            </section>

            <section id="programs" className="section programs-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Coaching</p>
                  <h2>
                    Coaching <em>programs</em>
                  </h2>
                </div>
                <p>
                  Choose your program, train with a clear plan and meet your
                  coach each week
                </p>
              </div>
              {catalogError && <p role="alert">{catalogError}</p>}
              <Carousel label="Coaching programs">
                {catalogLoading
                  ? [0, 1, 2].map((i) => <ProgramSkeleton key={i} />)
                  : catalog.map((program, index) => (
                      <article
                        className={`program-card p${(index % 3) + 1}`}
                        key={program.id}
                      >
                        <div className="program-image">
                          <img
                            src={
                              [
                                "/images/stock-training.webp",
                                "/images/real-coach.webp",
                                "/images/real-coaching.webp",
                              ][index % 3]
                            }
                            alt={
                              [
                                "Athlete performing a kettlebell workout",
                                "Personal trainer in a gym",
                                "Trainer guiding a client through a strength exercise",
                              ][index % 3]
                            }
                            loading="lazy"
                          />
                          <span>{program.tag}</span>
                          <small className="program-number">0{index + 1}</small>
                        </div>
                        <div className="program-body">
                          <div className="program-meta">
                            <span>
                              <Timer size={15} /> {program.duration}
                            </span>
                            <span>
                              <Target size={15} /> {program.level}
                            </span>
                          </div>
                          <h3>{program.title}</h3>
                          <p>{program.subtitle}</p>
                          <div className="program-bottom">
                            <strong
                              className={
                                program.price ? "" : "price-on-request"
                              }
                            >
                              {program.price ? (
                                <>
                                  ${program.price}
                                  <small> USD</small>
                                </>
                              ) : (
                                "Pricing pending"
                              )}
                            </strong>
                            <button
                              onClick={() => {
                                tap();
                                setSelected(program);
                                setSubmitted(null);
                                setOrderError("");
                              }}
                              aria-label={`View ${program.title}`}
                            >
                              <span>View program</span>
                              <ArrowRight size={19} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
              </Carousel>
            </section>

            <Shifts />

            <Physio preview />
            <section id="about" className="section about-section">
              <div className="portrait-wrap">
                <img
                  src="/images/real-coaching.webp"
                  alt="Coach guiding an athlete through a focused strength session"
                  loading="lazy"
                  width="1400"
                  height="1120"
                />
                <div className="portrait-mark">
                  <Award />
                  <span>
                    <b>10 YEARS</b>OF COACHING
                  </span>
                </div>
              </div>
              <div className="about-copy">
                <p className="eyebrow">Your coach</p>
                <h2>
                  Andre
                  <br />
                  <em>Saleh</em>
                </h2>
                <p>
                  Ten years of coaching, one clear mission: help you build
                  strength, move with confidence and see your progress
                </p>
                <div className="credential-grid">
                  <div>
                    <Dumbbell />
                    <span>
                      <b>Strength</b>Progressive programming
                    </span>
                  </div>
                  <div>
                    <ShieldCheck />
                    <span>
                      <b>Structured</b>Ready-to-follow programs
                    </span>
                  </div>
                  <div>
                    <TrendingUp />
                    <span>
                      <b>Measurable</b>Weekly progress checks
                    </span>
                  </div>
                  <div>
                    <MessageCircle />
                    <span>
                      <b>Supported</b>Direct coach feedback
                    </span>
                  </div>
                </div>
                <a
                  className="text-link"
                  href={coach.instagram}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Instagram size={18} /> @salehandre10 <ArrowRight size={16} />
                </a>
              </div>
            </section>
          </>
        )}
      </main>

      <nav className="social-float" aria-label="Contact Andre">
        <a
          className="social-whatsapp"
          href={`https://wa.me/${coach.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with Andre on WhatsApp"
          title="WhatsApp"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.45 0 .08 5.37.08 11.97c0 2.11.55 4.17 1.6 5.99L0 24l6.2-1.63a11.95 11.95 0 0 0 5.84 1.49h.01C18.65 23.86 24 18.49 24 11.9c0-3.19-1.24-6.19-3.48-8.42ZM12.05 21.84a9.91 9.91 0 0 1-5.06-1.38l-.36-.21-3.68.97.98-3.59-.24-.37a9.92 9.92 0 1 1 8.36 4.58Zm5.44-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.09 4.5.71.3 1.27.48 1.7.62.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
          </svg>
        </a>
      </nav>

      {!physioPage && (
        <div
          className={`quick-bar${showQuickBar && !quickBarDismissed ? " visible" : ""}`}
          role="complementary"
          aria-label="Quick contact"
        >
          <span>
            <b>Ready to start?</b>
            <small>Andre replies personally</small>
          </span>
          <div className="quick-bar-actions">
            href=
<details className="message-options">
  <summary className="primary-btn">Message Andre</summary>

  <div className="message-options__menu">
    {[
      ["Start coaching", "Hi Andre, I'm interested in starting coaching with you. How can I get started?"],
      ["Ask about training plans", "Hi Andre, I'd like to know more about your training plans."],
      ["Ask about nutrition", "Hi Andre, I'd like to ask about nutrition guidance."],
      ["Ask another question", "Hi Andre, I have a question about your coaching services."],
    ].map(([label, message]) => (
      <a
        key={label}
        href={`https://wa.me/${coach.whatsapp}?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={tap}
      >
        {label}
      </a>
    ))}
  </div>
</details>            <button
              className="icon-btn"
              aria-label="Dismiss"
              onClick={() => setQuickBarDismissed(true)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="mobile-dock">
        <button
          className={activeSection === "programs" ? "active" : ""}
          aria-current={activeSection === "programs" ? "page" : undefined}
          onClick={() => navigate("programs")}
        >
          <Dumbbell />
          <span>Programs</span>
        </button>
        <button
          className={activeSection === "results" ? "active" : ""}
          aria-current={activeSection === "results" ? "page" : undefined}
          onClick={() => navigate("results")}
        >
          <Award />
          <span>Results</span>
        </button>
        <button
          className={activeSection === "physio" ? "active" : ""}
          aria-current={activeSection === "physio" ? "page" : undefined}
          onClick={() => navigate("physio")}
        >
          <ShieldCheck />
          <span>Post-rehab</span>
        </button>
        <button
          className={activeSection === "about" ? "active" : ""}
          aria-current={activeSection === "about" ? "page" : undefined}
          onClick={() => navigate("about")}
        >
          <UserRound />
          <span>Coach</span>
        </button>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        label="Program details"
      >
        {selected && !submitted && (
          <>
            <p className="eyebrow">{selected.tag}</p>
            <h2>{selected.title}</h2>
            <p className="modal-description">{selected.description}</p>
            <div className="purchase-inclusions">
              <span>
                <Check size={16} />8 weeks of structured training
              </span>
              <span>
                <Check size={16} />
                Weekly coach meeting
              </span>
            </div>
            <details className="program-inclusions">
              <summary>What’s included</summary>
              <ul className="feature-list">
                {selected.features.map((f) => (
                  <li key={f}>
                    <Check size={16} />
                    {f}
                  </li>
                ))}
              </ul>
            </details>
            <div className="checkout-summary">
              <span>
                Total price<small>One payment • Full eight-week program</small>
              </span>
              <strong>
                {selected.price > 0
                  ? `$${selected.price} USD`
                  : "Pricing pending"}
              </strong>
            </div>
            <PaymentPaths
              disabled={payBusy || selected.price <= 0}
              onPay={payForProgram}
            >
              <form className="checkout-form" onSubmit={submitOrder}>
                <p>
                  Request this program, pay the coach directly in cash, and it
                  will unlock after the coach confirms receipt
                </p>
                <label>
                  WhatsApp number (optional)
                  <input
                    name="phone"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+961 …"
                  />
                </label>
                <button
                  className="primary-btn"
                  disabled={loading || selected.price <= 0}
                >
                  {loading ? (
                    "Sending request…"
                  ) : (
                    <>
                      Request cash payment <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <small>You’ll need a member account to send the request</small>
                {orderError && (
                  <p role="alert" className="form-error">
                    {orderError}
                  </p>
                )}
              </form>
            </PaymentPaths>
            {payError && (
              <p role="alert" className="form-error">
                {payError}
              </p>
            )}
          </>
        )}

        {submitted && (
          <div className="success-state">
            <Confetti />
            <div>
              <Check size={28} />
            </div>
            <p className="eyebrow">Request received</p>
            <h2>You’re on the list</h2>
            <p>{submitted.message}</p>
            <strong>Reference: {submitted.reference}</strong>
            <button className="primary-btn" onClick={() => setSelected(null)}>
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/admin") ? (
      <Admin />
    ) : window.location.pathname.startsWith("/payment/return") ? (
      <PaymentReturn />
    ) : window.location.pathname.startsWith("/member") ? (
      <Member />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
