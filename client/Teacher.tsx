import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Check,
  CheckCheck,
  ClipboardList,
  Clock3,
  FileCheck2,
  KeyRound,
  Plus,
  Send,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import {
  TOPICS,
  type StudentRow,
  type TeacherAssignment,
  type TeacherDetail,
  type TopicId,
  type StudentReview,
} from '../shared/types';
import { api, errorMessage, useResource } from './api';
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
  useToast,
} from './components';
import { formatDate, isExpired, localDateTime, statusInfo, topicName } from './utils';

export function TeacherHome() {
  const { auth } = useAuth();
  const { data, error, reload } = useResource<{ assignments: TeacherAssignment[] }>(
    '/teacher/assignments',
  );
  const roster = useResource<{ students: StudentRow[] }>('/teacher/students');
  const [filter, setFilter] = useState('all');
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  const open = data.assignments.filter((a) => !isExpired(a.deadline));
  const totalSubmissions = data.assignments.reduce((n, a) => n + a.submitted, 0);
  const total = data.assignments.reduce((n, a) => n + a.total, 0);
  const average = totalSubmissions
    ? Math.round((data.assignments.reduce((n, a) => n + a.scoreTotal, 0) / totalSubmissions) * 10) /
      10
    : null;
  const shown = data.assignments.filter(
    (a) => filter === 'all' || (filter === 'open' ? !isExpired(a.deadline) : isExpired(a.deadline)),
  );
  return (
    <>
      <PageHeading
        eyebrow="TEACHER’S DESK / 教师工作台"
        title={`${auth!.user.name}，今天也一起进步。`}
        description="布置一份好练习，看见每位同学的学习进度。"
        action={
          <Link className="button primary" to="/teacher/new">
            <Plus size={18} />
            发布作业
          </Link>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="班级学生"
          value={roster.data?.students.length ?? '—'}
          unit="人"
          icon={<Users size={18} />}
          detail={auth!.classroom.name}
        />
        <StatCard
          label="进行中的作业"
          value={open.length}
          unit="份"
          icon={<ClipboardList size={18} />}
          detail={`累计发布 ${data.assignments.length} 份作业`}
          tone="blue"
        />
        <StatCard
          label="累计提交"
          value={totalSubmissions}
          unit="份"
          icon={<FileCheck2 size={18} />}
          detail={`共 ${total} 份学生作业`}
          tone="amber"
        />
        <StatCard
          label="已提交平均分"
          value={average ?? '—'}
          unit="分"
          icon={<Target size={18} />}
          detail="按所有已提交答卷计算"
          tone="violet"
        />
      </div>
      <div className="dashboard-columns">
        <section className="assignment-section">
          <div className="section-heading">
            <h2>
              班级作业 <span className="count-label">{data.assignments.length}</span>
            </h2>
            <button className="subtle-button" onClick={reload}>
              刷新列表
            </button>
          </div>
          <div className="tabs" role="group" aria-label="筛选作业">
            {[
              ['all', '全部作业'],
              ['open', '进行中'],
              ['closed', '已截止'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
              >
                {label}
                {key === 'open' && <span>{open.length}</span>}
              </button>
            ))}
          </div>
          <div className="assignment-list">
            {shown.length ? (
              shown.map((assignment) => (
                <TeacherAssignmentCard key={assignment.id} assignment={assignment} />
              ))
            ) : (
              <EmptyState
                title={filter === 'all' ? '第一份练习，从这里开始' : '这里暂时没有作业'}
                description={
                  filter === 'all'
                    ? '先创建学生账号，再选好知识点发布作业。'
                    : '可以切换筛选查看其他作业。'
                }
              >
                {filter === 'all' && (
                  <Link className="button primary" to="/teacher/new">
                    <Plus size={17} />
                    发布作业
                  </Link>
                )}
              </EmptyState>
            )}
          </div>
        </section>
        <aside className="dashboard-aside">
          <div className="practice-note">
            <div className="eyebrow">小练习 · 大进步</div>
            <h2>
              让数学，
              <br />
              每天靠近一点。
            </h2>
            <div className="math-orbit" aria-hidden="true">
              <span>+</span>
              <span>×</span>
              <span>÷</span>
              <span>−</span>
              <div>
                <BookOpen size={33} strokeWidth={1.3} />
              </div>
            </div>
            <p>
              少一点重复的批改，
              <br />
              多一点对学习的关注。
            </p>
          </div>
          <div className="quick-guide">
            <h3>一份作业的旅程</h3>
            <div>
              <span>
                <Plus size={15} />
              </span>
              <p>
                <strong>选好知识点</strong>
                <small>按练习目标自动出题</small>
              </p>
            </div>
            <div>
              <span>
                <Send size={15} />
              </span>
              <p>
                <strong>发布给全班</strong>
                <small>学生保存草稿，接着完成</small>
              </p>
            </div>
            <div>
              <span>
                <CheckCheck size={15} />
              </span>
              <p>
                <strong>及时获得反馈</strong>
                <small>提交即批改，错题看得见</small>
              </p>
            </div>
            <TextLink to="/teacher/students">管理班级学生</TextLink>
          </div>
        </aside>
      </div>
    </>
  );
}
function TeacherAssignmentCard({ assignment: a }: { assignment: TeacherAssignment }) {
  const expired = isExpired(a.deadline);
  return (
    <article className="assignment-card">
      <div className="assignment-card-top">
        <span className={`assignment-icon ${a.topicIds.includes('mixed100') ? 'violet' : 'green'}`}>
          <span>
            {a.topicIds.includes('mixed100') ? '÷' : a.topicIds.includes('multiply20') ? '×' : '+'}
          </span>
        </span>
        <Badge tone={expired ? 'neutral' : 'green'}>{expired ? '已截止' : '进行中'}</Badge>
      </div>
      <Link to={`/teacher/assignments/${a.id}`} className="assignment-title">
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
          <span>提交进度</span>
          <strong>
            {a.submitted}
            <span> / {a.total} 人</span>
          </strong>
        </div>
        <Progress value={a.submitted} total={a.total} label={`${a.title}提交进度`} />
      </div>
      <div className="assignment-card-bottom">
        <span>
          平均分 <strong>{a.average ?? '—'}</strong>
          {a.average !== null && ' 分'}
        </span>
        <TextLink to={`/teacher/assignments/${a.id}`}>查看作业</TextLink>
      </div>
    </article>
  );
}

export function PublishAssignment() {
  const [topics, setTopics] = useState<TopicId[]>(['add20']);
  const [count, setCount] = useState(10);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const roster = useResource<{ students: StudentRow[] }>('/teacher/students');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(20, 0, 0, 0);
  function toggle(id: TopicId) {
    setTopics((previous) =>
      previous.includes(id) ? previous.filter((t) => t !== id) : [...previous, id],
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!topics.length) {
      setError('请至少选择一个知识点');
      return;
    }
    const form = new FormData(event.currentTarget);
    const deadline = new Date(String(form.get('deadline')));
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      setError('请选择晚于当前时间的截止时间');
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ assignment: TeacherAssignment }>('/teacher/assignments', {
        method: 'POST',
        body: {
          title: form.get('title'),
          topicIds: topics,
          questionCount: count,
          deadline: deadline.toISOString(),
        },
      });
      toast('作业已发布，学生现在可以开始练习');
      navigate(`/teacher/assignments/${data.assignment.id}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CREATE AN ASSIGNMENT / 新的练习"
        title="为班级准备一份好练习"
        description="选好知识点和题量，系统会生成同一套题目并发布给全班。"
        back="/teacher"
      />
      <form onSubmit={submit} className="publish-layout">
        <div className="form-panel">
          {roster.error && <InlineError message={roster.error.message} />}
          {roster.error && (
            <button type="button" className="text-button" onClick={roster.reload}>
              重新加载班级名单
            </button>
          )}
          {roster.data?.students.length === 0 && (
            <div className="info-strip">
              <Users size={18} />
              <p>
                班级还没有学生，请先
                <Link className="text-link" to="/teacher/students">
                  创建学生账号
                </Link>
                ，再发布作业。
              </p>
            </div>
          )}
          <section className="form-section">
            <div className="form-section-heading">
              <span>1</span>
              <div>
                <h2>这次练什么？</h2>
                <p>可选择多个知识点，题量将尽量均匀分配。</p>
              </div>
            </div>
            <fieldset className="topic-options" disabled={busy}>
              <legend className="sr-only">知识点</legend>
              {TOPICS.map((topic) => (
                <label
                  className={`topic-option ${topics.includes(topic.id) ? 'selected' : ''}`}
                  key={topic.id}
                >
                  <input
                    type="checkbox"
                    checked={topics.includes(topic.id)}
                    onChange={() => toggle(topic.id)}
                  />
                  <span className="topic-symbol">{topic.symbol}</span>
                  <span className="topic-copy">
                    <strong>{topic.name}</strong>
                    <small>{topic.description}</small>
                  </span>
                  <span className="custom-checkbox">
                    {topics.includes(topic.id) && <Check size={14} />}
                  </span>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="form-section">
            <div className="form-section-heading">
              <span>2</span>
              <div>
                <h2>安排练习量</h2>
                <p>每题等分，满分 100 分。</p>
              </div>
            </div>
            <fieldset className="count-options" disabled={busy}>
              <legend className="sr-only">题量</legend>
              {[10, 20, 50].map((value) => (
                <label key={value} className={count === value ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="count"
                    value={value}
                    checked={count === value}
                    onChange={() => setCount(value)}
                  />
                  <strong>
                    {value}
                    <span> 道</span>
                  </strong>
                  <small>
                    {value === 10 ? '轻松巩固' : value === 20 ? '标准练习' : '充分训练'}
                  </small>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="form-section">
            <div className="form-section-heading">
              <span>3</span>
              <div>
                <h2>给作业一个名字</h2>
                <p>清楚的名字能让学生更容易找到练习。</p>
              </div>
            </div>
            <div className="form-stack">
              <label>
                作业名称
                <input
                  name="title"
                  placeholder="例如：周四练习 · 20 以内加减"
                  required
                  maxLength={60}
                  disabled={busy}
                />
              </label>
              <label>
                截止时间<span className="input-hint">按当前设备的本地时间填写</span>
                <input
                  name="deadline"
                  type="datetime-local"
                  required
                  defaultValue={localDateTime(tomorrow)}
                  disabled={busy}
                />
              </label>
            </div>
          </section>
          <InlineError message={error} />
          <div className="form-bottom">
            <Link to="/teacher" className="button secondary">
              返回作业列表
            </Link>
            <button
              className="button primary"
              disabled={busy || !topics.length || !roster.data?.students.length}
            >
              {busy ? <Spinner /> : <Send size={17} />}
              {busy ? '正在发布…' : '生成并发布作业'}
            </button>
          </div>
        </div>
        <aside className="publish-summary">
          <div className="summary-heading">
            <Sparkles size={19} />
            <h2>练习安排</h2>
          </div>
          <div className="summary-row">
            <span>发布给</span>
            <strong>{roster.data ? `${roster.data.students.length} 位学生` : '正在加载…'}</strong>
          </div>
          <div className="summary-row">
            <span>题目数量</span>
            <strong>{count} 道</strong>
          </div>
          <div className="summary-row">
            <span>每题分值</span>
            <strong>{100 / count} 分</strong>
          </div>
          <div className="summary-topics">
            <span>练习知识点</span>
            {topics.length ? (
              topics.map((id) => (
                <p key={id}>
                  <Check size={14} />
                  {topicName(id)}
                </p>
              ))
            ) : (
              <p className="muted">请先选择知识点</p>
            )}
          </div>
          <div className="example-box">
            <span>题型示例</span>
            <p>{TOPICS.find((t) => t.id === topics[0])?.example ?? '选择知识点后显示'}</p>
            <small>正式题目会在发布时随机生成。</small>
          </div>
          <p className="summary-note">
            <Clock3 size={16} />
            截止后不能再保存或提交；发布后的题目和截止时间不可修改。
          </p>
          {roster.error && <InlineError message={roster.error.message} />}
          {roster.data?.students.length === 0 && (
            <div className="inline-error">
              请先<Link to="/teacher/students">创建学生账号</Link>。
            </div>
          )}
          <p className="muted text-small">
            以发布时的学生名单为准。之后创建的学生从下一份新作业开始参与。
          </p>
        </aside>
      </form>
    </>
  );
}

export function StudentsPage() {
  const { auth } = useAuth();
  const { data, error, reload } = useResource<{ students: StudentRow[] }>('/teacher/students');
  const [creating, setCreating] = useState(false);
  const [reset, setReset] = useState<StudentRow | null>(null);
  const [search, setSearch] = useState('');
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  const shown = data.students.filter((s) =>
    `${s.name} ${s.username}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="OUR CLASS / 班级学生"
        title="每一位同学，都在这里"
        description={`${auth!.classroom.name} · 共 ${data.students.length} 位学生。为学生创建账号后，把账号和初始密码告诉本人。`}
        action={
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            创建学生账号
          </button>
        }
      />
      <div className="panel">
        <div className="table-toolbar">
          <h2>学生名单</h2>
          <input
            type="search"
            className="search-input"
            placeholder="搜索姓名或账号"
            aria-label="搜索学生"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>学生</th>
                  <th>登录账号</th>
                  <th>作业完成</th>
                  <th>加入时间</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <span className="student-name">
                        <span className="avatar small">{student.name.slice(0, 1)}</span>
                        <strong>{student.name}</strong>
                      </span>
                    </td>
                    <td>
                      <code>{student.username}</code>
                    </td>
                    <td>
                      {student.submitted}
                      <span className="muted"> / {student.assigned} 份</span>
                    </td>
                    <td className="muted">{formatDate(student.createdAt)}</td>
                    <td>
                      <button className="text-button" onClick={() => setReset(student)}>
                        <KeyRound size={14} />
                        重置密码
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={search ? '没有匹配的学生' : '迎接第一位同学'}
            description={search ? '试试其他姓名或账号。' : '创建学生账号后，就可以发布班级作业了。'}
          />
        )}
      </div>
      <div className="info-strip">
        <BookOpen size={19} />
        <p>学生使用自己的账号作答，草稿和成绩各自保存。新增学生参与之后发布的新作业。</p>
      </div>
      {creating && <StudentAccountModal onClose={() => setCreating(false)} onDone={reload} />}
      {reset && (
        <StudentAccountModal student={reset} onClose={() => setReset(null)} onDone={reload} />
      )}
    </>
  );
}
function StudentAccountModal({
  student,
  onClose,
  onDone,
}: {
  student?: StudentRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(student ? `/teacher/students/${student.id}/password` : '/teacher/students', {
        method: 'POST',
        body: student
          ? { password: form.get('password') }
          : {
              name: form.get('name'),
              username: form.get('username'),
              password: form.get('password'),
            },
      });
      toast(
        student
          ? `${student.name}的密码已重置，原登录已失效`
          : '学生账号已创建，请将账号和初始密码告诉学生',
      );
      onDone();
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={student ? `重置${student.name}的密码` : '创建学生账号'}
      onClose={onClose}
      busy={busy}
    >
      <form className="form-stack" onSubmit={submit}>
        {!student && (
          <>
            <label>
              学生姓名
              <input
                name="name"
                required
                maxLength={30}
                placeholder="例如：王小禾"
                disabled={busy}
              />
            </label>
            <label>
              登录账号
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]{3,24}"
                placeholder="例如：student04"
                autoComplete="off"
                disabled={busy}
              />
              <span className="input-hint">3–24 位字母、数字或下划线，不区分大小写</span>
            </label>
          </>
        )}
        <label>
          {student ? '新密码' : '初始密码'}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            placeholder="至少 8 位"
            disabled={busy}
          />
        </label>
        <p className="muted text-small">
          {student
            ? '重置后，这名学生需要使用新密码重新登录。'
            : '学生登录后可以自行修改密码。新增学生只参与之后发布的作业。'}
        </p>
        <InlineError message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy && <Spinner />}
            {student ? '重置密码' : '创建账号'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TeacherAssignmentPage() {
  const { id } = useParams();
  const { data, error, reload } = useResource<TeacherDetail>(`/teacher/assignments/${id}`);
  const [tab, setTab] = useState('students');
  const [filter, setFilter] = useState('all');
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  const a = data.assignment;
  const students = data.students.filter(
    (s) =>
      filter === 'all' ||
      (filter === 'submitted' ? s.status === 'submitted' : s.status !== 'submitted'),
  );
  return (
    <>
      <PageHeading
        eyebrow="ASSIGNMENT / 作业详情"
        title={a.title}
        description={`${a.topicIds.map(topicName).join(' · ')} · ${a.questionCount} 道题 · ${formatDate(a.deadline, true)} 截止`}
        back="/teacher"
        action={
          <Badge tone={isExpired(a.deadline) ? 'neutral' : 'green'}>
            {isExpired(a.deadline) ? '已截止' : '进行中'}
          </Badge>
        }
      />
      <div className="stats-grid three">
        <StatCard
          label="已提交"
          value={a.submitted}
          unit="人"
          icon={<FileCheck2 size={18} />}
          detail={`全班共 ${a.total} 人`}
        />
        <StatCard
          label="未提交"
          value={a.unsubmitted}
          unit="人"
          icon={<Clock3 size={18} />}
          detail="包含未开始与已保存草稿"
          tone="amber"
        />
        <StatCard
          label="平均分"
          value={a.average ?? '—'}
          unit="分"
          icon={<Target size={18} />}
          detail="仅计算正式提交的答卷"
          tone="violet"
        />
      </div>
      <div className="panel">
        <div className="detail-tabs tabs" role="group" aria-label="作业详情视图">
          <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
            学生提交情况
          </button>
          <button
            className={tab === 'questions' ? 'active' : ''}
            onClick={() => setTab('questions')}
          >
            题目与答案 <span>{a.questionCount}</span>
          </button>
        </div>
        {tab === 'students' ? (
          <>
            <div className="table-toolbar">
              <select
                aria-label="筛选提交情况"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">全部学生（{a.total}）</option>
                <option value="submitted">已提交（{a.submitted}）</option>
                <option value="unsubmitted">未提交（{a.unsubmitted}）</option>
              </select>
              <button className="subtle-button" onClick={reload}>
                刷新进度
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>状态</th>
                    <th>已作答</th>
                    <th>得分</th>
                    <th>最近保存 / 提交</th>
                    <th>
                      <span className="sr-only">查看</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const status = statusInfo(student.status, a.deadline);
                    return (
                      <tr key={student.id}>
                        <td>
                          <strong>{student.name}</strong>
                          <small className="table-subline">{student.username}</small>
                        </td>
                        <td>
                          <Badge tone={status.tone}>
                            {student.status !== 'submitted' && isExpired(a.deadline)
                              ? `已截止 · ${student.status === 'draft' ? '草稿' : '未开始'}`
                              : status.label}
                          </Badge>
                        </td>
                        <td>
                          {student.answered}
                          <span className="muted"> / {a.questionCount}</span>
                        </td>
                        <td>
                          <strong className={student.score !== null ? 'score-inline' : 'muted'}>
                            {student.score ?? '—'}
                          </strong>
                        </td>
                        <td className="muted">
                          {student.submittedAt || student.updatedAt
                            ? formatDate((student.submittedAt || student.updatedAt)!)
                            : '尚未开始'}
                        </td>
                        <td>
                          <TextLink to={`/teacher/assignments/${a.id}/students/${student.id}`}>
                            {student.status === 'submitted'
                              ? '查看答卷'
                              : student.status === 'draft'
                                ? '查看草稿'
                                : '查看详情'}
                          </TextLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!students.length && (
              <EmptyState title="暂无符合条件的学生" description="切换筛选可查看其他学生。" />
            )}
          </>
        ) : (
          <div className="teacher-question-grid">
            {data.questions.map((q) => (
              <div className="teacher-question" key={q.id}>
                <span className="question-number">{String(q.position).padStart(2, '0')}</span>
                <span className="equation">
                  {q.expression} = <strong>{q.answer}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function TeacherReviewPage() {
  const { id, studentId } = useParams();
  const { data, error, reload } = useResource<StudentReview>(
    `/teacher/assignments/${id}/students/${studentId}`,
  );
  const [wrongOnly, setWrongOnly] = useState(false);
  if (error) return <ErrorPanel error={error} retry={reload} />;
  if (!data) return <Loading />;
  const submitted = !!data.work.submittedAt;
  const shown = wrongOnly ? data.questions.filter((q) => q.correct === false) : data.questions;
  return (
    <>
      <Link className="back-link" to={`/teacher/assignments/${id}`}>
        <ArrowLeft size={16} />
        返回作业详情
      </Link>
      <PageHeading
        eyebrow="STUDENT WORK / 学生答卷"
        title={`${data.student.name}的${submitted ? '答卷' : '草稿'}`}
        description={`${data.assignment.title} · ${data.student.username}`}
        action={
          <Badge tone={submitted ? 'green' : 'amber'}>
            {submitted ? '已提交 · 已批改' : data.work.updatedAt ? '草稿 · 未提交' : '尚未开始'}
          </Badge>
        }
      />
      <div className="review-overview">
        <div>
          <span className="muted">{submitted ? '作业得分' : '当前状态'}</span>
          <div className="review-score">
            {submitted ? data.work.score : '未提交'}
            {submitted && <small>/ 100 分</small>}
          </div>
        </div>
        <div>
          <span className="muted">{submitted ? '答对题目' : '已填写题目'}</span>
          <strong>
            {submitted
              ? data.work.correctCount
              : Object.values(data.work.answers).filter(Boolean).length}{' '}
            / {data.assignment.questionCount} 道
          </strong>
        </div>
        <div>
          <span className="muted">{submitted ? '提交时间' : '最近保存'}</span>
          <strong>
            {data.work.updatedAt
              ? formatDate((data.work.submittedAt || data.work.updatedAt)!, true)
              : '尚无保存记录'}
          </strong>
        </div>
      </div>
      {!submitted && (
        <div className="info-strip">
          <Clock3 size={18} />
          <p>这份答卷尚未正式提交，不计分、不纳入平均分。下方仅展示当前已保存的答案。</p>
        </div>
      )}
      <div className="panel">
        <div className="table-toolbar">
          <h2>逐题查看</h2>
          {submitted && (
            <button
              className={`button ${wrongOnly ? 'primary' : 'secondary'} small-button`}
              onClick={() => setWrongOnly(!wrongOnly)}
              aria-pressed={wrongOnly}
            >
              {wrongOnly
                ? '查看全部题目'
                : `只看错题（${data.assignment.questionCount - data.work.correctCount!}）`}
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>题号</th>
                <th>题目</th>
                <th>学生答案</th>
                <th>正确答案</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.id}>
                  <td className="muted">{String(q.position).padStart(2, '0')}</td>
                  <td className="equation">{q.expression} = ?</td>
                  <td className={q.correct === false ? 'wrong-answer' : ''}>
                    {q.studentAnswer || '未作答'}
                  </td>
                  <td className="correct-answer">{q.answer}</td>
                  <td>
                    {q.correct === null ? (
                      <span className="muted">未批改</span>
                    ) : (
                      <Badge tone={q.correct ? 'green' : 'red'}>
                        {q.correct ? '正确' : '错误'}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {wrongOnly && !shown.length && (
          <EmptyState title="全部答对了" description="这次练习没有错题。" />
        )}
      </div>
    </>
  );
}
