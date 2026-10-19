import { randomInt, randomUUID } from 'node:crypto';
import type { Answers, Question, TopicId } from '../shared/types.js';

export interface GeneratedQuestion extends Question {
  answer: number;
}
type Candidate = { expression: string; answer: number };
const pools = new Map<TopicId, Candidate[]>();

function candidates(topic: TopicId): Candidate[] {
  const cached = pools.get(topic);
  if (cached) return cached;
  const items: Candidate[] = [];
  const add = (expression: string, answer: number) => items.push({ expression, answer });
  if (topic === 'add20') {
    for (let a = 0; a <= 20; a++)
      for (let b = 0; b <= 20; b++) {
        if (a + b <= 20) add(`${a} + ${b}`, a + b);
        if (a >= b) add(`${a} − ${b}`, a - b);
      }
  } else if (topic === 'multiply20') {
    for (let a = 1; a <= 20; a++)
      for (let b = 1; b <= 20; b++) {
        if (a * b <= 20) {
          add(`${a} × ${b}`, a * b);
          add(`${a * b} ÷ ${b}`, a);
        }
      }
  } else {
    for (let a = 2; a <= 10; a++)
      for (let b = 2; b <= 10; b++)
        for (let c = 1; c <= 20; c++) {
          const product = a * b;
          if (product + c <= 100) {
            add(`${a} × ${b} + ${c}`, product + c);
            add(`${product + c} − ${a} × ${b}`, c);
          }
          if (product >= c) add(`${a} × ${b} − ${c}`, product - c);
          add(`${product} ÷ ${b} + ${c}`, a + c);
          if (a * (b + c) <= 100) add(`${a} × (${b} + ${c})`, a * (b + c));
          if (a >= c) add(`${product} ÷ ${b} − ${c}`, a - c);
        }
  }
  const unique = [...new Map(items.map((item) => [item.expression, item])).values()];
  pools.set(topic, unique);
  return unique;
}

export function generateQuestions(topics: TopicId[], count: number): GeneratedQuestion[] {
  if (!topics.length || new Set(topics).size !== topics.length || ![10, 20, 50].includes(count))
    throw new Error('Invalid question configuration');
  const shuffled = new Map(
    topics.map((topic) => {
      const pool = [...candidates(topic)];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return [topic, pool] as const;
    }),
  );
  return Array.from({ length: count }, (_, index) => {
    const topicId = topics[index % topics.length];
    const candidate = shuffled.get(topicId)!.pop()!;
    return { ...candidate, id: randomUUID(), position: index + 1, topicId };
  });
}

export function isCorrect(value: string | undefined, expected: number): boolean {
  const answer = (value ?? '').trim();
  return /^\+?\d+(?:\.\d+)?$/.test(answer) && Number(answer) === expected;
}

export function grade(questions: Pick<GeneratedQuestion, 'id' | 'answer'>[], answers: Answers) {
  const correctCount = questions.filter((question) =>
    isCorrect(answers[question.id], question.answer),
  ).length;
  return { correctCount, score: Math.round((correctCount / questions.length) * 100) };
}
