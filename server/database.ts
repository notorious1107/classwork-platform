import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.js';
import { generateQuestions, grade, type GeneratedQuestion } from './math.js';
import type { Answers, TopicId } from '../shared/types.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classrooms(id),
        username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('teacher','student')),
        password_hash TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classrooms(id),
        teacher_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
        topic_ids TEXT NOT NULL, question_count INTEGER NOT NULL CHECK(question_count IN (10,20,50)),
        deadline TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, expression TEXT NOT NULL, topic_id TEXT NOT NULL,
        answer INTEGER NOT NULL, UNIQUE(assignment_id, position)
      );
      CREATE TABLE IF NOT EXISTS assignment_students (
        assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(assignment_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS work (
        assignment_id TEXT NOT NULL, student_id TEXT NOT NULL,
        answers_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, submitted_at TEXT, score INTEGER, correct_count INTEGER,
        PRIMARY KEY(assignment_id, student_id),
        FOREIGN KEY(assignment_id, student_id) REFERENCES assignment_students(assignment_id, student_id),
        CHECK((submitted_at IS NULL AND score IS NULL AND correct_count IS NULL) OR
              (submitted_at IS NOT NULL AND score BETWEEN 0 AND 100 AND correct_count IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_enrollment_student ON assignment_students(student_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
      PRAGMA user_version = 1;
    `);
  }
  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}

export function insertAssignment(
  store: Store,
  input: {
    classId: string;
    teacherId: string;
    title: string;
    topicIds: TopicId[];
    questionCount: number;
    deadline: string;
    createdAt?: string;
  },
) {
  const id = randomUUID();
  const questions = generateQuestions(input.topicIds, input.questionCount);
  const createdAt = input.createdAt ?? new Date().toISOString();
  store.transaction(() => {
    store.run(
      'INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.classId,
      input.teacherId,
      input.title,
      JSON.stringify(input.topicIds),
      input.questionCount,
      input.deadline,
      createdAt,
    );
    for (const question of questions)
      store.run(
        'INSERT INTO questions VALUES (?, ?, ?, ?, ?, ?)',
        question.id,
        id,
        question.position,
        question.expression,
        question.topicId,
        question.answer,
      );
    store.run(
      "INSERT INTO assignment_students SELECT ?, id FROM users WHERE class_id = ? AND role = 'student'",
      id,
      input.classId,
    );
  });
  return { id, questions };
}

export interface InitializeOptions {
  demo: boolean;
  teacherUsername?: string;
  teacherPassword?: string;
  teacherName?: string;
  className?: string;
}
export async function initialize(store: Store, options: InitializeOptions) {
  if (store.get('SELECT id FROM users LIMIT 1')) return;
  const teacherUsername = options.teacherUsername ?? 'teacher';
  const teacherPassword = options.teacherPassword ?? (options.demo ? 'Teacher123!' : '');
  if (
    !/^[a-zA-Z0-9_]{3,24}$/.test(teacherUsername) ||
    teacherPassword.length < 8 ||
    teacherPassword.length > 72
  ) {
    throw new Error(
      '首次初始化请设置 TEACHER_USERNAME（3–24 位字母、数字或下划线）与 TEACHER_PASSWORD（8–72 位），或启用 SEED_DEMO=true。',
    );
  }
  const teacherId = randomUUID();
  const classId = randomUUID();
  const passwordHash = await hashPassword(teacherPassword);
  const studentHash = options.demo ? await hashPassword('Student123!') : '';
  const now = new Date().toISOString();
  store.transaction(() => {
    store.run('INSERT INTO settings VALUES (?, ?)', 'demo', options.demo ? 'true' : 'false');
    store.run(
      'INSERT INTO classrooms VALUES (?, ?)',
      classId,
      options.className ?? '三年级（1）班',
    );
    store.run(
      'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)',
      teacherId,
      classId,
      teacherUsername.toLowerCase(),
      options.teacherName ?? '陈老师',
      'teacher',
      passwordHash,
      now,
    );
    if (options.demo)
      for (const [username, name] of [
        ['student01', '林小满'],
        ['student02', '周一诺'],
        ['student03', '许知远'],
      ]) {
        store.run(
          'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)',
          randomUUID(),
          classId,
          username,
          name,
          'student',
          studentHash,
          now,
        );
      }
  });
  if (!options.demo) return;
  const first = insertAssignment(store, {
    classId,
    teacherId,
    title: '把基础练扎实 · 20 以内加减',
    topicIds: ['add20'],
    questionCount: 10,
    deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  });
  insertAssignment(store, {
    classId,
    teacherId,
    title: '小小挑战 · 四则混合练习',
    topicIds: ['mixed100'],
    questionCount: 20,
    deadline: new Date(Date.now() + 4 * 86400000).toISOString(),
  });
  const completed = store.get<{ id: string }>("SELECT id FROM users WHERE username = 'student02'")!;
  const drafting = store.get<{ id: string }>("SELECT id FROM users WHERE username = 'student03'")!;
  const answers: Answers = Object.fromEntries(
    first.questions.map((q: GeneratedQuestion, i: number) => [
      q.id,
      String(q.answer + (i < 8 ? 0 : 1)),
    ]),
  );
  const result = grade(first.questions, answers);
  store.run(
    'INSERT INTO work VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
    first.id,
    completed.id,
    JSON.stringify(answers),
    now,
    now,
    result.score,
    result.correctCount,
  );
  const draft = Object.fromEntries(
    first.questions.slice(0, 3).map((q) => [q.id, String(q.answer)]),
  );
  store.run(
    'INSERT INTO work VALUES (?, ?, ?, 1, ?, NULL, NULL, NULL)',
    first.id,
    drafting.id,
    JSON.stringify(draft),
    now,
  );
}
