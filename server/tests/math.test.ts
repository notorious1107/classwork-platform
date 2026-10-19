import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateQuestions, grade, isCorrect } from '../math.js';
import type { TopicId } from '../../shared/types.js';

// Independent recursive-descent evaluator checks precedence and stored answers.
function evaluate(expression: string): number {
  const tokens = expression.match(/\d+|[+−×÷()]/g)!;
  let index = 0;
  function atom(): number {
    if (tokens[index] === '(') {
      index++;
      const result = sum();
      assert.equal(tokens[index++], ')');
      return result;
    }
    return Number(tokens[index++]);
  }
  function product(): number {
    let result = atom();
    while (tokens[index] === '×' || tokens[index] === '÷') {
      const op = tokens[index++];
      const value = atom();
      result = op === '×' ? result * value : result / value;
    }
    return result;
  }
  function sum(): number {
    let result = product();
    while (tokens[index] === '+' || tokens[index] === '−') {
      const op = tokens[index++];
      const value = product();
      result = op === '+' ? result + value : result - value;
    }
    return result;
  }
  const result = sum();
  assert.equal(index, tokens.length);
  return result;
}
for (const topic of ['add20', 'multiply20', 'mixed100'] as TopicId[]) {
  test(`${topic}: 50 batches of 50 unique, bounded, correctly evaluated questions`, () => {
    for (let batch = 0; batch < 50; batch++) {
      const questions = generateQuestions([topic], 50);
      assert.equal(questions.length, 50);
      assert.equal(new Set(questions.map((q) => q.expression)).size, 50);
      for (const [i, q] of questions.entries()) {
        assert.equal(q.position, i + 1);
        assert.equal(evaluate(q.expression), q.answer);
        assert.ok(
          Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer <= (topic === 'mixed100' ? 100 : 20),
        );
        const numbers = q.expression.match(/\d+/g)!.map(Number);
        assert.ok(numbers.every((n) => n >= 0 && n <= (topic === 'mixed100' ? 100 : 20)));
      }
    }
  });
}
test('multiple knowledge points are balanced and all supported counts work', () => {
  for (const count of [10, 20, 50]) {
    const questions = generateQuestions(['add20', 'multiply20', 'mixed100'], count);
    const distribution = ['add20', 'multiply20', 'mixed100'].map(
      (topic) => questions.filter((q) => q.topicId === topic).length,
    );
    assert.ok(Math.max(...distribution) - Math.min(...distribution) <= 1);
    assert.equal(
      grade(questions, Object.fromEntries(questions.map((q) => [q.id, `${q.answer}`]))).score,
      100,
    );
  }
});
test('grading uses whole numeric answers; blank and expressions are wrong', () => {
  assert.ok(isCorrect(' 003.0 ', 3));
  assert.ok(isCorrect('0', 0));
  for (const value of ['', ' ', '2+1', '3x', '0x3', '3e0', 'Infinity', 'NaN', '3.1'])
    assert.equal(isCorrect(value, 3), false);
  assert.deepEqual(
    grade(
      [
        { id: 'a', answer: 3 },
        { id: 'b', answer: 0 },
      ],
      { a: '3' },
    ),
    { correctCount: 1, score: 50 },
  );
});
