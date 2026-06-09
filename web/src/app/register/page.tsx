'use client';

import LoadingBar from '@/components/LoadingBar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { authAPI } from '@/lib/api';

export default function Register() {
    const router = useRouter();
    const { isAuthenticated, isLoading, checkAuth, user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [passwordValue, setPasswordValue] = useState('');
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        username: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        qqNumber: '',
    });

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            if (user?.role === 'ADMIN' || user?.role === 'AUTHOR') router.push('/admin');
            else if (user?.role === 'TEACHER') router.push('/teacher');
            else router.push('/dashboard');
        }
    }, [isAuthenticated, isLoading, router, user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('两次输入的密码不一致');
            setLoading(false);
            return;
        }

        try {
            await authAPI.register({
                username: formData.username,
                displayName: formData.displayName,
                password: formData.password,
                qqNumber: formData.qqNumber || undefined,
            });
            router.push('/login?registered=true');
        } catch (err: any) {
            setError(err.response?.data?.message || '注册失败，用户名或QQ号可能已被使用');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || isAuthenticated) {
        return <LoadingBar />;
    }

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            <div className="hidden lg:flex relative flex-col justify-center p-16 bg-surface-lowest">
                <div className="max-w-xl">
                    <p className="mb-5 text-sm font-medium text-on-surface-variant">Spark Lab</p>
                    <h2 className="text-5xl font-semibold leading-[1.06] text-page-title">
                        注册之后，实验环境会跟随你的课程进度。
                    </h2>
                    <p className="mt-6 text-lg leading-relaxed text-on-surface-variant">
                        学习小组、课程内容和容器实例都统一管理。少一点视觉噪声，多一点清晰路径。
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-md">
                    <div className="text-center mb-10">
                        <h1 className="text-page-title text-3xl font-bold mb-3 tracking-tight">
                            注册 星火实验室
                        </h1>
                        <p className="text-sm text-on-surface-variant">
                            创建您的账号，开始学习之旅
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">用户名（登录用）</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    onFocus={() => setIsTyping(true)}
                                    onBlur={() => setIsTyping(false)}
                                    placeholder="用于登录，至少3个字符"
                                    required
                                    minLength={3}
                                    maxLength={32}
                                    pattern="[A-Za-z0-9_\-]+"
                                    title="只能包含字母、数字、下划线和短横线"
                                    className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">显示姓名</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                    placeholder="真实姓名，用于显示"
                                    required
                                    minLength={2}
                                    maxLength={40}
                                    className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                />
                            </div>
                        </div>

                        <p className="rounded-md bg-surface-container px-4 py-3 text-xs leading-5 text-on-surface-variant">
                            公开注册仅创建学生账号。学习小组由老师或管理员分配。
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">QQ号（可选）</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.qqNumber}
                                    onChange={(e) => setFormData({ ...formData, qqNumber: e.target.value })}
                                    placeholder="用于显示QQ头像"
                                    maxLength={15}
                                    pattern="[0-9]*"
                                    title="只能包含数字"
                                    className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">密码</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={(e) => {
                                        setFormData({ ...formData, password: e.target.value });
                                        setPasswordValue(e.target.value);
                                    }}
                                    placeholder="至少6个字符"
                                    required
                                    minLength={6}
                                    maxLength={72}
                                    className="w-full h-12 pl-4 pr-20 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                                >
                                    {showPassword ? '隐藏' : '显示'}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">确认密码</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    placeholder="再次输入密码"
                                    required
                                    minLength={6}
                                    maxLength={72}
                                    className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="px-4 py-3 text-sm text-on-error-container bg-error-container rounded-lg">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-primary hover:opacity-90 text-on-primary font-semibold rounded-xl transition-all active:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? '注册中...' : '注册'}
                        </button>
                    </form>

                    <div className="text-center text-sm text-on-surface-variant mt-7">
                        已有账号？{' '}
                        <a href="/login" className="text-primary font-medium hover:underline">
                            立即登录
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
