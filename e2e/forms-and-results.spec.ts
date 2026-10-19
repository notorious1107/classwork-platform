import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  login,
  prepareAssignment,
  teacherLogin,
  createStudent,
  expireTestAssignment,
} from './helpers';

function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

test('failed login can recover, protected pages require login, and roles return to their own home', async ({
  page,
}) => {
  await page.goto('/teacher/new');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('账号', { exact: true }).fill('teacher');
  await page.getByLabel('密码', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('账号或密码不正确');
  await page.getByLabel('密码', { exact: true }).fill('Teacher123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto('/student');
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await login(page, 'student01', 'Student123!');
  await page.goto('/teacher/new');
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
});

test('student form rejects duplicates, search handles no matches, and new students join only later assignments', async ({
  page,
  request,
  browser,
}) => {
  const before = await prepareAssignment(request, '新增学生前');
  await login(page, 'teacher', 'Teacher123!');
  await page.getByRole('link', { name: '班级学生', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索学生' }).fill('找不到这个同学');
  await expect(page.getByRole('heading', { name: '没有匹配的学生' })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索学生' }).fill('');
  await page.getByRole('button', { name: '创建学生账号', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('学生姓名').fill('表单测试同学');
  await dialog.getByLabel(/登录账号/).fill('STUDENT01');
  await dialog.getByLabel('初始密码').fill('FormTest123!');
  await dialog.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('这个账号已被使用');
  const username = `form_${randomUUID().slice(0, 8)}`;
  await dialog.getByLabel(/登录账号/).fill(username);
  await dialog.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('searchbox', { name: '搜索学生' }).fill(username.toUpperCase());
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('表单测试同学');
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  try {
    await login(student, username, 'FormTest123!');
    await expect(student.getByRole('heading', { name: '练习正在准备中' })).toBeVisible();
    const after = await prepareAssignment(request, '新增学生后');
    await student.getByRole('button', { name: '刷新列表', exact: true }).click();
    await expect(student.getByRole('heading', { name: after.assignment.title })).toBeVisible();
    await expect(student.getByRole('heading', { name: before.assignment.title })).toHaveCount(0);
    const original = await (
      await request.get(`/api/teacher/assignments/${before.assignment.id}`)
    ).json();
    expect(original.assignment.total).toBe(before.assignment.total);
  } finally {
    await studentContext.close();
  }
});

for (const count of [10, 20, 50])
  test(`GUI publishing validates inputs and generates ${count} questions across all knowledge points`, async ({
    page,
  }) => {
    await login(page, 'teacher', 'Teacher123!');
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '发布作业', exact: true })
      .click();
    const topics = page.getByRole('group', { name: '知识点', exact: true });
    await topics.getByText('20 以内加减', { exact: true }).click();
    await expect(page.getByRole('button', { name: '生成并发布作业' })).toBeDisabled();
    for (const name of ['20 以内加减', '20 以内乘除', '100 以内四则混合'])
      await topics.getByText(name, { exact: true }).click();
    await page
      .getByRole('group', { name: '题量', exact: true })
      .getByRole('radio', { name: new RegExp(`^${count} 道`) })
      .check({ force: true });
    const title = `界面发布 ${count} 题 ${randomUUID().slice(0, 8)}`;
    await page.getByLabel('作业名称').fill(title);
    await page.getByLabel(/截止时间/).fill(localTime(new Date(Date.now() - 86400000)));
    await page.getByRole('button', { name: '生成并发布作业' }).click();
    await expect(page.getByRole('alert')).toContainText('截止时间');
    await page.getByLabel(/截止时间/).fill(localTime(new Date(Date.now() + 86400000)));
    await page.getByRole('button', { name: '生成并发布作业' }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `题目与答案 ${count}`, exact: true }).click();
    await expect(page.locator('.teacher-question')).toHaveCount(count);
    const id = page.url().split('/').pop();
    const data = await (await page.request.get(`/api/teacher/assignments/${id}`)).json();
    const distribution = ['add20', 'multiply20', 'mixed100'].map(
      (topic) => data.questions.filter((q: { topicId: string }) => q.topicId === topic).length,
    );
    expect(Math.max(...distribution) - Math.min(...distribution)).toBeLessThanOrEqual(1);
  });

for (const score of [0, 100])
  test(`GUI handles ${score} points, confirmation, review filters and immutable results`, async ({
    page,
    request,
    browser,
  }) => {
    const { assignment, questions } = await prepareAssignment(request, `成绩${score}`);
    await login(page, 'student01', 'Student123!');
    await page.goto(`/student/assignments/${assignment.id}`);
    if (score === 100) {
      await page.getByLabel('第 1 题答案', { exact: true }).fill(String(questions[0].answer));
      await page.getByLabel('第 1 题答案', { exact: true }).press('Enter');
      await expect(page.getByLabel('第 2 题答案', { exact: true })).toBeFocused();
      await page.getByRole('button', { name: '正式提交', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('还有 9 道未填写');
      await page.getByRole('button', { name: '继续检查' }).click();
      for (const q of questions)
        await page.getByLabel(`第 ${q.position} 题答案`, { exact: true }).fill(String(q.answer));
    }
    await page.getByRole('button', { name: '正式提交', exact: true }).click();
    if (score === 0) await expect(page.getByRole('dialog')).toContainText('还有 10 道未填写');
    await page.getByRole('button', { name: '确认正式提交', exact: true }).click();
    await expect(page.locator('.result-score')).toHaveText(`${score}分`);
    if (score === 100)
      await expect(page.getByRole('heading', { name: '这次没有错题' })).toBeVisible();
    else {
      await expect(page.locator('.review-question')).toHaveCount(10);
      await expect(page.getByText('未作答', { exact: true })).toHaveCount(10);
    }
    await page.getByRole('button', { name: '全部题目', exact: true }).click();
    await expect(page.locator('.review-question')).toHaveCount(10);
    await page.goto(`/student/assignments/${assignment.id}`);
    await expect(page).toHaveURL(/\/result$/);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    try {
      await login(teacher, 'teacher', 'Teacher123!');
      await teacher.goto(`/teacher/assignments/${assignment.id}`);
      await teacher.getByRole('combobox', { name: '筛选提交情况' }).selectOption('submitted');
      await expect(teacher.locator('tbody tr')).toHaveCount(1);
      await teacher.getByRole('link', { name: '查看答卷', exact: true }).click();
      await expect(teacher.locator('.review-score')).toContainText(String(score));
      await teacher
        .getByRole('button', { name: `只看错题（${score === 100 ? 0 : 10}）`, exact: true })
        .click();
      if (score === 100)
        await expect(teacher.getByRole('heading', { name: '全部答对了' })).toBeVisible();
      else await expect(teacher.locator('tbody tr')).toHaveCount(10);
    } finally {
      await teacherContext.close();
    }
  });

test('expired draft is readable, ungraded and read-only, including direct result navigation', async ({
  page,
  request,
}) => {
  const { assignment } = await prepareAssignment(request, '已截止草稿');
  await login(page, 'student03', 'Student123!');
  await page.goto(`/student/assignments/${assignment.id}`);
  await page.getByLabel('第 1 题答案', { exact: true }).fill('0');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存于/)).toBeVisible();
  expireTestAssignment(assignment.id);
  await page.reload();
  await expect(page.getByText('已截止 · 仅可查看', { exact: true })).toBeVisible();
  await expect(page.getByLabel('第 1 题答案', { exact: true })).toHaveValue('0');
  for (const input of await page.locator('.answer-input').all()) await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: '正式提交', exact: true })).toHaveCount(0);
  await page.goto(`/student/assignments/${assignment.id}/result`);
  await expect(page).toHaveURL(new RegExp(`/student/assignments/${assignment.id}$`));
  const data = await (await request.get(`/api/teacher/assignments/${assignment.id}`)).json();
  expect(data.assignment.submitted).toBe(0);
  expect(data.assignment.average).toBeNull();
});

test('password form validation, own password change, teacher reset and session revocation work end to end', async ({
  page,
  request,
  browser,
}) => {
  const student = await createStudent(request, 'password');
  await login(page, student.username, student.password);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  try {
    await login(other, student.username, student.password);
    await page.getByRole('button', { name: '修改密码', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('原密码', { exact: true }).fill('WrongPassword123!');
    await modal.getByLabel('新密码', { exact: true }).fill('Changed123!');
    await modal.getByLabel('确认新密码', { exact: true }).fill('Mismatch123!');
    await modal.getByRole('button', { name: '保存新密码' }).click();
    await expect(modal.getByRole('alert')).toContainText('两次输入的新密码不一致');
    await modal.getByLabel('确认新密码', { exact: true }).fill('Changed123!');
    await modal.getByRole('button', { name: '保存新密码' }).click();
    await expect(modal.getByRole('alert')).toContainText('原密码不正确');
    await modal.getByLabel('原密码', { exact: true }).fill(student.password);
    await modal.getByRole('button', { name: '保存新密码' }).click();
    await expect(modal).not.toBeVisible();
    await other.getByRole('button', { name: '刷新列表' }).click();
    await expect(other.getByRole('heading', { name: '请重新登录' })).toBeVisible();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await login(page, student.username, 'Changed123!');
    await login(teacher, 'teacher', 'Teacher123!');
    await teacher.getByRole('link', { name: '班级学生', exact: true }).click();
    await teacher.getByRole('searchbox', { name: '搜索学生' }).fill(student.username);
    await teacher.getByRole('button', { name: '重置密码', exact: true }).click();
    await teacher.getByRole('dialog').getByLabel('新密码').fill('ResetByTeacher123!');
    await teacher
      .getByRole('dialog')
      .getByRole('button', { name: '重置密码', exact: true })
      .click();
    await expect(teacher.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: '刷新列表' }).click();
    await expect(page.getByRole('heading', { name: '请重新登录' })).toBeVisible();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.getByLabel('账号', { exact: true }).fill(student.username);
    await page.getByLabel('密码', { exact: true }).fill('Changed123!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('账号或密码不正确');
    await page.getByLabel('密码', { exact: true }).fill('ResetByTeacher123!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/student$/);
  } finally {
    await otherContext.close();
    await teacherContext.close();
  }
});

test('a failed list request has a working retry instead of an endless loader', async ({ page }) => {
  let failed = false;
  await page.route('**/api/student/assignments', async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, json: { error: '测试暂时不可用' } });
    } else await route.continue();
  });
  await login(page, 'student01', 'Student123!');
  await expect(page.getByRole('heading', { name: '暂时无法加载' })).toBeVisible();
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('heading', { name: '林小满，今天也进步一点。' })).toBeVisible();
});

test('teacher forms and scrollable records remain usable on a phone-sized screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'teacher', 'Teacher123!');
  await page.getByRole('link', { name: '班级学生', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建学生账号' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: '创建学生账号' }).click();
  await expect(page.getByRole('dialog').getByLabel('学生姓名')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '发布作业', exact: true })
    .click();
  await expect(page.getByLabel('作业名称')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成并发布作业' })).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/screenshots/teacher-phone.png', fullPage: true });
});
