import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';
import Notifications, {
  MessageFeed,
  refreshNotifications
} from './Notifications';
import './care.css';

export function cleanCopy(value) {
  if (typeof value !== 'string') return value;

  return value.replace(
    /(^|[\s.!?])([^\s]+)(?=\s|$)/g,
    (match, prefix, word) => {
      if (
        word.includes('@') ||
        word.includes('/') ||
        /^[\d.]+$/.test(word)
      ) {
        return match;
      }

      return prefix + word.replace(/\.+$/, '');
    }
  );
}

export async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'},
    ...(body !== undefined
      ? {body: JSON.stringify(body)}
      : {})
  });

  if (response.status === 204) return null;

  let data;

  try {
    data = await response.json();
  } catch {
    const error = new Error('Service unavailable — please try again');
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      cleanCopy(data?.message || 'Request failed')
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export const values = event =>
  Object.fromEntries(new FormData(event.currentTarget));

export function TaskForm({
  children,
  submit,
  className = '',
  buttonLabel = 'Save / submit'
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  return (
    <form
      className={'care-form ' + className}
      onSubmit={async event => {
        event.preventDefault();
        if (submitting.current) return;

        const form = event.currentTarget;
        const formValues = values(event);

        submitting.current = true;
        setBusy(true);
        setError('');

        try {
          await submit(formValues, form);
        } catch (error) {
          setError(cleanCopy(error.message));
        } finally {
          submitting.current = false;
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
        {busy ? 'Please wait…' : buttonLabel}
        <ArrowRight size={16}/>
      </button>
    </form>
  );
}

export function Carousel({children, label}) {
  const ref = useRef(null);
  const touched = useRef(false);
  const cards = React.Children.toArray(children);
  const count = cards.length;

  const [active, setActive] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [hint, setHint] = useState(false);

  function moveTo(index) {
    const element = ref.current;
    const child = element?.children[index];

    if (!child) return;

    element.scrollTo({
      left: child.offsetLeft - element.children[0].offsetLeft,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth'
    });
  }

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const timers = [];
    let frame;

    function update() {
      setOverflow(element.scrollWidth > element.clientWidth + 8);

      const first = element.children[0];

      if (!first) {
        setActive(0);
        return;
      }

      let best = 0;
      let distance = Infinity;

      Array.from(element.children).forEach((child, index) => {
        const difference = Math.abs(
          child.offsetLeft - first.offsetLeft - element.scrollLeft
        );

        if (difference < distance) {
          distance = difference;
          best = index;
        }
      });

      setActive(best);
    }

    function scroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }

    function interrupt() {
      touched.current = true;
      timers.forEach(clearTimeout);
      element.style.scrollSnapType = '';
      setHint(false);
    }

    const resize = new ResizeObserver(update);
    resize.observe(element);
    update();

    const observer = new IntersectionObserver(entries => {
      if (
        !entries[0].isIntersecting ||
        touched.current ||
        element.scrollWidth <= element.clientWidth + 8
      ) {
        return;
      }

      observer.disconnect();

      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      setHint(true);

      timers.push(setTimeout(() => {
        if (touched.current) return;

        element.style.scrollSnapType = 'none';
        element.scrollTo({left: 42, behavior: 'smooth'});
      }, 700));

      timers.push(setTimeout(() => {
        if (!touched.current) {
          element.scrollTo({left: 0, behavior: 'smooth'});
        }
      }, 1450));

      timers.push(setTimeout(() => {
        element.style.scrollSnapType = '';
        setHint(false);
      }, 2250));
    }, {threshold: 0.5});

    observer.observe(element);
    element.addEventListener('scroll', scroll, {passive: true});

    ['pointerdown', 'wheel', 'keydown'].forEach(event =>
      element.addEventListener(event, interrupt, {passive: true})
    );

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      element.removeEventListener('scroll', scroll);

      ['pointerdown', 'wheel', 'keydown'].forEach(event =>
        element.removeEventListener(event, interrupt)
      );

      element.style.scrollSnapType = '';
    };
  }, [count]);

  function manual(index) {
    touched.current = true;

    if (ref.current) ref.current.style.scrollSnapType = '';

    setHint(false);
    moveTo(index);
  }

  return (
    <div
      className={`carousel-wrap${
        overflow ? ' has-overflow' : ''
      }${hint ? ' swipe-hint-active' : ''}`}
    >
      <div className="carousel-controls">
        <span>
          <b>{label}</b>
          <small>{overflow ? 'Swipe to explore' : 'Find your fit'}</small>
        </span>

        <div className="carousel-arrows">
          <button
            type="button"
            aria-label="Previous cards"
            disabled={!overflow || active === 0}
            onClick={() => manual(Math.max(0, active - 1))}
          >
            <ChevronLeft/>
          </button>

          <button
            type="button"
            aria-label="Next cards"
            disabled={!overflow || active >= count - 1}
            onClick={() => manual(Math.min(count - 1, active + 1))}
          >
            <ChevronRight/>
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
          <span className="swipe-cue">
            <ArrowLeft size={14}/>
            <span>Swipe to explore</span>
            <ArrowRight size={14}/>
          </span>

          <div
            className="carousel-dots"
            aria-label={`${label} navigation`}
          >
            {cards.map((_, index) => (
              <button
                type="button"
                key={index}
                className={index === active ? 'active' : ''}
                aria-label={`Show ${label} card ${index + 1}`}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => manual(index)}
              />
            ))}
          </div>

          <small className="carousel-position">
            {String(active + 1).padStart(2, '0')}
            {' / '}
            {String(count).padStart(2, '0')}
          </small>
        </div>
      )}
    </div>
  );
}

