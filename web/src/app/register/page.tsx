'use client';

import { AnimatedCharacters } from '@/components/AnimatedCharacters';
import LoadingBar from '@/components/LoadingBar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { authAPI, publicClassAPI } from '@/lib/api';
import { Eye, EyeOff, Lock, User, Hash } from 'lucide-react';

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
        role: 'STUDENT' as 'STUDENT' | 'TEACHER',
        classIds: [] as string[],
    });
    const [publicClasses, setPublicClasses] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        publicClassAPI.list().then((r) => setPublicClasses(r.data)).catch(() => setPublicClasses([]));
    }, []);

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
            const classIds = formData.role === 'STUDENT' ? formData.classIds : undefined;
            await authAPI.register({
                username: formData.username,
                displayName: formData.displayName,
                password: formData.password,
                qqNumber: formData.qqNumber || undefined,
                role: formData.role,
                ...(classIds && classIds.length === 1 ? { classId: classIds[0] } : {}),
                ...(classIds && classIds.length > 1 ? { classIds } : {}),
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
            <div className="hidden lg:flex relative flex-col justify-center items-center p-12 bg-gradient-to-br from-surface-lowest via-surface-low to-surface-container overflow-hidden">
                <div className="relative z-20">
                    <AnimatedCharacters
                        isTyping={isTyping}
                        showPassword={showPassword}
                        passwordLength={passwordValue.length}
                    />
                </div>

                <div className="absolute top-[15%] right-[10%] w-[300px] h-[300px] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute bottom-[10%] left-[5%] w-[400px] h-[400px] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />
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
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    onFocus={() => setIsTyping(true)}
                                    onBlur={() => setIsTyping(false)}
                                    placeholder="用于登录，至少3个字符"
                                    required
                                    minLength={3}
                                    className="w-full h-12 pl-11 pr-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface placeholder-on-surface-variant focus:bg-surface-bright focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">显示姓名</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                                <input
                                    type="text"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                    placeholder="真实姓名，用于显示"
                                    required
                                    minLength={2}
                                    className="w-full h-12 pl-11 pr-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface placeholder-on-surface-variant focus:bg-surface-bright focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">注册身份</label>
                            <select
                                value={formData.role}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        role: e.target.value as 'STUDENT' | 'TEACHER',
                                        classIds: e.target.value === 'TEACHER' ? [] : formData.classIds,
                                    })
                                }
                                className="w-full h-12 px-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm"
                            >
                                <option value="STUDENT">学生（可选学习小组）</option>
                                <option value="TEACHER">老师（也可自行注册）</option>
                            </select>
                        </div>

                        {formData.role === 'STUDENT' && (
                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">
                                    学习小组（可选，可多选）
                                </label>
                                <p className="text-xs text-on-surface-variant mb-2">
                                    注册后也可在「个人资料」中加入或退出小组。
                                </p>
                                <div className="max-h-40 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-high p-3 space-y-2">
                                    {publicClasses.length === 0 ? (
                                        <p className="text-sm text-on-surface-variant">暂无小组，可直接注册后在资料页加入。</p>
                                    ) : (
                                        publicClasses.map((cl) => {
                                            const checked = formData.classIds.includes(cl.id);
                                            return (
                                                <label
                                                    key={cl.id}
                                                    className="flex items-center gap-2 text-sm cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => {
                                                            setFormData((prev) => ({
                                                                ...prev,
                                                                classIds: checked
                                                                    ? prev.classIds.filter((x) => x !== cl.id)
                                                                    : [...prev.classIds, cl.id],
                                                            }));
                                                        }}
                                                        className="rounded border-outline-variant"
                                                    />
                                                    <span>{cl.name}</span>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">QQ号（可选）</label>
                            <div className="relative">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                                <input
                                    type="text"
                                    value={formData.qqNumber}
                                    onChange={(e) => setFormData({ ...formData, qqNumber: e.target.value })}
                                    placeholder="用于显示QQ头像"
                                    className="w-full h-12 pl-11 pr-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface placeholder-on-surface-variant focus:bg-surface-bright focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">密码</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
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
                                    className="w-full h-12 pl-11 pr-12 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface placeholder-on-surface-variant focus:bg-surface-bright focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                                >
                                    {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-on-surface mb-1.5">确认密码</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    placeholder="再次输入密码"
                                    required
                                    minLength={6}
                                    className="w-full h-12 pl-11 pr-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface placeholder-on-surface-variant focus:bg-surface-bright focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
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

