/** @type {import('next').NextConfig} */
const nextConfig = {
  // 开发环境双次挂载会触发成对请求，编译稍慢时易被 Next 记为 abort 并重试刷屏；生产仍为 true
  reactStrictMode: process.env.NODE_ENV === 'production',
  poweredByHeader: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
}

module.exports = nextConfig
