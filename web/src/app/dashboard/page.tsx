'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { courseAPI, containerAPI, authAPI } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import LoadingBar from '@/components/LoadingBar';
import AboutCreditsOverlay from '@/components/AboutCreditsOverlay';
import { cn } from '@/lib/utils';
import { courseMetaSubtitles } from '@/lib/courseMetaSubtitles';

/** 「关于平台」正放退场 */
const ABOUT_PLATFORM_CHARS = [...'关于平台'];
const ABOUT_CHAR_STAGGER_S = 0.04;
const ABOUT_CHAR_MORPH_DURATION_S = 0.14;
const ABOUT_CHAR_MORPH_EASE: [number, number, number, number] = [0.32, 0, 0.48, 1];
const ABOUT_ICON_MORPH_DURATION_S = 0.1;
const ABOUT_ICON_MORPH_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
/** 倒放逐字清晰：单独放慢，与正放退场速度无关 */
const ABOUT_CHAR_RESTORE_STAGGER_S = 0.072;
const ABOUT_CHAR_RESTORE_DURATION_S = 0.22;
const ABOUT_ICON_RESTORE_DURATION_S = 0.16;
const TEXT_EXIT_DONE_MS =
  Math.ceil((ABOUT_PLATFORM_CHARS.length - 1) * ABOUT_CHAR_STAGGER_S * 1000) +
  Math.ceil(ABOUT_CHAR_MORPH_DURATION_S * 1000) +
  80;
const TEXT_RESTORE_DONE_MS =
  Math.ceil((ABOUT_PLATFORM_CHARS.length - 1) * ABOUT_CHAR_RESTORE_STAGGER_S * 1000) +
  Math.ceil(ABOUT_CHAR_RESTORE_DURATION_S * 1000) +
  100;
