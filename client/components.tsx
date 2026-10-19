import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Grid2X2,
  LoaderCircle,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from './api';

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="方格数学首页">
      <span className="brand-mark">
        <Grid2X2 size={23} strokeWidth={1.7} />
      </span>
      <span>
        方格<span className="brand-suffix">数学</span>
        <small>班级作业空间</small>
      </span>
    </Link>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={18} aria-hidden="true" />;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Spinner /> 正在加载…
    </div>
  );
}
export function ErrorPanel({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <AlertCircle size={34} />
      <h2>{error instanceof ApiError && error.status === 401 ? '请重新登录' : '暂时无法加载'}</h2>
      <p>{error.message}</p>
      {error instanceof ApiError && error.status === 401 ? (
        <a className="button primary" href="/login">
          前往登录
        </a>
      ) : (
        retry && (
          <button className="button secondary" onClick={retry}>
            重新加载
          </button>
        )
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <BookOpen size={38} strokeWidth={1.3} />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  back,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <div className="page-heading">
      {back && (
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} />
          返回{back.includes('students') ? '班级学生' : '作业列表'}
        </Link>
      )}
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span />
      {children}
    </span>
  );
}
export function Progress({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label?: string;
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label ?? '完成进度'}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total || 1}
    >
      <div style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
    </div>
  );
}
export function StatCard({
  label,
  value,
  unit,
  icon,
  detail,
  tone = 'green',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon: ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="关闭"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function InlineError({ message }: { message: string }) {
  return message ? (
    <div className="inline-error" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (message) {
      const id = window.setTimeout(() => setMessage(''), 4500);
      return () => clearTimeout(id);
    }
  }, [message]);
  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button className="icon-button" onClick={() => setMessage('')} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
const DraftExitContext = createContext<{
  register: (save: (() => Promise<void>) | null, allowExit?: () => void) => void;
  ensureSaved: () => Promise<void>;
  allowExit: () => void;
}>(null!);
export function DraftExitProvider({ children }: { children: ReactNode }) {
  const save = useRef<(() => Promise<void>) | null>(null);
  const allow = useRef<(() => void) | undefined>(undefined);
  const value = useRef({
    register: (callback: (() => Promise<void>) | null, allowExit?: () => void) => {
      save.current = callback;
      allow.current = allowExit;
    },
    ensureSaved: async () => {
      await save.current?.();
    },
    allowExit: () => {
      allow.current?.();
    },
  });
  return <DraftExitContext.Provider value={value.current}>{children}</DraftExitContext.Provider>;
}
export const useDraftExit = () => useContext(DraftExitContext);
export function SignInAgain() {
  return (
    <div className="info-strip">
      <p>本页尚未保存的答案仍保留。请在新页面登录本页原账号，再回到这里重试保存。</p>
      <a className="text-link" href="/login?reauth=1" target="_blank" rel="noopener noreferrer">
        在新页面重新登录
      </a>
    </div>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ChevronRight size={16} />
    </Link>
  );
}
