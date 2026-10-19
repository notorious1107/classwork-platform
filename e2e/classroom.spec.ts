import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(username === 'teacher' ? '/teacher$' : '/student$'));
}
test.beforeAll(() => mkdirSync('test-results/screenshots', { recursive: true }));

test('teacher creates student and publishes; student saves, resumes, submits; teacher sees matching score', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.screenshot({ path: 'test-results/screenshots/login-desktop.png', fullPage: true });
  await login(page, 'teacher', 'Teacher123!');
  await expect(page.getByRole('heading', { name: '陈老师，今天也一起进步。' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/teacher-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '班级学生', exact: true }).click();
  await page.getByRole('button', { name: '创建学生账号' }).click();
  const createModal = page.getByRole('dialog');
  await createModal.getByLabel('学生姓名').fill('浏览器同学');
  await createModal.getByLabel('登录账号').fill('browser_student');
  await createModal.getByLabel('初始密码').fill('Browser123!');
  await createModal.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByText('浏览器同学', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '发布作业', exact: true }).click();
  await page.getByText('100 以内四则混合', { exact: true }).click();
  await page.getByText('标准练习', { exact: true }).click();
  await page.getByLabel('作业名称').fill('浏览器验证 · 基础与混合练习');
  await page.getByRole('button', { name: '生成并发布作业' }).click();
  await expect(page).toHaveURL(/\/teacher\/assignments\/[a-f0-9-]+$/);
  const id = page.url().split('/').pop()!;
  const teacherDetail = await (await page.request.get(`/api/teacher/assignments/${id}`)).json();
  expect(teacherDetail.assignment.total).toBe(4);
  const questions = teacherDetail.questions as { id: string; position: number; answer: number }[];
  const context = await browser.newContext();
  const studentPage = await context.newPage();
  studentPage.on('pageerror', (error) => errors.push(error.message));
  await login(studentPage, 'browser_student', 'Browser123!');
  await expect(
    studentPage.getByRole('heading', { name: '浏览器验证 · 基础与混合练习' }),
  ).toBeVisible();
  await studentPage.getByRole('link', { name: '开始作答' }).click();
  await studentPage.getByLabel('第 1 题答案', { exact: true }).fill(String(questions[0].answer));
  await expect(studentPage.getByText(/草稿已保存于/)).toBeVisible();
  await studentPage.getByLabel('第 2 题答案', { exact: true }).fill('987');
  await studentPage.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(studentPage.getByText(/草稿已保存于/)).toBeVisible();
  await studentPage.reload();
  await expect(studentPage.getByLabel('第 1 题答案', { exact: true })).toHaveValue(
    String(questions[0].answer),
  );
  await expect(studentPage.getByLabel('第 2 题答案', { exact: true })).toHaveValue('987');
  await studentPage.getByRole('link', { name: '返回作业列表' }).click();
  await expect(studentPage.getByText('草稿', { exact: true })).toBeVisible();
  await studentPage.getByRole('link', { name: '继续作答' }).click();
  const user = await (await studentPage.request.get('/api/auth/me')).json();
  await page.goto(`/teacher/assignments/${id}/students/${user.user.id}`);
  await expect(page.getByText('草稿 · 未提交', { exact: true })).toBeVisible();
  await expect(page.getByText('987', { exact: true })).toBeVisible();
  for (let i = 0; i < 19; i++)
    await studentPage
      .getByLabel(`第 ${i + 1} 题答案`, { exact: true })
      .fill(String(questions[i].answer + (i === 18 ? 1 : 0)));
  await studentPage.getByRole('button', { name: '正式提交', exact: true }).click();
  await expect(
    studentPage.getByRole('dialog').getByText('还有 1 道未填写，将按错误计分。'),
  ).toBeVisible();
  await studentPage.getByRole('button', { name: '确认正式提交', exact: true }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/assignments/${id}/result$`));
  await expect(studentPage.locator('.result-score')).toContainText('90');
  await expect(studentPage.locator('.review-question')).toHaveCount(2);
  await expect(studentPage.getByText('未作答', { exact: true })).toBeVisible();
  await studentPage.screenshot({
    path: 'test-results/screenshots/student-result.png',
    fullPage: true,
  });
  await studentPage.getByRole('button', { name: '全部题目', exact: true }).click();
  await expect(studentPage.locator('.review-question')).toHaveCount(20);
  await studentPage.reload();
  await expect(studentPage.locator('.result-score')).toContainText('90');
  await studentPage.goto(`/student/assignments/${id}`);
  await expect(studentPage).toHaveURL(/\/result$/);
  await page.goto(`/teacher/assignments/${id}`);
  await expect(page.locator('.stat-card').nth(0).locator('.stat-value')).toContainText('1');
  await expect(page.locator('.stat-card').nth(1).locator('.stat-value')).toContainText('3');
  await expect(page.locator('.stat-card').nth(2).locator('.stat-value')).toContainText('90');
  await page.getByRole('link', { name: '查看答卷' }).click();
  await expect(page.locator('.review-score')).toContainText('90');
  await page.getByRole('button', { name: '只看错题（2）' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await studentPage.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(studentPage).toHaveURL(/\/login$/);
  await login(studentPage, 'browser_student', 'Browser123!');
  await studentPage.getByRole('link', { name: '查看结果' }).click();
  await expect(studentPage.locator('.result-score')).toContainText('90');
  expect(errors).toEqual([]);
  await context.close();
});

test('mobile layout, 50 questions, network failure feedback and saving before navigation', async ({
  page,
  browser,
}) => {
  await login(page, 'teacher', 'Teacher123!');
  const response = await page.request.post('/api/teacher/assignments', {
    data: {
      title: '手机验证 · 50 道混合练习',
      topicIds: ['add20', 'multiply20', 'mixed100'],
      questionCount: 50,
      deadline: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const { assignment } = await response.json();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await context.newPage();
  await mobile.goto('/login');
  await mobile.screenshot({ path: 'test-results/screenshots/login-mobile.png', fullPage: true });
  await login(mobile, 'student01', 'Student123!');
  await mobile.screenshot({ path: 'test-results/screenshots/student-mobile.png', fullPage: true });
  expect(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await mobile.goto(`/student/assignments/${assignment.id}`);
  await expect(mobile.locator('.answer-input')).toHaveCount(50);
  expect(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await mobile.route('**/api/student/assignments/*/draft', (route) => route.abort('failed'));
  await mobile.getByLabel('第 50 题答案', { exact: true }).fill('42');
  await expect(mobile.getByRole('alert')).toContainText('无法连接服务器');
  await mobile.unroute('**/api/student/assignments/*/draft');
  await mobile.getByRole('button', { name: '保存当前草稿', exact: true }).click();
  await expect(mobile.getByText(/草稿已保存于/)).toBeVisible();
  await mobile.getByLabel('第 1 题答案', { exact: true }).fill('16');
  await mobile.getByRole('link', { name: '返回作业列表' }).click();
  await expect(mobile.getByRole('dialog')).toBeVisible();
  await mobile.getByRole('button', { name: '保存并离开', exact: true }).click();
  await expect(mobile).toHaveURL(/\/student$/);
  await mobile.goto(`/student/assignments/${assignment.id}`);
  await expect(mobile.getByLabel('第 1 题答案', { exact: true })).toHaveValue('16');
  await expect(mobile.getByLabel('第 50 题答案', { exact: true })).toHaveValue('42');
  await mobile.screenshot({
    path: 'test-results/screenshots/worksheet-mobile.png',
    fullPage: false,
  });
  await context.close();
});

test('two browser tabs cannot silently overwrite a newer draft', async ({ page }) => {
  await login(page, 'teacher', 'Teacher123!');
  const response = await page.request.post('/api/teacher/assignments', {
    data: {
      title: '双标签草稿冲突验证',
      topicIds: ['add20'],
      questionCount: 10,
      deadline: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const { assignment } = await response.json();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await login(page, 'student03', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  const second = await page.context().newPage();
  await second.goto(`/student/assignments/${assignment.id}`);
  await expect(second.getByLabel('第 1 题答案', { exact: true })).toBeVisible();
  await page.getByLabel('第 1 题答案', { exact: true }).fill('11');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  await second.getByLabel('第 1 题答案', { exact: true }).fill('22');
  await expect(second.getByRole('alert')).toContainText('草稿已在其他页面更新');
  const stored = await (await page.request.get(`/api/student/assignments/${assignment.id}`)).json();
  const firstQuestion = stored.questions[0].id;
  expect(stored.work.answers[firstQuestion]).toBe('11');
  await second.close({ runBeforeUnload: false });
});

test('logging out immediately after typing saves the draft before revoking the session', async ({
  page,
}) => {
  await login(page, 'student01', 'Student123!');
  const { assignments } = await (await page.request.get('/api/student/assignments')).json();
  const assignment = assignments.find((a: { status: string }) => a.status !== 'submitted');
  await page.goto(`/student/assignments/${assignment.id}`);
  await page.getByLabel('第 3 题答案', { exact: true }).fill('123');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'student01', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  await expect(page.getByLabel('第 3 题答案', { exact: true })).toHaveValue('123');
});