/** 胶囊宽度收束为圆的时长（与 motion width 过渡一致） */
const CIRCLE_SHRINK_MS = 420;
const ABOUT_CIRCLE_PX = 40;
const OVERLAY_OPEN_MS = TEXT_EXIT_DONE_MS + CIRCLE_SHRINK_MS + 70;

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isLoggingOut, checkAuth } = useAuthStore();
  const [courses, setCourses] = useState<any[]>([]);
  const [runningContainerCount, setRunningContainerCount] = useState(0);
  const [stats, setStats] = useState({ enrolled: 0, completed: 0, hours: 0, points: 0 });
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [aboutMorphActive, setAboutMorphActive] = useState(false);
  const [aboutCircleOnly, setAboutCircleOnly] = useState(false);
  const [creditsOrigin, setCreditsOrigin] = useState<{ x: number; y: number } | null>(null);
  /** 点击瞬间锁定的胶囊像素宽，与固定高度一起动画，避免 layout 投影把按钮拉成椭圆 */
  const [aboutPillLockW, setAboutPillLockW] = useState<number | null>(null);
  const [aboutTextRestoreActive, setAboutTextRestoreActive] = useState(false);
  const aboutButtonRef = useRef<HTMLButtonElement>(null);
  const aboutTextHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aboutOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aboutExpandDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aboutRestoreDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAboutTimers = () => {
    if (aboutTextHideTimerRef.current) {
      clearTimeout(aboutTextHideTimerRef.current);
      aboutTextHideTimerRef.current = null;
    }
    if (aboutOverlayTimerRef.current) {
      clearTimeout(aboutOverlayTimerRef.current);
      aboutOverlayTimerRef.current = null;
    }
    if (aboutExpandDoneTimerRef.current) {
      clearTimeout(aboutExpandDoneTimerRef.current);
      aboutExpandDoneTimerRef.current = null;
    }
    if (aboutRestoreDoneTimerRef.current) {
      clearTimeout(aboutRestoreDoneTimerRef.current);
      aboutRestoreDoneTimerRef.current = null;
    }
  };

  const handleCreditsClose = () => {
    clearAboutTimers();
    setAboutTextRestoreActive(true);
    setCreditsOpen(false);
    setAboutMorphActive(false);
    setAboutCircleOnly(false);
    aboutExpandDoneTimerRef.current = setTimeout(() => {
      aboutExpandDoneTimerRef.current = null;
      setAboutPillLockW(null);
    }, CIRCLE_SHRINK_MS + 120);
    aboutRestoreDoneTimerRef.current = setTimeout(() => {
      aboutRestoreDoneTimerRef.current = null;
      setAboutTextRestoreActive(false);
    }, TEXT_RESTORE_DONE_MS);
  };

  const handleAboutPlatformClick = () => {
    if (creditsOpen || aboutMorphActive || aboutTextRestoreActive) return;
    clearAboutTimers();
    setAboutTextRestoreActive(false);
    const el = aboutButtonRef.current;
    setAboutPillLockW(
      el ? Math.round(el.getBoundingClientRect().width) : 168
    );
    setAboutMorphActive(true);
    setAboutCircleOnly(false);

    aboutTextHideTimerRef.current = setTimeout(() => {
      aboutTextHideTimerRef.current = null;
      setAboutCircleOnly(true);
    }, TEXT_EXIT_DONE_MS);

    aboutOverlayTimerRef.current = setTimeout(() => {
      aboutOverlayTimerRef.current = null;
      const el = aboutButtonRef.current;
      let origin = {
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
      };
      if (el) {
        const r = el.getBoundingClientRect();
        origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      setCreditsOrigin(origin);
      setCreditsOpen(true);
    }, OVERLAY_OPEN_MS);
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!isLoading && isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'AUTHOR')) {
      router.push('/admin');
    } else if (!isLoading && isAuthenticated && user?.role === 'TEACHER') {
      router.push('/teacher');
    }
  }, [isAuthenticated, isLoading, user, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const aboutCompact = aboutCircleOnly || creditsOpen;

  const loadData = async () => {
    try {
      const [coursesRes, containersRes, statsRes] = await Promise.all([
        courseAPI.getAll(),
        containerAPI.getAll(),
        authAPI.getStats(),
      ]);
      setCourses(coursesRes.data.filter((c: any) => c.isEnrolled).slice(0, 3));
      const allContainers = containersRes.data || [];
      setRunningContainerCount(allContainers.filter((c: any) => c.status === 'running').length);
      setStats({
        enrolled: statsRes.data.enrolledCourses || 0,
        completed: statsRes.data.completedLabs || 0,
        hours: Math.floor((statsRes.data.studyTime || 0) / 60),
        points: statsRes.data.totalScore || 0,
      });
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (isLoggingOut) {
    return <LoadingBar text="退出中" />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AboutCreditsOverlay
        open={creditsOpen}
        origin={creditsOrigin}
        onClose={handleCreditsClose}
      />

      <Sidebar />

      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col pt-16 lg:pt-0">
        <div className="flex-1 w-full max-w-[1600px] mx-auto px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
          <section aria-label="学习大厅" className="flex flex-col gap-10 lg:gap-12">
              <div className="max-w-3xl">
                <h2 className="font-display text-page-title text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                  欢迎回来，
                  <span className="text-primary">{user?.displayName}</span>
                </h2>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-on-surface-variant sm:text-lg">
                  动手实验、视频与试卷都在等你——今天推进一小步，离目标就近一大步。
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => router.push('/explore')}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-all hover:opacity-95 active:scale-[0.98]"
                  >
                    探索课程
                  </button>
                  <motion.button
                    ref={aboutButtonRef}
                    type="button"
                    onClick={handleAboutPlatformClick}
                    aria-label={aboutCircleOnly || creditsOpen ? '关于平台' : undefined}
                    transition={{
                      width: { duration: CIRCLE_SHRINK_MS / 1000, ease: [0.22, 1, 0.36, 1] },
                      height: { duration: 0 },
                      rotate: {
                        duration: 0.52,
                        ease: [0.22, 1, 0.36, 1],
                        times: [0, 0.14, 0.28, 0.42, 0.55, 0.68, 0.82, 1],
                      },
                    }}
                    animate={{
                      ...(aboutPillLockW != null
                        ? {
                            width: aboutCompact ? ABOUT_CIRCLE_PX : aboutPillLockW,
                            height: ABOUT_CIRCLE_PX,
                          }
                        : {}),
                      rotate:
                        aboutMorphActive && !aboutCircleOnly
                          ? [0, -4, 4, -2.5, 2.5, -1.2, 1.2, 0]
                          : 0,
                    }}
                    whileTap={!aboutMorphActive && !aboutTextRestoreActive ? { scale: 0.97 } : undefined}
                    className={cn(
                      'inline-flex h-10 shrink-0 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-bright text-sm font-semibold text-on-surface transition-colors duration-200',
                      'hover:bg-surface-high dark:bg-surface-container dark:text-on-surface-variant dark:hover:bg-surface-high/60',
                      aboutCompact
                        ? 'border border-outline-variant p-0 shadow-sm dark:border-outline-variant dark:shadow-[0_2px_8px_rgba(0,0,0,0.28)]'
                        : 'gap-2 whitespace-nowrap border-0 px-5 shadow-none',
                    )}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {!(aboutCircleOnly || creditsOpen) && (
                        <motion.span
                          key="about-label"
                          className="inline-flex items-center gap-2 whitespace-nowrap"
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                        >
                          <span className="inline-flex items-baseline font-semibold tracking-tight">
                            {ABOUT_PLATFORM_CHARS.map((ch, i) => {
                              const reverseIndex = ABOUT_PLATFORM_CHARS.length - 1 - i;
                              return (
                                <motion.span
                                  key={`${ch}-${i}`}
                                  className="inline-block whitespace-pre"
                                  initial={
                                    aboutTextRestoreActive
                                      ? { opacity: 0, y: 6, filter: 'blur(7px)' }
                                      : false
                                  }
                                  animate={
                                    aboutTextRestoreActive
                                      ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                                      : aboutMorphActive
                                        ? {
                                            opacity: 0,
                                            y: -6,
                                            filter: 'blur(7px)',
                                          }
                                        : {
                                            opacity: 1,
                                            y: 0,
                                            filter: 'blur(0px)',
                                          }
                                  }
                                  transition={{
                                    duration: aboutTextRestoreActive
                                      ? ABOUT_CHAR_RESTORE_DURATION_S
                                      : ABOUT_CHAR_MORPH_DURATION_S,
                                    delay: aboutTextRestoreActive
                                      ? i * ABOUT_CHAR_RESTORE_STAGGER_S
                                      : aboutMorphActive
                                        ? reverseIndex * ABOUT_CHAR_STAGGER_S
                                        : 0,
                                    ease: ABOUT_CHAR_MORPH_EASE,
                                  }}
                                >
                                  {ch}
                                </motion.span>
                              );
                            })}
                          </span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
              </div>

              <div aria-label="学习数据概览" className="w-full space-y-5">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <h3 className="font-display text-page-title text-lg font-bold tracking-tight sm:text-xl">
                    学习数据
                  </h3>
                  <p className="text-xs text-on-surface-variant sm:text-sm">
                    课程、实验、时长与运行中容器数
                  </p>
                </div>
                <div className="app-card p-6">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    <div className="rounded-xl bg-surface-container/55 px-4 py-4 dark:bg-surface-container/35">
                      <p className="text-xs font-medium text-on-surface-variant sm:text-sm">已注册课程</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-primary sm:text-3xl">
                        {stats.enrolled}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container/55 px-4 py-4 dark:bg-surface-container/35">
                      <p className="text-xs font-medium text-on-surface-variant sm:text-sm">完成实验</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-on-surface sm:text-3xl">
                        {stats.completed}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container/55 px-4 py-4 dark:bg-surface-container/35">
                      <p className="text-xs font-medium text-on-surface-variant sm:text-sm">学习时长</p>
                      <p className="mt-2 text-on-surface">
                        <span className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                          {stats.hours}
                        </span>
                        <span className="ml-1 text-xs font-medium text-on-surface-variant sm:text-sm">小时</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container/55 px-4 py-4 dark:bg-surface-container/35">
                      <p className="text-xs font-medium text-on-surface-variant sm:text-sm">运行中容器</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-on-surface sm:text-3xl">
                        {runningContainerCount}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 我的课程 */}
              <div aria-label="我的课程" className="space-y-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-display text-page-title text-lg font-bold tracking-tight sm:text-xl">
                  我的课程
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">继续上次进度，或新开一门挑战</p>
              </div>
              <button
                onClick={() => router.push('/explore')}
                className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary/15 sm:self-auto"
              >
                查看全部
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="app-card p-10 text-center">
                <p className="text-on-surface-variant mb-4">你还没有注册任何课程</p>
                <button
                  onClick={() => router.push('/explore')}
                  className="rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-on-primary transition-all hover:opacity-95 active:scale-[0.99]"
                >
                  浏览课程
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => {
                  const isInactive = !course.isActive;
                  const meta = courseMetaSubtitles(course, 'learner');
                  return (
                    <div
                      key={course.id}
                      role="button"
                      tabIndex={isInactive ? -1 : 0}
                      className={`app-card p-6 transition-all duration-200 ${
                        isInactive
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer hover:-translate-y-0.5 hover:bg-surface-bright dark:hover:bg-surface-high'
                      }`}
                      onClick={() => {
                        if (isInactive) {
                          alert('该课程已停课，暂时无法学习');
                          return;
                        }
                        router.push(`/courses/${course.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (isInactive) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/courses/${course.id}`);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4
                          className={`flex-1 text-lg font-bold tracking-tight ${isInactive ? 'text-on-surface-variant' : 'text-page-title'}`}
                        >
                          {course.title}
                        </h4>
                        {isInactive && (
                          <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0 ml-2">
                            停课中
                          </span>
                        )}
                      </div>
                      {meta.classLine ? (
                        <p
                          className={`text-xs mb-1 ${meta.isPublic ? 'text-on-surface-variant' : 'text-primary'}`}
                        >
                          {meta.classLine}
                        </p>
                      ) : null}
                      {meta.teacherLine && (
                        <p className="text-xs text-on-surface-variant mb-2">{meta.teacherLine}</p>
                      )}
                      <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">
                        {course.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-on-surface-variant">
                          {course.labCount} 个实验
                        </span>
                        {!isInactive && (
                          <button className="text-primary hover:underline text-sm flex items-center gap-1">
                            继续学习
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
          </section>
        </div>
      </main>
    </div>
  );
}