export function Physio({preview = false}) {
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let stopped = false;

    api('/services')
      .then(result => {
        if (!stopped) setServices(result);
      })
      .catch(error => {
        if (!stopped) setError(error.message);
      });

    return () => { stopped = true; };
  }, []);

  if (preview) {
    return (
      <section
        className="section care-section physio-preview"
        id="physio"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Physiotherapy</p>
            <h2>Move better</h2>
          </div>
        </div>

        <a
          className="physio-visual physio-entry"
          href="/physiotherapy"
          aria-label="Explore physiotherapy sessions and programs"
        >
          <img
            src="/images/real-physio.webp"
            alt="Physiotherapist guiding a rehabilitation exercise"
            loading="lazy"
            width="900"
            height="1350"
          />

          <span className="physio-entry-caption">
            <span>
              <b>Physiotherapy & recovery</b>
              <small>Explore sessions & programs</small>
            </span>

            <ArrowRight size={22}/>
          </span>
        </a>
      </section>
    );
  }

  return (
    <section className="section care-section" id="physio">
      <div className="physio-lead">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Physiotherapy</p>
            <h2>
              Move better
              <br/>
              <em>Come back stronger</em>
            </h2>
          </div>

          <p>
            A clear path from assessment to recovery and a
            confident return to training
          </p>
        </div>

        <figure className="physio-visual">
          <img
            src="/images/real-physio.webp"
            alt="Physiotherapist guiding a client through a rehabilitation exercise"
            loading="lazy"
            width="1122"
            height="1402"
          />

          <figcaption>
            <Activity/>
            <span>
              <b>Coach-led care</b>
              Built for active bodies
            </span>
          </figcaption>
        </figure>
      </div>

      {error && <p role="alert">{error}</p>}

      <div
        className="care-services-grid"
        aria-label="Physiotherapy sessions"
      >
        {services.map((service, index) => (
          <article className="care-card" key={service.id}>
            <div className="care-step">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <Activity className="care-symbol"/>
            </div>

            <p className="eyebrow">
              {service.duration} minute session
            </p>

            <h3>{cleanCopy(service.title)}</h3>
            <p>{cleanCopy(service.description)}</p>
            <strong>${service.price} USD</strong>

            <button
              type="button"
              className="primary-btn"
              onClick={async () => {
                try {
                  const session = await api('/session');

                  if (session.role !== 'member') {
                    location.href = '/member?return=physio';
                    return;
                  }

                  setSaved(false);
                  setSelected(service);
                } catch (error) {
                  setError(error.message);
                }
              }}
            >
              Request a session
              <ArrowRight size={16}/>
            </button>
          </article>
        ))}
      </div>

      {selected && (
        <dialog
          ref={node => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setSelected(null)}
          className="care-dialog"
        >
          <button
            type="button"
            className="close-care"
            aria-label="Close"
            onClick={() => setSelected(null)}
          >
            ×
          </button>

          <h3>{cleanCopy(selected.title)}</h3>

          <p className="service-dialog-description">
            {cleanCopy(selected.description)}
          </p>

          {saved ? (
            <p role="status">
              Request saved — your coach will confirm the time
              in your member area
            </p>
          ) : (
            <TaskForm
              buttonLabel="Request appointment"
              submit={async values => {
                await api('/bookings', 'POST', {
                  serviceId: selected.id,
                  requestedAt: new Date(values.time).toISOString(),
                  notes: values.notes
                });

                setSaved(true);
              }}
            >
              <label>
                Preferred date and time — your local time
                <input
                  name="time"
                  type="datetime-local"
                  required
                />
              </label>

              <label>
                Scheduling note — optional
                <textarea
                  name="notes"
                  maxLength="500"
                  placeholder="For example, preferred contact time"
                />
              </label>

              <p>Check your member area for appointment confirmation</p>
            </TaskForm>
          )}
        </dialog>
      )}
    </section>
  );
}

