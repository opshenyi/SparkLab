'use client';

import TextSelectionAI from '@/components/TextSelectionAI';

export default function AITestPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface p-8">
      <TextSelectionAI />
      
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-page-title mb-6">
          文本选择AI助手测试页面
        </h1>
        
        <div className="app-card p-6 mb-6">
          <h2 className="text-2xl font-bold text-page-title mb-4">使用说明</h2>
          <ol className="list-decimal list-inside space-y-2 text-on-surface-variant">
            <li>用鼠标选中下方任意文本</li>
            <li>等待1秒，会自动弹出"询问星火AI"按钮</li>
            <li>点击按钮，打开AI对话弹窗</li>
            <li>AI会自动回答选中的文本内容</li>
            <li>可以在输入框中继续提问</li>
          </ol>
        </div>

        <div className="space-y-6">
          <div className="bg-surface-container rounded-xl p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">Linux基础命令</h3>
            <p className="text-on-surface-variant mb-4">
              Linux是一个强大的操作系统，掌握基本命令对于系统管理至关重要。
            </p>
            <div className="space-y-2 text-on-surface-variant">
              <p><strong>ls</strong> - 列出目录内容</p>
              <p><strong>cd</strong> - 切换目录</p>
              <p><strong>pwd</strong> - 显示当前工作目录</p>
              <p><strong>mkdir</strong> - 创建新目录</p>
              <p><strong>rm</strong> - 删除文件或目录</p>
              <p><strong>cp</strong> - 复制文件或目录</p>
              <p><strong>mv</strong> - 移动或重命名文件</p>
            </div>
          </div>

          <div className="bg-surface-container rounded-xl p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">Docker容器管理</h3>
            <p className="text-on-surface-variant mb-4">
              Docker是一个开源的容器化平台，可以帮助开发者快速构建、部署和运行应用程序。
            </p>
            <div className="space-y-2 text-on-surface-variant">
              <p><strong>docker ps</strong> - 查看运行中的容器</p>
              <p><strong>docker images</strong> - 查看本地镜像</p>
              <p><strong>docker run</strong> - 运行一个新容器</p>
              <p><strong>docker stop</strong> - 停止运行中的容器</p>
              <p><strong>docker rm</strong> - 删除容器</p>
              <p><strong>docker exec</strong> - 在运行中的容器内执行命令</p>
            </div>
          </div>

          <div className="bg-surface-container rounded-xl p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">网络配置</h3>
            <p className="text-on-surface-variant mb-4">
              网络配置是系统管理的重要组成部分，了解基本的网络命令可以帮助你诊断和解决网络问题。
            </p>
            <div className="space-y-2 text-on-surface-variant">
              <p><strong>ifconfig</strong> - 配置网络接口</p>
              <p><strong>ping</strong> - 测试网络连接</p>
              <p><strong>netstat</strong> - 显示网络连接、路由表等信息</p>
              <p><strong>ssh</strong> - 安全远程登录</p>
              <p><strong>scp</strong> - 安全文件传输</p>
              <p><strong>curl</strong> - 发送HTTP请求</p>
            </div>
          </div>

          <div className="bg-surface-container rounded-xl p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">编程示例</h3>
            <p className="text-on-surface-variant mb-4">
              以下是一个简单的Python脚本示例，用于读取文件内容：
            </p>
            <pre className="bg-surface-container p-4 rounded-lg overflow-x-auto text-sm">
              <code className="text-on-surface">{`def read_file(filename):
    try:
        with open(filename, 'r') as file:
            content = file.read()
            return content
    except FileNotFoundError:
        print(f"文件 {filename} 不存在")
        return None
    except Exception as e:
        print(f"读取文件时出错: {e}")
        return None

# 使用示例
content = read_file('example.txt')
if content:
    print(content)`}</code>
            </pre>
          </div>

          <div className="bg-surface-container rounded-xl p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">数据库查询</h3>
            <p className="text-on-surface-variant mb-4">
              SQL是用于管理关系型数据库的标准语言。以下是一些常用的SQL查询示例：
            </p>
            <div className="space-y-2 text-on-surface-variant">
              <p><strong>SELECT</strong> - 从数据库中选择数据</p>
              <p><strong>INSERT INTO</strong> - 向数据库中插入新数据</p>
              <p><strong>UPDATE</strong> - 更新数据库中的数据</p>
              <p><strong>DELETE</strong> - 从数据库中删除数据</p>
              <p><strong>JOIN</strong> - 连接多个表</p>
              <p><strong>WHERE</strong> - 过滤查询结果</p>
            </div>
          </div>

          <div className="app-card p-6">
            <h3 className="text-xl font-bold text-page-title mb-3">提示</h3>
            <p className="text-on-surface-variant">
              试着选中上面的任何文本，比如"Linux是一个强大的操作系统"或者"docker ps"，
              然后等待1秒，你会看到"询问星火AI"按钮出现。点击它，AI会帮你解释这些内容！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
