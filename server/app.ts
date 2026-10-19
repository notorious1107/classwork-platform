import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { Store, insertAssignment } from './database.js';
import { hashPassword, verifyPassword, sessionHash } from './security.js';
import { grade, isCorrect } from './math.js';
import type { Assignment, Answers, Question, Role, TopicId, User, Work } from '../shared/types.js';

interface UserRecord {
  id: string;
  class_id: string;
  username: string;
  name: string;
  role: Role;
  password_hash: string;
}
interface AssignmentRecord {
  id: string;
  title: string;
  topic_ids: string;
  question_count: number;
  deadline: string;
  created_at: string;
}
interface WorkRecord {
  answers_json: string;
  revision: number;
  updated_at: string;
  submitted_at: string | null;
  score: number | null;
  correct_count: number | null;
}
interface QuestionRecord {
  id: string;
  position: number;
  expression: string;
  topic_id: TopicId;
  answer: number;
}
interface AssignmentStats extends AssignmentRecord {
  total: number;
  submitted: number;
  average: number | null;
  score_total: number;
}
type AuthRequest = Request & { user: User; tokenHash: string };
const authRequest = (req: Request): AuthRequest => req as AuthRequest;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const cookieName = 'fg_session';
const sessionAge = 7 * 86400000;
const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,24}$/, '账号需为 3–24 位字母、数字或下划线')
  .transform((s) => s.toLowerCase());
const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位');
const answersSchema = z
  .object({
    answers: z.record(z.string(), z.string().trim().max(20, '答案最多 20 个字符')),
    revision: z.number().int().min(0),
  })
  .strict();
const publicUser = (row: UserRecord): User => ({
  id: row.id,
  classId: row.class_id,
  username: row.username,
  name: row.name,
  role: row.role,
});
const publicAssignment = (row: AssignmentRecord): Assignment => ({
  id: row.id,
  title: row.title,
  topicIds: JSON.parse(row.topic_ids),
  questionCount: row.question_count,
  deadline: row.deadline,
  createdAt: row.created_at,
});
const publicQuestion = (row: QuestionRecord): Question => ({
  id: row.id,
  position: row.position,
  expression: row.expression,
  topicId: row.topic_id,
});
const publicWork = (row: WorkRecord | undefined): Work =>
  row
    ? {
        answers: JSON.parse(row.answers_json),
        revision: row.revision,
        updatedAt: row.updated_at,
        submittedAt: row.submitted_at,
        score: row.score,
        correctCount: row.correct_count,
      }
    : {
        answers: {},
        revision: 0,
        updatedAt: null,
        submittedAt: null,
        score: null,
        correctCount: null,
      };
function answeredCount(answers: Answers) {
  return Object.values(answers).filter((value) => value.trim() !== '').length;
}
const statsQuery = `SELECT a.*, COUNT(e.student_id) AS total,
  COUNT(w.submitted_at) AS submitted, ROUND(AVG(w.score), 1) AS average, COALESCE(SUM(w.score), 0) AS score_total
  FROM assignments a LEFT JOIN assignment_students e ON e.assignment_id = a.id
  LEFT JOIN work w ON w.assignment_id = a.id AND w.student_id = e.student_id`;
const publicStats = (row: AssignmentStats) => ({
  ...publicAssignment(row),
  total: row.total,
  submitted: row.submitted,
  unsubmitted: row.total - row.submitted,
  average: row.average,
  scoreTotal: row.score_total,
});

