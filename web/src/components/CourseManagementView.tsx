'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { courseAPI, teacherAPI } from '@/lib/api';
import { profilePageCardClass, profilePagePrimaryButtonClass } from '@/lib/profileShell';
import { useAuthStore } from '@/store/useAuthStore';
import { Edit, Plus, X, BookOpen, List, Book } from 'lucide-react';

type CourseRow = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  classId?: string | null;
  classIds?: string[];
  className?: string | null;
  homeroomTeacherName?: string | null;
  difficulty: string;
  duration: number;
  labCount?: number;
  videoCount?: number;
  examCount?: number;
  materialCount?: number;
};

function courseGroupIds(c: CourseRow): string[] {
  if (c.classIds && c.classIds.length > 0) return c.classIds;
  if (c.classId) return [c.classId];
  return [];
}

export default function CourseManagementView() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [advised, setAdvised] = useState<{ id: string; name: string }[]>([]);

  const advisedIdSet = useMemo(() => new Set(advised.map((g) => g.id)), [advised]);

  const loadAdvised = useCallback(async () => {
    try {
      const res = await teacherAPI.listGroups();
      const rows = (res.data as { id: string; name: string; iAmAdvisor?: boolean }[]).filter(
        (g) => g.iAmAdvisor
      );
      setAdvised(rows.map((g) => ({ id: g.id, name: g.name })));
    } catch {
      setAdvised([]);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    if (advisedIdSet.size === 0) {
      setCourses([]);
      return;
    }
    try {
      const res = await courseAPI.getAll();
      const rows = res.data as CourseRow[];
      setCourses(
        rows.filter((c) => courseGroupIds(c).some((gid) => advisedIdSet.has(gid)))
      );
    } catch (e) {
      console.error('Failed to load courses:', e);
      setCourses([]);
    }
  }, [advisedIdSet]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    void loadAdvised();
  }, [loadAdvised]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const handleToggleActive = async (course: CourseRow) => {
    const action = course.isActive ? '停课' : '开课';
    if (!confirm(`确定要${action}此课程吗？`)) return;
    try {
      await teacherAPI.toggleCourse(course.id);
      await loadCourses();
    } catch (error) {
      console.error('Toggle active failed:', error);
      alert(`操作失败：${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const base = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      difficulty: formData.get('difficulty') as string,
      duration: parseInt(formData.get('duration') as string, 10),
      isActive: formData.get('isActive') === 'true',
    };
    if (selectedGroupIds.length === 0) {
      alert('请至少选择一个学习小组');
      return;
    }

    try {
      if (editingCourse) {
        await teacherAPI.updateCourse(editingCourse.id, { ...base, classIds: selectedGroupIds });
      } else {
        await teacherAPI.createCourse({ ...base, classIds: selectedGroupIds });
      }
      setShowCourseModal(false);
      setEditingCourse(null);
      setSelectedGroupIds([]);
      await loadCourses();
    } catch (error) {
      console.error('Failed to save course:', error);
      alert('保存失败，请重试');
    }
  };

  const handleManageLabs = (course: CourseRow) => {
    router.push(`/teacher/courses/${course.id}/labs`);
  };

  const subtitle = advised.length
    ? '新建课程时可勾选多个学习小组，学生只要在任一小组内即可看到该课；列表展示与您负责小组有交集的全部课程。'
    : '请先在「学习小组」中创建小组并担任小组老师后，再管理课程。';

  const newCourseBtn =
    advised.length > 0 ? (
      <button
        type="button"
        onClick={() => {
          setEditingCourse(null);
          setSelectedGroupIds(advised[0]?.id ? [advised[0].id] : []);
          setShowCourseModal(true);
        }}
        className={`${profilePagePrimaryButtonClass} shrink-0`}
      >
        <Plus className="w-4 h-4" />
        新建课程
      </button>
    ) : null;

  const toggleGroup = (gid: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]
    );
  };

  return (
    <>
      <header className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-page-title text-[28px] font-semibold leading-8 tracking-tight">课程管理</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">{subtitle}</p>
          </div>
          {newCourseBtn}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div key={course.id} className={`${profilePageCardClass} p-6 flex flex-col`}>
            <div className="flex items-start justify-between mb-3">
              <h4 className="text-lg font-bold text-page-title flex-1 pr-2">{course.title}</h4>
              <span
                className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                  course.isActive
                    ? 'bg-status-success-bg text-status-success-text'
                    : 'bg-status-neutral-bg text-status-neutral-text'
                }`}
              >
                {course.isActive ? '开课中' : '已停课'}
              </span>
            </div>

            {(course.className || courseGroupIds(course).length > 0) && (
              <p className="text-xs font-medium text-primary mb-2">
                分配至：{course.className?.trim() || courseGroupIds(course).join('、')}
              </p>
            )}

            <p className="text-sm text-on-surface-variant mb-4 line-clamp-2 flex-grow">{course.description}</p>

            <div className="flex items-center gap-4 text-xs text-on-surface-variant mb-4 pb-4 flex-wrap">
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {course.labCount || 0} 实验
              </span>
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {course.videoCount || 0} 视频
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {course.examCount || 0} 试卷
              </span>
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {course.materialCount || 0} 课件
              </span>
              <span>
                {course.difficulty === 'beginner'
                  ? '入门'
                  : course.difficulty === 'intermediate'
                    ? '进阶'
                    : '高级'}
              </span>
              <span>{course.duration} 分钟</span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleManageLabs(course)}
                className="w-full bg-surface-container text-primary px-3 py-2.5 rounded-lg hover:bg-surface-bright transition-all flex items-center justify-center gap-2 font-medium"
              >
                <List className="w-4 h-4" />
                管理课程 (
                {(course.labCount || 0) +
                  (course.videoCount || 0) +
                  (course.examCount || 0) +
                  (course.materialCount || 0)}
                )
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(course)}
                  className={`px-2 py-2 rounded-lg transition-all flex items-center justify-center gap-1 text-xs font-medium bg-surface-container hover:bg-surface-bright ${
                    course.isActive ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                  title={course.isActive ? '停课' : '开课'}
                >
                  {course.isActive ? <Book className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{course.isActive ? '停课' : '开课'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCourse(course);
                    const g = courseGroupIds(course).filter((id) => advisedIdSet.has(id));
                    setSelectedGroupIds(g.length > 0 ? g : courseGroupIds(course));
                    setShowCourseModal(true);
                  }}
                  className="bg-surface-container text-primary px-2 py-2 rounded-lg hover:bg-surface-bright transition-all flex items-center justify-center gap-1 text-xs"
                  title="编辑课程"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">编辑</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div className={`${profilePageCardClass} px-6 py-14 text-center`}>
          <p className="text-on-surface font-medium mb-1">
            {advised.length === 0 ? '暂无可管理课程' : '暂无课程'}
          </p>
          <p className="text-sm text-on-surface-variant">
            {advised.length === 0
              ? '请前往「学习小组」创建小组并担任小组老师。'
              : '点击「新建课程」，并勾选要分配到的学习小组（可多选）。'}
          </p>
        </div>
      )}

      {showCourseModal && advised.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="app-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-page-title">{editingCourse ? '编辑课程' : '新建课程'}</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCourseModal(false);
                  setEditingCourse(null);
                  setSelectedGroupIds([]);
                }}
                className="text-on-surface-variant hover:text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              key={editingCourse?.id ?? 'new-course'}
              onSubmit={handleSaveCourse}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-on-surface-variant mb-2">分配到学习小组 *（可多选）</label>
                <div className="flex flex-row flex-wrap gap-2 rounded-xl bg-surface-container/50 p-3 ring-1 ring-inset ring-on-surface/[0.08] dark:bg-surface-container/35 dark:ring-white/[0.08]">
                  {advised.map((g) => (
                    <label
                      key={g.id}
                      className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-bright/80 dark:hover:bg-surface-low/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-on-surface">{g.name}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-on-surface-variant">
                  仅列出您担任小组老师的学习小组；勾选多个后，各组学生均可看到本课程。
                </p>
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">课程名称 *</label>
                <input
                  name="title"
                  defaultValue={editingCourse?.title}
                  required
                  placeholder="例如：Linux 基础入门"
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">课程描述 *</label>
                <textarea
                  name="description"
                  defaultValue={editingCourse?.description}
                  required
                  rows={3}
                  placeholder="简要描述课程内容和学习目标"
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">难度等级 *</label>
                  <select
                    name="difficulty"
                    defaultValue={editingCourse?.difficulty || 'beginner'}
                    className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="beginner">入门</option>
                    <option value="intermediate">进阶</option>
                    <option value="advanced">高级</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-on-surface-variant mb-2">预计时长（分钟） *</label>
                  <input
                    name="duration"
                    type="number"
                    defaultValue={editingCourse?.duration || 60}
                    required
                    min={1}
                    placeholder="60"
                    className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-on-surface-variant mb-2">开课状态</label>
                <select
                  name="isActive"
                  defaultValue={editingCourse?.isActive !== false ? 'true' : 'false'}
                  className="w-full bg-surface-container text-on-surface px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="true">开课（学生可见可学习）</option>
                  <option value="false">停课（学生不可学习）</option>
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCourseModal(false);
                    setEditingCourse(null);
                    setSelectedGroupIds([]);
                  }}
                  className="flex-1 bg-surface-container text-on-surface-variant px-4 py-2 rounded-lg hover:bg-surface-bright transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-on-primary px-4 py-2 rounded-lg hover:opacity-90 transition-all"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