export function Shifts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;

    api('/transformations')
      .then(result => {
        if (!stopped) setItems(result);
      })
      .catch(error => {
        if (!stopped) setError(error.message);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });

    return () => { stopped = true; };
  }, []);

  return (
    <section id="results" className="section results-showcase">
      <div className="section-heading">
        <div>
          <p className="eyebrow">The shift</p>
          <h2>The <em>transformations</em></h2>
        </div>

        <p>Strength, confidence and a body that moves better</p>
      </div>

      {error && <p role="alert">{error}</p>}

      {loading && <p className="muted">Loading transformations…</p>}

      {items.length > 0 && (
        <Carousel label="Before & after">
          {items.map(item => (
            <article className="shift-card" key={item.id}>
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

              <div>
                <p className="eyebrow">
                  {cleanCopy(item.duration)}
                </p>

                <h3>{cleanCopy(item.title)}</h3>
                <p>{cleanCopy(item.story)}</p>
                <b>{item.name}</b>
              </div>
            </article>
          ))}
        </Carousel>
      )}

      {!loading && !error && !items.length && (
        <p className="muted">Client transformations will appear here</p>
      )}
    </section>
  );
}

export default function Member() {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('programs');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [messageRequest, setMessageRequest] = useState(0);

  const reset = new URLSearchParams(location.search).get('reset');

  const load = useCallback(async () => {
    try {
      const result = await api('/member/dashboard');
      setData(result);
      setLoadError('');
      return result;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setData(null);
      }

      setLoadError(
        error.status === 401 ? '' : error.message
      );

      throw error;
    }
  }, []);

  useEffect(() => {
    if (reset) {
      setLoading(false);
      return;
    }

    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load, reset]);

  useEffect(() => {
    if (!data?.user?.id || reset) return;

    let stopped = false;
    let pending = false;

    async function refresh() {
      if (stopped || pending || document.hidden) return;

      pending = true;

      try {
        await load();
      } catch {
        // Displayed by load
      } finally {
        pending = false;
      }
    }

    const timer = setInterval(refresh, 10000);

    window.addEventListener('focus', refresh);
    window.addEventListener('coaching-messages-updated', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('coaching-messages-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [data?.user?.id, load, reset]);

  useEffect(() => {
    if (tab !== 'messages' || !messageRequest) return;

    const frame = requestAnimationFrame(() => {
      const section = document.getElementById('member-conversation');

      section?.scrollIntoView({
        block: 'start',
        behavior: 'auto'
      });

      section?.focus({preventScroll: true});
    });

    return () => cancelAnimationFrame(frame);
  }, [tab, messageRequest]);

  function openMessages() {
    setTab('messages');
    setNotice('');
    setMessageRequest(value => value + 1);
    load().catch(() => {});
  }

  if (loading) {
    return (
      <main className="member-shell">
        <p>Loading your account…</p>
      </main>
    );
  }

  if (reset) {
    return (
      <main className="member-shell auth-care">
        <h1>Reset your password</h1>

        <TaskForm
          buttonLabel="Update password"
          submit={async values => {
            await api('/member/reset', 'POST', {
              token: reset,
              password: values.password
            });

            location.replace('/member');
          }}
        >
          <label>
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength="12"
              maxLength="128"
              required
            />
          </label>
        </TaskForm>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="member-shell auth-care">
        <a href="/">
          <ArrowLeft size={16}/>
          Back to website
        </a>

        <Activity className="care-symbol"/>
        <p className="eyebrow">Your coaching space</p>

        <h1>
          {mode === 'login' ? 'Welcome back' : 'Start your journey'}
        </h1>

        {loadError && (
          <p role="alert" className="form-error">
            {loadError}
          </p>
        )}

        <div className="care-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>

        <TaskForm
          key={mode}
          buttonLabel={mode === 'login' ? 'Sign in' : 'Create account'}
          submit={async values => {
            await api('/member/' + mode, 'POST', values);
            await load();

            if (
              new URLSearchParams(location.search).get('return') ===
              'physio'
            ) {
              location.href = '/physiotherapy';
            }
          }}
        >
          {mode === 'register' && (
            <label>
              Full name
              <input
                name="name"
                autoComplete="name"
                maxLength="100"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password — at least 12 characters
            <input
              name="password"
              type="password"
              autoComplete={
                mode === 'register'
                  ? 'new-password'
                  : 'current-password'
              }
              minLength="12"
              maxLength="128"
              required
            />
          </label>
        </TaskForm>

        <p className="muted">
          Forgot your password? Ask your coach for a private reset link
        </p>
      </main>
    );
  }

  const messages = data.messages || [];
  const assignments = data.assignments || [];
  const orders = data.orders || [];
  const checkins = data.checkins || [];
  const bookings = data.bookings || [];

  const unread = messages.filter(message =>
    message.from === 'coach' && !message.readAt
  ).length;

  return (
    <main className="member-shell">
      <header className="member-header">
        <div>
          <a href="/">← Website</a>
          <p className="eyebrow">Member area</p>
          <h1>Hello, {data.user.name.split(' ')[0]}</h1>
        </div>

        <div className="member-header-actions">
          <Notifications role="member" onOpen={openMessages}/>

          <button
            type="button"
            className="ghost-btn"
            onClick={async () => {
              try {
                await api('/logout', 'POST');
                setData(null);
                setNotice('');
                setLoadError('');
                setTab('programs');
              } catch (error) {
                setNotice(error.message);
              }
            }}
          >
            <LogOut size={16}/>
            Sign out
          </button>
        </div>
      </header>

      <div className="care-tabs">
        {[
          'programs',
          'check-ins',
          'messages',
          'appointments',
          'account'
        ].map(value => (
          <button
            type="button"
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => {
              setTab(value);
              setNotice('');
            }}
          >
            {value}

            {value === 'messages' && unread > 0 && (
              <span className="inline-unread">{unread}</span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="success-care">{notice}</p>
      )}

      {loadError && (
        <p role="alert" className="form-error">{loadError}</p>
      )}

      {tab === 'programs' && (
        <>
          <h2>Your programs</h2>

          {assignments.length ? assignments.map(assignment => {
            const program = assignment.program || {
              title: 'Archived program'
            };

            return (
              <article key={assignment.id} className="care-card">
                <p className="eyebrow">{program.duration}</p>
                <h3>{cleanCopy(program.title)}</h3>
                <p>{cleanCopy(program.description)}</p>

                <div className="program-content">
                  {cleanCopy(
                    program.content ||
                    'Your coach is preparing your program instructions'
                  )}
                </div>
              </article>
            );
          }) : (
            <div className="empty-care">
              <p>Your coach hasn’t assigned a program yet</p>
              <a className="primary-btn" href="/#programs">
                Browse programs
              </a>
            </div>
          )}

          <h2>Program requests</h2>

          {orders.map(order => (
            <div className="care-list-row" key={order.id}>
              <b>{cleanCopy(order.program)}</b>
              <span>${order.amount} · {order.status}</span>
            </div>
          ))}

          <p className="muted">
            Payment status and program access are confirmed by your coach
          </p>
        </>
      )}

      {tab === 'check-ins' && (
        <div className="care-columns">
          <section>
            <h2>Weekly check-in</h2>

            <TaskForm
              buttonLabel="Send check-in"
              submit={async (values, form) => {
                await api('/member/checkins', 'POST', values);
                form.reset();
                await load();
                setNotice('Check-in sent to your coach');
              }}
            >
              <label>
                Weight, kg — optional
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
                <input
                  name="planned"
                  type="number"
                  min="1"
                  max="30"
                  required
                />
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
                <textarea name="notes" maxLength="2000"/>
              </label>

              <p className="muted">
                Only you and your coach can see these check-ins
              </p>
            </TaskForm>
          </section>

          <section>
            <h2>Your history</h2>

            {checkins.length ? checkins.map(checkin => (
              <article className="care-card" key={checkin.id}>
                <b>
                  {new Date(checkin.createdAt).toLocaleDateString()}
                </b>

                <p>
                  {checkin.completed}/{checkin.planned} sessions
                  {checkin.weight
                    ? ' · ' + checkin.weight + ' kg'
                    : ''}
                </p>

                <p>{checkin.notes}</p>

                {checkin.reply && (
                  <div className="coach-reply">
                    <b>Coach feedback</b>
                    <p>{checkin.reply}</p>
                  </div>
                )}
              </article>
            )) : <p>No check-ins yet</p>}
          </section>
        </div>
      )}

      {tab === 'messages' && (
        <section
          id="member-conversation"
          className="conversation-section"
          tabIndex={-1}
        >
          <h2>Your conversation</h2>

          <MessageFeed
            role="member"
            memberId={data.user.id}
            messages={messages}
          />

          <TaskForm
            buttonLabel="Send message"
            submit={async (values, form) => {
              await api('/member/messages', 'POST', values);
              form.reset();
              refreshNotifications();
              await load();
            }}
          >
            <label>
              Message your coach
              <textarea
                name="body"
                required
                maxLength="2000"
                placeholder="Write your message"
              />
            </label>
          </TaskForm>
        </section>
      )}

      {tab === 'appointments' && (
        <>
          <h2>Physiotherapy appointments</h2>

          <a href="/physiotherapy" className="primary-btn">
            Request a session
            <CalendarDays size={16}/>
          </a>

          {bookings.map(booking => (
            <article className="care-card" key={booking.id}>
              <h3>{cleanCopy(booking.title)}</h3>

              <p>
                {new Date(booking.requestedAt).toLocaleString()}
                {' · '}
                {booking.duration} min
                {' · '}
                ${booking.price}
              </p>

              <b className="status">{booking.status}</b>

              {['requested', 'confirmed'].includes(booking.status) && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={async () => {
                    try {
                      await api(
                        `/member/bookings/${booking.id}`,
                        'PATCH',
                        {}
                      );
                      await load();
                    } catch (error) {
                      setNotice(error.message);
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

      {tab === 'account' && (
        <>
          <h2>Account</h2>
          <p>{data.user.email}</p>

          <TaskForm
            buttonLabel="Update password"
            submit={async (values, form) => {
              await api('/member/password', 'POST', values);
              form.reset();
              setNotice('Password updated');
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