import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, initialize, insertAssignment } from '../database.js';
import { createApp } from '../app.js';

async function fixture(path = ':memory:') {
  const store = new Store(path);
  await initialize(store, { demo: true });
  const app = createApp({ store });
  const teacher = request.agent(app);
  const student = request.agent(app);
  const other = request.agent(app);
  await teacher
    .post('/api/auth/login')
    .send({ username: 'teacher', password: 'Teacher123!' })
    .expect(200);
  await student
    .post('/api/auth/login')
    .send({ username: 'student01', password: 'Student123!' })
    .expect(200);
  await other
    .post('/api/auth/login')
    .send({ username: 'student02', password: 'Student123!' })
    .expect(200);
  async function publish(count = 10) {
    return (
      await teacher
        .post('/api/teacher/assignments')
        .send({
          title: '接口验证作业',
          topicIds: ['add20', 'mixed100'],
          questionCount: count,
          deadline: new Date(Date.now() + 3600000).toISOString(),
        })
        .expect(201)
    ).body.assignment;
  }
  return { store, app, teacher, student, other, publish };
}
test('a stale browser identity cannot read or write through a different account cookie', async () => {
  const f = await fixture();
  try {
    const studentId = (await f.student.get('/api/auth/me')).body.user.id;
    const otherId = (await f.other.get('/api/auth/me')).body.user.id;
    await f.student.get('/api/student/assignments').set('X-Classwork-User', studentId).expect(200);
    await f.other.get('/api/student/assignments').set('X-Classwork-User', studentId).expect(401);
    const a = await f.publish();
    await f.other
      .put(`/api/student/assignments/${a.id}/draft`)
      .set('X-Classwork-User', studentId)
      .send({ answers: {}, revision: 0 })
      .expect(401);
    await f.other.get('/api/student/assignments').set('X-Classwork-User', otherId).expect(200);
  } finally {
    f.store.close();
  }
});
test('login, role checks, durable cookie properties, logout revocation', async () => {
  const f = await fixture();
  try {
    await request(f.app).get('/api/teacher/assignments').expect(401);
    await f.student.get('/api/teacher/students').expect(403);
    await f.teacher.get('/api/student/assignments').expect(403);
    await request(f.app)
      .post('/api/auth/login')
      .send({ username: 'teacher', password: 'bad' })
      .expect(401);
    const login = await request(f.app)
      .post('/api/auth/login')
      .send({ username: 'TEACHER', password: 'Teacher123!' })
      .expect(200);
    const cookie = login.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(login.body.user.password_hash, undefined);
    const me = await f.student.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.role, 'student');
    assert.equal(me.headers['cache-control'], 'no-store');
    await f.student.post('/api/auth/logout').send({}).expect(200);
    await f.student.get('/api/auth/me').expect(401);
  } finally {
    f.store.close();
  }
});
test('teacher creates students; names are literal; roster snapshot stays fixed', async () => {
  const f = await fixture();
  try {
    const before = await f.publish();
    const created = await f.teacher
      .post('/api/teacher/students')
      .send({ username: 'Student04', name: "王小禾'; --", password: 'NewStudent123!' })
      .expect(201);
    assert.equal(created.body.student.username, 'student04');
    await f.teacher
      .post('/api/teacher/students')
      .send({ username: 'STUDENT04', name: '重名账号', password: 'NewStudent123!' })
      .expect(409);
    await f.teacher
      .post('/api/teacher/students')
      .send({ username: 'bad', name: '同学', password: '123' })
      .expect(400);
    await f.student
      .post('/api/teacher/students')
      .send({ username: 'student05', name: '同学', password: 'NewStudent123!' })
      .expect(403);
    const agent = request.agent(f.app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'student04', password: 'NewStudent123!' })
      .expect(200);
    assert.equal(
      (await agent.get('/api/student/assignments').expect(200)).body.assignments.length,
      0,
    );
    await agent.get(`/api/student/assignments/${before.id}`).expect(404);
    const after = await f.publish();
    assert.equal(after.total, 4);
    assert.equal(
      (await f.teacher.get(`/api/teacher/assignments/${before.id}`)).body.assignment.total,
      3,
    );
    assert.equal((await agent.get('/api/student/assignments')).body.assignments.length, 1);
  } finally {
    f.store.close();
  }
});
test('publish validates topic, question count and future deadline; all students receive same stored questions', async () => {
  const f = await fixture();
  try {
    const input = {
      title: '测试',
      topicIds: ['add20'],
      questionCount: 10,
      deadline: new Date(Date.now() + 100000).toISOString(),
    };
    for (const patch of [
      { topicIds: [] },
      { topicIds: ['x'] },
      { topicIds: ['add20', 'add20'] },
      { questionCount: 11 },
      { title: '' },
      { deadline: '2020-01-01T00:00:00Z' },
      { deadline: 'bad' },
    ])
      await f.teacher
        .post('/api/teacher/assignments')
        .send({ ...input, ...patch })
        .expect(400);
    for (const count of [10, 20, 50]) {
      const a = await f.publish(count);
      const one = (await f.student.get(`/api/student/assignments/${a.id}`)).body;
      const two = (await f.other.get(`/api/student/assignments/${a.id}`)).body;
      assert.equal(one.questions.length, count);
      assert.deepEqual(one.questions, two.questions);
      assert.ok(one.questions.every((q: object) => !('answer' in q) && !('correct' in q)));
    }
  } finally {
    f.store.close();
  }
});
test('drafts persist, remain ungraded, enforce ownership, and reject stale tab writes', async () => {
  const f = await fixture();
  try {
    const a = await f.publish();
    const detail = (await f.student.get(`/api/student/assignments/${a.id}`)).body;
    const answers = { [detail.questions[0].id]: '12' };
    const saved = (
      await f.student
        .put(`/api/student/assignments/${a.id}/draft`)
        .send({ answers, revision: 0 })
        .expect(200)
    ).body.work;
    assert.equal(saved.revision, 1);
    assert.equal(saved.submittedAt, null);
    assert.equal(saved.score, null);
    const recovered = (await f.student.get(`/api/student/assignments/${a.id}`)).body.work;
    assert.deepEqual(recovered.answers, answers);
    const otherWork = (await f.other.get(`/api/student/assignments/${a.id}`)).body.work;
    assert.deepEqual(otherWork.answers, {});
    await f.student
      .put(`/api/student/assignments/${a.id}/draft`)
      .send({ answers: {}, revision: 0 })
      .expect(409);
    await f.student
      .put(`/api/student/assignments/${a.id}/draft`)
      .send({ answers: { foreign: '1' }, revision: 1 })
      .expect(400);
    const teacher = (await f.teacher.get(`/api/teacher/assignments/${a.id}`)).body;
    assert.equal(teacher.assignment.submitted, 0);
    assert.equal(teacher.assignment.average, null);
    const studentId = (await f.student.get('/api/auth/me')).body.user.id;
    const review = (await f.teacher.get(`/api/teacher/assignments/${a.id}/students/${studentId}`))
      .body;
    assert.equal(review.questions[0].studentAnswer, '12');
    assert.ok(review.questions.every((q: { correct: unknown }) => q.correct === null));
  } finally {
    f.store.close();
  }
});
test('formal submission grades blank and wrong answers, locks work, and updates teacher statistics', async () => {
  const f = await fixture();
  try {
    const a = await f.publish();
    const detail = (await f.teacher.get(`/api/teacher/assignments/${a.id}`)).body;
    const answers = Object.fromEntries(
      detail.questions
        .slice(0, 9)
        .map((q: { id: string; answer: number }, i: number) => [
          q.id,
          String(q.answer + (i === 8 ? 1 : 0)),
        ]),
    );
    const result = (
      await f.student
        .post(`/api/student/assignments/${a.id}/submit`)
        .send({ answers, revision: 0 })
        .expect(200)
    ).body.work;
    assert.equal(result.score, 80);
    assert.equal(result.correctCount, 8);
    assert.ok(result.submittedAt);
    const graded = (await f.student.get(`/api/student/assignments/${a.id}`)).body;
    assert.equal(graded.questions.filter((q: { correct: boolean }) => !q.correct).length, 2);
    assert.ok(graded.questions.every((q: object) => 'answer' in q));
    await f.student
      .post(`/api/student/assignments/${a.id}/submit`)
      .send({ answers: {}, revision: 1 })
      .expect(409);
    await f.student
      .put(`/api/student/assignments/${a.id}/draft`)
      .send({ answers: {}, revision: 1 })
      .expect(409);
    const stats = (await f.teacher.get(`/api/teacher/assignments/${a.id}`)).body.assignment;
    assert.deepEqual(
      {
        total: stats.total,
        submitted: stats.submitted,
        unsubmitted: stats.unsubmitted,
        average: stats.average,
      },
      { total: 3, submitted: 1, unsubmitted: 2, average: 80 },
    );
    const correctAnswers = Object.fromEntries(
      detail.questions.map((q: { id: string; answer: number }) => [q.id, String(q.answer)]),
    );
    await f.other
      .post(`/api/student/assignments/${a.id}/submit`)
      .send({ answers: correctAnswers, revision: 0 })
      .expect(200);
    assert.equal(
      (await f.teacher.get(`/api/teacher/assignments/${a.id}`)).body.assignment.average,
      90,
    );
  } finally {
    f.store.close();
  }
});
test('expired assignments remain readable but reject draft and submission writes', async () => {
  const f = await fixture();
  try {
    const a = await f.publish();
    f.store.run(
      'UPDATE assignments SET deadline = ? WHERE id = ?',
      '2020-01-01T00:00:00.000Z',
      a.id,
    );
    await f.student.get(`/api/student/assignments/${a.id}`).expect(200);
    await f.student
      .put(`/api/student/assignments/${a.id}/draft`)
      .send({ answers: {}, revision: 0 })
      .expect(403);
    await f.student
      .post(`/api/student/assignments/${a.id}/submit`)
      .send({ answers: {}, revision: 0 })
      .expect(403);
  } finally {
    f.store.close();
  }
});
test('class boundaries and cross-origin writes are enforced', async () => {
  const f = await fixture();
  try {
    const classId = randomUUID();
    const teacherId = randomUUID();
    const hash = f.store.get<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE role = 'teacher'",
    )!.password_hash;
    f.store.run('INSERT INTO classrooms VALUES (?, ?)', classId, '其他班');
    f.store.run(
      'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)',
      teacherId,
      classId,
      'other_teacher',
      '其他教师',
      'teacher',
      hash,
      new Date().toISOString(),
    );
    const a = insertAssignment(f.store, {
      classId,
      teacherId,
      title: '外班作业',
      topicIds: ['add20'],
      questionCount: 10,
      deadline: new Date(Date.now() + 100000).toISOString(),
    });
    await f.teacher.get(`/api/teacher/assignments/${a.id}`).expect(404);
    await f.student.get(`/api/student/assignments/${a.id}`).expect(404);
    await f.teacher
      .post(`/api/teacher/students/${teacherId}/password`)
      .send({ password: 'NewPass123!' })
      .expect(404);
    await f.teacher
      .post('/api/teacher/assignments')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    await f.teacher
      .post('/api/teacher/assignments')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(403);
    await f.student
      .post('/api/auth/logout')
      .set('Content-Type', 'text/plain')
      .send('{}')
      .expect(415);
  } finally {
    f.store.close();
  }
});
test('teacher password reset revokes student sessions, own password change verifies old password', async () => {
  const f = await fixture();
  try {
    const id = (await f.student.get('/api/auth/me')).body.user.id;
    await f.teacher
      .post(`/api/teacher/students/${id}/password`)
      .send({ password: 'Reset12345!' })
      .expect(200);
    await f.student.get('/api/auth/me').expect(401);
    await f.student
      .post('/api/auth/login')
      .send({ username: 'student01', password: 'Student123!' })
      .expect(401);
    await f.student
      .post('/api/auth/login')
      .send({ username: 'student01', password: 'Reset12345!' })
      .expect(200);
    await f.student
      .post('/api/auth/password')
      .send({ oldPassword: 'bad', newPassword: 'OwnPassword123!' })
      .expect(400);
    await f.student
      .post('/api/auth/password')
      .send({ oldPassword: 'Reset12345!', newPassword: 'OwnPassword123!' })
      .expect(200);
    await f.student.post('/api/auth/logout').send({}).expect(200);
    await f.student
      .post('/api/auth/login')
      .send({ username: 'student01', password: 'OwnPassword123!' })
      .expect(200);
  } finally {
    f.store.close();
  }
});
test('database reopening preserves sessions, assignments, drafts and scores without reseeding', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'classwork-test-'));
  const path = join(folder, 'persist.sqlite');
  let store: Store | undefined;
  try {
    const f = await fixture(path);
    store = f.store;
    const a = await f.publish();
    const q = (await f.teacher.get(`/api/teacher/assignments/${a.id}`)).body.questions[0];
    await f.student
      .put(`/api/student/assignments/${a.id}/draft`)
      .send({ answers: { [q.id]: '13' }, revision: 0 })
      .expect(200);
    await f.other
      .post(`/api/student/assignments/${a.id}/submit`)
      .send({ answers: { [q.id]: String(q.answer) }, revision: 0 })
      .expect(200);
    const sessionResponse = await request(f.app)
      .post('/api/auth/login')
      .send({ username: 'student01', password: 'Student123!' });
    const cookie = sessionResponse.headers['set-cookie'][0].split(';')[0];
    const userCount = store.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
    store.close();
    store = new Store(path);
    await initialize(store, { demo: true });
    const app = createApp({ store });
    const recovered = (
      await request(app).get(`/api/student/assignments/${a.id}`).set('Cookie', cookie).expect(200)
    ).body;
    assert.equal(recovered.work.answers[q.id], '13');
    assert.equal(store.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n, userCount);
    assert.equal(
      store.get<{ score: number }>(
        'SELECT score FROM work WHERE assignment_id = ? AND submitted_at IS NOT NULL',
        a.id,
      )!.score,
      10,
    );
  } finally {
    store?.close();
    assert.ok(
      resolve(folder).startsWith(resolve(tmpdir()) + sep) && folder.includes('classwork-test-'),
    );
    rmSync(folder, { recursive: true, force: true });
  }
});
test('clean initialization requires a configured teacher and has no demo accounts', async () => {
  const store = new Store(':memory:');
  try {
    await assert.rejects(initialize(store, { demo: false }));
    await initialize(store, {
      demo: false,
      teacherUsername: 'math_teacher',
      teacherPassword: 'Configured123!',
      className: '四年级一班',
    });
    assert.equal(store.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n, 1);
    const app = createApp({ store });
    const teacher = request.agent(app);
    assert.equal((await request(app).get('/api/config').expect(200)).body.demo, false);
    await teacher
      .post('/api/auth/login')
      .send({ username: 'math_teacher', password: 'Configured123!' })
      .expect(200);
    await teacher
      .post('/api/teacher/assignments')
      .send({
        title: '没有学生',
        topicIds: ['add20'],
        questionCount: 10,
        deadline: new Date(Date.now() + 100000).toISOString(),
      })
      .expect(400);
  } finally {
    store.close();
  }
});
