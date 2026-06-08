'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { X } from 'lucide-react';

const circleEase: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** 圆形巨幕展开：慢启动 + 长时长，避免首帧就像已经扩到一半（不要用「头重」的 ease-out） */
const BURST_REVEAL_DURATION_S = 0.35;
const burstRevealEase: [number, number, number, number] = [0.42, 0, 1, 1];
/** 收起与展开同一时长；缓动为展开 ease-in 的互补 ease-out，平均速率一致 */
const BURST_COLLAPSE_DURATION_S = BURST_REVEAL_DURATION_S;
const burstCloseEase: [number, number, number, number] = [0, 0, 0.58, 1];
const scrollEase: [number, number, number, number] = [0.42, 0.03, 0.58, 0.97];
/** 按像素速度算时长，避免「字早滚完了还要空等固定 24s」 */
const SCROLL_PX_PER_SECOND = 92;
const SCROLL_DURATION_MIN_S = 12;
const SCROLL_DURATION_MAX_S = 22;
/** 最后一条离开可视区后再多滚一小段即结束（原先用整轨高度 + 0.58vh，尾部空白太久） */
const SCROLL_TAIL_BELOW_LAST_PX = 48;
/** 字幕滚到底后的额外停留；0 表示播完立刻关 */
const SCROLL_END_HOLD_MS = 0;
/** 若 onComplete / Promise 未触发，超时强制关闭（秒） */
const SCROLL_CLOSE_SAFETY_PAD_S = 2;

function coverRadiusPx(originX: number, originY: number) {
  if (typeof window === 'undefined') return 2400;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  const maxD = Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - originX, cy - originY)));
  return Math.ceil(maxD * 1.08);
}

function CreditSegment({
  y,
  offsetTop,
  className,
  children,
}: {
  y: MotionValue<number>;
  offsetTop: number;
  className?: string;
  children: React.ReactNode;
}) {
  const opacity = useTransform(y, (currentY) => {
    if (typeof window === 'undefined') return 1;
    const vy = offsetTop + currentY;
    const center = window.innerHeight * 0.46;
    const halfBand = window.innerHeight * 0.38;
    const d = Math.abs(vy - center);
    let t = Math.min(1, d / halfBand);
    t = t * t * (3 - 2 * t);
    return 0.2 + 0.8 * (1 - Math.pow(t, 1.12));
  });

  return (
    <motion.div
      data-credit
      className={className}
      style={{ opacity, willChange: 'opacity' }}
    >
      {children}
    </motion.div>
  );
}

const BLOCKS: { title?: string; lines: string[]; titleClass?: string }[] = [
  { lines: ['在线容器化教学与实训平台'] },
  { lines: ['Spark Lab'] },
  {
    title: '你可以在这里',
    lines: ['注册课程 · 完成实验', '观看视频 · 参与测验'],
    titleClass: 'text-lg font-semibold sm:text-xl',
  },
  {
    title: '隔离环境',
    lines: ['在独立容器中动手实践', '降低误操作与环境干扰'],
    titleClass: 'text-base font-semibold sm:text-lg',
  },
  {
    title: '多形态学习',
    lines: ['实验 / 视频 / 试卷', '按节奏循序渐进'],
    titleClass: 'text-base font-semibold sm:text-lg',
  },
  {
    title: '安全与可控',
    lines: ['资源与容器由平台统一调度', '在可控范围内完成实训'],
    titleClass: 'text-base font-semibold sm:text-lg',
  },
  { lines: ['感谢使用星火实验室'] },
  { lines: ['祝学习愉快'] },
];

type Metrics = { endY: number; offsets: number[]; scrollDurationS: number };
type Stage = 'burst' | 'plate' | 'scroll';

