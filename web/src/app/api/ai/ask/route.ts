import { NextRequest, NextResponse } from 'next/server';

// 这里使用星火AI的API
// 你需要在 .env.local 中配置 SPARK_AI_API_KEY 和 SPARK_AI_API_URL
const SPARK_AI_API_KEY = process.env.SPARK_AI_API_KEY || '';
const SPARK_AI_API_URL = process.env.SPARK_AI_API_URL || 'https://spark-api.xf-yun.com/v1/chat/completions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, containerId, history = [] } = body;

    if (!question) {
      return NextResponse.json(
        { error: '问题不能为空' },
        { status: 400 }
      );
    }

    // 构建对话历史
    const messages = [
      {
        role: 'system',
        content: '你是一个专业的技术助手，擅长解答编程、Linux、Docker等技术问题。请用简洁、准确的语言回答用户的问题。',
      },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: question,
      },
    ];

    // 如果没有配置API密钥，返回模拟响应
    if (!SPARK_AI_API_KEY) {
      console.warn('未配置 SPARK_AI_API_KEY，返回模拟响应');
      
      // 模拟AI响应
      const mockResponse = generateMockResponse(question);
      
      return NextResponse.json({
        answer: mockResponse,
        model: 'mock',
      });
    }

    // 调用星火AI API
    const response = await fetch(SPARK_AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SPARK_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'generalv3.5',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`星火AI API错误: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || '抱歉，我无法回答这个问题。';

    return NextResponse.json({
      answer,
      model: data.model,
    });
  } catch (error) {
    console.error('AI API错误:', error);
    
    // 返回友好的错误响应
    return NextResponse.json(
      {
        answer: '抱歉，AI服务暂时不可用。这可能是因为：\n\n1. API密钥未配置或无效\n2. 网络连接问题\n3. API服务暂时不可用\n\n请稍后再试或联系管理员。',
        error: true,
      },
      { status: 200 } // 返回200以便前端能正常显示错误消息
    );
  }
}

// 生成模拟响应（用于开发测试）
function generateMockResponse(question: string): string {
  const lowerQuestion = question.toLowerCase();
  
  if (lowerQuestion.includes('linux') || lowerQuestion.includes('命令')) {
    return `关于 "${question}"：

这是一个Linux相关的问题。以下是一些建议：

1. **基础命令**：可以使用 \`ls\`、\`cd\`、\`pwd\` 等命令进行文件操作
2. **权限管理**：使用 \`chmod\` 和 \`chown\` 管理文件权限
3. **进程管理**：使用 \`ps\`、\`top\`、\`kill\` 等命令管理进程

如需更详细的帮助，请提供具体的使用场景。

*注意：这是模拟响应，请配置 SPARK_AI_API_KEY 以使用真实的AI服务。*`;
  }
  
  if (lowerQuestion.includes('docker') || lowerQuestion.includes('容器')) {
    return `关于 "${question}"：

Docker容器相关建议：

1. **容器管理**：使用 \`docker ps\`、\`docker start/stop\` 管理容器
2. **镜像操作**：使用 \`docker images\`、\`docker pull/push\` 管理镜像
3. **网络配置**：使用 \`docker network\` 配置容器网络

需要更多帮助吗？

*注意：这是模拟响应，请配置 SPARK_AI_API_KEY 以使用真实的AI服务。*`;
  }
  
  return `感谢您的提问："${question}"

我是星火AI助手的模拟版本。要获得真实的AI回答，请：

1. 在 \`.env.local\` 文件中配置 \`SPARK_AI_API_KEY\`
2. 配置 \`SPARK_AI_API_URL\`（可选，默认使用星火API）
3. 重启开发服务器

配置完成后，我将能够提供更智能、更准确的回答。

*这是模拟响应，仅用于开发测试。*`;
}
