import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { downloadFeedbackDocx, downloadFeedbackPdf } from '../api/files';
import { useAuth } from '../context/AuthContext';
import FeedbackView from '../components/FeedbackView';
import { Loader, ErrorBox, PageSkeleton } from '../components/ui';
import { useT } from '../lib/i18n';

/** Employee-facing feedback page (and printable view). */
export default function FeedbackPage() {
  const t = useT();
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/submissions/${id}`);
  const { user } = useAuth();
  const staff = ['super_admin', 'instructor'].includes(user.role);

  if (loading) return <PageSkeleton variant="detail" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const sub = data.submission;

  return (
    <div className="page fb-page">
      <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
        <Link to={`/assignments/${sub.assignment?._id || sub.assignment}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}>
          <ArrowLeft size={15} /> {t('Back to assignment')}
        </Link>
        <span className="spacer" />
        {sub.final && staff && (
          <button className="btn" onClick={() => downloadFeedbackDocx(sub._id)}>
            <FileDown size={16} /> Word
          </button>
        )}
        {sub.final && (
          <button className="btn btn-primary" onClick={() => downloadFeedbackPdf(sub._id)}>
            <FileDown size={16} /> {t('Download PDF')}
          </button>
        )}
      </div>
      {sub.final ? (
        <div className="card fb-sheet"><FeedbackView sub={sub} fb={sub.final} /></div>
      ) : (
        <div className="card empty"><h3>{t('Feedback isn’t ready yet')}</h3><p>{t('Your instructor is still reviewing this submission.')}</p></div>
      )}
    </div>
  );
}
