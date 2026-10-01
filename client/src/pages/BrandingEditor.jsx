import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Palette, Save, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { ErrorBox, PageSkeleton, Progress } from '../components/ui';
import { contrast, inkOn } from '../lib/color';
import { useT } from '../lib/i18n';

const PRESETS = ['#141414', '#1D4ED8', '#0F766E', '#B91C1C', '#7C3AED', '#C2410C', '#0369A1', '#15803D'];

/** Company look: logo + accent colour, shown to the company's admins and employees and on their certificates. */
export default function BrandingEditor() {
  const t = useT();
  const { user } = useAuth();
  const { refresh } = useBranding();
  const params = useParams();
  const companyId = params.id || user.company;
  const [b, setB] = useState(null);
  const [color, setColor] = useState('');
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const input = useRef();

  useEffect(() => {
    api.get(`/branding/${companyId}`).then(({ data }) => { setB(data.branding); setColor(data.branding.accentColor || ''); }).catch((e) => setMsg({ err: errorMessage(e) }));
  }, [companyId]);

  if (!b) return msg.err ? <div className="page"><ErrorBox>{msg.err}</ErrorBox></div> : <PageSkeleton variant="detail" />;
  const valid = /^#[0-9a-fA-F]{6}$/.test(color);
  const ratio = valid ? contrast(color, inkOn(color)) : null;
  const onPage = valid ? contrast(color, '#fbf8f4') : null;

  const save = async () => {
    setBusy(true); setMsg({});
    try {
      const { data } = await api.put(`/branding/${companyId}`, { accentColor: valid ? color : null });
      setB(data.branding); refresh(); setMsg({ ok: 'Saved — your team sees it the next time a page loads.' });
    } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(false); }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!/\.(png|jpe?g)$/i.test(file.name)) return setMsg({ err: 'Use a PNG or JPG image.' });
    if (file.size > 1024 * 1024) return setMsg({ err: 'The logo must be 1 MB or smaller.' });
    const fd = new FormData(); fd.append('files', file);
    setBusy(true); setMsg({});
    try { const { data } = await api.post(`/branding/${companyId}/logo`, fd); setB(data.branding); refresh(); setMsg({ ok: 'Logo updated.' }); } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(false); }
  };
  const removeLogo = async () => {
    setBusy(true);
    try { const { data } = await api.delete(`/branding/${companyId}/logo`); setB(data.branding); refresh(); } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(false); }
  };
  const previewStyle = valid ? { '--accent': color, '--accent-ink': inkOn(color) } : {};

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      {params.id && <Link to="/admin/companies" className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {t('Companies')}</Link>}
      <div className="page-head">
        <div>
          <h1>{b.name} branding</h1>
          <p>{t('Your logo and colour appear for your admins and employees, and on their certificates and exported reports.')}</p>
        </div>
      </div>
      {msg.ok && <div className="alert alert-ok" role="status">{msg.ok}</div>}
      <ErrorBox>{msg.err}</ErrorBox>
      <div className="profile-grid">
        <section className="card stack">
          <div className="row"><ImagePlus size={18} /><h2 className="h-card">{t('Logo')}</h2></div>
          <div className="logo-box">{b.logoUrl ? <img src={b.logoUrl} alt={`${b.name} logo`} /> : <span className="muted small">{t('No logo yet')}</span>}</div>
          <p className="small muted">{t('PNG or JPG, up to 1 MB. A wide logo on a transparent background works best.')}</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => input.current.click()}><ImagePlus size={15} /> {b.logoUrl ? t('Replace logo') : t('Upload logo')}</button>
            {b.logoUrl && <button className="btn btn-ghost" disabled={busy} onClick={removeLogo}><Trash2 size={15} /> {t('Remove')}</button>}
            <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg" onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </section>

        <section className="card stack">
          <div className="row"><Palette size={18} /><h2 className="h-card">{t('Accent colour')}</h2></div>
          <div className="row">
            {PRESETS.map((p) => <button key={p} type="button" className={`swatch ${color.toLowerCase() === p.toLowerCase() ? 'on' : ''}`} style={{ background: p }} aria-label={`Use ${p}`} onClick={() => setColor(p)} />)}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="color" aria-label={t('Pick a colour')} value={valid ? color : '#141414'} onChange={(e) => setColor(e.target.value)} className="color-input" />
            <input className="input" style={{ maxWidth: 140 }} value={color} placeholder={t('#1D4ED8')} onChange={(e) => setColor(e.target.value.trim())} aria-label={t('Hex colour')} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColor('')}>{t('Use default')}</button>
          </div>
          {valid && (
            <p className="small" style={{ color: ratio >= 4.5 && onPage >= 3 ? 'var(--ok)' : 'var(--warn)' }}>
              {ratio >= 4.5 && onPage >= 3 ? <CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> : <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />}
              {' '}Button text contrast {ratio.toFixed(1)}:1{onPage < 3 ? ' · very light colours are hard to see on the page — pick a darker shade' : ''}
            </p>
          )}
          <div className="brand-preview" style={previewStyle}>
            <span className="small muted">{t('Preview')}</span>
            <div className="row">
              <span className="pill-preview">{t('Dashboard')}</span>
              <button type="button" className="btn btn-primary btn-sm">{t('Submit for review')}</button>
            </div>
            <div className="brand-progress"><Progress value={64} /></div>
          </div>
          <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={busy || (color && !valid)} onClick={save}><Save size={15} /> {t('Save colour')}</button></div>
        </section>
      </div>
    </div>
  );
}
