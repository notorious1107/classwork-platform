import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { login, prepareAssignment } from './helpers';

test.beforeAll(() => mkdirSync('test-results/screenshots', { recursive: true }));

test('signing in again in a new tab preserves unsaved answers and enables retry', async ({
  page,
  request,
}) => {
  const { assignment } = await prepareAssignment(request, '重新登录保留答案');
  await login(page, 'student01', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  const other = await page.context().newPage();
  await other.goto('/student');
  await other.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(other).toHaveURL(/\/login$/);
  await page.getByLabel('第 1 题答案', { exact: true }).fill('21');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const signIn = page.getByRole('link', { name: '在新页面重新登录', exact: true });
  await expect(signIn).toBeVisible();
  const newPage = page.context().waitForEvent('page');
  await signIn.click();
  const reauth = await newPage;
  await login(reauth, 'student01', 'Student123!');
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('21');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('21');
});

test('expired session allows explicit exit without trapping the unsaved worksheet', async ({
  page,
  request,
}) => {
  const { assignment } = await prepareAssignment(request, '会话失效退出');
  await login(page, 'student03', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  await page.getByLabel('第 1 题答案', { exact: true }).fill('12');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  const other = await page.context().newPage();
  await other.goto('/student');
  await other.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(other).toHaveURL(/\/login$/);
  await page.getByLabel('第 1 题答案', { exact: true }).fill('13');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '草稿尚未保存' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/logout-recovery.png' });
  await page.getByRole('button', { name: '留在本页', exact: true }).click();
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('13');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '仍然退出', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'student03', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('12');
});

test('switching accounts in another tab cannot write the old worksheet into the new account', async ({
  page,
  request,
}) => {
  const { assignment, students } = await prepareAssignment(request, '账号切换隔离');
  await login(page, 'student01', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  const other = await page.context().newPage();
  await other.goto('/student');
  await other.getByRole('button', { name: '退出登录', exact: true }).click();
  await login(other, 'student02', 'Student123!');
  await page.getByLabel('第 1 题答案', { exact: true }).fill('17');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('账号已切换');
  const otherStudent = students.find((student) => student.username === 'student02')!;
  const review = await (
    await request.get(`/api/teacher/assignments/${assignment.id}/students/${otherStudent.id}`)
  ).json();
  expect(review.work.answers).toEqual({});
  expect(review.work.updatedAt).toBeNull();
  const newTab = page.context().waitForEvent('page');
  await page.getByRole('link', { name: '在新页面重新登录', exact: true }).click();
  const reauth = await newTab;
  await expect(reauth.getByText('当前浏览器登录为周一诺。重新登录会切换账号。')).toBeVisible();
  await reauth.getByLabel('账号', { exact: true }).fill('student01');
  await reauth.getByLabel('密码', { exact: true }).fill('Student123!');
  await reauth.getByRole('button', { name: '登录', exact: true }).click();
  await expect(reauth).toHaveURL(/\/student$/);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  const originalStudent = students.find((student) => student.username === 'student01')!;
  const recovered = await (
    await request.get(`/api/teacher/assignments/${assignment.id}/students/${originalStudent.id}`)
  ).json();
  expect(Object.values(recovered.work.answers)).toEqual(['17']);
});

test('an acknowledged-on-server draft survives a lost network response without a false conflict', async ({
  page,
  request,
}) => {
  const { assignment } = await prepareAssignment(request, '草稿响应丢失');
  await login(page, 'student01', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  let dropped = false;
  await page.route(`**/api/student/assignments/${assignment.id}/draft`, async (route) => {
    if (dropped) {
      await route.continue();
      return;
    }
    dropped = true;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('failed');
  });
  await page.getByLabel('第 1 题答案', { exact: true }).fill(' 03 ');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  await page.getByLabel('第 2 题答案', { exact: true }).fill('4');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('03');
  await expect(page.getByLabel('第 2 题答案', { exact: true })).toHaveValue('4');
});

test('a lost submission response recovers the already graded result instead of trapping submission', async ({
  page,
  request,
}) => {
  const { assignment, questions } = await prepareAssignment(request, '提交响应丢失');
  await login(page, 'student01', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  await page.getByLabel('第 1 题答案', { exact: true }).fill(String(questions[0].answer));
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  await page.route(`**/api/student/assignments/${assignment.id}/submit`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: '正式提交', exact: true }).click();
  await page.getByRole('button', { name: '确认正式提交', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/student/assignments/${assignment.id}/result$`));
  await expect(page.locator('.result-score')).toContainText('10');
  await expect(page.locator('.review-question')).toHaveCount(9);
});
