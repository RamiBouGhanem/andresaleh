import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  Dumbbell,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareMore,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import "./admin.css";
import CareAdmin from "./CareAdmin";
import { api, cleanCopy } from "./Care";
import Notifications from "./Notifications";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);

const date = (value) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

const tabs = [
  ["overview", LayoutDashboard, "Overview"],
  ["programs", Dumbbell, "Programs"],
  ["orders", ShoppingBag, "Orders"],
  ["leads", MessageSquareMore, "Leads"],
  ["clients", UsersRound, "Members"],
  ["physio", Activity, "Physiotherapy"],
  ["shifts", TrendingUp, "Transformations"],
  ["settings", Settings, "Settings"],
];

function Login({ done }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      await api("/admin/login", "POST", values);
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <a href="/">
        <ArrowLeft /> Back to website
      </a>
      <section>
        <div className="admin-logo">
          <Activity />
        </div>
        <p className="eyebrow">Coach administration</p>
        <h1>
  <span className="login-heading-text">Run your coaching</span>
  <br/>
  <em className="login-heading-business">business</em>
</h1>{" "}
        <p>Manage programs, clients, leads and sales from one place</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Coach email"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              required
            />
          </label>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          <button disabled={busy} className="primary-btn">
            {busy ? "Signing in…" : "Sign in"} <ChevronRight />
          </button>
          <small>Use your coach administrator credentials</small>
        </form>
      </section>
    </main>
  );
}

