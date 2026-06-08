'use client';

import LoadingBar from '@/components/LoadingBar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { authAPI, publicClassAPI } from '@/lib/api';

export default function Login() {
    const router = useRouter();
    const { login, isAuthenticated, isLoading, checkAuth, user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [passwordValue, setPasswordValue] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showCredit, setShowCredit] = useState(false);
    const [isRegisterMode, setIsRegisterMode] = useState(false);
    const [loginData, setLoginData] = useState({
        username: '',
        password: '',
    });
    const [registerData, setRegisterData] = useState({
        username: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        qqNumber: '',
        role: 'STUDENT' as 'STUDENT' | 'TEACHER',
        classId: '',
    });
    const [publicClasses, setPublicClasses] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('registered') === 'true') {
            setSuccess('注册成功！请登录您的账号');
        }
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (isRegisterMode) {
            publicClassAPI.list().then((r) => setPublicClasses(r.data)).catch(() => setPublicClasses([]));
        }
    }, [isRegisterMode]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            if (user?.role === 'ADMIN' || user?.role === 'AUTHOR') {
                router.push('/admin');
            } else if (user?.role === 'TEACHER') {
                router.push('/teacher');
            } else {
                router.push('/dashboard');
            }
        }
    }, [isAuthenticated, isLoading, user, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await login(loginData.username, loginData.password);
            const u = useAuthStore.getState().user;
            if (u?.role === 'ADMIN' || u?.role === 'AUTHOR') router.push('/admin');
            else if (u?.role === 'TEACHER') router.push('/teacher');
            else router.push('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || '账号或密码有误，请重新输入');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (registerData.password !== registerData.confirmPassword) {
            setError('两次输入的密码不一致');
            setLoading(false);
            return;
        }

        try {
            await authAPI.register({
                username: registerData.username,
                displayName: registerData.displayName,
                password: registerData.password,
                qqNumber: registerData.qqNumber || undefined,
                role: registerData.role,
                classId: registerData.role === 'STUDENT' ? registerData.classId : undefined,
            });
            setSuccess('注册成功！请登录您的账号');
            setIsRegisterMode(false);
            setRegisterData({
                username: '',
                displayName: '',
                password: '',
                confirmPassword: '',
                qqNumber: '',
                role: 'STUDENT',
                classId: '',
            });
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
            {/* 左侧：品牌叙事区 */}
            <div className="hidden lg:flex relative flex-col justify-center p-16 bg-surface-lowest">
                <div className="max-w-xl">
                    <p className="mb-5 text-sm font-medium text-on-surface-variant">Spark Lab</p>
                    <h2 className="text-5xl font-semibold leading-[1.06] text-page-title">
                        把每一次登录，带回真实的实验环境。
                    </h2>
                    <p className="mt-6 text-lg leading-relaxed text-on-surface-variant">
                        课程、容器、试卷和材料保持在同一套清晰工作流里。界面减少干扰，把注意力留给实践本身。
                    </p>
                </div>
            </div>

            {/* 右侧：登录/注册表单 */}
            <div className="flex items-center justify-center p-8 bg-background">
                <div className="w-full max-w-md">
                    <div className="text-center mb-10">
                        <h1 
                            className="text-page-title text-3xl font-bold mb-3 tracking-tight cursor-pointer select-none"
                            onDoubleClick={() => setShowCredit(!showCredit)}
                        >
                            {isRegisterMode ? '注册' : '登录'} 到 星火实验室
                        </h1>
                        {showCredit && (
                            <p className="text-sm text-on-surface-variant mb-2">
                                由 21动漫1班 肖瑞杰 倾力制作
                            </p>
                        )}
                        <p className="text-sm text-on-surface-variant">
                            {isRegisterMode ? '创建您的账号，开始学习之旅' : '欢迎回来，继续您的学习之旅'}
                        </p>
                    </div>

                    {/* 切换标签 */}
                    <div className="flex gap-2 mb-6 bg-surface-container-high rounded-xl p-1">
                        <button
                            onClick={() => {
                                setIsRegisterMode(false);
                                setError('');
                            }}
                            className={`flex-1 py-2 rounded-lg transition-all ${
                                !isRegisterMode
                                    ? 'bg-primary text-on-primary'
                                    : 'text-on-surface-variant hover:text-primary'
                            }`}
                        >
                            登录
                        </button>
                        <button
                            onClick={() => {
                                setIsRegisterMode(true);
                                setError('');
                                setSuccess('');
                            }}
                            className={`flex-1 py-2 rounded-lg transition-all ${
                                isRegisterMode
                                    ? 'bg-primary text-on-primary'
                                    : 'text-on-surface-variant hover:text-primary'
                            }`}
                        >
                            注册
                        </button>
                    </div>

                    {/* 登录表单 */}
                    {!isRegisterMode && (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">账号</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={loginData.username}
                                        onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                                        onFocus={() => setIsTyping(true)}
                                        onBlur={() => setIsTyping(false)}
                                        placeholder="至少3个字符"
                                        required
                                        minLength={3}
                                        maxLength={20}
                                        className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">密码</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={loginData.password}
                                        onChange={(e) => {
                                            setLoginData({ ...loginData, password: e.target.value });
                                            setPasswordValue(e.target.value);
                                        }}
                                        placeholder="至少6个字符"
                                        required
                                        minLength={6}
                                        maxLength={32}
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

                            {error && (
                                <div className="px-4 py-3 text-sm text-on-error-container bg-error-container rounded-lg">
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div className="px-4 py-3 text-sm text-green-800 bg-green-100 rounded-lg">
                                    {success}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-12 bg-primary hover:opacity-90 text-on-primary font-semibold rounded-xl transition-all active:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? '登录中...' : '登录'}
                            </button>
                        </form>
                    )}

                    {/* 注册表单 */}
                    {isRegisterMode && (
                        <form onSubmit={handleRegister} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">用户名</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={registerData.username}
                                        onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                                        onFocus={() => setIsTyping(true)}
                                        onBlur={() => setIsTyping(false)}
                                        placeholder="至少3个字符"
                                        required
                                        minLength={3}
                                        maxLength={20}
                                        pattern="[a-zA-Z0-9_]+"
                                        title="只能包含字母、数字和下划线"
                                        className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">显示姓名</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={registerData.displayName}
                                        onChange={(e) => setRegisterData({ ...registerData, displayName: e.target.value })}
                                        placeholder="至少2个字符"
                                        required
                                        minLength={2}
                                        maxLength={20}
                                        className="w-full h-12 px-4 bg-surface-lowest rounded-md text-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">注册身份</label>
                                <select
                                    value={registerData.role}
                                    onChange={(e) =>
                                        setRegisterData({
                                            ...registerData,
                                            role: e.target.value as 'STUDENT' | 'TEACHER',
                                            classId: e.target.value === 'TEACHER' ? '' : registerData.classId,
                                        })
                                    }
                                    className="w-full h-12 px-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm"
                                >
                                    <option value="STUDENT">学生（需选择班级）</option>
                                    <option value="TEACHER">老师（由管理员分配班主任与班级）</option>
                                </select>
                            </div>

                            {registerData.role === 'STUDENT' && (
                                <div>
                                    <label className="block text-sm font-medium text-on-surface mb-1.5">所在班级 *</label>
                                    <select
                                        value={registerData.classId}
                                        onChange={(e) => setRegisterData({ ...registerData, classId: e.target.value })}
                                        required
                                        className="w-full h-12 px-4 bg-surface-container-high border border-outline-variant rounded-xl text-sm"
                                    >
                                        <option value="">请选择班级</option>
                                        {publicClasses.map((cl) => (
                                            <option key={cl.id} value={cl.id}>
                                                {cl.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-on-surface mb-1.5">QQ号（可选）</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={registerData.qqNumber}
                                        onChange={(e) => setRegisterData({ ...registerData, qqNumber: e.target.value })}
                                        placeholder="用于头像，可留空"
                                        maxLength={11}
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
                                        value={registerData.password}
                                        onChange={(e) => {
                                            setRegisterData({ ...registerData, password: e.target.value });
                                            setPasswordValue(e.target.value);
                                        }}
                                        placeholder="至少6个字符"
                                        required
                                        minLength={6}
                                        maxLength={32}
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
                                        value={registerData.confirmPassword}
                                        onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                                        placeholder="再次输入密码"
                                        required
                                        minLength={6}
                                        maxLength={32}
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
                    )}
                </div>
            </div>
        </div>
    );
}
