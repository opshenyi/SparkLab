import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 创建管理员用户
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      displayName: '管理员',
      email: 'admin@sparklab.com',
      password: adminPassword,
      role: 'ADMIN',
      qqNumber: '10000',
    },
  });
  console.log('Admin user created:', admin.username);

  // 创建测试学生
  const studentPassword = await bcrypt.hash('student123', 10);
  const student = await prisma.user.upsert({
    where: { username: 'student' },
    update: {},
    create: {
      username: 'student',
      displayName: '测试学生',
      email: 'student@sparklab.com',
      password: studentPassword,
      role: 'STUDENT',
      qqNumber: '10001',
    },
  });
  console.log('Student user created:', student.username);

  // 创建课程
  const course1 = await prisma.course.upsert({
    where: { id: 'course-1' },
    update: {},
    create: {
      id: 'course-1',
      title: 'Linux 基础入门',
      description: '从零开始学习 Linux 操作系统，掌握命令行基础操作',
      difficulty: 'beginner',
      duration: 120,
      isPublished: true,
    },
  });
  console.log('Course created:', course1.title);

  const course2 = await prisma.course.upsert({
    where: { id: 'course-2' },
    update: {},
    create: {
      id: 'course-2',
      title: 'Docker 容器技术',
      description: '深入学习 Docker 容器化技术，掌握镜像构建和容器编排',
      difficulty: 'intermediate',
      duration: 180,
      isPublished: true,
    },
  });
  console.log('Course created:', course2.title);

  // 创建实验
  const lab1 = await prisma.lab.upsert({
    where: { id: 'lab-1' },
    update: {},
    create: {
      id: 'lab-1',
      courseId: course1.id,
      title: 'Linux 文件系统操作',
      description: '学习 Linux 文件系统的基本操作命令',
      content: `# Linux 文件系统操作

## 实验目标
- 掌握 ls、cd、pwd 等基本命令
- 学会创建、删除文件和目录
- 理解 Linux 文件权限

## 实验步骤

### 1. 查看当前目录
\`\`\`bash
pwd
\`\`\`

### 2. 列出文件
\`\`\`bash
ls -la
\`\`\`

### 3. 创建目录
\`\`\`bash
mkdir test
cd test
\`\`\`

### 4. 创建文件
\`\`\`bash
touch hello.txt
echo "Hello Spark Lab" > hello.txt
cat hello.txt
\`\`\`

## 判题标准
- 成功创建 test 目录
- 成功创建 hello.txt 文件
- 文件内容包含 "Hello Spark Lab"
`,
      difficulty: 'beginner',
      order: 1,
      points: 100,
      timeLimit: 30,
      dockerImage: 'ubuntu:22.04',
      cpuLimit: 1.0,
      memoryLimit: 512,
      judgeType: 'auto',
      judgeScript: '/judge/check_lab1.sh',
    },
  });
  console.log('Lab created:', lab1.title);

  // 创建实验步骤
  await prisma.step.createMany({
    data: [
      {
        labId: lab1.id,
        title: '查看当前目录',
        content: '使用 `pwd` 命令查看当前所在目录',
        order: 1,
        hint: '提示：pwd 是 print working directory 的缩写',
      },
      {
        labId: lab1.id,
        title: '创建测试目录',
        content: '使用 `mkdir test` 创建一个名为 test 的目录',
        order: 2,
        hint: '提示：mkdir 是 make directory 的缩写',
      },
      {
        labId: lab1.id,
        title: '创建文件并写入内容',
        content: '在 test 目录中创建 hello.txt 文件，并写入 "Hello Spark Lab"',
        order: 3,
        hint: '提示：可以使用 echo 命令配合重定向符号 >',
      },
    ],
  });
  console.log('Lab steps created');

  const lab2 = await prisma.lab.upsert({
    where: { id: 'lab-2' },
    update: {},
    create: {
      id: 'lab-2',
      courseId: course1.id,
      title: 'Shell 脚本编程',
      description: '学习编写简单的 Shell 脚本',
      content: `# Shell 脚本编程

## 实验目标
- 理解 Shell 脚本基本语法
- 学会使用变量和条件判断
- 编写实用的自动化脚本

## 实验内容
编写一个脚本，自动检测系统信息并输出。
`,
      difficulty: 'intermediate',
      order: 2,
      points: 150,
      timeLimit: 45,
      dockerImage: 'ubuntu:22.04',
      cpuLimit: 1.0,
      memoryLimit: 512,
      judgeType: 'manual',
    },
  });
  console.log('Lab created:', lab2.title);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