function Editor({ program, close, save }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const values = Object.fromEntries(new FormData(event.currentTarget));
    values.features = values.features
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    try {
      await save(values);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-bg">
      <form className="admin-modal" onSubmit={submit}>
        <button
          type="button"
          className="admin-close"
          onClick={close}
          aria-label="Close program editor"
        >
          <X />
        </button>

        <p className="eyebrow">{program ? "Edit program" : "New program"}</p>
        <h2>{program ? "Update offer" : "Create an offer"}</h2>

        <div className="form-grid">
          <label>
            Program title
            <input name="title" defaultValue={program?.title} required />
          </label>
          <label>
            Price (USD)
            <input
              name="price"
              type="number"
              min="1"
              defaultValue={program?.price}
              required
            />
          </label>
          <label>
            Tag
            <input name="tag" defaultValue={program?.tag || "NEW"} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={program?.status || "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label>
            Duration
            <input
              name="duration"
              defaultValue={program?.duration || "8 weeks"}
            />
          </label>
          <label>
            Level
            <input name="level" defaultValue={program?.level || "All levels"} />
          </label>
          <label className="wide">
            Subtitle
            <input name="subtitle" defaultValue={program?.subtitle} />
          </label>
          <label className="wide">
            Description
            <textarea
              name="description"
              rows="3"
              defaultValue={program?.description}
            />
          </label>
          <label className="wide">
            Features — one per line
            <textarea
              name="features"
              rows="5"
              defaultValue={program?.features?.join("\n")}
            />
          </label>
          <label className="wide">
            Member-only program instructions
            <textarea
              name="content"
              rows="10"
              defaultValue={program?.content}
              placeholder="Training schedule, exercise sets and reps, resources and guidance"
            />
          </label>
        </div>

        {error && <div role="alert">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
          <button disabled={busy} className="primary-btn">
            {busy ? "Saving…" : "Save program"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(true);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [menu, setMenu] = useState(false);
  const [editor, setEditor] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api("/admin/dashboard");
      setData(result);
      setError("");
      return result;
    } catch (e) {
      setError(e.message);

      if (e.status === 401 || e.status === 403) {
        setAuthenticated(false);
        setData(null);
      }

      throw e;
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    let stopped = false;
    let pending = false;

    async function refresh() {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        await load();
      } catch {
        // Errors are displayed by load
      } finally {
        pending = false;
      }
    }

    refresh();
    const timer = setInterval(refresh, 10000);

    window.addEventListener("focus", refresh);
    window.addEventListener("coaching-messages-updated", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("coaching-messages-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authenticated, load]);

  const lists = useMemo(() => {
    const search = query.toLowerCase();

    return {
      orders: (data?.orders || []).filter((item) =>
        `${item.name} ${item.email} ${item.program}`
          .toLowerCase()
          .includes(search),
      ),
      leads: (data?.leads || []).filter((item) =>
        `${item.name} ${item.email} ${item.goal}`
          .toLowerCase()
          .includes(search),
      ),
    };
  }, [data, query]);

  async function save(values) {
    await api(
      editor?.id ? `/admin/programs/${editor.id}` : "/admin/programs",
      editor?.id ? "PUT" : "POST",
      values,
    );
    setEditor(false);
    await load();
  }

  async function remove(programId) {
    if (!window.confirm("Delete this program?")) return;

    try {
      await api(`/admin/programs/${programId}`, "DELETE");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function status(type, itemId, value) {
    try {
      await api(`/admin/${type}/${itemId}`, "PATCH", { status: value });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function openConversation(memberId) {
    setTab("clients");
    setMenu(false);
    setConversation({ memberId, requestId: Date.now() });
    load().catch(() => {});
  }

  if (!authenticated) {
    return (
      <Login
        done={() => {
          setData(null);
          setError("");
          setAuthenticated(true);
        }}
      />
    );
  }

  if (!data) {
    return (
      <div className="admin-loading">
        <Activity />
        <p>{error || "Loading dashboard…"}</p>
        {error && (
          <button className="ghost-btn" onClick={() => load().catch(() => {})}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const unread = data.messages.filter(
    (message) => message.from === "member" && !message.readAt,
  ).length;

  return (
    <div className="admin-shell">
      <aside className={menu ? "admin-sidebar open" : "admin-sidebar"}>
        <a className="admin-brand" href="/">
          <Activity />
          <span>
            <b>ANDRE SALEH</b>COACHING
          </span>
        </a>

        <nav>
          {tabs.map(([id, Icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMenu(false);
              }}
            >
              <Icon />
              {label}
              {id === "leads" && data.stats.leads > 0 && (
                <i>{data.stats.leads}</i>
              )}
              {id === "clients" && unread > 0 && <i>{unread}</i>}
            </button>
          ))}
        </nav>

        <div className="admin-user">
          <div>AS</div>
          <span>
            <b>Andre Saleh</b>Head coach
          </span>
          <button
            aria-label="Sign out"
            onClick={async () => {
              try {
                await api("/logout", "POST");
                setAuthenticated(false);
                setData(null);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <LogOut />
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>

          <div>
            <p>{tab}</p>
            <h1>
              {tab === "overview"
                ? "Welcome back, Coach"
                : tabs.find((item) => item[0] === tab)?.[2]}
            </h1>
          </div>

          <div className="admin-top-actions">
            <Notifications role="admin" onOpen={openConversation} />
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Eye /> View website
            </a>
            <button
              className="primary-btn"
              aria-label="Add program"
              onClick={() => setEditor({})}
            >
              <Plus /> Add program
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="admin-alert">
            {error}
          </div>
        )}

        {tab === "overview" && (
          <>
            <section className="stat-grid">
              <Stat
                icon={CircleDollarSign}
                label="Revenue collected"
                value={money(data.stats.revenue)}
                note="From paid orders"
              />
              <Stat
                icon={UsersRound}
                label="Active clients"
                value={data.stats.clients}
                note="Registered active members"
              />
              <Stat
                icon={MessageSquareMore}
                label="Unread messages"
                value={unread}
                note="Open the bell to reply"
              />
              <Stat
                icon={Eye}
                label="Website views"
                value={data.stats.views.toLocaleString()}
                note="Page views recorded"
              />
            </section>

            <div className="admin-overview-grid">
              <section className="admin-card">
                <Head
                  eyebrow="Client health"
                  title="Check-ins at a glance"
                  action={() => setTab("clients")}
                />
                {data.clients.map((client) => (
                  <div className="client-row" key={client.id}>
                    <Avatar name={client.name} />
                    <div className="client-name">
                      <b>{client.name}</b>
                      <span>{cleanCopy(client.program)}</span>
                    </div>
                    <div className="compliance">
                      <span>{client.compliance}% compliance</span>
                      <i>
                        <b style={{ width: `${client.compliance}%` }} />
                      </i>
                    </div>
                    <time>{client.nextCheckIn}</time>
                  </div>
                ))}
              </section>

              <section className="admin-card">
                <Head eyebrow="Sales" title="Program performance" />
                {data.programs.map((program, index) => (
                  <div className="sales-row" key={program.id}>
                    <span>{index + 1}</span>
                    <div>
                      <b>{cleanCopy(program.title)}</b>
                      <small>{program.sales || 0} paid orders</small>
                    </div>
                    <strong>
                      {money((program.sales || 0) * program.price)}
                    </strong>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}

        {tab === "programs" && (
          <section className="admin-card full">
            <Head eyebrow="Offers" title="Programs & pricing" />
            {data.programs.map((program) => (
              <article className="program-admin-row" key={program.id}>
                <div className="program-icon">
                  <Dumbbell />
                </div>
                <div>
                  <h3>{cleanCopy(program.title)}</h3>
                  <p>
                    {program.duration} · {program.level}
                  </p>
                </div>
                <span className={`status ${program.status}`}>
                  {program.status}
                </span>
                <strong>{money(program.price)}</strong>
                <small>{program.sales || 0} paid orders</small>
                <button onClick={() => setEditor(program)}>Edit</button>
                <button
                  className="danger-icon"
                  aria-label={`Delete ${program.title}`}
                  onClick={() => remove(program.id)}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
          </section>
        )}

        {["orders", "leads"].includes(tab) && (
          <section className="admin-card full">
            <div className="table-toolbar">
              <Head eyebrow="Management" title={tab} />
              <label className="search">
                <Search />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${tab}`}
                />
              </label>
            </div>

            {tab === "orders" && (
              <Table
                headings={["Customer", "Program", "Date", "Amount", "Status"]}
              >
                {lists.orders.map((order) => (
                  <div className="tr" key={order.id}>
                    <Person item={order} />
                    <span>{cleanCopy(order.program)}</span>
                    <span>{date(order.createdAt)}</span>
                    <span>{money(order.amount)}</span>
                    <select
                      className={`status ${order.status}`}
                      value={order.status}
                      onChange={(event) =>
                        status("orders", order.id, event.target.value)
                      }
                    >
                      {["pending", "paid", "cancelled", "refunded"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  </div>
                ))}
              </Table>
            )}

            {tab === "leads" && (
              <Table headings={["Lead", "Goal", "Source", "Date", "Status"]}>
                {lists.leads.map((lead) => (
                  <div className="tr" key={lead.id}>
                    <Person item={lead} />
                    <span>{lead.goal}</span>
                    <span>{lead.source}</span>
                    <span>{date(lead.createdAt)}</span>
                    <select
                      className={`status ${lead.status}`}
                      value={lead.status}
                      onChange={(event) =>
                        status("leads", lead.id, event.target.value)
                      }
                    >
                      {[
                        "new",
                        "contacted",
                        "qualified",
                        "converted",
                        "closed",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </Table>
            )}
          </section>
        )}

        {["clients", "physio", "shifts"].includes(tab) && (
          <CareAdmin
            key={tab}
            data={data}
            load={load}
            section={tab}
            conversation={conversation}
          />
        )}

        {tab === "settings" && (
          <section className="admin-card full settings-page">
            <Head eyebrow="Configuration" title="Business settings" />
            <div className="settings-grid">
              <Setting
                icon={Settings}
                title="Brand & contact"
                text="Keep your contact details and social links up to date"
              />
              <Setting
                icon={CircleDollarSign}
                title="Payments"
                text="Arrange payment with the client and update the order status once received"
              />
              <Setting
                icon={Dumbbell}
                title="Program delivery"
                text="Add instructions to a program and assign it from Members"
              />
              <Setting
                icon={MessageSquareMore}
                title="Message notifications"
                text="Use the notification bell to see unread messages and open a conversation"
              />
            </div>
          </section>
        )}
      </main>

      {editor && (
        <Editor
          program={editor.id ? editor : null}
          close={() => setEditor(false)}
          save={save}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, note }) {
  return (
    <article>
      <span>
        <Icon />
      </span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>
        <TrendingUp />
        {note}
      </small>
    </article>
  );
}

function Head({ eyebrow, title, action }) {
  return (
    <div className="card-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && (
        <button onClick={action}>
          View all <ChevronRight />
        </button>
      )}
    </div>
  );
}

function Avatar({ name = "" }) {
  return (
    <div className="avatar">
      {name
        .split(/\s+/)
        .map((value) => value[0])
        .join("")
        .slice(0, 2)}
    </div>
  );
}

function Person({ item }) {
  return (
    <span>
      <b>{item.name}</b>
      <small>{item.email}</small>
    </span>
  );
}

function Table({ headings, children }) {
  return (
    <div className="data-table">
      <div className="tr th">
        {headings.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Setting({ icon: Icon, title, text }) {
  return (
    <article>
      <Icon />
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}
