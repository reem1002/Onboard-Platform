import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen, LayoutDashboard, ClipboardCheck, Users, LogOut, Menu, ShieldCheck, Building2, GraduationCap,
  LifeBuoy, PanelLeftClose, PanelLeftOpen, Home, FileText, Settings as SettingsIcon, Award, Palette,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import ActivityBar from './ActivityBar';
import { useT } from '../lib/i18n';
import { useBranding } from '../context/BrandingContext';
import LanguageToggle from './LanguageToggle';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const ROLE_LABEL = { super_admin: 'Platform admin', company_admin: 'Company admin', instructor: 'Instructor', employee: 'Employee' };

const DASH = ['/dashboard', Home, 'Dashboard'];
const NAV = {
  super_admin: [
    DASH,
    ['/admin/companies', Building2, 'Companies'],
    ['/courses', BookOpen, 'Courses'],
    ['/admin/instructors', GraduationCap, 'Instructors'],
    ['/review', ClipboardCheck, 'Review queue'],
    ['/reports/shared', FileText, 'Shared reports'],
    ['/support', LifeBuoy, 'Support'],
    ['/certificates', Award, 'Certificates'],
    ['/admin/settings', SettingsIcon, 'Settings'],
  ],
  instructor: [
    DASH,
    ['/review', ClipboardCheck, 'Review queue'],
    ['/courses', BookOpen, 'My courses'],
    ['/reports/shared', FileText, 'Shared reports'],
    ['/certificates', Award, 'Certificates'],
    ['/support', LifeBuoy, 'Questions'],
  ],
  company_admin: [
    DASH,
    ['/team', LayoutDashboard, 'Team progress'],
    ['/people', Users, 'Employees'],
    ['/reports/shared', FileText, 'Reports'],
    ['/certificates', Award, 'Certificates'],
    ['/company/branding', Palette, 'Branding'],
    ['/courses', BookOpen, 'Courses'],
    ['/support', LifeBuoy, 'Support'],
  ],
  employee: [
    DASH,
    ['/courses', BookOpen, 'My training'],
    ['/certificates', Award, 'Certificates'],
    ['/support', LifeBuoy, 'Help & support'],
  ],
};

// Per-browser preference; storage can be unavailable (private mode) so every access is guarded
const readCollapsed = () => {
  try { return localStorage.getItem('lms.sidebar') === 'collapsed'; } catch { return false; }
};
const writeCollapsed = (v) => {
  try { localStorage.setItem('lms.sidebar', v ? 'collapsed' : 'open'); } catch { /* ignore */ }
};

const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Layout() {
  const { user, logout } = useAuth();
  const t = useT();
  const { branding } = useBranding();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  // Support badge: tickets waiting on me (60 s poll; navigation refreshes at most every 20 s)
  const lastSupport = useRef(0);
  useEffect(() => {
    let alive = true;
    const tick = () => { lastSupport.current = Date.now(); api.get('/support/unread', { silent: true }).then(({ data }) => alive && setUnread(data.count)).catch(() => {}); };
    const timer = setInterval(tick, 60000);
    if (Date.now() - lastSupport.current > 20000) tick();
    return () => { alive = false; clearInterval(timer); };
  }, [loc.pathname]);

  const toggle = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });

  return (
    <div className={`shell ${open ? 'nav-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <ActivityBar />
      <aside className="sidebar" aria-label={t('Main navigation')}>
        <div className="brand">
          {branding?.logoUrl ? (
            <img className="brand-logo" src={branding.logoUrl} alt={branding.name} />
          ) : (
            <>
              <span className="brand-mark"><ShieldCheck size={18} /></span>
              <span className="label">{branding?.name || 'Onboard'}</span>
            </>
          )}
        </div>
        <nav className="nav">
          {NAV[user.role].map(([to, Icon, label]) => (
            <NavLink key={to} to={to} end={false} title={collapsed ? t(label) : undefined} aria-label={t(label)}>
              <Icon size={18} />
              <span className="label">{t(label)}</span>
              {to === '/support' && unread > 0 && <span className="badge" aria-label={t('{n} waiting', { n: unread })}>{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link to="/profile" className="who-link" title={t('Account settings')}>
            <span className="avatar" aria-hidden>{initials(user.name)}</span>
            <span className="label">
              <span className="who">{user.name}</span>
              <span className="role">{t(ROLE_LABEL[user.role])}</span>
            </span>
          </Link>
          <button className="btn btn-ghost btn-sm signout" onClick={logout} title={t('Sign out')}>
            <LogOut size={15} /> <span className="label">{t('Sign out')}</span>
          </button>
        </div>
        <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')} title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <div className="main">
        <header className="appbar">
          <button className="btn btn-ghost icon-btn mobile-only" aria-label={t('Open menu')} onClick={() => setOpen(true)}><Menu /></button>
          <strong className="mobile-only">{branding?.name || 'Onboard'}</strong>
          <span className="spacer" />
          <LanguageToggle />
          <NotificationBell />
          <Link to="/profile" className="avatar-btn" aria-label={t('Account settings')} title={t('Account settings')}>{initials(user.name)}</Link>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
