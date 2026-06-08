'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import LoadingBar from '@/components/LoadingBar'
import TopNavBar from '@/components/TopNavBar'
import AnimatedTerminal from '@/components/AnimatedTerminal'

export default function LandingPage() {
  const router = useRouter()
  const { isAuthenticated, user, isLoading, checkAuth } = useAuthStore()

  // 检查登录状态
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // 如果已登录则跳转（等待进度条动画完成）
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // 等待3秒进度条动画完成后再跳转
      const timer = setTimeout(() => {
        if (user?.role === 'ADMIN' || user?.role === 'AUTHOR') {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, isLoading, user, router])

  // 在检查认证状态或已登录时显示加载状态
  if (isLoading || isAuthenticated) {
    return <LoadingBar showProgress={true} />
  }

  return (
    <div className="relative min-h-screen bg-black text-white font-body">
      <TopNavBar />
      
      <main className="relative">
        <section className="relative overflow-hidden h-screen flex items-center justify-center px-6">
          {/* 视频背景 */}
          <div className="absolute inset-0 z-0">
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-full object-cover"
            >
              <source src="/video.mp4" type="video/mp4" />
            </video>
          </div>

          {/* 主要内容 */}
          <div className="max-w-7xl mx-auto w-full relative z-10 pt-24">
            <div className="text-center mb-12">
              <h1 className="text-5xl lg:text-7xl font-semibold font-headline leading-[1.06] mb-6">
                在实践中掌握未来
              </h1>
              <p className="text-lg lg:text-xl text-white/70 mb-10 max-w-2xl mx-auto">
                面向[星火工作坊]学员的技能实验室<br/>
                处于安全隔离的环境中，自主部署，高效完成实验任务
              </p>
            </div>

            <AnimatedTerminal />
          </div>
        </section>
      </main>
    </div>
  )
}
