import { TOPICS, type TopicId, type WorkStatus } from '../shared/types';
export const topicName = (id: TopicId) => TOPICS.find((topic) => topic.id === id)?.name ?? id;
export const formatDate = (value: string, full = false) =>
  new Intl.DateTimeFormat('zh-CN', {
    ...(full ? { year: 'numeric' as const } : {}),
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
export const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
export const isExpired = (deadline: string) => Date.now() >= new Date(deadline).getTime();
export function statusInfo(status: WorkStatus, deadline: string) {
  if (status === 'submitted') return { label: '已提交', tone: 'green' };
  if (isExpired(deadline)) return { label: '已截止', tone: 'neutral' };
  if (status === 'draft') return { label: '草稿', tone: 'amber' };
  return { label: '待完成', tone: 'blue' };
}
export function localDateTime(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}
