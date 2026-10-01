import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/global.css';
import { AuthProvider, useAuth, can } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { I18nProvider } from './lib/i18n';
import QuizResults from './pages/QuizResults';
import Certificates from './pages/Certificates';
import Verify from './pages/Verify';
import BrandingEditor from './pages/BrandingEditor';
import Layout from './components/Layout';
import { PageSkeleton, Skeleton } from './components/ui';
import Login from './pages/Login';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import AssignmentPage from './pages/AssignmentPage';
import AssignmentEditor from './pages/AssignmentEditor';
import ReviewQueue from './pages/ReviewQueue';
import ReviewDetail from './pages/ReviewDetail';
import TeamDashboard from './pages/TeamDashboard';
import People from './pages/People';
import FeedbackPage from './pages/FeedbackPage';
import Companies from './pages/admin/Companies';
import Support from './pages/Support';
import QuizPage from './pages/QuizPage';
import ReportPage from './pages/ReportPage';
import CourseReports from './pages/CourseReports';
import QuizEditor from './pages/QuizEditor';
import SupportTicket from './pages/SupportTicket';
import Instructors from './pages/admin/Instructors';
import PlatformSettings from './pages/admin/Settings';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ForceChangePassword from './pages/ForceChangePassword';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import SharedReports from './pages/SharedReports';

function Protected({ children, allow }) {
  const { user, booting, signedOut } = useAuth();
  const loc = useLocation();
  if (booting) return (
    <div className="boot-shell" role="status" aria-label="Loading">
      <aside>{[160, 120, 140, 110].map((w, i) => <Skeleton key={i} w={i ? w : 120} h={i ? 18 : 32} r={i ? 999 : 10} />)}</aside>
      <main><PageSkeleton variant="dashboard" /></main>
    </div>
  );
  if (!user) return <Navigate to="/login" replace state={signedOut ? undefined : { from: loc.pathname + loc.search }} />;
  // Admin-created accounts must pick their own password before anything else
  if (user.mustChangePassword) return <ForceChangePassword />;
  // Client-side gating is UX only — the API enforces every permission server-side.
  if (allow && !allow(user)) return <Navigate to="/" replace />;
  return children;
}


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <AuthProvider>
      <BrandingProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify/:code" element={<Verify />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="quizzes/:id/results" element={<Protected allow={can.report}><QuizResults /></Protected>} />
            <Route path="company/branding" element={<Protected allow={can.manageTeam}><BrandingEditor /></Protected>} />
            <Route path="admin/companies/:id/branding" element={<Protected allow={can.admin}><BrandingEditor /></Protected>} />
            <Route path="reports/shared" element={<Protected allow={can.report}><SharedReports /></Protected>} />
            <Route path="courses" element={<Courses />} />
            <Route path="courses/:id" element={<CourseDetail />} />
            <Route path="courses/:courseId/assignments/new" element={<Protected allow={can.author}><AssignmentEditor /></Protected>} />
            <Route path="assignments/:id" element={<AssignmentPage />} />
            <Route path="assignments/:id/edit" element={<Protected allow={can.author}><AssignmentEditor /></Protected>} />
            <Route path="feedback/:id" element={<FeedbackPage />} />
            <Route path="quizzes/:id" element={<QuizPage />} />
            <Route path="reports" element={<Protected allow={can.report}><ReportPage /></Protected>} />
            <Route path="courses/:id/reports" element={<Protected allow={can.report}><CourseReports /></Protected>} />
            <Route path="quizzes/:id/edit" element={<Protected allow={can.author}><QuizEditor /></Protected>} />
            <Route path="courses/:courseId/quizzes/new" element={<Protected allow={can.author}><QuizEditor /></Protected>} />
            <Route path="support" element={<Support />} />
            <Route path="support/:id" element={<SupportTicket />} />
            <Route path="review" element={<Protected allow={can.grade}><ReviewQueue /></Protected>} />
            <Route path="review/:id" element={<Protected allow={can.grade}><ReviewDetail /></Protected>} />
            <Route path="team" element={<Protected allow={can.viewTeam}><TeamDashboard /></Protected>} />
            <Route path="admin/companies" element={<Protected allow={can.admin}><Companies /></Protected>} />
            <Route path="admin/instructors" element={<Protected allow={can.admin}><Instructors /></Protected>} />
            <Route path="admin/settings" element={<Protected allow={can.admin}><PlatformSettings /></Protected>} />
            <Route path="people" element={<Protected allow={can.manageTeam}><People /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrandingProvider>
      </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>
);
