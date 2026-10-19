import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleCheck,
  CloudCheck,
  FileCheck2,
  Flag,
  Lightbulb,
  LockKeyhole,
  PencilLine,
  Save,
  Send,
  Target,
  Trophy,
} from 'lucide-react';
import type { Answers, StudentAssignment, StudentDetail, Work } from '../shared/types';
import { api, ApiError, errorMessage, useResource } from './api';
import { useAuth } from './auth';
import {
  Badge,
  EmptyState,
  ErrorPanel,
  InlineError,
  Loading,
  Modal,
  PageHeading,
  Progress,
  Spinner,
  StatCard,
  TextLink,
  useDraftExit,
  useToast,
  SignInAgain,
} from './components';
import { formatDate, formatTime, isExpired, statusInfo, topicName } from './utils';

export function StudentHome() {
  const { auth } = useAuth();
  const { data, error, reload } = useResource<{ assignments: StudentAssignment[] }>(
    '/student/assignments',
  );
  const [filter, setFilter] = useState('all');
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pending = data.assignments.filter(
    (a) => a.status !== 'submitted' && !isExpired(a.deadline),
  );
  const submitted = data.assignments.filter((a) => a.status === 'submitted');
  const average = submitted.length
    ? Math.round((submitted.reduce((sum, a) => sum + a.score!, 0) / submitted.length) * 10) / 10
    : null;
  const shown = data.assignments
    .filter(
      (a) =>
        filter === 'all' ||
        (filter === 'pending' ? a.status !== 'submitted' : a.status === 'submitted'),
    )
    .sort((a, b) => {
      const priority = (item: StudentAssignment) =>
        item.status === 'submitted' ? 2 : isExpired(item.deadline) ? 1 : 0;
      return (
        priority(a) - priority(b) || new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    });
  return (
    <>
      <PageHeading
        eyebrow="MY LEARNING / 我的学习"
        title={`${auth!.user.name}，今天也进步一点。`}
        description={
          pending.length
            ? `有 ${pending.length} 份练习等你完成。准备好，就从一题开始吧。`
            : '今天的练习都安排好了。也可以回顾已经完成的作业。'
        }
      />
      <div className="stats-grid three">
        <StatCard
          label="待完成"
          value={pending.length}
          unit="份"
          icon={<PencilLine size={18} />}
          detail="记得在截止前正式提交"
          tone="blue"
        />
        <StatCard
          label="已完成"
          value={submitted.length}
          unit="份"
          icon={<FileCheck2 size={18} />}
          detail="每一份认真，都是进步"
        />
        <StatCard
          label="我的平均分"
          value={average ?? '—'}
          unit="分"
          icon={<Target size={18} />}
          detail="来自已正式提交的作业"
          tone="violet"
        />
      </div>
      <div className="dashboard-columns">
        <section className="assignment-section">
          <div className="section-heading">
            <h2>
              我的作业 <span className="count-label">{data.assignments.length}</span>
            </h2>
            <button className="subtle-button" onClick={reload}>
              刷新列表
            </button>
          </div>
          <div className="tabs" role="group" aria-label="筛选我的作业">
            {[
              ['all', '全部作业'],
              ['pending', '未提交'],
              ['submitted', '已完成'],
            ].map(([key, label]) => (
              <button
                className={filter === key ? 'active' : ''}
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="assignment-list">
            {shown.length ? (
              shown.map((a) => <StudentAssignmentCard assignment={a} key={a.id} />)
            ) : (
              <EmptyState
                title={data.assignments.length ? '这里暂时没有作业' : '练习正在准备中'}
                description={
                  data.assignments.length
                    ? '切换分类，看看其他练习吧。'
                    : '老师发布新作业后，会显示在这里。'
                }
              />
            )}
          </div>
        </section>
        <aside className="dashboard-aside">
          <div className="student-note">
            <span className="eyebrow">给认真练习的你</span>
            <div className="student-note-symbol" aria-hidden="true">
              a<span>+</span>b
            </div>
            <h2>
              慢慢想，
              <br />
              你能解开这一题。
            </h2>
            <p>
              做不完可以先保存草稿，
              <br />
              下次回来，从这里继续。
            </p>
          </div>
          <div className="quick-guide">
            <h3>
              <Lightbulb size={17} />
              练习小提醒
            </h3>
            <p className="guide-paragraph">
              草稿保存后还可以修改。只有点击「正式提交」，才会批改和计分。
            </p>
            <p className="guide-paragraph">提交后记得看看错题。找到原因，比一次全对更重要。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
function StudentAssignmentCard({ assignment: a }: { assignment: StudentAssignment }) {
  const status = statusInfo(a.status, a.deadline);
  const submitted = a.status === 'submitted';
  const expired = isExpired(a.deadline);
  return (
    <article className="assignment-card">
      <div className="assignment-card-top">
        <span className={`assignment-icon ${a.topicIds.includes('mixed100') ? 'violet' : 'green'}`}>
          <span>
            {a.topicIds.includes('mixed100') ? '÷' : a.topicIds.includes('multiply20') ? '×' : '+'}
          </span>
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <Link
        className="assignment-title"
        to={`/student/assignments/${a.id}${submitted ? '/result' : ''}`}
      >
        <h3>{a.title}</h3>
      </Link>
      <div className="topic-tags">
        {a.topicIds.map((id) => (
          <span key={id}>{topicName(id)}</span>
        ))}
        <span>{a.questionCount} 道题</span>
      </div>
      <div className="assignment-deadline">
        <CalendarClock size={15} />
        <time dateTime={a.deadline}>{formatDate(a.deadline)} 截止</time>
      </div>
      <div className="assignment-progress">
        <div>
          <span>{submitted ? '本次得分' : '作答进度'}</span>
          <strong>
            {submitted ? `${a.score} 分` : a.answered}
            {!submitted && <span> / {a.questionCount} 道</span>}
          </strong>
        </div>
        <Progress
          value={submitted ? a.score! : a.answered}
          total={submitted ? 100 : a.questionCount}
        />
      </div>
      <div className="assignment-card-bottom">
        <span>
          {submitted
            ? '已自动批改'
            : expired
              ? '截止后仅可查看'
              : a.status === 'draft'
                ? '草稿已保存'
                : '准备好就开始吧'}
        </span>
        <TextLink to={`/student/assignments/${a.id}${submitted ? '/result' : ''}`}>
          {submitted
            ? '查看结果'
            : expired
              ? '查看作业'
              : a.status === 'draft'
                ? '继续作答'
                : '开始作答'}
        </TextLink>
      </div>
    </article>
  );
}

function serializeAnswers(answers: Answers) {
  return JSON.stringify(
    Object.entries(answers)
      .map(([id, value]) => [id, value.trim()] as const)
      .filter(([, value]) => value !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
function useDraft(id: string, initial: Work, disabled: boolean) {
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const answersRef = useRef(answers);
  const revision = useRef(initial.revision);
  const saved = useRef(serializeAnswers(initial.answers));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty = () => serializeAnswers(answersRef.current) !== saved.current;
  const persist = useCallback(() => {
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        const snapshot = { ...answersRef.current };
        const serialized = serializeAnswers(snapshot);
        if (serialized === saved.current) {
          if (mounted.current) setSaveState('saved');
          return;
        }
        if (mounted.current) {
          setSaveState('saving');
          setError('');
          setNeedsLogin(false);
        }
        function acknowledge(work: Work) {
          revision.current = work.revision;
          saved.current = serialized;
          if (mounted.current) {
            setSavedAt(work.updatedAt);
            setError('');
            setNeedsLogin(false);
            setSaveState(dirty() ? 'dirty' : 'saved');
          }
        }
        try {
          const data = await api<{ work: Work }>(`/student/assignments/${id}/draft`, {
            method: 'PUT',
            body: { answers: snapshot, revision: revision.current },
          });
          acknowledge(data.work);
        } catch (error) {
          if (error instanceof ApiError && (error.status === 0 || error.status === 409)) {
            try {
              const latest = await api<StudentDetail>(`/student/assignments/${id}`);
              if (
                !latest.work.submittedAt &&
                latest.work.revision >= revision.current &&
                serializeAnswers(latest.work.answers) === serialized
              ) {
                acknowledge(latest.work);
                return;
              }
            } catch {
              /* Retain the original save error if recovery also fails. */
            }
          }
          if (mounted.current) {
            setSaveState('error');
            setError(errorMessage(error));
            setNeedsLogin(error instanceof ApiError && error.status === 401);
          }
          throw error;
        }
      });
    queue.current = task;
    return task;
  }, [id]);
  function change(questionId: string, value: string) {
    const next = { ...answersRef.current };
    if (value === '') delete next[questionId];
    else next[questionId] = value;
    answersRef.current = next;
    setAnswers(next);
    setSaveState(dirty() ? 'dirty' : 'saved');
    setError('');
  }
  useEffect(() => {
    if (disabled || !dirty()) return;
    const timer = window.setTimeout(() => {
      void persist().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, disabled, persist]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return {
    answers,
    answersRef,
    revision,
    change,
    dirty,
    persist,
    saveState,
    savedAt,
    error,
    needsLogin,
  };
}

export function AssignmentPage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<StudentDetail>(`/student/assignments/${id}`);
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (data.work.submittedAt) return <Navigate to={`/student/assignments/${id}/result`} replace />;
  return <WorkingSheet key={data.assignment.id} data={data} />;
}
function WorkingSheet({ data }: { data: StudentDetail }) {
  const a = data.assignment;
  const [now, setNow] = useState(Date.now());
  const expired = now >= new Date(a.deadline).getTime();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitNeedsLogin, setSubmitNeedsLogin] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const submitted = useRef(false);
  const toast = useToast();
  const navigate = useNavigate();
  const draft = useDraft(a.id, data.work, expired || submitting);
  const { register } = useDraftExit();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draft.dirty() && !submitted.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    register(draft.persist, () => {
      submitted.current = true;
    });
    return () => register(null);
  }, [register, draft.persist]);
  const answered = Object.values(draft.answers).filter((value) => value.trim()).length;
  async function saveManual() {
    try {
      await draft.persist();
      toast('草稿已保存，还没有正式提交');
    } catch {
      /* persistent inline error */
    }
  }
  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    setSubmitNeedsLogin(false);
    function showResult() {
      submitted.current = true;
      setConfirming(false);
      toast('作业已提交并完成批改');
      navigate(`/student/assignments/${a.id}/result`, { replace: true });
    }
    try {
      await draft.persist();
      await api(`/student/assignments/${a.id}/submit`, {
        method: 'POST',
        body: { answers: draft.answersRef.current, revision: draft.revision.current },
      });
      showResult();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status === 409)) {
        try {
          const latest = await api<StudentDetail>(`/student/assignments/${a.id}`);
          if (latest.work.submittedAt) {
            showResult();
            return;
          }
        } catch {
          /* Keep the original error and the student's in-memory answers. */
        }
      }
      setSubmitError(errorMessage(error));
      setSubmitNeedsLogin(error instanceof ApiError && error.status === 401);
    } finally {
      setSubmitting(false);
    }
  }
  async function leave() {
    setLeaving(true);
    try {
      if (!expired) await draft.persist();
      blocker.proceed?.();
    } catch {
      /* remain on sheet */
    } finally {
      setLeaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ONE QUESTION AT A TIME / 认真练习"
        title={a.title}
        description={`${a.questionCount} 道题 · 每题 ${100 / a.questionCount} 分 · ${a.topicIds.map(topicName).join(' · ')}`}
        back="/student"
        action={
          <Badge tone={expired ? 'neutral' : 'blue'}>
            {expired ? '已截止 · 仅可查看' : '正在作答'}
          </Badge>
        }
      />
      <div
        className={`save-banner ${draft.saveState === 'error' ? 'save-error' : ''}`}
        aria-live="polite"
      >
        <span>
          {draft.saveState === 'saving' ? (
            <Spinner />
          ) : draft.saveState === 'error' ? (
            <Flag size={17} />
          ) : (
            <CloudCheck size={18} />
          )}
          {expired
            ? '作业已截止，以下为当前答案。'
            : draft.saveState === 'saving'
              ? '正在保存草稿…'
              : draft.saveState === 'error'
                ? '草稿未保存，请重试'
                : draft.saveState === 'dirty'
                  ? '有修改待保存，稍后自动保存'
                  : draft.savedAt
                    ? `草稿已保存于 ${formatTime(draft.savedAt)}`
                    : '填写后自动保存，也可以手动保存草稿'}
        </span>
        <span className="save-banner-note">保存草稿 ≠ 正式提交</span>
      </div>
      <InlineError message={draft.error} />
      {draft.needsLogin && <SignInAgain />}
      <div className="worksheet-layout">
        <section className="worksheet">
          <div className="worksheet-heading">
            <div>
              <span className="eyebrow">练习本</span>
              <h2>仔细算一算</h2>
            </div>
            <span className="muted text-small">
              {expired ? '已保存的答案' : '算出结果，填写在方框里'}
            </span>
          </div>
          <div className="question-grid">
            {data.questions.map((q, i) => (
              <div
                className={`question-item ${draft.answers[q.id]?.trim() ? 'has-answer' : ''}`}
                key={q.id}
                id={`question-${q.position}`}
              >
                <span className="question-number">{String(q.position).padStart(2, '0')}</span>
                <label htmlFor={`answer-${q.id}`} className="equation">
                  {q.expression} =
                </label>
                <input
                  id={`answer-${q.id}`}
                  aria-label={`第 ${q.position} 题答案`}
                  className="answer-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={20}
                  placeholder="?"
                  value={draft.answers[q.id] ?? ''}
                  disabled={expired || submitting}
                  onChange={(event) => draft.change(q.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      document.getElementById(`answer-${data.questions[i + 1]?.id}`)?.focus();
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div className="worksheet-bottom">
            <Lightbulb size={17} />
            {expired
              ? '未正式提交的作业不计分，老师可以查看已保存的草稿。'
              : '慢慢想，认真算。按回车键可以跳到下一题。'}
          </div>
          {!expired && (
            <div className="worksheet-actions">
              <span>
                已填写 {answered} / {a.questionCount} 道，检查好就可以提交了。
              </span>
              <button
                className="button secondary"
                onClick={saveManual}
                disabled={draft.saveState === 'saving' || submitting}
              >
                <Save size={16} />
                保存当前草稿
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setSubmitError('');
                  setConfirming(true);
                }}
                disabled={submitting}
              >
                <Send size={16} />
                检查并提交
              </button>
            </div>
          )}
        </section>
        <aside className="answer-sidebar">
          <div className="answer-summary">
            <h2>本次练习</h2>
            <div className="answered-count">
              <strong>{answered}</strong>
              <span>/ {a.questionCount} 道已填写</span>
            </div>
            <Progress value={answered} total={a.questionCount} />
            <div className="question-navigator" aria-label="题号导航">
              {data.questions.map((q) => (
                <a
                  key={q.id}
                  href={`#question-${q.position}`}
                  className={draft.answers[q.id]?.trim() ? 'filled' : ''}
                  aria-label={`跳到第 ${q.position} 题`}
                >
                  {q.position}
                </a>
              ))}
            </div>
            <div className="deadline-note">
              <CalendarClock size={17} />
              <div>
                截止时间<strong>{formatDate(a.deadline, true)}</strong>
              </div>
            </div>
            {!expired ? (
              <>
                <button
                  className="button secondary"
                  onClick={saveManual}
                  disabled={draft.saveState === 'saving' || submitting}
                >
                  <Save size={17} />
                  保存草稿
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    setSubmitError('');
                    setConfirming(true);
                  }}
                  disabled={submitting}
                >
                  <Send size={17} />
                  正式提交
                </button>
                <p className="muted text-small">
                  提交后立即批改，答案不能再修改。关闭页面前，请确认草稿已保存。
                </p>
              </>
            ) : (
              <Link className="button secondary" to="/student">
                <ArrowLeft size={16} />
                返回我的作业
              </Link>
            )}
          </div>
        </aside>
      </div>
      {confirming && (
        <Modal title="准备正式提交了吗？" onClose={() => setConfirming(false)} busy={submitting}>
          <div className="submit-confirm-icon">
            <Send size={26} />
          </div>
          <p className="confirm-copy">
            已填写{' '}
            <strong>
              {answered} / {a.questionCount}
            </strong>{' '}
            道题。
            {answered < a.questionCount && (
              <span className="wrong-answer">
                还有 {a.questionCount - answered} 道未填写，将按错误计分。
              </span>
            )}
          </p>
          <p className="muted">正式提交后会立即批改，答案不能再修改。</p>
          <InlineError message={submitError} />
          {submitNeedsLogin && <SignInAgain />}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              继续检查
            </button>
            <button className="button primary" onClick={submit} disabled={submitting}>
              {submitting ? <Spinner /> : <Check size={17} />}
              {submitting ? '正在提交…' : '确认正式提交'}
            </button>
          </div>
        </Modal>
      )}
      {blocker.state === 'blocked' && (
        <Modal
          title={expired ? '离开这份作业？' : '先保存，再离开'}
          onClose={() => blocker.reset?.()}
          busy={leaving}
        >
          <p className="muted">
            {expired
              ? '作业已经截止，尚未保存的修改无法再上传。离开后将以服务器已保存的草稿为准。'
              : '还有答案未保存。保存成功后会自动前往刚才选择的页面。'}
          </p>
          <InlineError message={draft.error} />
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => blocker.reset?.()}
              disabled={leaving}
            >
              留在这里
            </button>
            <button className="button primary" onClick={leave} disabled={leaving}>
              {leaving && <Spinner />}
              {expired ? '离开页面' : '保存并离开'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ResultPage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<StudentDetail>(`/student/assignments/${id}`);
  const [view, setView] = useState<'wrong' | 'all'>('wrong');
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (!data.work.submittedAt) return <Navigate to={`/student/assignments/${id}`} replace />;
  const wrong = data.questions.filter((q) => !q.correct);
  const shown = view === 'wrong' ? wrong : data.questions;
  return (
    <>
      <PageHeading
        eyebrow="EVERY STEP COUNTS / 练习反馈"
        title="认真完成，就是进步。"
        description={`${data.assignment.title} · ${formatDate(data.work.submittedAt, true)} 提交`}
        back="/student"
        action={<Badge tone="green">已提交 · 已批改</Badge>}
      />
      <div className="result-hero">
        <div className="result-score-block">
          <span className="eyebrow">本次作业得分</span>
          <div className="result-score">
            {data.work.score}
            <small>分</small>
          </div>
          <span className="result-caption">满分 100 分 · 规则自动批改</span>
        </div>
        <div className="result-message">
          <span className="result-icon">
            {wrong.length === 0 ? (
              <Trophy size={30} strokeWidth={1.4} />
            ) : (
              <CircleCheck size={30} strokeWidth={1.4} />
            )}
          </span>
          <h2>{wrong.length === 0 ? '全部答对，继续保持！' : '把错题弄懂，再前进一步。'}</h2>
          <p>
            答对 <strong>{data.work.correctCount}</strong> 道，共{' '}
            <strong>{data.assignment.questionCount}</strong> 道。
            {wrong.length > 0
              ? `下面有 ${wrong.length} 道题值得再想一想。`
              : '每一份认真，都值得一个大大的勾。'}
          </p>
          <span className="result-lock">
            <LockKeyhole size={13} />
            作业已正式提交，答案已锁定
          </span>
        </div>
      </div>
      <div className="panel result-panel">
        <div className="section-heading">
          <h2>
            {view === 'wrong' ? '错题回顾' : '全部题目'}{' '}
            <span className="count-label">{shown.length}</span>
          </h2>
          <div className="segmented">
            <button
              className={view === 'wrong' ? 'active' : ''}
              aria-pressed={view === 'wrong'}
              onClick={() => setView('wrong')}
            >
              只看错题
            </button>
            <button
              className={view === 'all' ? 'active' : ''}
              aria-pressed={view === 'all'}
              onClick={() => setView('all')}
            >
              全部题目
            </button>
          </div>
        </div>
        {shown.length ? (
          <div className="review-question-grid">
            {shown.map((q) => (
              <article
                className={`review-question ${q.correct ? 'is-correct' : 'is-wrong'}`}
                key={q.id}
              >
                <div className="review-question-top">
                  <span className="question-number">第 {q.position} 题</span>
                  <Badge tone={q.correct ? 'green' : 'red'}>
                    {q.correct ? '正确' : '再想一想'}
                  </Badge>
                </div>
                <div className="review-equation equation">{q.expression} = ?</div>
                <div className="answer-comparison">
                  <div>
                    <span>我的答案</span>
                    <strong className={q.correct ? 'correct-answer' : 'wrong-answer'}>
                      {data.work.answers[q.id] || '未作答'}
                    </strong>
                  </div>
                  <div>
                    <span>正确答案</span>
                    <strong className="correct-answer">{q.answer}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="这次没有错题"
            description="每一道都算对了，真棒！可以切换到全部题目回顾答卷。"
          >
            <span className="all-correct-stamp">
              <Check size={25} />
              全对
            </span>
          </EmptyState>
        )}
      </div>
      <div className="result-bottom">
        <Link className="button secondary" to="/student">
          <ArrowLeft size={16} />
          返回我的作业
        </Link>
        <p className="muted text-small">成绩与答卷已保存，下次登录仍可查看。</p>
      </div>
    </>
  );
}
