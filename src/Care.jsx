import React, {useEffect, useRef, useState} from 'react';
import {api, TaskForm, cleanCopy} from './Care';
import {MessageFeed, refreshNotifications} from './Notifications';

export default function CareAdmin({data, load, section, conversation}) {
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const messageSection = useRef(null);

  const member = data.clients.find(client => client.id === selected);

  useEffect(() => {
    if (section === 'clients' && conversation?.memberId) {
      setSelected(conversation.memberId);
      setQuery('');
      setNotice('');
      setResetLink('');
    }
  }, [section, conversation]);

  useEffect(() => {
    if (!member || conversation?.memberId !== selected) return;

    const frame = requestAnimationFrame(() => {
      messageSection.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start'
      });
      messageSection.current?.focus({preventScroll: true});
    });

    return () => cancelAnimationFrame(frame);
  }, [selected, conversation, member?.id]);

  async function act(action) {
    try {
      await action();
      await load();
      setNotice('Saved');
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function submitAction(action) {
    await action();
    await load();
    setNotice('Saved');
  }

  function chooseMember(memberId) {
    setSelected(memberId);
    setNotice('');
    setResetLink('');
  }

  return (
    <section className="admin-card care-admin">
      <header className="care-admin-heading">
        <h2>
          {section === 'clients'
            ? 'Members & coaching'
            : section === 'physio'
              ? 'Physiotherapy appointments'
              : 'Client transformations'}
        </h2>
        <button className="ghost-btn" onClick={() => act(async () => {})}>Refresh</button>
      </header>

      {notice && <p role="status" className="success-care">{notice}</p>}

      {section === 'clients' && <>
        <label className="care-search">
          Find a member
          <input placeholder="Name or email" value={query}
            onChange={event => setQuery(event.target.value)}/>
        </label>

        <div className="care-columns">
          <aside>
            {data.clients
              .filter(client =>
                `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase())
              )
              .map(client => {
                const unread = data.messages.filter(message =>
                  message.memberId === client.id &&
                  message.from === 'member' &&
                  !message.readAt
                ).length;

                return (
                  <button
                    className={`member-pick ${selected === client.id ? 'chosen' : ''}`}
                    onClick={() => chooseMember(client.id)}
                    key={client.id}
                  >
                    <span className="member-pick-title">
                      <b>{client.name}</b>
                      {unread > 0 && <span className="inline-unread">{unread}</span>}
                    </span>
                    <small>{client.email}</small>
                    <span>{client.status}</span>
                  </button>
                );
              })}

            {!data.clients.length && <p>Members appear here when they create an account</p>}
          </aside>

          {member ? (
            <section key={member.id}>
              <h3>{member.name}</h3>
              <p>{member.email} · Joined {new Date(member.createdAt).toLocaleDateString()}</p>

              <div className="care-actions">
                <button className="ghost-btn" onClick={() => act(() =>
                  api(`/admin/members/${member.id}`, 'PATCH', {
                    status: member.status === 'active' ? 'inactive' : 'active'
                  })
                )}>
                  {member.status === 'active' ? 'Deactivate account' : 'Activate account'}
                </button>

                <button className="ghost-btn" disabled={resetBusy} onClick={async () => {
                  setResetBusy(true);
                  setResetLink('');

                  try {
                    const result = await api(`/admin/members/${member.id}/reset`, 'POST', {});
                    setResetLink(location.origin + result.path);
                    setNotice('Reset link created — valid for 30 minutes');
                  } catch (e) {
                    setNotice(e.message);
                  } finally {
                    setResetBusy(false);
                  }
                }}>
                  {resetBusy ? 'Creating link…' : 'Create reset link'}
                </button>
              </div>

              {resetLink && (
                <div className="reset-link-box">
                  <label>
                    Private reset link
                    <input readOnly value={resetLink}
                      onFocus={event => event.target.select()}/>
                  </label>
                  <button className="ghost-btn" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(resetLink);
                      setNotice('Reset link copied');
                    } catch {
                      setNotice('Select the link above and copy it');
                    }
                  }}>Copy link</button>
                </div>
              )}

              <h3>Assigned programs</h3>

              {data.assignments
                .filter(assignment => assignment.memberId === member.id)
                .map(assignment => (
                  <div key={assignment.id} className="care-list-row">
                    <span>
                      {cleanCopy(data.programs.find(program =>
                        program.id === assignment.programId
                      )?.title || 'Archived program')}
                    </span>
                    <button className="ghost-btn" onClick={() => act(() =>
                      api(`/admin/assignments/${assignment.id}`, 'DELETE')
                    )}>Revoke access</button>
                  </div>
                ))}

              <TaskForm submit={values => submitAction(() =>
                api('/admin/assignments', 'POST', {
                  memberId: member.id,
                  programId: values.programId
                })
              )} buttonLabel="Grant access">
                <label>
                  Grant program access
                  <select name="programId" required>
                    <option value="">Choose program</option>
                    {data.programs.map(program =>
                      <option value={program.id} key={program.id}>{cleanCopy(program.title)}</option>
                    )}
                  </select>
                </label>
              </TaskForm>

              <h3>Check-ins</h3>

              {data.checkins
                .filter(checkin => checkin.memberId === member.id)
                .map(checkin => (
                  <article className="care-card" key={checkin.id}>
                    <b>{new Date(checkin.createdAt).toLocaleString()}</b>
                    <p>
                      {checkin.completed}/{checkin.planned} completed · {checkin.weight ?? 'No weight entered'}
                    </p>
                    <p>{checkin.notes}</p>

                    <TaskForm submit={values => submitAction(() =>
                      api(`/admin/checkins/${checkin.id}`, 'PATCH', values)
                    )} buttonLabel="Save feedback">
                      <label>
                        Coach feedback
                        <textarea name="reply" defaultValue={checkin.reply} maxLength="2000"/>
                      </label>
                    </TaskForm>
                  </article>
                ))}

              <section ref={messageSection} tabIndex={-1} className="conversation-section">
                <h3>Messages with {member.name}</h3>

                <MessageFeed
                  role="admin"
                  memberId={member.id}
                  messages={data.messages.filter(message => message.memberId === member.id)}
                />

                <TaskForm buttonLabel="Send message" submit={async (values, form) => {
                  await api('/admin/messages', 'POST', {
                    memberId: member.id,
                    body: values.body
                  });
                  form.reset();
                  await load();
                  refreshNotifications();
                }}>
                  <label>
                    Reply to member
                    <textarea name="body" required maxLength="2000" placeholder="Write your message"/>
                  </label>
                </TaskForm>
              </section>
            </section>
          ) : (
            <div className="empty-care">
              <h3>Select a member</h3>
              <p>Review progress, assign content and keep the conversation in one place</p>
            </div>
          )}
        </div>
      </>}

      {section === 'physio' && <>
        <p>Times use your device’s time zone — confirmed appointments cannot overlap</p>
        {!data.bookings.length && <p>No appointment requests yet</p>}

        {data.bookings.map(booking => (
          <article className="care-card" key={booking.id}>
            <h3>{cleanCopy(booking.title)}</h3>
            <p>
              {booking.name} · {new Date(booking.requestedAt).toLocaleString()} · {booking.duration} minutes · ${booking.price}
            </p>
            <p>{booking.notes}</p>
            <label>
              Appointment status
              <select value={booking.status} onChange={event => act(() =>
                api(`/admin/bookings/${booking.id}`, 'PATCH', {status: event.target.value})
              )}>
                {['requested', 'confirmed', 'completed', 'cancelled'].map(value =>
                  <option key={value}>{value}</option>
                )}
              </select>
            </label>
          </article>
        ))}

        <h3>Session types & pricing</h3>
        <button className="primary-btn" onClick={() => setEditing({active: true})}>
          Add session type
        </button>

        {data.services.map(service => (
          <div className="care-list-row" key={service.id}>
            <span>
              {cleanCopy(service.title)} · {service.duration} min · ${service.price} · {service.active ? 'Visible' : 'Hidden'}
            </span>
            <button className="ghost-btn" onClick={() => setEditing(service)}>Edit</button>
          </div>
        ))}

        {editing && (
          <TaskForm key={editing.id || 'new'} buttonLabel="Save session"
            submit={async values => {
              await api('/admin/services', 'POST', {
                ...values,
                id: editing.id,
                active: values.active === 'on'
              });
              setEditing(null);
              await load();
            }}>
            <label>Session name<input name="title" defaultValue={editing.title} required/></label>
            <label>Duration, minutes<input name="duration" type="number" min="15" max="180"
              defaultValue={editing.duration || 60} required/></label>
            <label>Price, USD<input name="price" type="number" min="0"
              defaultValue={editing.price || 0} required/></label>
            <label>Description<textarea name="description" defaultValue={editing.description}/></label>
            <label className="checkbox-care">
              <input name="active" type="checkbox" defaultChecked={editing.active}/> Show on website
            </label>
            <button type="button" className="ghost-btn" onClick={() => setEditing(null)}>Cancel</button>
          </TaskForm>
        )}
      </>}

      {section === 'shifts' && <>
        <p>Add client photos and record permission before publishing</p>
        <button className="primary-btn" onClick={() => setEditing({})}>Add transformation</button>

        {data.transformations.map(item => (
          <div className="care-list-row" key={item.id}>
            <span>{item.name} · {cleanCopy(item.title)} · {item.published ? 'Published' : 'Draft'}</span>
            <button className="ghost-btn" onClick={() => setEditing(item)}>Edit</button>
            <button className="ghost-btn" onClick={() => {
              if (window.confirm('Delete this transformation?')) {
                act(() => api(`/admin/transformations/${item.id}`, 'DELETE'));
              }
            }}>Delete</button>
          </div>
        ))}

        {editing && (
          <TransformationEditor
            key={editing.id || 'new'}
            item={editing}
            close={() => setEditing(null)}
            save={async values => {
              await api('/admin/transformations', 'POST', values);
              setEditing(null);
              await load();
            }}
          />
        )}
      </>}
    </section>
  );
}

function TransformationEditor({item, save, close}) {
  const [before, setBefore] = useState(item.before || '');
  const [after, setAfter] = useState(item.after || '');
  const [error, setError] = useState('');

  function file(event, setImage) {
    setError('');
    const image = event.target.files[0];
    if (!image) return;

    if (image.size > 2 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      setError('Choose a JPEG, PNG or WebP under 2 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.onerror = () => setError('Unable to read this image');
    reader.readAsDataURL(image);
  }

  return (
    <TaskForm buttonLabel="Save transformation" submit={values => {
      if (error) throw new Error(error);
      return save({
        ...values,
        id: item.id,
        before,
        after,
        consent: values.consent === 'on',
        published: values.published === 'on'
      });
    }}>
      <label>Client display name<input name="name" defaultValue={item.name} required maxLength="100"/></label>
      <label>Headline<input name="title" defaultValue={item.title} required maxLength="150"/></label>
      <label>Time period<input name="duration" defaultValue={item.duration} placeholder="For example: 12 weeks"/></label>
      <label>Client story<textarea name="story" defaultValue={item.story}/></label>

      <div className="care-columns">
        <label>
          Before photo
          <input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={event => file(event, setBefore)}/>
          {before && <img className="preview-photo" src={before} alt="Before preview"/>}
        </label>
        <label>
          After photo
          <input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={event => file(event, setAfter)}/>
          {after && <img className="preview-photo" src={after} alt="After preview"/>}
        </label>
      </div>

      {error && <p role="alert">{error}</p>}

      <label className="checkbox-care">
        <input name="consent" type="checkbox" defaultChecked={item.consent}/>
        I have permission to publish these photos and this story
      </label>
      <label className="checkbox-care">
        <input name="published" type="checkbox" defaultChecked={item.published}/>
        Publish on the website
      </label>
      <button type="button" className="ghost-btn" onClick={close}>Cancel</button>
    </TaskForm>
  );
}