import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(username === 'teacher' ? '/teacher$' : '/student$'));
}

export async function teacherLogin(request: APIRequestContext) {
  const response = await request.post('/api/auth/login', {
    data: { username: 'teacher', password: 'Teacher123!' },
  });
  expect(response.ok()).toBeTruthy();
}

export async function prepareAssignment(request: APIRequestContext, title: string, count = 10) {
  await teacherLogin(request);
  const response = await request.post('/api/teacher/assignments', {
    data: {
      title: `${title} ${randomUUID().slice(0, 8)}`,
      topicIds: ['add20'],
      questionCount: count,
      deadline: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const { assignment } = await response.json();
  const detail = await request.get(`/api/teacher/assignments/${assignment.id}`);
  expect(detail.ok()).toBeTruthy();
  return (await detail.json()) as {
    assignment: { id: string; title: string; total: number };
    questions: { id: string; position: number; answer: number }[];
    students: { id: string; username: string }[];
  };
}

export async function createStudent(request: APIRequestContext, prefix: string) {
  await teacherLogin(request);
  const username = `${prefix}_${randomUUID().slice(0, 8)}`;
  const response = await request.post('/api/teacher/students', {
    data: { name: '隔离测试同学', username, password: 'Fixture123!' },
  });
  expect(response.ok()).toBeTruthy();
  return { ...(await response.json()).student, password: 'Fixture123!' } as {
    id: string;
    username: string;
    password: string;
  };
}

export function expireTestAssignment(assignmentId: string) {
  const runtime = JSON.parse(readFileSync(resolve('test-results/e2e-runtime.json'), 'utf8')) as {
    databasePath: string;
  };
  const path = resolve(runtime.databasePath);
  if (!path.startsWith(resolve('test-results') + sep) || !/browser-[a-f0-9-]+\.sqlite$/.test(path))
    throw new Error('Refusing to modify a database outside the browser test fixture');
  const db = new DatabaseSync(path);
  try {
    db.prepare('UPDATE assignments SET deadline = ? WHERE id = ?').run(
      '2020-01-01T00:00:00.000Z',
      assignmentId,
    );
  } finally {
    db.close();
  }
}
