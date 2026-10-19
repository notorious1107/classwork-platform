import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3102';
const database = join(process.cwd(), 'test-results', `restart-${randomUUID()}.sqlite`);
let child;
let diagnostics = '';
async function start() {
  child = spawn(process.execPath, ['dist/server/server/index.js'], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: '3102',
      HOST: '127.0.0.1',
      DATABASE_PATH: database,
      SEED_DEMO: 'true',
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  diagnostics = '';
  child.stdout.on('data', (data) => {
    diagnostics += data;
  });
  child.stderr.on('data', (data) => {
    diagnostics += data;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`服务退出：${diagnostics}`);
    try {
      if (
        diagnostics.includes('方格数学 API：') &&
        (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok
      )
        return;
    } catch {
      /* wait for listener */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`服务未就绪：${diagnostics}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      current.kill();
      reject(new Error('服务未能退出'));
    }, 5000);
    current.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    current.kill('SIGTERM');
  });
  child = undefined;
}
async function call(path, cookie, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(username, password) {
  return (await call('/auth/login', null, 'POST', { username, password })).cookie;
}
try {
  await start();
  const teacher = await login('teacher', 'Teacher123!');
  await call('/teacher/students', teacher, 'POST', {
    name: '重启验证学生',
    username: 'restart_student',
    password: 'Restart123!',
  });
  const { data: created } = await call('/teacher/assignments', teacher, 'POST', {
    title: '真实进程重启验证',
    topicIds: ['add20'],
    questionCount: 10,
    deadline: new Date(Date.now() + 86400000).toISOString(),
  });
  const id = created.assignment.id;
  const { data: detail } = await call(`/teacher/assignments/${id}`, teacher);
  const firstQuestion = detail.questions[0];
  const draftStudent = await login('student01', 'Student123!');
  const gradedStudent = await login('student03', 'Student123!');
  await call(`/student/assignments/${id}/draft`, draftStudent, 'PUT', {
    answers: { [firstQuestion.id]: '17' },
    revision: 0,
  });
  await call(`/student/assignments/${id}/submit`, gradedStudent, 'POST', {
    answers: { [firstQuestion.id]: String(firstQuestion.answer) },
    revision: 0,
  });
  await stop();
  await start();
  await login('restart_student', 'Restart123!');
  const { data: draft } = await call(`/student/assignments/${id}`, draftStudent);
  assert.equal(draft.work.answers[firstQuestion.id], '17');
  assert.equal(draft.work.submittedAt, null);
  const { data: result } = await call(`/student/assignments/${id}`, gradedStudent);
  assert.equal(result.work.score, 10);
  assert.equal(result.work.correctCount, 1);
  const { data: stats } = await call(`/teacher/assignments/${id}`, teacher);
  assert.equal(stats.assignment.submitted, 1);
  assert.equal(stats.assignment.total, 4);
  assert.equal(stats.assignment.average, 10);
  console.log('真实进程重启验证通过：账号、登录会话、作业、草稿、成绩和教师统计均保留。');
} finally {
  await stop();
}
