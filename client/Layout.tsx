import { useState, type FormEvent } from 'react';
import {
  ClipboardList,
  Users,
  Plus,
  LogOut,
  KeyRound,
  ArrowUpRight,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '../shared/types';
import { useAuth } from './auth';
import { api, errorMessage } from './api';
import { Brand, InlineError, Loading, Modal, Spinner, useToast, useDraftExit } from './components';

export function ProtectedLayout({ role }: { role: Role }) {
  const { auth, loading } = useAuth();
  if (loading) return <Loading />;
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.user.role !== role) return <Navigate to={`/${auth.user.role}`} replace />;
  return <Layout />;
}
function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { ensureSaved, allowExit } = useDraftExit();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const teacher = auth!.user.role === 'teacher';
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await ensureSaved();
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLoggingOut(false);
      return;
    }
    await finishLogout();
  }
  async function finishLogout() {
    setLoggingOut(true);
    try {
      await logout();
      allowExit();
      setLogoutError('');
      navigate('/login');
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="class-card">
          <span className="class-card-icon">
            <BookOpen size={20} />
          </span>
          <div>
            <strong>{auth!.classroom.name}</strong>
            <small>{teacher ? '教师工作台' : '我的学习空间'}</small>
          </div>
          <span className="class-dot" />
        </div>
        <div className="nav-label">{teacher ? '教学管理' : '我的学习'}</div>
        <nav className="main-nav" aria-label="主导航">
          <NavLink to={teacher ? '/teacher' : '/student'} end>
            <ClipboardList size={19} />
            {teacher ? '班级作业' : '我的作业'}
          </NavLink>
          {teacher && (
            <>
              <NavLink to="/teacher/students">
                <Users size={19} />
                班级学生
              </NavLink>
              <NavLink to="/teacher/new">
                <Plus size={19} />
                发布作业
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-grid">
            + −<br />× ÷
          </span>
          <p>
            每天一小步，
            <br />
            数学更进一步。
          </p>
          <span>认真练习，也看见进步</span>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{auth!.user.name.slice(0, 1)}</span>
          <div>
            <strong>{auth!.user.name}</strong>
            <small>
              {teacher ? '教师' : '学生'} · {auth!.user.username}
            </small>
          </div>
          <button
            className="icon-button"
            onClick={() => setPasswordOpen(true)}
            aria-label="修改密码"
            title="修改密码"
          >
            <KeyRound size={17} />
          </button>
        </div>
        <button className="logout-button" onClick={handleLogout} disabled={loggingOut}>
          <LogOut size={16} />
          {loggingOut ? '正在退出…' : '退出登录'}
        </button>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <span className="topbar-dot" />
            {teacher ? '让每一次练习，都有回应' : '专注这一题，进步一点点'}
          </div>
          <span className="topbar-date">
            {new Intl.DateTimeFormat('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            }).format(new Date())}
          </span>
        </header>
        <main id="main" className="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>方格数学 · {auth!.classroom.name}</span>
          <span>
            <ShieldCheck size={13} />
            专属于这个班级的练习空间
          </span>
        </footer>
      </div>
      {passwordOpen && <PasswordModal onClose={() => setPasswordOpen(false)} />}
      {logoutError && (
        <Modal title="草稿尚未保存" onClose={() => setLogoutError('')} busy={loggingOut}>
          <p className="muted">
            保存失败，当前页面的答案仍保留。可以留在本页重试；仍然退出将丢弃尚未保存的修改，服务器已保存的草稿不会删除。
          </p>
          <InlineError message={logoutError} />
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setLogoutError('')}
              disabled={loggingOut}
            >
              留在本页
            </button>
            <button className="button primary" onClick={finishLogout} disabled={loggingOut}>
              {loggingOut && <Spinner />}仍然退出
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('newPassword') !== form.get('confirm')) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { oldPassword: form.get('oldPassword'), newPassword: form.get('newPassword') },
      });
      toast('密码已修改，其他设备需要重新登录');
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="修改密码" onClose={onClose} busy={busy}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted">请使用至少 8 位的新密码。</p>
        <label>
          原密码
          <input
            name="oldPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </label>
        <label>
          新密码
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </label>
        <label>
          确认新密码
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
          />
        </label>
        <InlineError message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy && <Spinner />}保存新密码
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