export function createApp(options: {
  store: Store;
  secureCookies?: boolean;
  allowedOrigins?: string[];
  clientDir?: string;
  loginLimit?: number;
}) {
  const { store } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      strictTransportSecurity: options.secureCookies ? undefined : false,
      contentSecurityPolicy: {
        directives: { 'upgrade-insecure-requests': options.secureCookies ? [] : null },
      },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site')
      return next(new HttpError(403, '请从本站页面发起操作'));
    if (origin) {
      let allowed = false;
      try {
        allowed =
          new URL(origin).host === req.get('host') ||
          (options.allowedOrigins ?? []).includes(origin);
      } catch {
        /* rejected below */
      }
      if (!allowed) return next(new HttpError(403, '请求来源不受信任，请在本站操作'));
    }
    if (!req.is('application/json')) return next(new HttpError(415, '请求需要使用 JSON 格式'));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: options.secureCookies ?? false,
    path: '/',
  };

  const authenticate = (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies[cookieName];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      return next(new HttpError(401, '请先登录'));
    const tokenHash = sessionHash(token);
    const row = store.get<UserRecord>(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      tokenHash,
      Date.now(),
    );
    if (!row) return next(new HttpError(401, '登录已失效，请重新登录'));
    const expectedUser = req.get('x-classwork-user');
    if (expectedUser && expectedUser !== row.id) {
      return next(new HttpError(401, '当前浏览器账号已切换，请使用本页原账号重新登录后再试'));
    }
    authRequest(req).user = publicUser(row);
    authRequest(req).tokenHash = tokenHash;
    next();
  };
  const requireRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
    if (authRequest(req).user.role !== role)
      return next(new HttpError(403, '当前账号没有此操作权限'));
    next();
  };
  const authData = (user: User) => ({
    user,
    classroom: store.get('SELECT id, name FROM classrooms WHERE id = ?', user.classId),
    demo:
      store.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'demo')?.value ===
      'true',
  });
  const assignmentForTeacher = (id: string, user: User) => {
    const row = store.get<AssignmentStats>(
      `${statsQuery} WHERE a.id = ? AND a.class_id = ? GROUP BY a.id`,
      id,
      user.classId,
    );
    if (!row) throw new HttpError(404, '作业不存在');
    return row;
  };
  const assignmentForStudent = (id: string, user: User) => {
    const row = store.get<AssignmentRecord>(
      'SELECT a.* FROM assignments a JOIN assignment_students e ON e.assignment_id = a.id WHERE a.id = ? AND a.class_id = ? AND e.student_id = ?',
      id,
      user.classId,
      user.id,
    );
    if (!row) throw new HttpError(404, '作业不存在，或未分配给你');
    return row;
  };
  const questionsFor = (id: string) =>
    store.all<QuestionRecord>(
      'SELECT * FROM questions WHERE assignment_id = ? ORDER BY position',
      id,
    );
  const workFor = (id: string, studentId: string) =>
    store.get<WorkRecord>(
      'SELECT * FROM work WHERE assignment_id = ? AND student_id = ?',
      id,
      studentId,
    );

  app.get('/api/health', (_req, res) => {
    store.get('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.get('/api/config', (_req, res) => {
    res.json({
      demo:
        store.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'demo')?.value ===
        'true',
    });
  });
  app.post(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.loginLimit ?? 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: '登录尝试过多，请 15 分钟后再试' },
    }),
    async (req, res) => {
      const body = z
        .object({ username: usernameSchema, password: z.string().min(1).max(72) })
        .parse(req.body);
      const row = store.get<UserRecord>('SELECT * FROM users WHERE username = ?', body.username);
      // Unrecognised users still perform the expensive password derivation.
      const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
      const valid = await verifyPassword(body.password, row?.password_hash ?? dummy);
      if (!row || !valid) throw new HttpError(401, '账号或密码不正确');
      const currentHash = store.get<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = ?',
        row.id,
      )?.password_hash;
      if (currentHash !== row.password_hash)
        throw new HttpError(401, '密码已更新，请使用新密码登录');
      const token = randomBytes(32).toString('hex');
      const oldToken = req.cookies[cookieName];
      if (typeof oldToken === 'string')
        store.run('DELETE FROM sessions WHERE token_hash = ?', sessionHash(oldToken));
      store.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
      store.run(
        'INSERT INTO sessions VALUES (?, ?, ?)',
        sessionHash(token),
        row.id,
        Date.now() + sessionAge,
      );
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionAge });
      res.json(authData(publicUser(row)));
    },
  );
  app.get('/api/auth/me', authenticate, (req, res) => res.json(authData(authRequest(req).user)));
  app.post('/api/auth/logout', authenticate, (req, res) => {
    store.run('DELETE FROM sessions WHERE token_hash = ?', authRequest(req).tokenHash);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });
  app.post('/api/auth/password', authenticate, async (req, res) => {
    const { user, tokenHash } = authRequest(req);
    const body = z
      .object({ oldPassword: z.string().min(1).max(72), newPassword: passwordSchema })
      .parse(req.body);
    const before = store.get<UserRecord>('SELECT * FROM users WHERE id = ?', user.id)!;
    if (!(await verifyPassword(body.oldPassword, before.password_hash)))
      throw new HttpError(400, '原密码不正确');
    const hash = await hashPassword(body.newPassword);
    store.transaction(() => {
      const current = store.get<UserRecord>('SELECT * FROM users WHERE id = ?', user.id)!;
      if (current.password_hash !== before.password_hash)
        throw new HttpError(409, '密码已经变更，请重新登录后再试');
      store.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id);
      store.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', user.id, tokenHash);
    });
    res.json({ ok: true });
  });

  app.use('/api/teacher', authenticate, requireRole('teacher'));
  app.get('/api/teacher/students', (req, res) => {
    const user = authRequest(req).user;
    const rows = store.all(
      `SELECT u.id, u.name, u.username, u.created_at AS createdAt,
      COUNT(e.assignment_id) AS assigned, COUNT(w.submitted_at) AS submitted
      FROM users u LEFT JOIN assignment_students e ON e.student_id = u.id
      LEFT JOIN work w ON w.assignment_id = e.assignment_id AND w.student_id = u.id
      WHERE u.class_id = ? AND u.role = 'student' GROUP BY u.id ORDER BY u.created_at, u.username`,
      user.classId,
    );
    res.json({ students: rows });
  });
  app.post('/api/teacher/students', async (req, res) => {
    const user = authRequest(req).user;
    const body = z
      .object({
        username: usernameSchema,
        name: z.string().trim().min(1, '请填写学生姓名').max(30),
        password: passwordSchema,
      })
      .strict()
      .parse(req.body);
    const hash = await hashPassword(body.password);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    store.transaction(() => {
      if (store.get('SELECT id FROM users WHERE username = ?', body.username))
        throw new HttpError(409, '这个账号已被使用，请换一个');
      store.run(
        'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)',
        id,
        user.classId,
        body.username,
        body.name,
        'student',
        hash,
        createdAt,
      );
    });
    res.status(201).json({
      student: {
        id,
        username: body.username,
        name: body.name,
        createdAt,
        submitted: 0,
        assigned: 0,
      },
    });
  });
  app.post('/api/teacher/students/:studentId/password', async (req, res) => {
    const user = authRequest(req).user;
    const { password } = z.object({ password: passwordSchema }).parse(req.body);
    const student = store.get<{ id: string }>(
      "SELECT id FROM users WHERE id = ? AND class_id = ? AND role = 'student'",
      req.params.studentId as string,
      user.classId,
    );
    if (!student) throw new HttpError(404, '学生不存在');
    const hash = await hashPassword(password);
    store.transaction(() => {
      store.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, student.id);
      store.run('DELETE FROM sessions WHERE user_id = ?', student.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/teacher/assignments', (req, res) => {
    const rows = store.all<AssignmentStats>(
      `${statsQuery} WHERE a.class_id = ? GROUP BY a.id ORDER BY a.created_at DESC`,
      authRequest(req).user.classId,
    );
    res.json({ assignments: rows.map(publicStats) });
  });
  app.post('/api/teacher/assignments', (req, res) => {
    const user = authRequest(req).user;
    const body = z
      .object({
        title: z.string().trim().min(1, '请填写作业名称').max(60),
        topicIds: z
          .array(z.enum(['add20', 'multiply20', 'mixed100']))
          .min(1, '至少选择一个知识点')
          .max(3)
          .refine((v) => new Set(v).size === v.length, '知识点不能重复'),
        questionCount: z.union([z.literal(10), z.literal(20), z.literal(50)]),
        deadline: z.iso.datetime({ offset: true }),
      })
      .strict()
      .parse(req.body);
    if (new Date(body.deadline).getTime() <= Date.now())
      throw new HttpError(400, '截止时间需要晚于当前时间');
    const students = store.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM users WHERE class_id = ? AND role = 'student'",
      user.classId,
    )!;
    if (students.count === 0) throw new HttpError(400, '请先在班级学生中创建至少一个学生账号');
    const { id } = insertAssignment(store, {
      ...body,
      deadline: new Date(body.deadline).toISOString(),
      classId: user.classId,
      teacherId: user.id,
    });
    res.status(201).json({ assignment: publicStats(assignmentForTeacher(id, user)) });
  });
  app.get('/api/teacher/assignments/:id', (req, res) => {
    const id = req.params.id as string;
    const assignment = assignmentForTeacher(id, authRequest(req).user);
    const rows = store.all<{
      id: string;
      name: string;
      username: string;
      answers_json: string | null;
      updated_at: string | null;
      submitted_at: string | null;
      score: number | null;
    }>(
      `SELECT u.id, u.name, u.username, w.answers_json, w.updated_at, w.submitted_at, w.score
      FROM assignment_students e JOIN users u ON u.id = e.student_id
      LEFT JOIN work w ON w.assignment_id = e.assignment_id AND w.student_id = e.student_id
      WHERE e.assignment_id = ? ORDER BY u.username`,
      id,
    );
    res.json({
      assignment: publicStats(assignment),
      questions: questionsFor(id).map((q) => ({ ...publicQuestion(q), answer: q.answer })),
      students: rows.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        status: row.submitted_at ? 'submitted' : row.updated_at ? 'draft' : 'not_started',
        score: row.score,
        answered: answeredCount(JSON.parse(row.answers_json ?? '{}')),
        updatedAt: row.updated_at,
        submittedAt: row.submitted_at,
      })),
    });
  });
  app.get('/api/teacher/assignments/:id/students/:studentId', (req, res) => {
    const id = req.params.id as string;
    const studentId = req.params.studentId as string;
    const assignment = assignmentForTeacher(id, authRequest(req).user);
    const student = store.get<{ id: string; name: string; username: string }>(
      'SELECT u.id, u.name, u.username FROM assignment_students e JOIN users u ON u.id = e.student_id WHERE e.assignment_id = ? AND e.student_id = ?',
      id,
      studentId,
    );
    if (!student) throw new HttpError(404, '这名学生不在本次作业名单中');
    const work = publicWork(workFor(id, studentId));
    res.json({
      assignment: publicAssignment(assignment),
      student,
      work,
      questions: questionsFor(id).map((q) => ({
        ...publicQuestion(q),
        answer: q.answer,
        studentAnswer: work.answers[q.id] ?? '',
        correct: work.submittedAt ? isCorrect(work.answers[q.id], q.answer) : null,
      })),
    });
  });

  app.use('/api/student', authenticate, requireRole('student'));
  app.get('/api/student/assignments', (req, res) => {
    const user = authRequest(req).user;
    const rows = store.all<
      AssignmentRecord & {
        answers_json: string | null;
        updated_at: string | null;
        submitted_at: string | null;
        score: number | null;
      }
    >(
      `SELECT a.*, w.answers_json, w.updated_at, w.submitted_at, w.score FROM assignments a
      JOIN assignment_students e ON e.assignment_id = a.id LEFT JOIN work w ON w.assignment_id = a.id AND w.student_id = e.student_id
      WHERE e.student_id = ? AND a.class_id = ? ORDER BY a.created_at DESC`,
      user.id,
      user.classId,
    );
    res.json({
      assignments: rows.map((row) => ({
        ...publicAssignment(row),
        status: row.submitted_at ? 'submitted' : row.updated_at ? 'draft' : 'not_started',
        score: row.score,
        answered: answeredCount(JSON.parse(row.answers_json ?? '{}')),
        updatedAt: row.updated_at,
        submittedAt: row.submitted_at,
      })),
    });
  });
  app.get('/api/student/assignments/:id', (req, res) => {
    const user = authRequest(req).user;
    const id = req.params.id as string;
    const assignment = assignmentForStudent(id, user);
    const work = publicWork(workFor(id, user.id));
    res.json({
      assignment: publicAssignment(assignment),
      work,
      questions: questionsFor(id).map((q) =>
        work.submittedAt
          ? {
              ...publicQuestion(q),
              answer: q.answer,
              correct: isCorrect(work.answers[q.id], q.answer),
            }
          : publicQuestion(q),
      ),
    });
  });
  function writeWork(req: Request, submit: boolean) {
    const user = authRequest(req).user;
    const id = req.params.id as string;
    const body = answersSchema.parse(req.body);
    return store.transaction(() => {
      const assignment = assignmentForStudent(id, user);
      const existing = workFor(id, user.id);
      if (existing?.submitted_at) throw new HttpError(409, '这份作业已经正式提交，不能再修改');
      if (Date.now() >= new Date(assignment.deadline).getTime())
        throw new HttpError(403, '作业已截止，不能再保存或提交');
      if ((existing?.revision ?? 0) !== body.revision)
        throw new HttpError(409, '草稿已在其他页面更新，请刷新页面后继续，避免覆盖已有答案');
      const questions = questionsFor(id);
      const questionIds = new Set(questions.map((q) => q.id));
      if (Object.keys(body.answers).some((key) => !questionIds.has(key)))
        throw new HttpError(400, '答案中含有不属于这份作业的题目');
      const answers = Object.fromEntries(
        Object.entries(body.answers).filter(([, value]) => value !== ''),
      );
      const now = new Date().toISOString();
      const result = submit ? grade(questions, answers) : null;
      store.run(
        `INSERT INTO work (assignment_id, student_id, answers_json, revision, updated_at, submitted_at, score, correct_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(assignment_id, student_id) DO UPDATE SET
        answers_json = excluded.answers_json, revision = excluded.revision, updated_at = excluded.updated_at,
        submitted_at = excluded.submitted_at, score = excluded.score, correct_count = excluded.correct_count`,
        id,
        user.id,
        JSON.stringify(answers),
        body.revision + 1,
        now,
        submit ? now : null,
        result?.score ?? null,
        result?.correctCount ?? null,
      );
      return publicWork(workFor(id, user.id));
    });
  }
  app.put('/api/student/assignments/:id/draft', (req, res) =>
    res.json({ work: writeWork(req, false) }),
  );
  app.post('/api/student/assignments/:id/submit', (req, res) =>
    res.json({ work: writeWork(req, true) }),
  );
  app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在')));
  if (options.clientDir && existsSync(resolve(options.clientDir, 'index.html'))) {
    app.use(express.static(options.clientDir, { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(options.clientDir!, 'index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? '填写内容不符合要求' });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'JSON 请求格式不正确' });
      return;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      res.status(413).json({ error: '请求内容过大' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: '服务器暂时无法完成操作，请稍后重试' });
  });
  return app;
}
