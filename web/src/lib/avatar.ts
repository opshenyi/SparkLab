/**
 * 获取QQ头像URL
 * @param qqNumber QQ号
 * @param size 头像尺寸，可选值：1(40x40), 2(40x40), 3(100x100), 4(140x140), 5(640x640), 默认640
 * @returns QQ头像URL
 */
export function getQQAvatar(qqNumber?: string | null, size: 1 | 2 | 3 | 4 | 5 | 640 = 640): string | null {
  if (!qqNumber) return null;
  return `http://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=${size}`;
}

/**
 * 获取用户头像URL（优先使用QQ头像）
 * @param user 用户对象
 * @returns 头像URL或null
 */
export function getUserAvatar(user: { avatar?: string | null; qqNumber?: string | null }): string | null {
  // 优先使用QQ头像
  if (user.qqNumber) {
    return getQQAvatar(user.qqNumber);
  }
  // 其次使用自定义头像
  return user.avatar || null;
}

/**
 * 获取用户头像或默认字母头像
 * @param user 用户对象
 * @returns 头像URL或用户名首字母
 */
export function getUserAvatarOrInitial(user: { username: string; avatar?: string | null; qqNumber?: string | null }): { type: 'image' | 'initial'; value: string } {
  const avatarUrl = getUserAvatar(user);
  if (avatarUrl) {
    return { type: 'image', value: avatarUrl };
  }
  return { type: 'initial', value: user.username.charAt(0).toUpperCase() };
}
