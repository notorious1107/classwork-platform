export const TOPICS = [
  {
    id: 'add20',
    name: '20 以内加减',
    description: '和不超过 20，差为非负整数',
    example: '8 + 7 = ?',
    symbol: '+',
  },
  {
    id: 'multiply20',
    name: '20 以内乘除',
    description: '因数、被除数和结果在 20 以内，除法整除',
    example: '18 ÷ 3 = ?',
    symbol: '×',
  },
  {
    id: 'mixed100',
    name: '100 以内四则混合',
    description: '含两步运算与括号，先乘除后加减',
    example: '6 × (8 + 2) = ?',
    symbol: '÷',
  },
] as const;
export type TopicId = (typeof TOPICS)[number]['id'];
export type Role = 'teacher' | 'student';
export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  classId: string;
}
export interface Classroom {
  id: string;
  name: string;
}
export interface AuthData {
  user: User;
  classroom: Classroom;
  demo: boolean;
}
export interface Assignment {
  id: string;
  title: string;
  topicIds: TopicId[];
  questionCount: number;
  deadline: string;
  createdAt: string;
}
export interface TeacherAssignment extends Assignment {
  total: number;
  submitted: number;
  unsubmitted: number;
  average: number | null;
  scoreTotal: number;
}
export type WorkStatus = 'not_started' | 'draft' | 'submitted';
export interface StudentAssignment extends Assignment {
  status: WorkStatus;
  score: number | null;
  answered: number;
  updatedAt: string | null;
  submittedAt: string | null;
}
export interface Question {
  id: string;
  position: number;
  expression: string;
  topicId: TopicId;
}
export interface ReviewedQuestion extends Question {
  answer: number;
  studentAnswer: string;
  correct: boolean | null;
}
export type Answers = Record<string, string>;
export interface Work {
  answers: Answers;
  revision: number;
  updatedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  correctCount: number | null;
}
export interface StudentDetail {
  assignment: Assignment;
  questions: (Question & { answer?: number; correct?: boolean })[];
  work: Work;
}
export interface StudentRow {
  id: string;
  name: string;
  username: string;
  createdAt: string;
  submitted: number;
  assigned: number;
}
export interface SubmissionRow {
  id: string;
  name: string;
  username: string;
  status: WorkStatus;
  score: number | null;
  answered: number;
  updatedAt: string | null;
  submittedAt: string | null;
}
export interface TeacherDetail {
  assignment: TeacherAssignment;
  questions: (Question & { answer: number })[];
  students: SubmissionRow[];
}
export interface StudentReview {
  assignment: Assignment;
  student: Pick<User, 'id' | 'name' | 'username'>;
  work: Work;
  questions: ReviewedQuestion[];
}
