'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function TopNavBar() {
  const router = useRouter()

  const handleStartLab = () => {
    router.push('/login')
  }

  return (
    <nav className="fixed top-0 z-50 w-full">
      <div className="relative mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-[clamp(16px,5vw,96px)]">
        {/* 左侧 Logo */}
        <Link href="/" className="select-none text-lg font-semibold text-white outline-0">
          星火实验室
        </Link>

        {/* 右侧按钮 */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleStartLab}
            className="cursor-pointer rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur transition-colors duration-150 hover:bg-white/16"
          >
            开始实验
          </button>
        </div>
      </div>
    </nav>
  )
}
