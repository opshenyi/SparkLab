export type CourseMetaMode = 'default' | 'studentCard' | 'learner';

function learnerSubtitles(course: {
  classId?: string | null;
  className?: string | null;
  homeroomTeacherName?: string | null;
}) {
  const isPublic = !course.classId;
  if (isPublic) {
    return {
      isPublic,
      classLine: '公开课' as string | null,
      teacherLine: null as string | null,
    };
  }
  const t = (course.homeroomTeacherName || '').trim();
  return {
    isPublic,
    classLine: t ? `小组老师：${t}` : '小组老师：未指派',
    teacherLine: null as string | null,
  };
}

/**
 * 课程卡片副标题。
 * - default：含学习小组与小组老师（管理/兼容用）。
 * - studentCard / learner：学习侧仅展示小组老师；公开课标「公开课」（不展示小组名）。
 */
export function courseMetaSubtitles(
  course: {
    classId?: string | null;
    className?: string | null;
    homeroomTeacherName?: string | null;
  },
  mode: CourseMetaMode = 'default'
) {
  if (mode === 'studentCard' || mode === 'learner') {
    return learnerSubtitles(course);
  }

  const isPublic = !course.classId;
  const teacherLine = isPublic
    ? null
    : `小组老师：${(course.homeroomTeacherName || '').trim() || '未指派'}`;

  return {
    isPublic,
    classLine: isPublic ? '全校公开课' : `学习小组：${course.className || '小组'}`,
    teacherLine,
  };
}
