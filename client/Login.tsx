import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, BookOpen, PencilLine } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth';
import { errorMessage, useResource } from './api';
import { Brand, InlineError, Loading, Spinner } from './components';

export function Login() {
  const { auth, loading, error: authError, login } = useAuth();
  const [params] = useSearchParams();
  const reauth = params.get('reauth') === '1';
  const config = useResource<{ demo: boolean }>('/config');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const data = await login(String(form.get('username')), String(form.get('password')));
      navigate(`/${data.user.role}`, { replace: true });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (auth && !reauth) return <Navigate to={`/${auth.user.role}`} replace />;
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="login-story-content">
          <span className="login-eyebrow">一个班级，一起进步</span>
          <h1>
            把每一小步，
            <br />
            写成<span>大进步。</span>
          </h1>
          <p>
            从一份练习开始，让布置、作答和反馈
            <br className="desktop-only" />
            在同一个地方自然发生。
          </p>
          <div className="notebook-illustration" aria-hidden="true">
            <div className="notebook-top">
              <span>今天，也有一点进步</span>
              <PencilLine size={18} />
            </div>
            <div className="notebook-sum">
              8 <span>+</span> 7 <span>=</span> <b>15</b>
              <span className="notebook-check">
                <Check size={27} />
              </span>
            </div>
            <div className="notebook-sum">
              6 <span>×</span> 3 <span>=</span> <b>18</b>
              <span className="notebook-check">
                <Check size={27} />
              </span>
            </div>
            <div className="notebook-bottom">
              <span>认真思考的你，很棒。</span>
              <span>✦</span>
            </div>
          </div>
          <div className="login-features">
            <span>
              <BookOpen size={16} />
              按知识点练习
            </span>
            <span>
              <Check size={16} />
              提交即获反馈
            </span>
          </div>
        </div>
        <small className="login-copyright">方格数学 · 为班级的每一次进步</small>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <span className="eyebrow">欢迎回到方格</span>
          <h2>登录你的作业空间</h2>
          <p className="muted">
            {auth && reauth
              ? `当前浏览器登录为${auth.user.name}。重新登录会切换账号。`
              : '教师与学生使用各自的账号登录。'}
          </p>
          <form className="form-stack login-form" onSubmit={submit}>
            <label>
              账号
              <input
                name="username"
                autoComplete="username"
                placeholder="请输入账号"
                required
                minLength={3}
                maxLength={24}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                required
                maxLength={72}
              />
            </label>
            <InlineError message={error || authError} />
            <button className="button primary button-lg" disabled={busy}>
              {busy ? <Spinner /> : null}
              {busy ? '正在登录…' : '登录'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-help">
            <span className="help-dot">?</span>
            <p>
              学生账号由教师创建。
              <br />
              忘记密码时，请联系本班教师重置。
            </p>
          </div>
          {config.data?.demo && (
            <details className="demo-details">
              <summary>首次体验？查看演示账号</summary>
              <div>
                <p>
                  教师：<code>teacher</code> / <code>Teacher123!</code>
                </p>
                <p>
                  学生：<code>student01</code> / <code>Student123!</code>
                </p>
                <small>仅首次启用演示数据时有效；正式使用请修改密码。</small>
              </div>
            </details>
          )}
        </div>
        <div className="login-bottom-note">一题一题来，答案会越来越清楚。</div>
      </section>
    </div>
  );
}
