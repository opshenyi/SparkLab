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
        <Link href="/" className="text-2xl font-bold tracking-tighter text-white select-none outline-0 cursor-pointer">
          星火实验室
        </Link>

        {/* 右侧按钮 */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleStartLab}
            className="cursor-pointer rounded-full border-none bg-white px-8 py-3 font-bold text-base text-black transition-opacity duration-150 hover:opacity-90"
          >
            开始实验
          </button>
        </div>
      </div>
    </nav>
  )
}

