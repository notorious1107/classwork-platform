import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useRouteError,
  Link,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider, Loading, DraftExitProvider } from './components';
import { Login } from './Login';
import { ProtectedLayout } from './Layout';
import {
  TeacherHome,
  PublishAssignment,
  StudentsPage,
  TeacherAssignmentPage,
  TeacherReviewPage,
} from './Teacher';
import { StudentHome, AssignmentPage, ResultPage } from './Student';
import './styles.css';

function Home() {
  const { auth, loading } = useAuth();
  return loading ? <Loading /> : <Navigate to={auth ? `/${auth.user.role}` : '/login'} replace />;
}
function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <div className="empty-state">
      <h1>页面暂时无法打开</h1>
      <p>请刷新页面重试，或返回作业空间。</p>
      <Link className="button primary" to="/">
        返回首页
      </Link>
    </div>
  );
}
const router = createBrowserRouter([
  { path: '/', element: <Home />, errorElement: <RouteError /> },
  { path: '/login', element: <Login />, errorElement: <RouteError /> },
  {
    path: '/teacher',
    element: <ProtectedLayout role="teacher" />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TeacherHome /> },
      { path: 'new', element: <PublishAssignment /> },
      { path: 'students', element: <StudentsPage /> },
      { path: 'assignments/:id', element: <TeacherAssignmentPage /> },
      { path: 'assignments/:id/students/:studentId', element: <TeacherReviewPage /> },
    ],
  },
  {
    path: '/student',
    element: <ProtectedLayout role="student" />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <StudentHome /> },
      { path: 'assignments/:id', element: <AssignmentPage /> },
      { path: 'assignments/:id/result', element: <ResultPage /> },
    ],
  },
  {
    path: '*',
    element: (
      <div className="empty-state">
        <h1>没有找到这个页面</h1>
        <Link className="button primary" to="/">
          返回首页
        </Link>
      </div>
    ),
  },
]);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <ToastProvider>
      <DraftExitProvider>
        <RouterProvider router={router} />
      </DraftExitProvider>
    </ToastProvider>
  </AuthProvider>,
);
