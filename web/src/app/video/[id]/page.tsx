'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { labAPI } from '@/lib/api';
import LoadingBar from '@/components/LoadingBar';
import { Play, Pause, Volume2, VolumeX, Maximize, CheckCircle, Clock, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function VideoPage() {
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [video, setVideo] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated && videoId) {
      loadVideo();
    }
  }, [isAuthenticated, videoId]);

  const loadVideo = async () => {
    try {
      const res = await labAPI.getOne(videoId);
      setVideo(res.data);
      setDuration(res.data.videoDuration || 0);
    } catch (error) {
      console.error('Failed to load video:', error);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      if (!isNaN(current) && !isNaN(total) && total > 0) {
        setCurrentTime(current);
        setDuration(total);
        setProgress((current / total) * 100);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current && duration > 0) {
      const newTime = (parseFloat(e.target.value) / 100) * duration;
      videoRef.current.currentTime = newTime;
      setProgress(parseFloat(e.target.value));
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = async () => {
    if (progress >= 90) {
      alert('恭喜完成视频学习！');
      router.push('/dashboard');
    }
  };

  if (isLoading) {
    return <LoadingBar />;
  }

  if (!isAuthenticated || !video) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* 顶部导航 */}
      <div className="bg-surface-container px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回课程
          </button>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Clock className="w-4 h-4" />
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>
            {progress >= 90 && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                已完成
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：视频播放器 */}
          <div className="lg:col-span-2">
            <div className="app-card overflow-hidden">
              <div className="relative bg-black aspect-video">
                <video
                  ref={videoRef}
                  src={video.videoUrl}
                  className="w-full h-full"
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleComplete}
                  onClick={togglePlay}
                />
                
                {/* 播放控制层 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  {/* 进度条 */}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress || 0}
                    onChange={handleSeek}
                    className="w-full mb-3 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress || 0}%, rgba(255,255,255,0.3) ${progress || 0}%, rgba(255,255,255,0.3) 100%)`
                    }}
                  />
                  
                  {/* 控制按钮 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="text-white hover:text-primary transition-colors"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </button>
                      <button
                        onClick={toggleMute}
                        className="text-white hover:text-primary transition-colors"
                      >
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <span className="text-white text-sm">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>
                    <button
                      onClick={toggleFullscreen}
                      className="text-white hover:text-primary transition-colors"
                    >
                      <Maximize className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 视频信息 */}
              <div className="p-6">
                <h1 className="text-page-title text-2xl font-bold mb-2">{video.title}</h1>
                <p className="text-on-surface-variant mb-4">{video.description}</p>
                
                <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                  <span className="px-3 py-1 bg-surface-container rounded-full">
                    {video.difficulty === 'beginner' ? '入门' : 
                     video.difficulty === 'intermediate' ? '进阶' : '高级'}
                  </span>
                  <span>{video.points} 分</span>
                  <span>{Math.floor(duration / 60)} 分钟</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：课程内容 */}
          <div className="lg:col-span-1">
            <div className="bg-nav-blue-vein rounded-xl p-6 sticky top-6">
              <h3 className="text-page-title text-lg font-bold mb-4">课程内容</h3>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{video.content || '暂无内容'}</ReactMarkdown>
              </div>

              {progress >= 90 && (
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full mt-6 bg-primary text-on-primary px-4 py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  完成学习
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
