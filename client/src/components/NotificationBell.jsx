import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../api/client';
import { NotifIcon, timeAgo } from './notifications';

/** Bell + dropdown of recent in-app notifications. Polls every 60 s (and on navigation). */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const box = useRef(null);
  const loc = useLocation();
  const nav = useNavigate();

  const load = useCallback(() => api.get('/notifications', { params: { limit: 15 }, silent: true })
    .then(({ data }) => { setItems(data.items); setUnread(data.unread); })
    .catch(() => {}), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, loc.pathname]);

  useEffect(() => setOpen(false), [loc.pathname]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => {
    await api.post('/notifications/read', {}).catch(() => {});
    load();
  };

  const go = async (n) => {
    if (!n.readAt) await api.post('/notifications/read', { ids: [n._id] }).catch(() => {});
    setOpen(false);
    load();
    if (n.link && n.link.startsWith('/')) nav(n.link); // internal links only
  };

  return (
    <div className="bell" ref={box}>
      <button className="btn btn-ghost icon-btn bell-btn" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={19} />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-menu" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            <span className="spacer" />
            {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAll}><CheckCheck size={14} /> Mark all read</button>}
          </div>
          {items.length === 0 ? (
            <p className="muted small" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>You’re all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n._id}>
                  <button className={`notif ${n.readAt ? '' : 'unread'}`} onClick={() => go(n)}>
                    <NotifIcon type={n.type} />
                    <span className="notif-body">
                      <span className="notif-title">{n.title}</span>
                      {n.body && <span className="notif-text">{n.body}</span>}
                      <span className="notif-time">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="bell-foot" onClick={() => { setOpen(false); nav('/dashboard'); }}>Open dashboard</button>
        </div>
      )}
    </div>
  );
}
