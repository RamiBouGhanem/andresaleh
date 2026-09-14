import React, {useEffect, useId, useRef, useState} from 'react';
import {Bell, MessageSquareMore, X} from 'lucide-react';

export function refreshNotifications() {
  window.dispatchEvent(new Event('coaching-messages-updated'));
}

async function request(path, method = 'GET', body) {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'},
    ...(body !== undefined ? {body: JSON.stringify(body)} : {})
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || 'Unable to update messages');
  }

  return result;
}

export default function Notifications({role, onOpen}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({count: 0, conversations: []});
  const [error, setError] = useState('');
  const wrapper = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();

  useEffect(() => {
    let stopped = false;
    let pending = false;

    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;

      try {
        const result = await request(`/${role}/notifications`);

        if (!stopped) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (!stopped) setError(e.message);
      } finally {
        pending = false;
      }
    }

    refresh();

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
  }, [role]);

  useEffect(() => {
    if (!open) return;

    const outside = event => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };

    const escape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="notification-wrap" ref={wrapper}>
      <button
        type="button"
        className="notification-trigger"
        ref={trigger}
        onClick={() => setOpen(value => !value)}
        aria-label={`Notifications, ${data.count} unread messages`}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Bell size={21}/>
        {data.count > 0 && (
          <span className="notification-count">
            {data.count > 99 ? '99+' : data.count}
          </span>
        )}
        {error && <span className="notification-error-dot" aria-hidden="true"/>}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {data.count} unread messages
      </span>

      {open && (
        <section
          id={panelId}
          className="notification-panel"
          aria-label="Message notifications"
        >
          <header className="notification-heading">
            <div>
              <h2>Notifications</h2>
              <p>
                {data.count
                  ? `${data.count} unread ${data.count === 1 ? 'message' : 'messages'}`
                  : 'You’re all caught up'}
              </p>
            </div>
            <button
              type="button"
              className="notification-close"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18}/>
            </button>
          </header>

          {error && (
            <p role="alert" className="notification-error">
              {error}
            </p>
          )}

          <div className="notification-list">
            {!data.conversations.length && !error && (
              <div className="notification-empty">
                <MessageSquareMore size={27}/>
                <strong>No unread messages</strong>
                <p>New messages will appear here</p>
              </div>
            )}

            {data.conversations.map(item => (
              <button
                type="button"
                className="notification-item"
                key={item.memberId}
                onClick={() => {
                  setOpen(false);
                  onOpen(item.memberId);
                }}
              >
                <span className="notification-avatar">
                  {item.senderName
                    .split(/\s+/)
                    .map(part => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>

                <span className="notification-content">
                  <span className="notification-item-title">
                    <strong>{item.senderName}</strong>
                    <span className="notification-unread">{item.count}</span>
                  </span>
                  <span className="notification-preview">{item.preview}</span>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function MessageFeed({messages = [], role, memberId}) {
  const feed = useRef(null);
  const ids = messages.map(message => message.id).join('|');

  useEffect(() => {
    if (!feed.current) return;

    let stopped = false;
    let pending = false;
    const visible = new Set();
    const acknowledged = new Set();

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const messageId = entry.target.dataset.messageId;
        if (entry.isIntersecting) visible.add(messageId);
        else visible.delete(messageId);
      });
    }, {threshold: 0.01});

    feed.current
      .querySelectorAll('[data-message-id]')
      .forEach(element => observer.observe(element));

    async function markVisible() {
      if (stopped || pending || document.hidden) return;

      const messageIds = [...visible]
        .filter(messageId => !acknowledged.has(messageId))
        .slice(0, 200);

      if (!messageIds.length) return;

      pending = true;

      try {
        await request(`/${role}/messages/read`, 'POST', {
          ids: messageIds,
          ...(role === 'admin' ? {memberId} : {})
        });

        messageIds.forEach(messageId => acknowledged.add(messageId));
        if (!stopped) refreshNotifications();
      } catch {
        // Retry visible messages on the next interval
      } finally {
        pending = false;
      }
    }

    const timer = setInterval(markVisible, 1000);
    document.addEventListener('visibilitychange', markVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', markVisible);
    };
  }, [role, memberId, ids]);

  return (
    <div className="message-feed" ref={feed} aria-label="Conversation">
      {!messages.length && (
        <p className="muted">No messages yet — start the conversation below</p>
      )}

      {messages.map(message => {
        const incoming = role === 'admin'
          ? message.from === 'member'
          : message.from === 'coach';

        const sender = role === 'admin'
          ? message.from === 'coach' ? 'You' : 'Member'
          : message.from === 'coach' ? 'Coach' : 'You';

        return (
          <div
            key={message.id}
            className={`message ${message.from}`}
            data-message-id={incoming ? message.id : undefined}
          >
            <small>
              {sender} · {new Date(message.createdAt).toLocaleString()}
            </small>
            <p>{message.body}</p>
          </div>
        );
      })}
    </div>
  );
}