export default function AboutCreditsOverlay({
  open,
  origin,
  onClose,
}: {
  open: boolean;
  origin: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const y = useMotionValue(0);
  const burstRadiusPx = useMotionValue(0);
  const burstClipPath = useTransform(burstRadiusPx, (r) => {
    if (!origin) return 'circle(0px at 50% 50%)';
    const rad = Math.max(0, r);
    return `circle(${rad}px at ${origin.x}px ${origin.y}px)`;
  });
  const railRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);
  const burstAnimCtrlRef = useRef<ReturnType<typeof animate> | null>(null);
  const isClosingBurstRef = useRef(false);
  const beginCloseRef = useRef<() => void>(() => {});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stage, setStage] = useState<Stage>('burst');
  const stageRef = useRef<Stage>('burst');
  stageRef.current = stage;
  const canceledRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      canceledRef.current = false;
      isClosingBurstRef.current = false;
    }
    return () => {
      canceledRef.current = true;
    };
  }, [open]);

  const radius = useMemo(
    () => (origin ? coverRadiusPx(origin.x, origin.y) : 2400),
    [origin]
  );

  useEffect(() => {
    if (open) {
      setStage('burst');
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      burstRadiusPx.set(0);
      return;
    }
    if (!origin) return;
    burstRadiusPx.set(0);
  }, [open, origin, burstRadiusPx]);

  useEffect(() => {
    if (!open || !origin) return;
    burstAnimCtrlRef.current?.stop();
    burstRadiusPx.set(0);
    const ctrl = animate(burstRadiusPx, radius, {
      duration: BURST_REVEAL_DURATION_S,
      ease: burstRevealEase,
      onComplete: () => {
        if (canceledRef.current) return;
        if (stageRef.current === 'burst') setStage('plate');
      },
    });
    burstAnimCtrlRef.current = ctrl;
    return () => {
      ctrl.stop();
      burstAnimCtrlRef.current = null;
    };
  }, [open, origin, radius, burstRadiusPx]);

  const beginClose = useCallback(() => {
    if (isClosingBurstRef.current) return;
    if (!open) {
      onCloseRef.current();
      return;
    }
    if (!origin) {
      onCloseRef.current();
      return;
    }
    isClosingBurstRef.current = true;
    animRef.current?.stop();
    burstAnimCtrlRef.current?.stop();
    const ctrl = animate(burstRadiusPx, 0, {
      duration: BURST_COLLAPSE_DURATION_S,
      ease: burstCloseEase,
      onComplete: () => {
        burstAnimCtrlRef.current = null;
        if (!canceledRef.current) {
          onCloseRef.current();
        }
        isClosingBurstRef.current = false;
      },
    });
    burstAnimCtrlRef.current = ctrl;
  }, [open, origin, burstRadiusPx]);

  useEffect(() => {
    beginCloseRef.current = beginClose;
  }, [beginClose]);

  useLayoutEffect(() => {
    if (!open) {
      setMetrics(null);
      return;
    }
    const rail = railRef.current;
    if (!rail) return;
    const startY = window.innerHeight * 0.72;
    y.set(startY);
    const credits = rail.querySelectorAll<HTMLElement>('[data-credit]');
    const offsets = Array.from(credits).map((el) => el.offsetTop);
    const lastEl = credits[credits.length - 1];
    const contentBottom = lastEl ? lastEl.offsetTop + lastEl.offsetHeight : rail.offsetHeight;
    const tail = Math.max(SCROLL_TAIL_BELOW_LAST_PX, Math.round(window.innerHeight * 0.035));
    const endY = -(contentBottom + tail);
    const scrollDistance = Math.abs(endY - startY);
    const scrollDurationS = Math.min(
      SCROLL_DURATION_MAX_S,
      Math.max(SCROLL_DURATION_MIN_S, scrollDistance / SCROLL_PX_PER_SECOND)
    );
    setMetrics({ endY, offsets, scrollDurationS });
  }, [open, y]);

  useEffect(() => {
    if (!open || !metrics || stage !== 'scroll') return;
    animRef.current?.stop();
    let scrollEndHoldTimer: number | null = null;
    let safetyCloseTimer: number | null = null;
    let closeScheduled = false;

    const scheduleCloseAfterHold = () => {
      if (closeScheduled || canceledRef.current) return;
      closeScheduled = true;
      if (safetyCloseTimer != null) {
        window.clearTimeout(safetyCloseTimer);
        safetyCloseTimer = null;
      }
      if (SCROLL_END_HOLD_MS <= 0) {
        if (!canceledRef.current) beginCloseRef.current();
        return;
      }
      scrollEndHoldTimer = window.setTimeout(() => {
        scrollEndHoldTimer = null;
        if (canceledRef.current) return;
        beginCloseRef.current();
      }, SCROLL_END_HOLD_MS);
    };

    const startY = window.innerHeight * 0.72;
    y.set(startY);
    const controls = animate(y, metrics.endY, {
      duration: metrics.scrollDurationS,
      ease: scrollEase,
    });
    animRef.current = controls;

    void controls.then(() => {
      scheduleCloseAfterHold();
    });

    safetyCloseTimer = window.setTimeout(() => {
      safetyCloseTimer = null;
      scheduleCloseAfterHold();
    }, (metrics.scrollDurationS + SCROLL_CLOSE_SAFETY_PAD_S) * 1000);

    return () => {
      if (scrollEndHoldTimer != null) {
        window.clearTimeout(scrollEndHoldTimer);
        scrollEndHoldTimer = null;
      }
      if (safetyCloseTimer != null) {
        window.clearTimeout(safetyCloseTimer);
        safetyCloseTimer = null;
      }
      controls.stop();
      animRef.current = null;
    };
  }, [open, metrics, stage, y]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (stage !== 'plate') return;
    const t = window.setTimeout(() => setStage('scroll'), 1650);
    return () => window.clearTimeout(t);
  }, [stage]);

  return (
    <AnimatePresence>
      {open && origin && (
        <motion.div
          key="about-credits"
          role="dialog"
          aria-modal="true"
          aria-label="关于平台"
          className="fixed inset-0 z-[200] overflow-hidden"
          initial={false}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          style={{
            clipPath: burstClipPath,
            willChange: 'clip-path',
            transform: 'translateZ(0)',
          }}
        >
          <div
            className="absolute inset-0 flex flex-col bg-background text-on-surface"
            style={{ fontVariantLigatures: 'none' }}
          >
            <div className="relative flex justify-end p-4 sm:p-5">
              <button
                type="button"
                onClick={beginClose}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm font-semibold text-on-surface backdrop-blur-sm transition-colors hover:bg-surface-high dark:hover:bg-surface-high/70"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
                关闭
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              {(stage === 'plate' || stage === 'scroll') && (
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-[28%] z-10 flex justify-center px-6 sm:top-[30%]"
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={
                    stage === 'scroll'
                      ? {
                          opacity: 0,
                          scale: 1.04,
                          y: -28,
                        }
                      : {
                          opacity: 1,
                          scale: 1,
                          y: 0,
                        }
                  }
                  transition={{
                    duration: stage === 'scroll' ? 0.42 : 0.58,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{ willChange: 'transform, opacity' }}
                >
                  <div className="flex max-w-xl flex-col items-center gap-2 px-2 text-center">
                    <p className="font-display text-page-title text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                      Powered by{' '}
                      <span className="whitespace-nowrap">Spark Workshop</span>
                    </p>
                    <p className="text-sm leading-relaxed text-on-surface-variant sm:text-base">
                      © Shenyi · 倾力开发
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.div
                ref={railRef}
                style={{ y }}
                className="absolute left-0 right-0 px-6 sm:px-10"
                animate={{ opacity: stage === 'scroll' ? 1 : 0 }}
                transition={{ duration: 0.38, ease: circleEase }}
              >
                {BLOCKS.map((block, i) => (
                  <CreditSegment
                    key={i}
                    y={y}
                    offsetTop={metrics?.offsets[i] ?? 0}
                    className="mx-auto mb-14 max-w-2xl text-center sm:mb-20"
                  >
                    {block.title && (
                      <p
                        className={`mb-3 text-on-surface ${block.titleClass ?? 'text-xl font-bold'}`}
                      >
                        {block.title}
                      </p>
                    )}
                    {block.lines.map((line) => (
                      <p
                        key={line}
                        className="text-base leading-relaxed text-on-surface-variant sm:text-lg"
                      >
                        {line}
                      </p>
                    ))}
                  </CreditSegment>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
